import { createSimpleContext } from "@opencode-ai/ui/context"
import { batch } from "solid-js"
import { createStore, produce, type SetStoreFunction, type Store } from "solid-js/store"
import type { TerminalEventSource, TerminalSourceStatus } from "./source"
import type {
  AgentId,
  AgentRegistryEntry,
  DelegationEdge,
  ProjectedAgent,
  ProjectedFile,
  ProjectedFork,
  ProjectedIssue,
  ProjectedPlanNode,
  TerminalEvent,
  TerminalResources,
  TerminalSessionStatus,
  TerminalTab,
  TerminalView,
  TranscriptEvent,
} from "./types"

export interface TerminalProjectionState {
  sessionTitle: string
  agents: Record<AgentId, ProjectedAgent>
  agentOrder: AgentId[]
  transcript: TranscriptEvent[]
  delegations: DelegationEdge[]
  plan: Record<string, ProjectedPlanNode>
  planOrder: string[]
  issues: Record<string, ProjectedIssue>
  issueOrder: string[]
  files: Record<string, ProjectedFile>
  fileOrder: string[]
  fork: ProjectedFork
  resources: TerminalResources
  sessionStatus: TerminalSessionStatus
  queue: string[]
  filter: AgentId | "all"
  view: TerminalView
  tab: TerminalTab
  openFile: string | null
  editing: boolean
  fileEdits: Record<string, string>
  seenEventIds: Record<string, true>
}

export interface ResetProjectionOptions {
  preserveUi?: boolean
  preserveQueue?: boolean
  preserveFileEdits?: boolean
}

/**
 * Phase-agnostic mutations used by every Agentic Terminal panel.
 *
 * `fold` is the only event-to-projection entry point. UI-only actions deliberately
 * contain no timers, step counters, or simulation concepts so a live source can
 * replace the Phase A source without changing the panels.
 */
export interface TerminalProjectionActions {
  setSessionTitle(title: string): void
  registerAgents(agents: readonly AgentRegistryEntry[]): void
  registerFiles(files: readonly { payload: ProjectedFile; path: string }[]): void
  fold(event: TerminalEvent): void
  foldMany(events: readonly TerminalEvent[]): void
  resetProjection(options?: ResetProjectionOptions): void
  setSessionStatus(status: TerminalSessionStatus): void
  setFilter(agent: AgentId | "all"): void
  setView(view: TerminalView): void
  setTab(tab: TerminalTab): void
  enqueue(chunks: readonly string[]): void
  removeQueued(index: number): void
  shiftQueue(): string | undefined
  clearQueue(): void
  openFile(path: string): void
  closeFile(): void
  setEditing(editing: boolean): void
  saveFileEdit(path: string, content: string): void
  revertFileEdit(path: string): void
}

/** Shared panel contract. Panels read projection state and the phase-agnostic source surface. */
export interface TerminalStoreContextValue {
  state: Store<TerminalProjectionState>
  actions: TerminalProjectionActions
  source: TerminalEventSource
  sourceStatus: Store<TerminalSourceStatus>
}

export type TerminalStoreContextAccessor = () => TerminalStoreContextValue

export interface CreateTerminalStoreOptions {
  agents?: readonly AgentRegistryEntry[]
  source?: TerminalEventSource
  createSource?: (actions: TerminalProjectionActions) => TerminalEventSource
}

const disconnectedSourceStatus = (): TerminalSourceStatus => ({
  state: "paused",
  connected: false,
  step: 0,
  lastStep: 0,
  checkpointCount: 0,
  playing: false,
  complete: false,
  forkActive: false,
  choice: null,
})

const unavailableSource: TerminalEventSource = {
  agents: [],
  lastStep: 0,
  start() {},
  stop() {},
  dispose() {},
  subscribe() {
    return () => {}
  },
  subscribeStatus() {
    return () => {}
  },
  status: disconnectedSourceStatus,
  metrics() {
    return { byAgent: {}, tokens: 0, costUsd: 0, elapsedSeconds: 0 }
  },
  play() {},
  pause() {},
  toggle() {},
  stepForward() {},
  stepBackward() {},
  jump() {},
  resolveFork() {},
  send() {},
}

const emptyFork = (): ProjectedFork => ({ open: false, prompt: "", options: [] })

const projectedAgent = (agent: AgentRegistryEntry): ProjectedAgent => ({
  ...agent,
  status: "idle",
  task: "—",
  tokens: 0,
  costUsd: 0,
  ctxPct: 0,
})

const initialState = (agents: readonly AgentRegistryEntry[]): TerminalProjectionState => ({
  sessionTitle: "",
  agents: Object.fromEntries(agents.map((agent) => [agent.id, projectedAgent(agent)])),
  agentOrder: agents.map((agent) => agent.id),
  transcript: [],
  delegations: [],
  plan: {},
  planOrder: [],
  issues: {},
  issueOrder: [],
  files: {},
  fileOrder: [],
  fork: emptyFork(),
  resources: { tokens: 0, costUsd: 0, ctxPct: 0 },
  sessionStatus: "running",
  queue: [],
  filter: "all",
  view: "mission",
  tab: "plan",
  openFile: null,
  editing: false,
  fileEdits: {},
  seenEventIds: {},
})

function ensureAgent(
  state: Store<TerminalProjectionState>,
  setState: SetStoreFunction<TerminalProjectionState>,
  agentId: AgentId,
) {
  if (state.agents[agentId]) return
  batch(() => {
    setState("agents", agentId, projectedAgent({ id: agentId, name: agentId, color: "#808080" }))
    if (!state.agentOrder.includes(agentId)) setState("agentOrder", (order) => [...order, agentId])
  })
}

function updateResourceTotal(state: Store<TerminalProjectionState>, setState: SetStoreFunction<TerminalProjectionState>) {
  const values = state.agentOrder.map((id) => state.agents[id]).filter((agent): agent is ProjectedAgent => !!agent)
  setState("resources", {
    tokens: values.reduce((total, agent) => total + agent.tokens, 0),
    costUsd: values.reduce((total, agent) => total + agent.costUsd, 0),
    ctxPct: values.reduce((maximum, agent) => Math.max(maximum, agent.ctxPct), 0),
  })
}

/** Creates the transport-free projection store used by the context and unit tests. */
export function createTerminalStore(options: CreateTerminalStoreOptions = {}): TerminalStoreContextValue {
  const initialRegistry = options.agents ?? options.source?.agents ?? []
  const [state, setState] = createStore(initialState(initialRegistry))

  const registerAgents = (agents: readonly AgentRegistryEntry[]) => {
    batch(() => {
      for (const agent of agents) {
        setState("agents", agent.id, (current) => ({ ...projectedAgent(agent), ...current, ...agent }))
        if (!state.agentOrder.includes(agent.id)) setState("agentOrder", (order) => [...order, agent.id])
      }
    })
  }

  const registerFiles = (files: readonly { payload: ProjectedFile; path: string }[]) => {
    batch(() => {
      for (const file of files) {
        setState("files", file.path, file.payload)
        if (!state.fileOrder.includes(file.path)) setState("fileOrder", (paths) => [...paths, file.path])
      }
    })
  }

  const fold = (event: TerminalEvent) => {
    if (state.seenEventIds[event.id]) return
    setState("seenEventIds", event.id, true)
    if (event.agent !== "user") ensureAgent(state, setState, event.agent)

    switch (event.kind) {
      case "text":
      case "cmd":
        setState("transcript", (items) => [...items, event])
        break
      case "spawn": {
        if (!event.payload.handoff) setState("transcript", (items) => [...items, event])
        for (const child of event.payload.children ?? [event.payload.child]) {
          ensureAgent(state, setState, child)
          const edge: DelegationEdge = {
            parent: event.agent,
            child,
            task: event.payload.task,
            handoff: event.payload.handoff,
          }
          if (!state.delegations.some((item) => item.parent === edge.parent && item.child === edge.child)) {
            setState("delegations", (items) => [...items, edge])
          }
        }
        break
      }
      case "file":
        batch(() => {
          setState("transcript", (items) => [...items, event])
          setState("files", event.payload.path, { ...event.payload, updatedAt: event.ts, agent: event.agent })
          if (!state.fileOrder.includes(event.payload.path)) {
            setState("fileOrder", (paths) => [...paths, event.payload.path])
          }
        })
        break
      case "status":
        if (event.agent === "user") break
        setState("agents", event.agent, "status", event.payload.status)
        setState("agents", event.agent, "task", event.payload.task)
        if (event.payload.status === "fork") setState("sessionStatus", "awaiting-decision")
        if (state.agentOrder.length > 0 && state.agentOrder.every((id) => state.agents[id]?.status === "done")) {
          setState("sessionStatus", "complete")
        }
        break
      case "resource":
        if (event.agent === "user") break
        setState("agents", event.agent, {
          tokens: event.payload.tokens,
          costUsd: event.payload.costUsd,
          ...(event.payload.ctxPct === undefined ? {} : { ctxPct: event.payload.ctxPct }),
        })
        updateResourceTotal(state, setState)
        break
      case "plan": {
        const current = state.plan[event.payload.node]
        if (!current) {
          batch(() => {
            setState("plan", event.payload.node, {
              id: event.payload.node,
              label: event.payload.label ?? event.payload.node,
              parent: event.payload.parent,
              by: event.payload.by,
              indent: event.payload.parent ? (state.plan[event.payload.parent]?.indent ?? 0) + 1 : 0,
              fork: event.payload.fork,
              state: "pending",
            })
            if (!state.planOrder.includes(event.payload.node)) {
              setState("planOrder", (nodes) => [...nodes, event.payload.node])
            }
          })
        }
        if (event.payload.label) setState("plan", event.payload.node, "label", event.payload.label)
        if (event.payload.parent) setState("plan", event.payload.node, "parent", event.payload.parent)
        if (event.payload.by) setState("plan", event.payload.node, "by", event.payload.by)
        if (event.payload.fork) setState("plan", event.payload.node, "fork", event.payload.fork)
        const nextState = {
          add: "pending",
          start: "active",
          done: "done",
          reject: "rejected",
        } as const
        setState("plan", event.payload.node, "state", nextState[event.payload.op])
        break
      }
      case "issue": {
        const current = state.issues[event.payload.issueId]
        if (!current) {
          batch(() => {
            setState("issues", event.payload.issueId, {
              id: event.payload.issueId,
              title: event.payload.title ?? event.payload.issueId,
              agent: event.payload.agent ?? event.agent,
              detail: event.payload.detail ?? "",
              state: event.payload.op,
              resolution: event.payload.resolution,
              openedAt: event.ts,
              updatedAt: event.ts,
            })
            if (!state.issueOrder.includes(event.payload.issueId)) {
              setState("issueOrder", (ids) => [...ids, event.payload.issueId])
            }
          })
        } else {
          setState("issues", event.payload.issueId, {
            title: event.payload.title ?? current.title,
            agent: event.payload.agent ?? current.agent,
            detail: event.payload.detail ?? current.detail,
            state: event.payload.op,
            resolution: event.payload.resolution ?? current.resolution,
            updatedAt: event.ts,
          })
        }
        break
      }
      case "fork":
        if (event.payload.op === "open") {
          setState("fork", {
            open: true,
            prompt: event.payload.prompt,
            options: event.payload.options,
          })
          setState("sessionStatus", "awaiting-decision")
        } else {
          setState("fork", "open", false)
          setState("fork", "choice", event.payload.choice)
          setState("sessionStatus", "running")
        }
        break
    }
  }

  const actions: TerminalProjectionActions = {
    setSessionTitle(title) {
      setState("sessionTitle", title.trim())
    },
    registerAgents,
    registerFiles,
    fold,
    foldMany(events) {
      for (const event of events) fold(event)
    },
    resetProjection(resetOptions = {}) {
      const fresh = initialState(state.agentOrder.map((id) => state.agents[id]).filter(Boolean))
      if (resetOptions.preserveUi) {
        fresh.sessionTitle = state.sessionTitle
        fresh.view = state.view
        fresh.tab = state.tab
        fresh.openFile = state.openFile
        fresh.editing = state.editing
      }
      if (resetOptions.preserveQueue) fresh.queue = [...state.queue]
      if (resetOptions.preserveFileEdits) fresh.fileEdits = { ...state.fileEdits }
      setState(fresh)
    },
    setSessionStatus(status) {
      setState("sessionStatus", status)
    },
    setFilter(agent) {
      setState("filter", agent)
    },
    setView(view) {
      setState("view", view)
    },
    setTab(tab) {
      setState("tab", tab)
    },
    enqueue(chunks) {
      setState("queue", (queue) => [...queue, ...chunks.map((chunk) => chunk.trim()).filter(Boolean)])
    },
    removeQueued(index) {
      setState("queue", (queue) => queue.filter((_, itemIndex) => itemIndex !== index))
    },
    shiftQueue() {
      const [head, ...rest] = state.queue
      if (head === undefined) return
      setState("queue", rest)
      return head
    },
    clearQueue() {
      setState("queue", [])
    },
    openFile(path) {
      setState({ openFile: path, editing: false })
    },
    closeFile() {
      setState({ openFile: null, editing: false })
    },
    setEditing(editing) {
      setState("editing", editing)
    },
    saveFileEdit(path, content) {
      setState("fileEdits", path, content)
      setState("editing", false)
    },
    revertFileEdit(path) {
      setState(
        "fileEdits",
        produce((edits) => {
          delete edits[path]
        }),
      )
      setState("editing", false)
    },
  }

  const source = options.source ?? options.createSource?.(actions) ?? unavailableSource
  const [sourceStatus, setSourceStatus] = createStore<TerminalSourceStatus>({ ...source.status() })
  source.subscribeStatus((status) => {
    setSourceStatus({ ...status })
    setState("sessionStatus", status.state)
  })
  if (options.agents === undefined) registerAgents(source.agents)

  return { state, actions, source, sourceStatus }
}

/** Context shared by Mission Control and TUI so both are projections of one store. */
export const { use: useTerminalStore, provider: TerminalStoreProvider } = createSimpleContext({
  name: "AgenticTerminal",
  gate: false,
  init: (props: CreateTerminalStoreOptions) => createTerminalStore(props),
})

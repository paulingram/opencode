import type { Message, Part, Session } from "@opencode-ai/sdk/v2/client"
import { Identifier } from "@/utils/id"
import type { TerminalEventSource, TerminalSourceMetrics, TerminalSourceStatus } from "../source"
import type { TerminalProjectionActions } from "../store"
import type { AgentRegistryEntry, FilePayload, TerminalEvent } from "../types"
import {
  LiveEventAdapter,
  type AdaptedLiveBatch,
  type LiveAdapterLookup,
  type LiveFileRegistration,
  type LiveForkRequest,
  type LiveStoreSnapshot,
  type OpenCodeEvent,
} from "./adapters"
import { ReplayBuffer } from "./replay-buffer"

export interface LiveSessionSourceOptions {
  sessionID?: string
  directory?: string
  syncSession(sessionID: string, options?: { force?: boolean; messageLimit?: number }): Promise<void>
  hydrateSnapshot?(sessionID: string, options?: { force?: boolean }): Promise<void>
  snapshot(sessionID: string): LiveStoreSnapshot
  subscribeDirectory(directory: string, listener: (event: OpenCodeEvent) => void): () => void
  subscribeGlobal(listener: (event: OpenCodeEvent) => void): () => void
  startEvents(): void | Promise<void>
  replyQuestion(input: { requestID: string; answers: string[][] }): Promise<unknown>
  promptAsync(input: { sessionID: string; messageID: string; parts: Array<{ id: string; type: "text"; text: string }> }): Promise<unknown>
  sessionStatus?(sessionID: string): Promise<{ type?: string } | undefined>
  deliveryTimeoutMs?: number
  readFile?(path: string): Promise<{ content?: string } | undefined>
  onEvent?: (event: TerminalEvent) => void
  onReset?: () => void
  onFiles?: (files: readonly LiveFileRegistration[]) => void
  onAgents?: (agents: readonly AgentRegistryEntry[]) => void
  onSessionTitle?: (title: string) => void
  dequeue?: () => string | undefined
  onSessionCreated?: (session: Session) => void
  createSession?: (title: string) => Promise<Session | undefined>
  now?: () => number
}

export interface LiveSourceStatus extends TerminalSourceStatus {
  choice: string | null
}

const initialStatus = (): LiveSourceStatus => ({
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

const structuredUserEdit = (path: string, content: string) => {
  const lines = content.split("\n")
  const context = lines.length <= 40 ? content : `${lines.slice(0, 20).join("\n")}\n…\n${lines.slice(-20).join("\n")}`
  return [
    "<user_edit>",
    `path: ${path}`,
    "The user saved this session-local viewer edit. Treat it as authoritative and rebase the next write on it.",
    "<content>",
    context,
    "</content>",
    "</user_edit>",
  ].join("\n")
}

interface PendingPrompt {
  sessionID: string
  messageID: string
  parts: Array<{ id: string; type: "text"; text: string }>
  acknowledged: boolean
  assistantStarted: boolean
  attempts: number
  timeout?: ReturnType<typeof setTimeout>
}

const DEFAULT_DELIVERY_TIMEOUT_MS = 1_000
const IDLE_CONFIRM_RETRY_MS = 50

function activePlanNode(events: readonly TerminalEvent[]) {
  const states = new Map<string, "pending" | "active" | "done" | "rejected">()
  const order: string[] = []
  for (const event of events) {
    if (event.kind !== "plan") continue
    if (!states.has(event.payload.node)) order.push(event.payload.node)
    states.set(event.payload.node, ({
      add: "pending",
      start: "active",
      done: "done",
      reject: "rejected",
    } as const)[event.payload.op])
  }
  for (let index = order.length - 1; index >= 0; index -= 1) {
    const node = order[index]!
    if (states.get(node) === "active") return node
  }
}

export class LiveSessionSource implements TerminalEventSource<LiveSourceStatus> {
  readonly agents: AgentRegistryEntry[] = []

  private readonly adapter = new LiveEventAdapter()
  private readonly replay = new ReplayBuffer()
  private readonly listeners = new Set<(event: TerminalEvent) => void>()
  private readonly statusListeners = new Set<(status: LiveSourceStatus) => void>()
  private readonly registeredAgents = new Set<string>()
  private readonly registeredFiles = new Set<string>()
  private readonly eventQueue: OpenCodeEvent[] = []
  private buffered: AdaptedLiveBatch[] = []
  private unsubs: Array<() => void> = []
  private started = false
  private disposed = false
  private starting?: Promise<void>
  private folding?: Promise<void>
  private isPlaying = true
  private connected = false
  private complete = false
  private choice: string | null = null
  private fork?: LiveForkRequest
  private pendingPrompt?: PendingPrompt
  private deferredPrompts: string[] = []
  private replayStep?: number
  private startedAt = 0
  private sessionID?: string
  private directory?: string

  constructor(private readonly options: LiveSessionSourceOptions) {
    this.sessionID = options.sessionID
    this.directory = options.directory
    if (options.onEvent) this.listeners.add(options.onEvent)
  }

  get lastStep() {
    return this.replay.lastStep
  }

  start() {
    if (this.disposed || this.started || this.starting) return
    this.starting = this.attach().finally(() => {
      this.starting = undefined
    })
  }

  stop() {
    if (!this.started && !this.starting) return
    this.started = false
    this.isPlaying = false
    this.unsubs.splice(0).forEach((unsubscribe) => unsubscribe())
    this.emitStatus()
  }

  dispose() {
    if (this.disposed) return
    this.stop()
    this.disposed = true
    this.clearPendingPrompt()
    this.eventQueue.length = 0
    this.buffered = []
    this.listeners.clear()
    this.statusListeners.clear()
  }

  subscribe(listener: (event: TerminalEvent) => void) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  subscribeStatus(listener: (status: LiveSourceStatus) => void) {
    this.statusListeners.add(listener)
    return () => this.statusListeners.delete(listener)
  }

  status(): LiveSourceStatus {
    const step = this.replayStep ?? this.replay.lastStep
    return {
      connected: this.connected,
      state: this.complete ? "complete" : this.fork ? "awaiting-decision" : this.isPlaying ? "running" : "paused",
      step,
      lastStep: this.replay.lastStep,
      checkpointCount: this.replay.checkpointCount,
      playing: this.isPlaying && this.replayStep === undefined,
      complete: this.complete,
      forkActive: !!this.fork,
      choice: this.choice,
    }
  }

  metrics(step = this.status().step): TerminalSourceMetrics {
    const events = this.replay.through(step)
    const byAgent: TerminalSourceMetrics["byAgent"] = {}
    let contextPct: number | undefined
    for (const event of events) {
      if (event.kind !== "resource" || event.agent === "user") continue
      byAgent[event.agent] = { tokens: event.payload.tokens, costUsd: event.payload.costUsd }
      if (event.payload.ctxPct !== undefined) contextPct = Math.max(contextPct ?? 0, event.payload.ctxPct)
    }
    const values = Object.values(byAgent)
    const end = events.at(-1)?.ts ?? this.startedAt
    return {
      byAgent,
      tokens: values.reduce((sum, item) => sum + item.tokens, 0),
      costUsd: values.reduce((sum, item) => sum + item.costUsd, 0),
      elapsedSeconds: Math.max(0, Math.floor((end - this.startedAt) / 1_000)),
      ...(contextPct === undefined ? {} : { contextPct }),
    }
  }

  play() {
    if (this.complete) return
    this.isPlaying = true
    this.replayStep = undefined
    this.project(this.replay.tail())
    const queued = this.buffered.splice(0)
    for (const batch of queued) this.applyBatch(batch)
    this.emitStatus()
  }

  pause() {
    this.isPlaying = false
    this.replayStep = undefined
    this.emitStatus()
  }

  toggle() {
    if (this.isPlaying && this.replayStep === undefined) this.pause()
    else this.play()
  }

  stepForward() {
    const current = this.replayStep ?? this.lastStep
    if (current >= this.lastStep) {
      this.play()
      return
    }
    this.jump(current + 1)
  }

  stepBackward() {
    const current = this.replayStep ?? this.lastStep
    this.jump(Math.max(0, current - 1))
  }

  jump(step: number) {
    this.isPlaying = false
    this.replayStep = Math.min(this.lastStep, Math.max(0, Math.trunc(step)))
    this.project(this.replay.through(this.replayStep))
    this.emitStatus()
  }

  resolveFork(choice: string) {
    const fork = this.fork
    if (!fork) return
    const option = fork.options.find((item) => (item.value ?? item.key) === choice)
    if (!option) return
    void this.options
      .replyQuestion({ requestID: fork.requestID, answers: [[option.value ?? option.label]] })
      .then(() => {
        this.releaseFork(fork.requestID, choice, this.options.now?.() ?? Date.now())
      })
      .catch(() => {})
  }

  send(value: string) {
    const text = value.trim()
    if (!text) return
    void this.ensureSession(text).then(() => {
      if (!this.sessionID) return
      if (this.pendingPrompt) {
        this.deferredPrompts.push(text)
        return
      }
      return this.dispatchPrompt(this.sessionID, text)
    })
  }

  saveFileEdit(path: string, content: string) {
    if (!this.sessionID) return
    const text = structuredUserEdit(path, content)
    if (this.pendingPrompt) {
      this.deferredPrompts.push(text)
      return
    }
    void this.dispatchPrompt(this.sessionID, text)
  }

  private async attach() {
    const sessionID = this.sessionID
    const directory = this.directory
    if (!sessionID || !directory) {
      this.unsubs.push(this.options.subscribeGlobal((event) => {
        if (event.type === "server.connected") void this.resnapshot(true)
      }))
      await this.options.startEvents()
      if (this.disposed) return
      this.started = true
      this.connected = true
      this.emitStatus()
      return
    }
    await this.options.syncSession(sessionID)
    if (this.disposed) return
    await this.resnapshot(false)
    if (this.disposed) return
    this.unsubs.push(this.options.subscribeDirectory(directory, (event) => this.enqueue(event)))
    this.unsubs.push(this.options.subscribeGlobal((event) => {
      if (event.type === "server.connected") void this.resnapshot(true)
    }))
    await this.options.startEvents()
    if (this.disposed) return
    this.started = true
    this.connected = true
    this.emitStatus()
  }

  private enqueue(event: OpenCodeEvent) {
    if (event.type === "sync" || event.type === "server.heartbeat") return
    this.eventQueue.push(event)
    if (this.folding) return
    this.folding = this.drainEvents().finally(() => {
      this.folding = undefined
      if (this.eventQueue.length) this.enqueueDrain()
    })
  }

  private enqueueDrain() {
    if (this.folding) return
    this.folding = this.drainEvents().finally(() => {
      this.folding = undefined
    })
  }

  private async drainEvents() {
    for (;;) {
      const event = this.eventQueue.shift()
      if (!event) return
      const terminal = this.observeSessionEvent(event)
      const batch = this.adapter.adapt(event, this.lookup())
      await this.hydrateFiles(batch.files)
      this.consume(batch)
      if (terminal) this.emitStatus()
      this.observePromptEvent(event)
      if (event.type === "session.idle") {
        const properties = event.properties as { sessionID?: string }
        if (properties.sessionID === this.sessionID) await this.confirmIdleBoundary()
      }
    }
  }

  private consume(batch: AdaptedLiveBatch) {
    if (!this.isPlaying || this.replayStep !== undefined) {
      this.buffered.push(batch)
      return
    }
    this.applyBatch(batch)
  }

  private applyBatch(batch: AdaptedLiveBatch) {
    this.registerAgents(batch.agents)
    this.registerFiles(batch.files)
    const events = this.eventsWithForkPlan(batch, this.replay.tail())
    if (batch.fork) this.fork = batch.fork
    this.fold(events)
    if (batch.forkResolution && this.fork?.requestID === batch.forkResolution.requestID) {
      this.releaseFork(batch.forkResolution.requestID, batch.forkResolution.choice, batch.forkResolution.ts)
    }
    this.emitStatus()
  }

  private fold(events: readonly TerminalEvent[]) {
    const appended = this.replay.append(events)
    appended.forEach((event) => this.emit(event))
  }

  private eventsWithForkPlan(batch: AdaptedLiveBatch, history: readonly TerminalEvent[]) {
    const fork = batch.fork
    if (!fork) return batch.events
    const context = [...history, ...batch.events]
    const parent = activePlanNode(context)
    const ts = batch.events.findLast((event) => event.kind === "fork" && event.payload.op === "open")?.ts
      ?? batch.events.at(-1)?.ts
      ?? this.options.now?.()
      ?? Date.now()
    const planEvents: TerminalEvent[] = fork.planOptions.map((option) => ({
      id: `${option.node}:add`,
      ts,
      agent: "orchestrator",
      kind: "plan",
      payload: {
        op: "add",
        node: option.node,
        label: option.label,
        ...(parent ? { parent } : {}),
        fork: option.identity,
      },
    }))
    return [...batch.events, ...planEvents]
  }

  private releaseFork(requestID: string, choice: string, ts: number) {
    const fork = this.fork
    if (fork?.requestID !== requestID) return false
    const chosen = fork.planOptions.find((option) => option.identity === choice)
    const planEvents = fork.planOptions.flatMap<TerminalEvent>((option) => {
      if (option !== chosen) {
        return [{
          id: `${option.node}:reject`,
          ts,
          agent: "orchestrator",
          kind: "plan",
          payload: { op: "reject", node: option.node },
        }]
      }
      return [
        {
          id: `${option.node}:start`,
          ts,
          agent: "orchestrator",
          kind: "plan",
          payload: { op: "start", node: option.node },
        },
        {
          id: `${option.node}:done`,
          ts,
          agent: "orchestrator",
          kind: "plan",
          payload: { op: "done", node: option.node },
        },
      ]
    })
    const event: TerminalEvent = {
      id: `live:${requestID}:fork:resolve`,
      ts,
      agent: "user",
      kind: "fork",
      payload: { op: "resolve", choice },
    }
    const events = [...planEvents, event]
    this.choice = choice
    this.fork = undefined
    if (this.isPlaying && this.replayStep === undefined) {
      this.fold(events)
    } else {
      this.buffered.push({ events, agents: [], files: [] })
    }
    this.emitStatus()
    this.drainOne()
    return true
  }

  private async resnapshot(force: boolean) {
    if (!this.sessionID) return
    await this.options.syncSession(this.sessionID, force ? { force: true } : undefined)
    await this.options.hydrateSnapshot?.(this.sessionID, force ? { force: true } : undefined)
    const snapshot = this.options.snapshot(this.sessionID)
    const root = snapshot.sessions.find((session) => session.id === snapshot.rootSessionID)
    if (root) this.options.onSessionTitle?.(root.title.trim())
    const batch = this.adapter.snapshot(snapshot)
    await this.hydrateFiles(batch.files)
    if (!this.startedAt) this.startedAt = batch.events.at(0)?.ts ?? this.options.now?.() ?? Date.now()
    this.registerAgents(batch.agents)
    this.registerFiles(batch.files)
    const events = this.eventsWithForkPlan(batch, [])
    this.fork = batch.fork
    this.choice = null
    this.replay.replace(events)
    if (this.isPlaying && this.replayStep === undefined) this.project(this.replay.tail())
    else this.buffered = []
    this.connected = true
    this.emitStatus()
  }

  private project(events: readonly TerminalEvent[]) {
    this.options.onReset?.()
    events.forEach((event) => this.emit(event))
  }

  private registerAgents(agents: readonly AgentRegistryEntry[]) {
    const fresh = agents.filter((agent) => {
      if (this.registeredAgents.has(agent.id)) return false
      this.registeredAgents.add(agent.id)
      this.agents.push(agent)
      return true
    })
    if (fresh.length) this.options.onAgents?.(fresh)
  }

  private registerFiles(files: readonly LiveFileRegistration[]) {
    for (const file of files) this.registeredFiles.add(file.path)
    if (files.length) this.options.onFiles?.(files)
  }

  private async hydrateFiles(files: LiveFileRegistration[]) {
    if (!this.options.readFile) return
    await Promise.all(
      files.map(async (file) => {
        if (file.payload.content || file.payload.stat === "deleted") return
        const response = await this.options.readFile?.(file.path).catch(() => undefined)
        if (response?.content !== undefined) file.payload.content = response.content
      }),
    )
  }

  private lookup(): LiveAdapterLookup {
    const sessionID = this.sessionID
    if (!sessionID) {
      return {
        rootSessionID: "",
        session: () => undefined,
        message: () => undefined,
        parts: () => [],
        now: this.options.now,
      }
    }
    const snapshot = this.options.snapshot(sessionID)
    const sessions = snapshot.sessions
    const messages = Object.values(snapshot.messages).flatMap((items) => items ?? [])
    return {
      rootSessionID: snapshot.rootSessionID,
      session: (id) => sessions.find((session) => session.id === id),
      message: (id) => messages.find((message) => message.id === id),
      parts: (id) => snapshot.parts[id] ?? [],
      now: this.options.now,
    }
  }

  private observeSessionEvent(event: OpenCodeEvent) {
    if (event.type !== "session.created" && event.type !== "session.updated" && event.type !== "session.deleted") return false
    const properties = event.properties as { sessionID?: string; info?: Session }
    const session = properties.info
    const eventSessionID = session?.id ?? properties.sessionID
    if (eventSessionID !== this.sessionID) return false
    if (event.type !== "session.deleted") {
      if (session) this.options.onSessionTitle?.(session.title.trim())
      return false
    }
    this.complete = true
    this.isPlaying = false
    this.replayStep = undefined
    return true
  }

  private dispatchPrompt(sessionID: string, text: string) {
    if (this.pendingPrompt) {
      this.deferredPrompts.push(text)
      return Promise.resolve()
    }
    const prompt: PendingPrompt = {
      sessionID,
      messageID: Identifier.ascending("message"),
      parts: [{ id: Identifier.ascending("part"), type: "text", text }],
      acknowledged: false,
      assistantStarted: false,
      attempts: 0,
    }
    this.pendingPrompt = prompt
    return this.attemptPrompt(prompt)
  }

  private attemptPrompt(prompt: PendingPrompt) {
    if (this.disposed || this.pendingPrompt !== prompt) return Promise.resolve()
    prompt.attempts += 1
    return this.options
      .promptAsync({ sessionID: prompt.sessionID, messageID: prompt.messageID, parts: prompt.parts })
      .then(() => {
        if (this.pendingPrompt !== prompt || prompt.assistantStarted) return
        const timeout = this.options.deliveryTimeoutMs ?? DEFAULT_DELIVERY_TIMEOUT_MS
        prompt.timeout = setTimeout(() => void this.verifyPrompt(prompt), timeout)
      })
      .catch(() => {
        if (this.pendingPrompt === prompt) this.clearPendingPrompt()
      })
  }

  private observePromptEvent(event: OpenCodeEvent) {
    const prompt = this.pendingPrompt
    if (!prompt || event.type !== "message.updated") return
    const properties = event.properties as { info?: Message }
    const message = properties.info
    if (!message || message.sessionID !== prompt.sessionID) return
    if (message.role === "user" && message.id === prompt.messageID) {
      prompt.acknowledged = true
      return
    }
    if (message.role !== "assistant" || message.parentID !== prompt.messageID) return
    prompt.assistantStarted = true
    if (prompt.timeout) clearTimeout(prompt.timeout)
    prompt.timeout = undefined
  }

  private async verifyPrompt(prompt: PendingPrompt) {
    prompt.timeout = undefined
    if (this.disposed || this.pendingPrompt !== prompt) return
    const status = await this.options.sessionStatus?.(prompt.sessionID).catch(() => undefined)
    if (this.pendingPrompt !== prompt) return
    if (status && status.type !== "idle") {
      prompt.timeout = setTimeout(
        () => void this.verifyPrompt(prompt),
        prompt.assistantStarted ? IDLE_CONFIRM_RETRY_MS : this.options.deliveryTimeoutMs ?? DEFAULT_DELIVERY_TIMEOUT_MS,
      )
      return
    }
    await this.options.syncSession(prompt.sessionID, { force: true }).catch(() => undefined)
    if (this.pendingPrompt !== prompt) return
    const messages = this.options.snapshot(prompt.sessionID).messages[prompt.sessionID] ?? []
    prompt.acknowledged ||= messages.some((message) => message.role === "user" && message.id === prompt.messageID)
    prompt.assistantStarted ||= messages.some((message) => message.role === "assistant" && message.parentID === prompt.messageID)
    if (prompt.assistantStarted) {
      this.clearPendingPrompt()
      return
    }
    if (!prompt.acknowledged) return
    if (prompt.attempts > 1) {
      this.clearPendingPrompt()
      return
    }
    await this.attemptPrompt(prompt)
  }

  private clearPendingPrompt() {
    const prompt = this.pendingPrompt
    if (!prompt) return
    if (prompt.timeout) clearTimeout(prompt.timeout)
    this.pendingPrompt = undefined
  }

  private async confirmIdleBoundary() {
    const sessionID = this.sessionID
    if (!sessionID) return
    const status = await this.options.sessionStatus?.(sessionID).catch(() => undefined)
    if (status && status.type !== "idle") return
    const prompt = this.pendingPrompt
    if (prompt) {
      if (prompt.assistantStarted) this.clearPendingPrompt()
      else {
        if (prompt.timeout) clearTimeout(prompt.timeout)
        prompt.timeout = undefined
        await this.options.syncSession(prompt.sessionID, { force: true }).catch(() => undefined)
        if (this.pendingPrompt !== prompt) return
        const messages = this.options.snapshot(prompt.sessionID).messages[prompt.sessionID] ?? []
        prompt.acknowledged ||= messages.some((message) => message.role === "user" && message.id === prompt.messageID)
        prompt.assistantStarted ||= messages.some((message) => message.role === "assistant" && message.parentID === prompt.messageID)
        if (prompt.assistantStarted) this.clearPendingPrompt()
        else if (prompt.acknowledged && prompt.attempts === 1) {
          await this.attemptPrompt(prompt)
          return
        } else {
          this.clearPendingPrompt()
        }
      }
    }
    this.drainOne()
    this.emitStatus()
  }

  private drainOne() {
    if (!this.isPlaying || this.fork || this.complete || this.pendingPrompt) return false
    const deferred = this.deferredPrompts.shift()
    if (deferred !== undefined) {
      this.send(deferred)
      return true
    }
    const next = this.options.dequeue?.()
    if (next === undefined) return false
    this.send(next)
    return true
  }

  private ensureSession(title: string) {
    if (this.sessionID) return Promise.resolve()
    if (!this.options.createSession) return Promise.resolve()
    return this.options.createSession(title).then(async (session) => {
      if (!session) return
      this.sessionID = session.id
      this.directory = session.directory
      this.options.onSessionCreated?.(session)
      await this.options.syncSession(session.id)
      await this.resnapshot(false)
      if (this.started) this.unsubs.push(this.options.subscribeDirectory(session.directory, (event) => this.enqueue(event)))
    })
  }

  private emit(event: TerminalEvent) {
    for (const listener of this.listeners) listener(event)
  }

  private emitStatus() {
    const status = this.status()
    for (const listener of this.statusListeners) listener({ ...status })
  }
}

export interface LiveSessionBindings {
  sessionID: string
  directory: string
  actions: TerminalProjectionActions
  contextLimits?: Record<string, number | undefined>
  now?: () => number
  sessionData: {
    info: Record<string, Session | undefined>
    session_status: LiveStoreSnapshot["statuses"]
    session_diff: LiveStoreSnapshot["diffs"]
    todo: LiveStoreSnapshot["todos"]
    question: LiveStoreSnapshot["questions"]
    message: Record<string, Message[] | undefined>
    part: Record<string, Part[] | undefined>
  }
}

export function liveStoreSnapshot(bindings: LiveSessionBindings): LiveStoreSnapshot {
  const sessions: Session[] = []
  let current = bindings.sessionData.info[bindings.sessionID]
  if (current) sessions.push(current)
  for (const session of Object.values(bindings.sessionData.info)) {
    if (!session || sessions.some((item) => item.id === session.id)) continue
    let parent = session.parentID
    while (parent) {
      if (parent === bindings.sessionID) {
        sessions.push(session)
        break
      }
      parent = bindings.sessionData.info[parent]?.parentID
    }
  }
  return {
    rootSessionID: bindings.sessionID,
    sessions,
    messages: bindings.sessionData.message,
    parts: bindings.sessionData.part,
    statuses: bindings.sessionData.session_status,
    diffs: bindings.sessionData.session_diff,
    todos: bindings.sessionData.todo,
    questions: bindings.sessionData.question,
    contextLimits: bindings.contextLimits,
    now: bindings.now,
  }
}

export function registeredFilePayload(file: LiveFileRegistration): { path: string; payload: FilePayload & { agent: string; updatedAt: number } } {
  return {
    path: file.path,
    payload: { ...file.payload, agent: file.agent, updatedAt: file.ts },
  }
}

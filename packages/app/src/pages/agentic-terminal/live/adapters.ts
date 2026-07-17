import type {
  AssistantMessage,
  Event,
  Message,
  Part,
  QuestionInfo,
  QuestionRequest,
  Session,
  SessionStatus,
  SnapshotFileDiff,
  Todo,
  ToolPart,
} from "@opencode-ai/sdk/v2/client"
import type {
  AgentId,
  AgentRegistryEntry,
  DiffLine,
  FilePayload,
  ForkOption,
  TerminalEvent,
} from "../types"

export const LIVE_COLORS = {
  root: "#fab283",
  agents: ["#56b6c2", "#5c9cf5", "#e5c07b", "#9d7cd8", "#7fd88f"],
  error: "#e06c75",
  muted: "#808080",
} as const

export type OpenCodeEvent = Event | { type: "sync" | "server.heartbeat"; id?: string; properties?: unknown }

export interface LiveStoreSnapshot {
  rootSessionID: string
  sessions: readonly Session[]
  messages: Record<string, readonly Message[] | undefined>
  parts: Record<string, readonly Part[] | undefined>
  statuses?: Record<string, SessionStatus | undefined>
  diffs?: Record<string, readonly SnapshotFileDiff[] | undefined>
  todos?: Record<string, readonly Todo[] | undefined>
  questions?: Record<string, readonly QuestionRequest[] | undefined>
  contextLimits?: Record<string, number | undefined>
  now?: () => number
}

export interface LiveAdapterLookup {
  rootSessionID: string
  session(sessionID: string): Session | undefined
  message(messageID: string): Message | undefined
  parts(messageID: string): readonly Part[]
  contextLimit?(providerID: string, modelID: string): number | undefined
  now?: () => number
}

export interface LiveFileRegistration {
  path: string
  payload: FilePayload
  agent: AgentId
  ts: number
}

export interface LiveForkPlanOption {
  node: string
  identity: string
  label: string
}

export interface LiveForkRequest {
  requestID: string
  options: readonly ForkOption[]
  planOptions: readonly LiveForkPlanOption[]
}

export interface AdaptedLiveBatch {
  events: TerminalEvent[]
  agents: AgentRegistryEntry[]
  files: LiveFileRegistration[]
  fork?: LiveForkRequest
  forkResolution?: { requestID: string; choice: string; ts: number }
}

const emptyBatch = (): AdaptedLiveBatch => ({ events: [], agents: [], files: [] })
const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {}
const stringValue = (value: unknown) => (typeof value === "string" ? value : undefined)
const numberValue = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : undefined)
const terminalEvent = <T extends TerminalEvent>(event: T) => event
const normalizeWhitespace = (value: string) => value.replace(/\s+/g, " ").trim()
const stripAnsi = (value: string) => value.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "")
const eventID = (...parts: Array<string | number | undefined>) => `live:${parts.filter((part) => part !== undefined).join(":")}`

function timestampFromEventID(id: string | undefined) {
  if (!id?.startsWith("evt_")) return
  const hex = id.slice(4, 16)
  if (!/^[0-9a-fA-F]{12}$/.test(hex)) return
  try {
    return Number(BigInt(`0x${hex}`) / 0x1000n)
  } catch {
    return
  }
}

function eventTimestamp(event: OpenCodeEvent, properties: Record<string, unknown>, fallback: () => number) {
  const explicit = numberValue(properties.time) ?? numberValue(properties.timestamp)
  if (explicit !== undefined) return explicit
  const encoded = timestampFromEventID(event.id)
  if (encoded !== undefined) return encoded
  // Legacy sync/heartbeat and hand-written transport frames are not schema events and may have no timestamp-bearing ID.
  return fallback()
}

export function summarizeNarration(value: string) {
  const text = normalizeWhitespace(value)
  if (!text) return ""
  const sentences = text.match(/[^.!?]+(?:[.!?]+|$)/g)?.map((item) => item.trim()).filter(Boolean) ?? [text]
  const summary = sentences.slice(0, 2).join(" ")
  return summary.length <= 360 ? summary : `${summary.slice(0, 357).trimEnd()}…`
}

export function summarizeCommandOutput(value: string) {
  const lines = stripAnsi(value)
    .replace(/\r/g, "")
    .split("\n")
    .map(normalizeWhitespace)
    .filter((line) => line && !line.startsWith("<shell_metadata>"))
  if (lines.length === 0) return "(no output)"
  const summary = lines.length === 1 ? lines[0]! : `${lines[0]} · … · ${lines.at(-1)}`
  return summary.length <= 220 ? summary : `${summary.slice(0, 217).trimEnd()}…`
}

function slug(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return normalized || "agent"
}

function hash(value: string) {
  let result = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index)
    result = Math.imul(result, 16777619)
  }
  return (result >>> 0).toString(36)
}

function languageForPath(path: string) {
  const extension = path.split(".").at(-1)?.toLowerCase()
  const aliases: Record<string, string> = {
    ts: "ts",
    tsx: "tsx",
    js: "js",
    jsx: "jsx",
    md: "md",
    json: "json",
    py: "py",
    rs: "rs",
    go: "go",
    css: "css",
    html: "html",
    yml: "yaml",
    yaml: "yaml",
  }
  return aliases[extension ?? ""] ?? extension ?? "text"
}

export function salientDiff(diff: string, limit = 6): DiffLine[] {
  const lines: DiffLine[] = []
  for (const line of diff.replace(/\r/g, "").split("\n")) {
    if (/^(---|\+\+\+|@@|diff |index )/.test(line)) continue
    const sign: DiffLine[0] = line.startsWith("+") ? "+" : line.startsWith("-") ? "-" : " "
    const content = sign === " " ? line.replace(/^ /, "") : line.slice(1)
    if (!content.trim() && lines.length === 0) continue
    lines.push([sign, content])
    if (lines.length === limit) break
  }
  return lines
}

function fileStat(additions?: number, deletions?: number, status?: string) {
  if (status === "added" && !additions && !deletions) return "new"
  if (status === "deleted" && !additions && !deletions) return "deleted"
  return `+${additions ?? 0} −${deletions ?? 0}`
}

function errorMessage(error: unknown) {
  const record = asRecord(error)
  const data = asRecord(record.data)
  return stringValue(data.message) ?? stringValue(record.message) ?? stringValue(record.name) ?? "Session failed"
}

function fileFromText(value: string) {
  return value.match(/(?:^|\s)([\w./\\-]+\.[a-zA-Z0-9]{1,8})(?=\s|:|,|$)/)?.[1]
}

function messageTimestamp(message: Message | undefined, fallback: number) {
  if (!message) return fallback
  return message.time.created
}

function partTimestamp(part: Part, message: Message | undefined, fallback: number) {
  if ("time" in part && part.time && typeof part.time === "object") {
    const time = part.time as { start?: number; created?: number; end?: number }
    return time.end ?? time.start ?? time.created ?? messageTimestamp(message, fallback)
  }
  return messageTimestamp(message, fallback)
}

function textPartComplete(part: Extract<Part, { type: "text" }>, message: Message | undefined) {
  if (part.ignored) return false
  if (message?.role === "user") return true
  return part.time?.end !== undefined || message?.time.completed !== undefined
}

function toolMetadata(part: ToolPart) {
  const stateMetadata = "metadata" in part.state ? asRecord(part.state.metadata) : {}
  return { ...asRecord(part.metadata), ...stateMetadata }
}

function toolInput(part: ToolPart) {
  return asRecord(part.state.input)
}

function toolTerminal(part: ToolPart) {
  return part.state.status === "completed" || part.state.status === "error"
}

function commandExit(part: ToolPart) {
  if (part.state.status === "error") return 1
  const exit = numberValue(toolMetadata(part).exit)
  return exit === undefined || exit === 0 ? 0 : exit
}

function commandText(part: ToolPart) {
  const input = toolInput(part)
  return stringValue(input.command) ?? ("title" in part.state ? stringValue(part.state.title) : undefined) ?? part.tool
}

function commandOutput(part: ToolPart) {
  if (part.state.status === "error") return part.state.error
  const metadata = toolMetadata(part)
  if (part.state.status !== "completed") return stringValue(metadata.output) ?? ""
  return stringValue(metadata.output) ?? part.state.output
}

function todoOp(todo: Todo): "add" | "start" | "done" | "reject" {
  if (todo.status === "completed") return "done"
  if (todo.status === "in_progress") return "start"
  if (todo.status === "cancelled") return "reject"
  return "add"
}

export function forkFromQuestion(
  input: unknown,
  id = "question",
  ts = Date.now(),
): { event: TerminalEvent; request: LiveForkRequest } | undefined {
  const request = asRecord(input)
  const questions = Array.isArray(request.questions) ? request.questions : []
  if (questions.length !== 1) return
  const question = asRecord(questions[0]) as QuestionInfo & Record<string, unknown>
  const options = Array.isArray(question.options) ? question.options : []
  if (question.multiple === true || question.custom === true || options.length < 2) return
  const mapped = options.map((option, index) => {
    const value = asRecord(option)
    const label = stringValue(value.label) ?? `Option ${index + 1}`
    return {
      key: String(index + 1),
      label,
      note: stringValue(value.description) ?? "",
      value: label,
    }
  })
  const requestID = stringValue(request.id) ?? id
  const planOptions = mapped.map((option) => ({
    node: eventID(requestID, "fork", "option", option.key, hash(option.value ?? option.label)),
    identity: option.value ?? option.key,
    label: option.label,
  }))
  return {
    event: terminalEvent({
      id: eventID(id, "fork", "open"),
      ts,
      agent: "orchestrator",
      kind: "fork",
      payload: {
        op: "open",
        prompt: stringValue(question.question) ?? stringValue(question.header) ?? "Decision required",
        options: mapped,
      },
    }),
    request: { requestID, options: mapped, planOptions },
  }
}

interface OpenIssue {
  id: string
  signature: string
  agent: AgentId
  title: string
  file?: string
  detail: string
}

export class IssueSynthesizer {
  private readonly open = new Map<string, OpenIssue>()
  private sequence = 0

  reset() {
    this.open.clear()
    this.sequence = 0
  }

  failCommand(input: { command: string; output: string; agent: AgentId; ts: number; sourceID: string }) {
    const signature = normalizeWhitespace(input.command).toLowerCase()
    const existing = this.open.get(signature)
    if (existing) return []
    const file = fileFromText(`${input.command} ${input.output}`)
    const issue: OpenIssue = {
      id: `cmd-${hash(`${signature}:${this.sequence++}`)}`,
      signature,
      agent: input.agent,
      title: summarizeCommandOutput(input.output),
      file,
      detail: summarizeCommandOutput(input.output),
    }
    this.open.set(signature, issue)
    return [
      terminalEvent({
        id: eventID(input.sourceID, "issue", "open"),
        ts: input.ts,
        agent: input.agent,
        kind: "issue",
        payload: {
          op: "open",
          issueId: issue.id,
          title: issue.title,
          agent: file ? `${input.agent} · ${file}` : input.agent,
          detail: issue.detail,
        },
      }),
    ]
  }

  succeedCommand(input: { command: string; output: string; agent: AgentId; ts: number; sourceID: string }) {
    const signature = normalizeWhitespace(input.command).toLowerCase()
    const issue = this.open.get(signature)
    if (!issue) return []
    this.open.delete(signature)
    return [
      terminalEvent({
        id: eventID(input.sourceID, issue.id, "fixing"),
        ts: input.ts,
        agent: input.agent,
        kind: "issue",
        payload: { op: "fixing", issueId: issue.id },
      }),
      terminalEvent({
        id: eventID(input.sourceID, issue.id, "resolved"),
        ts: input.ts,
        agent: input.agent,
        kind: "issue",
        payload: {
          op: "resolved",
          issueId: issue.id,
          resolution: summarizeCommandOutput(input.output),
        },
      }),
    ]
  }

  sessionError(input: { detail: string; agent: AgentId; ts: number; sourceID: string }) {
    const signature = `session:${normalizeWhitespace(input.detail).toLowerCase()}`
    const existing = this.open.get(signature)
    if (existing) return []
    const file = fileFromText(input.detail)
    const issue: OpenIssue = {
      id: `session-${hash(`${signature}:${this.sequence++}`)}`,
      signature,
      agent: input.agent,
      title: summarizeNarration(input.detail),
      file,
      detail: summarizeNarration(input.detail),
    }
    this.open.set(signature, issue)
    return [
      terminalEvent({
        id: eventID(input.sourceID, "issue", "open"),
        ts: input.ts,
        agent: input.agent,
        kind: "issue",
        payload: {
          op: "open",
          issueId: issue.id,
          title: issue.title,
          agent: file ? `${input.agent} · ${file}` : input.agent,
          detail: issue.detail,
        },
      }),
    ]
  }

  unresolved() {
    return [...this.open.values()]
  }
}

export class LiveEventAdapter {
  private readonly agentBySession = new Map<string, AgentId>()
  private readonly registry = new Map<AgentId, AgentRegistryEntry>()
  private readonly messageResources = new Map<string, { agent: AgentId; tokens: number; costUsd: number }>()
  private readonly issues = new IssueSynthesizer()

  reset() {
    this.agentBySession.clear()
    this.registry.clear()
    this.messageResources.clear()
    this.issues.reset()
  }

  snapshot(input: LiveStoreSnapshot): AdaptedLiveBatch {
    this.reset()
    const batch = emptyBatch()
    const sessions = [...input.sessions]
      .filter((session) => this.inTree(session, input.rootSessionID, input.sessions))
      .sort((a, b) => a.time.created - b.time.created || a.id.localeCompare(b.id))

    for (const session of sessions) this.ensureSessionAgent(session, input.rootSessionID, input.sessions, batch)
    for (const session of sessions) {
      if (!session.parentID) continue
      const child = this.agentForSession(session, input.rootSessionID, input.sessions, batch)
      const parentSession = sessions.find((item) => item.id === session.parentID)
      const parent = parentSession
        ? this.agentForSession(parentSession, input.rootSessionID, input.sessions, batch)
        : this.rootAgent(input.rootSessionID, sessions, batch)
      batch.events.push(
        terminalEvent({
          id: eventID("snapshot", "spawn", session.id),
          ts: session.time.created,
          agent: parent,
          kind: "spawn",
          payload: { child, task: summarizeNarration(session.title) },
        }),
      )
    }

    const lookup: LiveAdapterLookup = {
      rootSessionID: input.rootSessionID,
      session: (id) => sessions.find((session) => session.id === id),
      message: (id) =>
        sessions.flatMap((session) => input.messages[session.id] ?? []).find((message) => message.id === id),
      parts: (id) => input.parts[id] ?? [],
      contextLimit: (providerID, modelID) => input.contextLimits?.[`${providerID}/${modelID}`],
      now: input.now,
    }

    const orderedMessages = sessions
      .flatMap((session) => input.messages[session.id] ?? [])
      .sort((a, b) => a.time.created - b.time.created || a.id.localeCompare(b.id))
    for (const message of orderedMessages) {
      const parts = [...(input.parts[message.id] ?? [])].sort((a, b) => a.id.localeCompare(b.id))
      for (const part of parts) this.merge(batch, this.adaptPart(part, message, lookup, `snapshot-${part.id}`, partTimestamp(part, message, message.time.created)))
      this.merge(batch, this.adaptMessage(message, lookup, `snapshot-${message.id}`))
    }
    for (const session of sessions) {
      const ts = session.time.updated
      const status = input.statuses?.[session.id]
      if (status) this.merge(batch, this.adaptSessionStatus({ sessionID: session.id, status }, lookup, `snapshot-${session.id}-status`, ts))
      const todos = input.todos?.[session.id]
      if (todos) this.merge(batch, this.adaptTodos({ sessionID: session.id, todos }, lookup, `snapshot-${session.id}-todos`, ts))
      const diff = input.diffs?.[session.id]
      if (diff) this.merge(batch, this.adaptSessionDiff({ sessionID: session.id, diff }, lookup, `snapshot-${session.id}-diff`, ts))
      for (const question of input.questions?.[session.id] ?? []) {
        const fork = forkFromQuestion(question, `snapshot-${question.id}`, ts)
        if (fork) this.merge(batch, { events: [fork.event], agents: [], files: [], fork: fork.request })
      }
    }
    return batch
  }

  adapt(event: OpenCodeEvent, lookup: LiveAdapterLookup): AdaptedLiveBatch {
    if (event.type === "sync" || event.type === "server.heartbeat") return emptyBatch()
    const properties = asRecord(event.properties)
    const id = event.id ?? `${event.type}-${hash(JSON.stringify(properties))}`
    const ts = eventTimestamp(event, properties, lookup.now ?? Date.now)

    switch (event.type) {
      case "session.created": {
        const session = properties.info as Session | undefined
        if (!session || !this.inLookupTree(session, lookup)) return emptyBatch()
        const batch = emptyBatch()
        const child = this.agentForSession(session, lookup.rootSessionID, this.lookupSessions(lookup, session), batch)
        if (!session.parentID) return batch
        const parentSession = lookup.session(session.parentID)
        const parent = parentSession
          ? this.agentForSession(parentSession, lookup.rootSessionID, this.lookupSessions(lookup, session), batch)
          : this.rootAgent(lookup.rootSessionID, this.lookupSessions(lookup, session), batch)
        batch.events.push(
          terminalEvent({
            id: eventID(id, "spawn", session.id),
            ts: session.time.created,
            agent: parent,
            kind: "spawn",
            payload: { child, task: summarizeNarration(session.title) },
          }),
        )
        return batch
      }
      case "message.part.updated": {
        const part = properties.part as Part | undefined
        if (!part || !this.sessionRelevant(part.sessionID, lookup)) return emptyBatch()
        return this.adaptPart(part, lookup.message(part.messageID), lookup, id, numberValue(properties.time) ?? ts)
      }
      case "message.updated": {
        const message = properties.info as Message | undefined
        if (!message || !this.sessionRelevant(message.sessionID, lookup)) return emptyBatch()
        return this.adaptMessage(message, lookup, id)
      }
      case "session.status":
        return this.adaptSessionStatus(properties, lookup, id, ts)
      case "session.error":
        return this.adaptSessionError(properties, lookup, id, ts)
      case "todo.updated":
        return this.adaptTodos(properties, lookup, id, ts)
      case "session.diff":
        return this.adaptSessionDiff(properties, lookup, id, ts)
      case "question.asked": {
        if (!this.sessionRelevant(stringValue(properties.sessionID), lookup)) return emptyBatch()
        const fork = forkFromQuestion(properties, id, ts)
        if (!fork) return emptyBatch()
        return { events: [fork.event], agents: [], files: [], fork: fork.request }
      }
      case "question.replied":
      case "question.rejected": {
        if (!this.sessionRelevant(stringValue(properties.sessionID), lookup)) return emptyBatch()
        const requestID = stringValue(properties.requestID)
        if (!requestID) return emptyBatch()
        const answers = Array.isArray(properties.answers) ? properties.answers : []
        const choice = event.type === "question.replied" && Array.isArray(answers[0])
          ? stringValue(answers[0][0]) ?? ""
          : ""
        return { events: [], agents: [], files: [], forkResolution: { requestID, choice, ts } }
      }
      case "session.deleted": {
        const session = properties.info as Session | undefined
        if (!session || !this.sessionRelevant(session.id, lookup)) return emptyBatch()
        return emptyBatch()
      }
      default:
        return emptyBatch()
    }
  }

  private adaptPart(
    part: Part,
    message: Message | undefined,
    lookup: LiveAdapterLookup,
    id: string,
    eventTime?: number,
  ): AdaptedLiveBatch {
    const batch = emptyBatch()
    const session = lookup.session(part.sessionID)
    if (!session) return batch
    const sessions = this.lookupSessions(lookup, session)
    const agent = message
      ? this.agentForMessage(message, lookup, batch)
      : this.agentForSession(session, lookup.rootSessionID, sessions, batch)
    const ts = eventTime ?? partTimestamp(part, message, lookup.now?.() ?? Date.now())

    if (part.type === "text" && textPartComplete(part, message)) {
      const text = summarizeNarration(part.text)
      if (text) {
        batch.events.push(
          terminalEvent({
            id: eventID(part.id, "text"),
            ts,
            agent: message?.role === "user" ? "user" : agent,
            kind: "text",
            payload: { text },
          }),
        )
      }
      return batch
    }

    if (part.type === "reasoning") {
      batch.events.push(
        terminalEvent({
          id: eventID(id, part.id, "status", part.time.end ? "work" : "think"),
          ts,
          agent,
          kind: "status",
          payload: { status: part.time.end ? "work" : "think", task: summarizeNarration(part.text) || "reasoning" },
        }),
      )
      return batch
    }

    if (part.type === "subtask") {
      const child = this.ensureAgent(part.agent, agent, batch)
      batch.events.push(
        terminalEvent({
          id: eventID(part.id, "spawn"),
          ts,
          agent,
          kind: "spawn",
          payload: { child, task: summarizeNarration(part.description || part.prompt) },
        }),
      )
      return batch
    }

    if (part.type !== "tool") return batch

    const status = part.state.status
    if (status === "pending" || status === "running") {
      batch.events.push(
        terminalEvent({
          id: eventID(id, part.id, "status", status),
          ts,
          agent,
          kind: "status",
          payload: {
            status: status === "running" ? "work" : "wait",
            task: summarizeNarration(("title" in part.state && part.state.title) || part.tool),
          },
        }),
      )
    }

    if (part.tool === "task" || part.tool === "subtask") {
      const metadata = toolMetadata(part)
      const input = toolInput(part)
      const childSessionID = stringValue(metadata.sessionId) ?? stringValue(metadata.sessionID)
      const childSession = childSessionID ? lookup.session(childSessionID) : undefined
      const child = childSession
        ? this.agentForSession(childSession, lookup.rootSessionID, this.lookupSessions(lookup, childSession), batch)
        : this.ensureAgent(
            stringValue(input.subagent_type) ?? stringValue(input.agent) ?? stringValue(input.description) ?? "subagent",
            agent,
            batch,
          )
      batch.events.push(
        terminalEvent({
          id: eventID(part.id, "spawn", child),
          ts,
          agent,
          kind: "spawn",
          payload: {
            child,
            task: summarizeNarration(stringValue(input.description) ?? stringValue(input.prompt) ?? "delegated task"),
          },
        }),
      )
    }

    if ((part.tool === "bash" || part.tool === "shell") && toolTerminal(part)) {
      const command = commandText(part)
      const output = summarizeCommandOutput(commandOutput(part))
      const exit = commandExit(part)
      batch.events.push(
        terminalEvent({
          id: eventID(part.id, "cmd", status),
          ts,
          agent,
          kind: "cmd",
          payload: { cmd: command, out: output, exit, outputColor: exit === 0 ? LIVE_COLORS.muted : LIVE_COLORS.error },
        }),
      )
      batch.events.push(
        ...(exit === 0
          ? this.issues.succeedCommand({ command, output, agent, ts, sourceID: part.id })
          : this.issues.failCommand({ command, output, agent, ts, sourceID: part.id })),
      )
    }

    for (const file of this.filesFromTool(part, agent, ts)) {
      batch.events.push(
        terminalEvent({
          id: eventID(part.id, "file", hash(file.payload.path), status),
          ts,
          agent,
          kind: "file",
          payload: file.payload,
        }),
      )
    }

    if (status === "error") {
      batch.events.push(
        terminalEvent({
          id: eventID(id, part.id, "status", "error"),
          ts,
          agent,
          kind: "status",
          payload: { status: "error", task: summarizeNarration(part.state.error) },
        }),
      )
    }
    return batch
  }

  private adaptMessage(message: Message, lookup: LiveAdapterLookup, id: string): AdaptedLiveBatch {
    const batch = emptyBatch()
    if (message.role !== "assistant" || message.time.completed === undefined) return batch
    const agent = this.agentForMessage(message, lookup, batch)
    const tokens = message.tokens.total ??
      message.tokens.input + message.tokens.output + message.tokens.reasoning + message.tokens.cache.read + message.tokens.cache.write
    this.messageResources.set(message.id, { agent, tokens, costUsd: message.cost })
    const totals = [...this.messageResources.values()].filter((item) => item.agent === agent)
    const contextLimit = lookup.contextLimit?.(message.providerID, message.modelID)
    const contextTokens = message.tokens.input + message.tokens.cache.read
    const ctxPct = contextLimit && contextLimit > 0
      ? Math.max(0, Math.min(100, Math.round((contextTokens / contextLimit) * 100)))
      : undefined
    batch.events.push(
      terminalEvent({
        id: eventID(message.id, "resource"),
        ts: message.time.completed,
        agent,
        kind: "resource",
        payload: {
          tokens: totals.reduce((sum, item) => sum + item.tokens, 0),
          costUsd: totals.reduce((sum, item) => sum + item.costUsd, 0),
          ...(ctxPct === undefined ? {} : { ctxPct }),
        },
      }),
    )
    if (message.error) {
      const detail = errorMessage(message.error)
      batch.events.push(...this.issues.sessionError({ detail, agent, ts: message.time.completed, sourceID: id }))
    }
    return batch
  }

  private adaptSessionStatus(properties: Record<string, unknown>, lookup: LiveAdapterLookup, id: string, ts: number) {
    const batch = emptyBatch()
    const sessionID = stringValue(properties.sessionID)
    if (!this.sessionRelevant(sessionID, lookup)) return batch
    const session = sessionID ? lookup.session(sessionID) : undefined
    if (!session) return batch
    const agent = this.agentForSession(session, lookup.rootSessionID, this.lookupSessions(lookup, session), batch)
    const status = asRecord(properties.status)
    const type = stringValue(status.type)
    if (type === "retry") {
      batch.events.push(
        terminalEvent({
          id: eventID(id, "status", "retry", numberValue(status.attempt)),
          ts,
          agent,
          kind: "status",
          payload: {
            status: "wait",
            task: summarizeNarration(stringValue(status.message) ?? "retrying"),
            retry: {
              attempt: numberValue(status.attempt) ?? 0,
              message: stringValue(status.message) ?? "",
              next: numberValue(status.next) ?? ts,
              action: status.action,
            },
          },
        }),
      )
      return batch
    }
    batch.events.push(
      terminalEvent({
        id: eventID(id, "status", type),
        ts: ts,
        agent,
        kind: "status",
        payload: {
          status: type === "busy" ? "think" : "idle",
          task: type === "busy" ? summarizeNarration(session.title) : "—",
        },
      }),
    )
    return batch
  }

  private adaptSessionError(properties: Record<string, unknown>, lookup: LiveAdapterLookup, id: string, ts: number) {
    const batch = emptyBatch()
    const sessionID = stringValue(properties.sessionID) ?? lookup.rootSessionID
    if (!this.sessionRelevant(sessionID, lookup)) return batch
    const session = lookup.session(sessionID)
    if (!session) return batch
    const agent = this.agentForSession(session, lookup.rootSessionID, this.lookupSessions(lookup, session), batch)
    const detail = errorMessage(properties.error)
    batch.events.push(
      terminalEvent({
        id: eventID(id, "status", "error"),
        ts: ts,
        agent,
        kind: "status",
        payload: { status: "error", task: summarizeNarration(detail) },
      }),
      ...this.issues.sessionError({ detail, agent, ts: ts, sourceID: id }),
    )
    return batch
  }

  private adaptTodos(properties: Record<string, unknown>, lookup: LiveAdapterLookup, id: string, ts: number) {
    const batch = emptyBatch()
    const sessionID = stringValue(properties.sessionID)
    if (!this.sessionRelevant(sessionID, lookup)) return batch
    const session = sessionID ? lookup.session(sessionID) : undefined
    if (!session) return batch
    const agent = this.agentForSession(session, lookup.rootSessionID, this.lookupSessions(lookup, session), batch)
    const todos = Array.isArray(properties.todos) ? (properties.todos as Todo[]) : []
    todos.forEach((todo, index) => {
      const node = `todo-${hash(todo.content)}`
      batch.events.push(
        terminalEvent({
          id: eventID(id, index, node, "add"),
          ts,
          agent,
          kind: "plan",
          payload: { op: "add", node, label: todo.content, by: agent },
        }),
      )
      const op = todoOp(todo)
      if (op !== "add") {
        batch.events.push(
          terminalEvent({
            id: eventID(id, index, node, op),
            ts,
            agent,
            kind: "plan",
            payload: { op, node },
          }),
        )
      }
    })
    return batch
  }

  private adaptSessionDiff(properties: Record<string, unknown>, lookup: LiveAdapterLookup, _id: string, ts: number) {
    const batch = emptyBatch()
    const sessionID = stringValue(properties.sessionID)
    if (!this.sessionRelevant(sessionID, lookup)) return batch
    const session = sessionID ? lookup.session(sessionID) : undefined
    if (!session) return batch
    const agent = this.agentForSession(session, lookup.rootSessionID, this.lookupSessions(lookup, session), batch)
    const diffs = Array.isArray(properties.diff) ? (properties.diff as SnapshotFileDiff[]) : []
    batch.files.push(
      ...diffs.flatMap((diff) => {
        const path = diff.file
        if (!path) return []
        return [{
          path,
          agent,
          ts,
          payload: {
            path,
            stat: fileStat(diff.additions, diff.deletions, diff.status),
            lang: languageForPath(path),
            diff: salientDiff(diff.patch ?? ""),
            content: "",
          },
        }]
      }),
    )
    return batch
  }

  private filesFromTool(part: ToolPart, agent: AgentId, ts: number): LiveFileRegistration[] {
    if (!["read", "write", "edit", "apply_patch", "patch"].includes(part.tool) || !toolTerminal(part)) return []
    const input = toolInput(part)
    const metadata = toolMetadata(part)
    const filediff = asRecord(metadata.filediff)
    const metadataFiles = Array.isArray(metadata.files) ? metadata.files.map(asRecord) : []
    const candidates = metadataFiles.length
      ? metadataFiles.map((file) => ({
          path: stringValue(file.relativePath) ?? stringValue(file.filePath),
          diff: stringValue(file.patch) ?? stringValue(metadata.diff) ?? "",
          additions: numberValue(file.additions),
          deletions: numberValue(file.deletions),
          status: stringValue(file.type),
          content: stringValue(file.after),
        }))
      : [{
          path:
            stringValue(input.filePath) ??
            stringValue(input.path) ??
            stringValue(metadata.filepath) ??
            stringValue(filediff.file) ??
            ("title" in part.state ? stringValue(part.state.title) : undefined),
          diff: stringValue(metadata.diff) ?? stringValue(filediff.patch) ?? "",
          additions: numberValue(filediff.additions),
          deletions: numberValue(filediff.deletions),
          status: stringValue(filediff.status),
          content:
            stringValue(input.content) ??
            stringValue(filediff.after) ??
            stringValue(asRecord(metadata.display).text),
        }]

    return candidates.flatMap((candidate) => {
      if (!candidate.path) return []
      return [{
        path: candidate.path,
        agent,
        ts,
        payload: {
          path: candidate.path,
          stat: fileStat(candidate.additions, candidate.deletions, candidate.status),
          lang: languageForPath(candidate.path),
          diff: salientDiff(candidate.diff),
          content: candidate.content ?? "",
        },
      }]
    })
  }

  private rootAgent(rootSessionID: string, sessions: readonly Session[], batch: AdaptedLiveBatch) {
    const root = sessions.find((session) => session.id === rootSessionID)
    return root ? this.agentForSession(root, rootSessionID, sessions, batch) : this.ensureAgent("orchestrator", undefined, batch, true)
  }

  private agentForMessage(message: Message, lookup: LiveAdapterLookup, batch: AdaptedLiveBatch) {
    const session = lookup.session(message.sessionID)
    if (!session) return this.ensureAgent(message.role === "assistant" ? message.agent : "user", undefined, batch)
    if (session.id !== lookup.rootSessionID) {
      return this.agentForSession(session, lookup.rootSessionID, this.lookupSessions(lookup, session), batch)
    }
    return this.ensureAgent(message.role === "assistant" ? message.agent : session.agent ?? "orchestrator", undefined, batch, true)
  }

  private agentForSession(
    session: Session,
    rootSessionID: string,
    sessions: readonly Session[],
    batch: AdaptedLiveBatch,
  ): AgentId {
    const cached = this.agentBySession.get(session.id)
    if (cached) return cached
    const root = session.id === rootSessionID
    const base = session.agent ?? (root ? "orchestrator" : session.title) ?? session.id
    const id = root ? slug(base) : `${slug(base)}-${session.id.slice(-6)}`
    const parentSession = session.parentID ? sessions.find((item) => item.id === session.parentID) : undefined
    const parent: AgentId | undefined = parentSession
      ? this.agentForSession(parentSession, rootSessionID, sessions, batch)
      : undefined
    this.agentBySession.set(session.id, id)
    return this.ensureAgent(base, parent, batch, root, id)
  }

  private ensureSessionAgent(session: Session, rootSessionID: string, sessions: readonly Session[], batch: AdaptedLiveBatch) {
    this.agentForSession(session, rootSessionID, sessions, batch)
  }

  private ensureAgent(name: string, parent: AgentId | undefined, batch: AdaptedLiveBatch, root = false, forcedID?: string) {
    const id = forcedID ?? slug(name)
    const existing = this.registry.get(id)
    if (existing) return id
    const entry: AgentRegistryEntry = {
      id,
      name,
      parent,
      color: root ? LIVE_COLORS.root : LIVE_COLORS.agents[this.registry.size % LIVE_COLORS.agents.length]!,
    }
    this.registry.set(id, entry)
    batch.agents.push(entry)
    return id
  }

  private inTree(session: Session, rootSessionID: string, sessions: readonly Session[]) {
    let current: Session | undefined = session
    const visited = new Set<string>()
    while (current && !visited.has(current.id)) {
      if (current.id === rootSessionID) return true
      visited.add(current.id)
      current = current.parentID ? sessions.find((item) => item.id === current!.parentID) : undefined
    }
    return false
  }

  private inLookupTree(session: Session, lookup: LiveAdapterLookup) {
    let current: Session | undefined = session
    const visited = new Set<string>()
    while (current && !visited.has(current.id)) {
      if (current.id === lookup.rootSessionID) return true
      visited.add(current.id)
      current = current.parentID ? lookup.session(current.parentID) : undefined
    }
    return false
  }

  private sessionRelevant(sessionID: string | undefined, lookup: LiveAdapterLookup) {
    if (!sessionID) return false
    const session = lookup.session(sessionID)
    return session ? this.inLookupTree(session, lookup) : sessionID === lookup.rootSessionID
  }

  private lookupSessions(lookup: LiveAdapterLookup, seed: Session) {
    const sessions: Session[] = [seed]
    let current = seed
    const visited = new Set<string>([seed.id])
    while (current.parentID) {
      const parent = lookup.session(current.parentID)
      if (!parent || visited.has(parent.id)) break
      sessions.push(parent)
      visited.add(parent.id)
      current = parent
    }
    return sessions
  }

  private merge(target: AdaptedLiveBatch, source: AdaptedLiveBatch) {
    target.events.push(...source.events)
    target.agents.push(...source.agents)
    target.files.push(...source.files)
    if (source.fork) target.fork = source.fork
    if (source.forkResolution) target.forkResolution = source.forkResolution
  }
}

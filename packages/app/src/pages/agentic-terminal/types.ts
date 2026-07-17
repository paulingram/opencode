export type AgentId = string

export type AgentStatus = "idle" | "think" | "work" | "wait" | "error" | "done" | "fork"

export interface AgentRegistryEntry {
  id: AgentId
  name: string
  parent?: AgentId
  color: string
}

export interface TextPayload {
  text: string
}

export interface SpawnPayload {
  child: AgentId
  children?: readonly AgentId[]
  task: string
  handoff?: boolean
}

export interface CommandPayload {
  cmd: string
  out: string
  exit: number
  outputColor?: string
}

export type DiffLine = readonly [sign: "+" | "-" | " ", line: string]

export interface FilePayload {
  path: string
  stat: string
  lang: string
  diff: readonly DiffLine[]
  content: string
}

export interface StatusPayload {
  status: AgentStatus
  task: string
  retry?: {
    attempt: number
    message: string
    next: number
    action?: unknown
  }
}

export interface PlanPayload {
  op: "add" | "start" | "done" | "reject"
  node: string
  label?: string
  parent?: string
  by?: string
  fork?: string
}

export interface IssuePayload {
  op: "open" | "fixing" | "resolved"
  issueId: string
  title?: string
  agent?: string
  detail?: string
  resolution?: string
}

export interface ForkOption {
  key: string
  label: string
  note: string
  value?: string
}

export type ForkPayload =
  | {
      op: "open"
      prompt: string
      options: readonly ForkOption[]
    }
  | {
      op: "resolve"
      choice: string
    }

export interface ResourcePayload {
  tokens: number
  costUsd: number
  ctxPct?: number
}

export interface TerminalEventMap {
  text: TextPayload
  spawn: SpawnPayload
  cmd: CommandPayload
  file: FilePayload
  status: StatusPayload
  plan: PlanPayload
  issue: IssuePayload
  fork: ForkPayload
  resource: ResourcePayload
}

export type TerminalEventKind = keyof TerminalEventMap

export type TerminalEventOf<K extends TerminalEventKind> = {
  id: string
  ts: number
  agent: AgentId | "user"
  kind: K
  payload: TerminalEventMap[K]
}

export type TerminalEvent = {
  [K in TerminalEventKind]: TerminalEventOf<K>
}[TerminalEventKind]

export type TranscriptEvent = TerminalEventOf<"text" | "spawn" | "cmd" | "file">

export type PlanNodeState = "pending" | "active" | "done" | "rejected"

export interface ProjectedAgent extends AgentRegistryEntry {
  status: AgentStatus
  task: string
  tokens: number
  costUsd: number
  ctxPct: number
}

export interface ProjectedPlanNode {
  id: string
  label: string
  parent?: string
  by?: string
  indent: number
  fork?: string
  state: PlanNodeState
}

export interface ProjectedIssue {
  id: string
  title: string
  agent: string
  detail: string
  state: "open" | "fixing" | "resolved"
  resolution?: string
  openedAt: number
  updatedAt: number
}

export interface ProjectedFile extends FilePayload {
  updatedAt: number
  agent: AgentId | "user"
}

export interface ProjectedFork {
  open: boolean
  prompt: string
  options: readonly ForkOption[]
  choice?: string
}

export interface DelegationEdge {
  parent: AgentId
  child: AgentId
  task: string
  handoff?: boolean
}

export interface TerminalResources {
  tokens: number
  costUsd: number
  ctxPct: number
}

export type TerminalView = "mission" | "tui"
export type TerminalTab = "plan" | "issues" | "flow"
export type TerminalSessionStatus = "running" | "paused" | "awaiting-decision" | "complete"

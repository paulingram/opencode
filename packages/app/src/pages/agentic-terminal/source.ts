import type { AgentId, AgentRegistryEntry, TerminalEvent, TerminalSessionStatus } from "./types"

export interface TerminalSourceStatus {
  state: TerminalSessionStatus
  connected: boolean
  step: number
  lastStep: number
  checkpointCount: number
  playing: boolean
  complete: boolean
  forkActive: boolean
  choice?: string | null
}

export interface TerminalAgentMetrics {
  tokens: number
  costUsd: number
}

export interface TerminalSourceMetrics {
  byAgent: Record<AgentId, TerminalAgentMetrics>
  tokens: number
  costUsd: number
  elapsedSeconds: number
  contextPct?: number
}

/** Phase-agnostic event, status, metrics, and transport contract exposed to every panel. */
export interface TerminalEventSource<TStatus extends TerminalSourceStatus = TerminalSourceStatus> {
  readonly agents: readonly AgentRegistryEntry[]
  readonly lastStep: number
  start(): void
  stop(): void
  dispose(): void
  subscribe(listener: (event: TerminalEvent) => void): () => void
  subscribeStatus(listener: (status: TStatus) => void): () => void
  status(): TStatus
  metrics(step?: number): TerminalSourceMetrics
  play(): void
  pause(): void
  toggle(): void
  stepForward(): void
  stepBackward(): void
  jump(step: number): void
  resolveFork(choice: string): void
  send(value: string): void
  saveFileEdit?(path: string, content: string): void
}

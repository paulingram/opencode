import type { TerminalEventSource, TerminalSourceMetrics, TerminalSourceStatus } from "../source"
import type { AgentRegistryEntry, TerminalEvent } from "../types"

const emptyMetrics = (): TerminalSourceMetrics => ({
  byAgent: {},
  tokens: 0,
  costUsd: 0,
  elapsedSeconds: 0,
  contextPct: 0,
})

export class TestTerminalSource implements TerminalEventSource {
  readonly agents: readonly AgentRegistryEntry[]
  readonly events: TerminalEvent[] = []
  readonly sent: string[] = []
  readonly resolved: string[] = []
  private readonly listeners = new Set<(event: TerminalEvent) => void>()
  private readonly statusListeners = new Set<(status: TerminalSourceStatus) => void>()
  private current: TerminalSourceStatus
  private checkpoints = 0
  metricsValue: TerminalSourceMetrics = emptyMetrics()

  constructor(options: {
    agents?: readonly AgentRegistryEntry[]
    status?: Partial<TerminalSourceStatus>
    events?: readonly TerminalEvent[]
  } = {}) {
    this.agents = options.agents ?? []
    this.events.push(...(options.events ?? []))
    this.checkpoints = this.events.length
    this.current = {
      state: "paused",
      connected: true,
      step: Math.max(0, this.events.length - 1),
      lastStep: Math.max(0, this.events.length - 1),
      checkpointCount: this.events.length,
      playing: false,
      complete: false,
      forkActive: false,
      choice: null,
      ...options.status,
    }
  }

  get lastStep() {
    return Math.max(0, this.checkpoints - 1)
  }

  start() {
    this.current = { ...this.current, connected: true }
    this.emitStatus()
  }

  stop() {
    this.current = { ...this.current, state: "paused", playing: false }
    this.emitStatus()
  }

  dispose() {
    this.listeners.clear()
    this.statusListeners.clear()
  }

  subscribe(listener: (event: TerminalEvent) => void) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  subscribeStatus(listener: (status: TerminalSourceStatus) => void) {
    this.statusListeners.add(listener)
    return () => this.statusListeners.delete(listener)
  }

  status() {
    return { ...this.current }
  }

  metrics() {
    return this.metricsValue
  }

  play() {
    this.setStatus({ state: "running", playing: true, step: this.lastStep })
  }

  pause() {
    this.setStatus({ state: "paused", playing: false })
  }

  toggle() {
    if (this.current.playing) this.pause()
    else this.play()
  }

  stepForward() {
    this.jump(this.current.step + 1)
  }

  stepBackward() {
    this.jump(this.current.step - 1)
  }

  jump(step: number) {
    this.setStatus({ state: "paused", playing: false, step: Math.min(this.lastStep, Math.max(0, Math.trunc(step))) })
  }

  resolveFork(choice: string) {
    this.resolved.push(choice)
    this.setStatus({ state: "running", playing: true, forkActive: false, choice })
  }

  send(value: string) {
    this.sent.push(value)
  }

  setEvents(events: readonly TerminalEvent[]) {
    this.events.splice(0, this.events.length, ...events)
    this.checkpoints = events.length
    this.current = {
      ...this.current,
      step: Math.min(this.current.step, this.lastStep),
      lastStep: this.lastStep,
      checkpointCount: this.checkpoints,
    }
    this.emitStatus()
  }

  emit(event: TerminalEvent) {
    this.events.push(event)
    this.checkpoints = this.events.length
    for (const listener of this.listeners) listener(event)
    this.setStatus({ step: this.lastStep, lastStep: this.lastStep, checkpointCount: this.checkpoints })
  }

  setStatus(status: Partial<TerminalSourceStatus>) {
    this.current = { ...this.current, ...status }
    this.emitStatus()
  }

  private emitStatus() {
    for (const listener of this.statusListeners) listener(this.status())
  }
}

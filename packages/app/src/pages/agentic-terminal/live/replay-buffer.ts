import type { TerminalEvent } from "../types"

export class ReplayBuffer {
  private readonly values: TerminalEvent[] = []
  private readonly seen = new Set<string>()

  get checkpointCount() {
    return this.values.length
  }

  get lastStep() {
    return Math.max(0, this.checkpointCount - 1)
  }

  append(events: readonly TerminalEvent[]) {
    const appended: TerminalEvent[] = []
    for (const event of events) {
      if (this.seen.has(event.id)) continue
      this.seen.add(event.id)
      this.values.push(event)
      appended.push(event)
    }
    return appended
  }

  replace(events: readonly TerminalEvent[]) {
    this.clear()
    return this.append(events)
  }

  through(step: number) {
    if (this.values.length === 0 || step < 0) return []
    return this.values.slice(0, Math.min(this.values.length, Math.trunc(step) + 1))
  }

  tail() {
    return [...this.values]
  }

  clear() {
    this.values.length = 0
    this.seen.clear()
  }
}

import { For, createMemo } from "solid-js"
import { useTerminalStore } from "../store"
import type {
  AgentStatus,
  CommandPayload,
  FilePayload,
  SpawnPayload,
  TextPayload,
  TranscriptEvent,
} from "../types"

export interface TerminalTuiProps {
  showCost: boolean
  sessionTitle?: string
}

interface Segment {
  text: string
  color?: string
  weight?: number
}

const STATUS: Record<AgentStatus, { glyph: string; color: string }> = {
  idle: { glyph: "○", color: "var(--terminal-dim)" },
  think: { glyph: "◐", color: "var(--terminal-info)" },
  work: { glyph: "●", color: "var(--terminal-primary)" },
  wait: { glyph: "◇", color: "var(--terminal-warn)" },
  error: { glyph: "✗", color: "var(--terminal-error)" },
  done: { glyph: "✓", color: "var(--terminal-success)" },
  fork: { glyph: "⑂", color: "var(--terminal-accent)" },
}

const formatTokens = (tokens: number) => (tokens >= 1_000 ? `${(tokens / 1_000).toFixed(1)}k` : String(tokens))
const truncate = (value: string, width: number) => (value.length > width ? `${value.slice(0, width - 1)}…` : value)
const separator: Segment[] = [{ text: "─".repeat(100), color: "var(--terminal-border)" }]

export function TerminalTui(props: TerminalTuiProps) {
  const terminal = useTerminalStore()

  const visibleEvents = () =>
    terminal.state.filter === "all"
      ? terminal.state.transcript
      : terminal.state.transcript.filter((event) => event.agent === terminal.state.filter)

  const name = (event: TranscriptEvent) =>
    event.agent === "user" ? "you" : (terminal.state.agents[event.agent]?.name ?? event.agent)
  const nameColor = (event: TranscriptEvent) =>
    event.agent === "user" ? "var(--terminal-text)" : (terminal.state.agents[event.agent]?.color ?? "var(--terminal-muted)")

  const eventLines = (event: TranscriptEvent): Segment[][] => {
    const prefix: Segment = { text: ` ${name(event).padEnd(13)}`, color: nameColor(event), weight: 500 }
    switch (event.kind) {
      case "text": {
        const payload = event.payload as TextPayload
        return [
          [
            prefix,
            {
              text: truncate(payload.text, 84),
              color: event.agent === "user" ? "var(--terminal-body-user)" : "var(--terminal-body-agent)",
            },
          ],
        ]
      }
      case "spawn": {
        const payload = event.payload as SpawnPayload
        return [
          [
            prefix,
            {
              text: `◆ spawned ${payload.child} — ${payload.task}`,
              color: "var(--terminal-accent)",
            },
          ],
        ]
      }
      case "cmd": {
        const payload = event.payload as CommandPayload
        return [
          [
            prefix,
            { text: "$ ", color: "var(--terminal-dim)" },
            { text: truncate(payload.cmd, 80), color: "var(--terminal-text)" },
          ],
          [
            { text: "".padEnd(14) },
            {
              text: truncate(payload.out, 80),
              color:
                payload.exit !== 0 ? "var(--terminal-error)" : payload.outputColor ?? "var(--terminal-muted)",
            },
          ],
        ]
      }
      case "file": {
        const payload = event.payload as FilePayload
        return [
          [prefix, { text: `✎ ${payload.path}`, color: "var(--terminal-file)" }],
          ...payload.diff.slice(0, 6).map(
            (line): Segment[] => [
              { text: "".padEnd(14) },
              {
                text: `${line[0]} ${truncate(line[1], 78)}`,
                color:
                  line[0] === "+"
                    ? "var(--terminal-diff-add-fg)"
                    : line[0] === "-"
                      ? "var(--terminal-diff-del-fg)"
                      : "var(--terminal-file)",
              },
            ],
          ),
        ]
      }
    }
  }

  const transcriptLines = createMemo(() => visibleEvents().flatMap(eventLines).slice(-15))
  const issues = () => terminal.state.issueOrder.map((id) => terminal.state.issues[id]).filter(Boolean)
  const planNodes = () => terminal.state.planOrder.map((id) => terminal.state.plan[id]).filter(Boolean)
  const openIssueCount = () => issues().filter((issue) => issue.state !== "resolved").length
  const donePlanCount = () => planNodes().filter((node) => node.state === "done").length
  const metrics = () => terminal.source.metrics(terminal.sourceStatus.step)

  const header = (): Segment[] => [
    { text: " opencode", color: "var(--terminal-primary)", weight: 700 },
    { text: `  ${props.sessionTitle?.trim() || terminal.state.sessionTitle || "Untitled session"}`, color: "var(--terminal-muted)" },
    {
      text: `    replay ${terminal.sourceStatus.step}/${terminal.sourceStatus.lastStep} · ${formatTokens(terminal.state.resources.tokens)} tok${props.showCost ? ` · $${terminal.state.resources.costUsd.toFixed(2)}` : ""}`,
      color: "var(--terminal-dim)",
    },
  ]

  const footer = (): Segment[] => [
    { text: " ISSUES ", color: "var(--terminal-dim)" },
    {
      text: openIssueCount() ? `${openIssueCount()} open` : "none open",
      color: openIssueCount() ? "var(--terminal-error)" : "var(--terminal-dim)",
    },
    { text: "    PLAN ", color: "var(--terminal-dim)" },
    {
      text: `${donePlanCount()}/${planNodes().length} done`,
      color: "var(--terminal-success)",
    },
    ...(terminal.sourceStatus.forkActive
      ? [{ text: "    ⑂ fork — press 1 or 2", color: "var(--terminal-accent)" }]
      : []),
  ]

  const agents = () => terminal.state.agentOrder.map((id) => terminal.state.agents[id]).filter(Boolean)
  const tree = (child: boolean, index: number) => {
    if (!child) return "◆"
    return index === agents().length - 1 ? "╰─" : "├─"
  }

  return (
    <section
      data-screen-label="TUI"
      data-testid="agentic-terminal-tui"
      data-elapsed={metrics().elapsedSeconds}
      style={{
        flex: 1,
        "overflow-y": "auto",
        "overflow-x": "hidden",
        padding: "14px 18px",
        "font-size": "12.5px",
        "line-height": 1.55,
        "min-height": 0,
      }}
    >
      <TuiLine segments={header()} />
      <TuiLine segments={separator} />
      <TuiLine segments={[{ text: " AGENTS", color: "var(--terminal-dim)" }]} />
      <For each={agents()}>
        {(agent, index) => {
          const status = () => STATUS[agent.status]
          const tokens = () => (agent.tokens ? formatTokens(agent.tokens) : "·")
          const cost = () => (props.showCost && agent.tokens ? `$${agent.costUsd.toFixed(2)}` : "")
          return (
            <TuiLine
              segments={[
                { text: ` ${tree(!!agent.parent, index())} `, color: "var(--terminal-border-strong)" },
                { text: `${status().glyph} `, color: status().color },
                { text: agent.name.padEnd(14), color: agent.color, weight: 500 },
                { text: truncate(agent.task, 44).padEnd(46), color: "var(--terminal-muted)" },
                { text: tokens().padStart(7), color: "var(--terminal-dim)" },
                { text: `  ${cost()}`.padEnd(9), color: "var(--terminal-dim)" },
              ]}
            />
          )
        }}
      </For>
      <TuiLine segments={separator} />
      <For each={transcriptLines()}>
        {(line) => <TuiLine testId="terminal-tui-transcript-line" segments={line} />}
      </For>
      <TuiLine segments={separator} />
      <TuiLine segments={footer()} />
      <TuiLine
        segments={[
          { text: " ❯ ", color: "var(--terminal-primary)", weight: 700 },
          { text: "▊", color: "var(--terminal-primary)" },
        ]}
      />
    </section>
  )
}

function TuiLine(props: { segments: readonly Segment[]; testId?: string }) {
  return (
    <div
      data-testid={props.testId}
      style={{ "min-height": "19px", "white-space": "pre", overflow: "hidden", "line-height": 1.55 }}
    >
      <For each={props.segments}>
        {(segment) => (
          <span style={{ color: segment.color ?? "var(--terminal-text)", "font-weight": segment.weight ?? 400 }}>
            {segment.text}
          </span>
        )}
      </For>
    </div>
  )
}

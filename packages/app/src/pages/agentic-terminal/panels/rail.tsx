import { For, Show } from "solid-js"
import { useTerminalStore } from "../store"
import type { AgentStatus } from "../types"

export interface TerminalRailProps {
  showCost: boolean
}

const STATUS: Record<AgentStatus, { glyph: string; color: string; pulse: boolean }> = {
  idle: { glyph: "○", color: "var(--terminal-dim)", pulse: false },
  think: { glyph: "◐", color: "var(--terminal-info)", pulse: true },
  work: { glyph: "●", color: "var(--terminal-primary)", pulse: true },
  wait: { glyph: "◇", color: "var(--terminal-warn)", pulse: false },
  error: { glyph: "✗", color: "var(--terminal-error)", pulse: false },
  done: { glyph: "✓", color: "var(--terminal-success)", pulse: false },
  fork: { glyph: "⑂", color: "var(--terminal-accent)", pulse: true },
}

const formatTokens = (tokens: number) => (tokens >= 1_000 ? `${(tokens / 1_000).toFixed(1)}k` : String(tokens))
const formatElapsed = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`

export function TerminalRail(props: TerminalRailProps) {
  const terminal = useTerminalStore()
  const selected = (id: string) => terminal.state.filter === id
  const toggleFilter = (id: string) => terminal.actions.setFilter(selected(id) ? "all" : id)
  const sourceMetrics = () => terminal.source.metrics(terminal.sourceStatus.step)
  const agents = () => terminal.state.agentOrder.map((id) => terminal.state.agents[id]).filter(Boolean)
  const files = () => terminal.state.fileOrder.map((path) => terminal.state.files[path]).filter(Boolean)
  const modified = (path: string) => terminal.state.fileEdits[path] !== undefined

  return (
    <aside
      data-testid="agentic-terminal-agent-rail"
      aria-label="agents, files, and resources"
      style={{
        width: "270px",
        "min-width": "270px",
        "border-right": "1px solid var(--terminal-border)",
        background: "var(--terminal-panel)",
        display: "flex",
        "flex-direction": "column",
        "min-height": 0,
        "overflow-y": "auto",
        "overflow-x": "hidden",
      }}
    >
      <div
        style={{
          flex: "none",
          padding: "12px 14px 6px",
          "font-size": "10px",
          "letter-spacing": "2px",
          color: "var(--terminal-dim)",
        }}
      >
        AGENTS
      </div>
      <button
        type="button"
        data-testid="terminal-all-activity"
        onClick={() => terminal.actions.setFilter("all")}
        style={{
          flex: "none",
          display: "flex",
          "align-items": "center",
          gap: "8px",
          padding: "7px 14px",
          cursor: "pointer",
          background: terminal.state.filter === "all" ? "var(--terminal-raised)" : "transparent",
          "border-top": 0,
          "border-right": 0,
          "border-bottom": 0,
          "border-left": `2px solid ${terminal.state.filter === "all" ? "var(--terminal-text)" : "transparent"}`,
          color: "inherit",
          "font-family": "inherit",
          "text-align": "left",
        }}
      >
        <span style={{ color: "var(--terminal-muted)" }}>◎</span>
        <span style={{ "font-size": "12px", color: "var(--terminal-text)" }}>all activity</span>
        <span style={{ flex: 1 }} />
        <span style={{ "font-size": "10px", color: "var(--terminal-dim)" }}>{terminal.state.transcript.length} events</span>
      </button>
      <For each={agents()}>
        {(agent, index) => {
          const state = () => STATUS[agent.status]
          const child = () => !!agent.parent
          const connector = () => (child() ? (index() === agents().length - 1 ? "╰─" : "├─") : "◆")
          return (
            <button
              type="button"
              data-agent-id={agent.id}
              aria-pressed={selected(agent.id)}
              onClick={() => toggleFilter(agent.id)}
              style={{
                flex: "none",
                padding: "7px 14px",
                cursor: "pointer",
                background: selected(agent.id) ? "var(--terminal-raised)" : "transparent",
                "border-top": 0,
                "border-right": 0,
                "border-bottom": 0,
                "border-left": `2px solid ${selected(agent.id) ? agent.color : "transparent"}`,
                color: "inherit",
                "font-family": "inherit",
                "text-align": "left",
              }}
            >
              <div style={{ display: "flex", "align-items": "center", gap: "8px" }}>
                <span style={{ color: "var(--terminal-border-strong)", "font-size": "11px" }}>{connector()}</span>
                <span
                  data-testid="terminal-agent-glyph"
                  style={{
                    color: state().color,
                    animation: state().pulse ? "terminal-pulse 1.4s ease-in-out infinite" : "none",
                  }}
                >
                  {state().glyph}
                </span>
                <span style={{ "font-size": "12.5px", color: agent.color, "font-weight": 500 }}>{agent.name}</span>
                <span style={{ flex: 1 }} />
                <span style={{ "font-size": "10px", color: "var(--terminal-dim)" }}>
                  {agent.tokens ? formatTokens(agent.tokens) : ""}
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  gap: "8px",
                  "padding-left": child() ? "42px" : "22px",
                  "margin-top": "2px",
                }}
              >
                <span
                  style={{
                    "font-size": "11px",
                    color: agent.status === "error" ? "var(--terminal-error)" : "var(--terminal-muted)",
                    "white-space": "nowrap",
                    overflow: "hidden",
                    "text-overflow": "ellipsis",
                    flex: 1,
                  }}
                >
                  {agent.task}
                </span>
                <span style={{ "font-size": "10px", color: "var(--terminal-dim)" }}>
                  {props.showCost && agent.tokens ? `$${agent.costUsd.toFixed(2)}` : ""}
                </span>
              </div>
            </button>
          )
        }}
      </For>
      <div
        style={{
          flex: "none",
          padding: "14px 14px 4px",
          "font-size": "10px",
          "letter-spacing": "2px",
          color: "var(--terminal-dim)",
        }}
      >
        FILES
      </div>
      <div style={{ flex: "none", "overflow-y": "auto", "overflow-x": "hidden", "max-height": "170px" }}>
        <For each={files()}>
          {(file) => {
            const markdown = () => file.lang === "md"
            return (
              <button
                type="button"
                onClick={() => terminal.actions.openFile(file.path)}
                style={{
                  width: "100%",
                  display: "flex",
                  "align-items": "center",
                  gap: "8px",
                  padding: "4px 14px",
                  cursor: "pointer",
                  background: "transparent",
                  border: 0,
                  color: "inherit",
                  "font-family": "inherit",
                  "text-align": "left",
                }}
              >
                <span style={{ color: markdown() ? "var(--terminal-accent)" : "var(--terminal-file)", "font-size": "11px" }}>
                  {markdown() ? "▤" : "✎"}
                </span>
                <span
                  title={file.path}
                  style={{
                    "font-size": "11px",
                    color: "var(--terminal-subtle-text)",
                    "white-space": "nowrap",
                    overflow: "hidden",
                    "text-overflow": "ellipsis",
                    flex: 1,
                  }}
                >
                  {file.path}
                </span>
                <span
                  style={{
                    "font-size": "10px",
                    color: modified(file.path) ? "var(--terminal-warn)" : "var(--terminal-dim)",
                    "white-space": "nowrap",
                  }}
                >
                  {modified(file.path) ? "modified" : file.stat}
                </span>
              </button>
            )
          }}
        </For>
      </div>
      <div style={{ flex: "1 0 12px" }} />
      <div
        style={{
          flex: "none",
          "border-top": "1px solid var(--terminal-border)",
          padding: "12px 14px",
          display: "flex",
          "flex-direction": "column",
          gap: "7px",
        }}
      >
        <div style={{ "font-size": "10px", "letter-spacing": "2px", color: "var(--terminal-dim)" }}>RESOURCES</div>
        <div style={{ display: "flex", "justify-content": "space-between", "font-size": "11.5px" }}>
          <span style={{ color: "var(--terminal-muted)" }}>tokens</span>
          <span>{formatTokens(terminal.state.resources.tokens)}</span>
        </div>
        <div style={{ display: "flex", "justify-content": "space-between", "font-size": "11.5px" }}>
          <span style={{ color: "var(--terminal-muted)" }}>cost</span>
          <span>${terminal.state.resources.costUsd.toFixed(2)}</span>
        </div>
        <div style={{ display: "flex", "justify-content": "space-between", "font-size": "11.5px" }}>
          <span style={{ color: "var(--terminal-muted)" }}>elapsed</span>
          <span>{formatElapsed(sourceMetrics().elapsedSeconds)}</span>
        </div>
        <div style={{ display: "flex", "justify-content": "space-between", "font-size": "11.5px" }}>
          <span style={{ color: "var(--terminal-muted)" }}>context</span>
          <span style={{ color: "var(--terminal-muted)" }}>
            {sourceMetrics().contextPct === undefined ? "—" : `${sourceMetrics().contextPct}%`}
          </span>
        </div>
        <Show when={sourceMetrics().contextPct !== undefined}>
          <div style={{ height: "4px", background: "var(--terminal-border)", "border-radius": "2px", overflow: "hidden" }}>
            <div
              data-testid="terminal-context-bar"
              style={{
                height: "100%",
                width: `${sourceMetrics().contextPct ?? 0}%`,
                background: "var(--terminal-primary)",
                "border-radius": "2px",
              }}
            />
          </div>
        </Show>
      </div>
    </aside>
  )
}

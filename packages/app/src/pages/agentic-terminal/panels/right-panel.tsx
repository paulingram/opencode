import { For, Match, Show, Switch } from "solid-js"
import { useTerminalStore } from "../store"
import type { ForkOption, ProjectedAgent, ProjectedPlanNode } from "../types"
import { resolveForkOption } from "./fork-banner"

const statusGlyph = {
  idle: "○",
  think: "◐",
  work: "●",
  wait: "◇",
  error: "✗",
  done: "✓",
  fork: "⑂",
} as const

const statusColor = {
  idle: "var(--terminal-border-strong)",
  think: "var(--terminal-info)",
  work: "var(--terminal-primary)",
  wait: "var(--terminal-warn)",
  error: "var(--terminal-error)",
  done: "var(--terminal-success)",
  fork: "var(--terminal-accent)",
} as const

const flowPositions: Record<string, readonly [number, number]> = {
  orch: [150, 36],
  explorer: [45, 152],
  coder1: [115, 152],
  coder2: [185, 152],
  reviewer: [255, 152],
}

function formatTokens(tokens: number) {
  if (!tokens) return ""
  return tokens >= 1_000 ? `${(tokens / 1_000).toFixed(1)}k` : String(tokens)
}

function indentForNode(node: ProjectedPlanNode) {
  return 16 + node.indent * 16
}

function optionForNode(node: ProjectedPlanNode, options: readonly ForkOption[]) {
  if (node.fork) return options.find((option) => (option.value ?? option.key) === node.fork)
  return options.find((option) => option.label === node.label)
}

function PlanTab() {
  const terminal = useTerminalStore()
  const nodes = () => terminal.state.planOrder.map((id) => terminal.state.plan[id]).filter(Boolean)

  return (
    <div>
      <For each={nodes()}>
        {(node) => {
          const option = () => optionForNode(node, terminal.state.fork.options)
          const clickable = () => terminal.state.fork.open && !!option() && node.state !== "rejected"
          const glyph = () => {
            if (clickable() || node.state === "rejected") return "⑂"
            if (node.state === "done") return "✓"
            if (node.state === "active") return "●"
            return "○"
          }
          const glyphColor = () => {
            if (clickable()) return "var(--terminal-accent)"
            if (node.state === "done") return "var(--terminal-success)"
            if (node.state === "active") return "var(--terminal-primary)"
            return "var(--terminal-dim)"
          }
          const labelColor = () => {
            if (node.state === "active") return "var(--terminal-text)"
            if (node.state === "done") return "var(--terminal-plan-done)"
            return "var(--terminal-dim)"
          }
          return (
            <button
              type="button"
              disabled={!clickable()}
              data-plan-fork-option={node.fork ?? option()?.value ?? option()?.key}
              onClick={() => {
                const selected = option()
                if (selected) resolveForkOption(terminal.source, selected.value ?? selected.key)
              }}
              style={{
                display: "flex",
                width: "100%",
                gap: "9px",
                padding: `5px 16px 5px ${indentForNode(node)}px`,
                border: "none",
                background: "transparent",
                color: "inherit",
                "font-family": "inherit",
                cursor: clickable() ? "pointer" : "default",
                "text-align": "left",
              }}
              onPointerEnter={(event) => {
                event.currentTarget.style.background = "var(--terminal-raised)"
              }}
              onPointerLeave={(event) => {
                event.currentTarget.style.background = "transparent"
              }}
            >
              <span
                style={{
                  color: glyphColor(),
                  animation: clickable() || node.state === "active" ? "terminal-pulse 1.4s ease-in-out infinite" : "none",
                }}
              >
                {glyph()}
              </span>
              <span style={{ "min-width": 0 }}>
                <span
                  style={{
                    display: "block",
                    color: labelColor(),
                    "font-size": "12px",
                    "text-decoration": node.state === "rejected" ? "line-through" : "none",
                  }}
                >
                  {node.label}
                </span>
                <Show when={node.state === "rejected" || node.by}>
                  <span style={{ display: "block", color: "var(--terminal-dim)", "font-size": "10.5px" }}>
                    {node.state === "rejected" ? "rejected at fork" : node.by}
                  </span>
                </Show>
              </span>
            </button>
          )
        }}
      </For>
      <div
        style={{
          margin: "12px 16px 4px",
          "padding-top": "10px",
          border: "none",
          "border-top": "1px solid var(--terminal-border)",
          color: "var(--terminal-dim)",
          "font-size": "10.5px",
          "line-height": 1.9,
        }}
      >
        ✓ done&nbsp; ● active&nbsp; ○ pending&nbsp; ⑂ fork option&nbsp; <span style={{ "text-decoration": "line-through" }}>rejected</span>
      </div>
    </div>
  )
}

function IssuesTab() {
  const terminal = useTerminalStore()
  const issues = () => [...terminal.state.issueOrder].reverse().map((id) => terminal.state.issues[id]).filter(Boolean)
  const colorFor = (state: "open" | "fixing" | "resolved") =>
    state === "open" ? "var(--terminal-error)" : state === "fixing" ? "var(--terminal-warn)" : "var(--terminal-success)"

  return (
    <Show when={issues().length} fallback={<div style={{ padding: "24px 16px", color: "var(--terminal-dim)", "font-size": "12px", "text-align": "center" }}>no issues yet — clean run</div>}>
      <For each={issues()}>
        {(issue) => (
          <article
            style={{
              margin: "10px 12px",
              background: "var(--terminal-bg)",
              border: `1px solid ${issue.state === "resolved" ? "var(--terminal-border)" : colorFor(issue.state)}`,
              "border-radius": "6px",
              padding: "10px 12px",
            }}
          >
            <div style={{ display: "flex", "align-items": "center", gap: "8px" }}>
              <span
                style={{
                  color: colorFor(issue.state),
                  border: `1px solid ${colorFor(issue.state)}`,
                  "border-radius": "9px",
                  padding: "1px 8px",
                  "font-size": "10px",
                }}
              >
                {issue.state}
              </span>
              <span style={{ color: "var(--terminal-dim)", "font-size": "10.5px" }}>{issue.agent}</span>
            </div>
            <div style={{ color: "var(--terminal-text)", "font-size": "12.5px", "margin-top": "6px" }}>{issue.title}</div>
            <div style={{ color: "var(--terminal-muted)", "font-size": "11px", "margin-top": "4px", "line-height": 1.5 }}>{issue.detail}</div>
            <Show when={issue.state === "resolved" && issue.resolution}>
              <div style={{ color: "var(--terminal-success)", "font-size": "11px", "margin-top": "6px", "line-height": 1.5 }}>↳ {issue.resolution}</div>
            </Show>
          </article>
        )}
      </For>
    </Show>
  )
}

function positionFor(agent: ProjectedAgent, index: number): readonly [number, number] {
  if (flowPositions[agent.id]) return flowPositions[agent.id]!
  if (!agent.parent) return [150, 36]
  const siblings = Math.max(1, index)
  return [30 + ((siblings - 1) % 5) * 60, 152]
}

function FlowTab() {
  const terminal = useTerminalStore()
  const agents = () => terminal.state.agentOrder.map((id) => terminal.state.agents[id]).filter(Boolean)
  const nodes = () => agents().map((agent, index) => ({ agent, position: positionFor(agent, index) }))
  const nodeById = () => new Map(nodes().map((node) => [node.agent.id, node]))
  const edgeColor = (agent: ProjectedAgent) => {
    if (agent.status === "idle") return "var(--terminal-border)"
    if (agent.status === "done") return "var(--terminal-flow-done)"
    return statusColor[agent.status]
  }
  const solidEdges = () =>
    agents()
      .filter((agent) => !!agent.parent)
      .map((agent) => ({ parent: agent.parent!, child: agent.id }))
  const handoffEdges = () => terminal.state.delegations.filter((edge) => edge.handoff)

  return (
    <div style={{ padding: "8px 14px 0" }}>
      <svg viewBox="0 0 300 214" width="100%" role="img" aria-label="Agent delegation flow">
        <For each={solidEdges()}>
          {(edge) => {
            const parent = () => nodeById().get(edge.parent)
            const child = () => nodeById().get(edge.child)
            const childAgent = () => terminal.state.agents[edge.child]
            return (
              <Show when={parent() && child() && childAgent()}>
                <line
                  x1={parent()!.position[0]}
                  y1={parent()!.position[1] + 13}
                  x2={child()!.position[0]}
                  y2={child()!.position[1] - 13}
                  stroke={edgeColor(childAgent()!)}
                  stroke-width="1.2"
                  stroke-dasharray="0"
                />
              </Show>
            )
          }}
        </For>
        <For each={handoffEdges()}>
          {(edge) => {
            const parent = () => nodeById().get(edge.parent)
            const child = () => nodeById().get(edge.child)
            const report = () => edge.child === "reviewer"
            return (
              <Show when={parent() && child()}>
                <line
                  x1={parent()!.position[0] + (report() ? 4 : 0)}
                  y1={parent()!.position[1] + 22}
                  x2={child()!.position[0] - (report() ? 3 : 4)}
                  y2={child()!.position[1] + (report() ? 19 : 22)}
                  stroke={report() ? "var(--terminal-flow-handoff-review)" : "var(--terminal-flow-handoff)"}
                  stroke-width="1.2"
                  stroke-dasharray="3 3"
                />
              </Show>
            )
          }}
        </For>
        <For each={nodes()}>
          {(node) => (
            <g>
              <circle cx={node.position[0]} cy={node.position[1]} r="13" fill="var(--terminal-panel)" stroke={statusColor[node.agent.status]} stroke-width="1.5" />
              <text x={node.position[0]} y={node.position[1] + 3.5} fill={statusColor[node.agent.status]} font-size="10" text-anchor="middle" font-family="JetBrains Mono">
                {statusGlyph[node.agent.status]}
              </text>
              <text x={node.position[0]} y={node.position[1] + 27} fill="var(--terminal-flow-label)" font-size="9" text-anchor="middle" font-family="JetBrains Mono">
                {node.agent.name}
              </text>
              <text x={node.position[0]} y={node.position[1] + 38} fill="var(--terminal-dim)" font-size="8" text-anchor="middle" font-family="JetBrains Mono">
                {formatTokens(node.agent.tokens)}
              </text>
            </g>
          )}
        </For>
      </svg>
      <div style={{ padding: "8px 8px 0", color: "var(--terminal-dim)", "font-size": "10.5px", "line-height": 1.9 }}>
        solid — delegation · dashed — handoff / report
        <br />
        color follows agent status
      </div>
    </div>
  )
}

export function RightPanel() {
  const terminal = useTerminalStore()
  const planNodes = () => terminal.state.planOrder.map((id) => terminal.state.plan[id]).filter(Boolean)
  const issues = () => terminal.state.issueOrder.map((id) => terminal.state.issues[id]).filter(Boolean)
  const done = () => planNodes().filter((node) => node.state === "done").length
  const total = () => planNodes().length
  const unresolved = () => issues().filter((issue) => issue.state !== "resolved").length
  const tabs = () => [
    { id: "plan" as const, label: `plan ${done()}/${total()}` },
    { id: "issues" as const, label: `issues${unresolved() ? ` · ${unresolved()}` : ""}` },
    { id: "flow" as const, label: "flow" },
  ]

  return (
    <aside
      data-screen-label="Right panel"
      style={{
        display: "flex",
        height: "100%",
        "min-height": 0,
        "flex-direction": "column",
        background: "var(--terminal-panel)",
        "border-left": "1px solid var(--terminal-border)",
      }}
    >
      <nav style={{ display: "flex", "flex-shrink": 0, "border-bottom": "1px solid var(--terminal-border)" }}>
        <For each={tabs()}>
          {(tab) => (
            <button
              type="button"
              data-panel-tab={tab.id}
              onClick={() => terminal.actions.setTab(tab.id)}
              style={{
                flex: 1,
                border: "none",
                "border-bottom": `2px solid ${terminal.state.tab === tab.id ? "var(--terminal-primary)" : "transparent"}`,
                background: terminal.state.tab === tab.id ? "var(--terminal-raised)" : "transparent",
                color: terminal.state.tab === tab.id ? "var(--terminal-text)" : "var(--terminal-muted)",
                "font-family": "inherit",
                "font-size": "11.5px",
                padding: "9px 0",
                cursor: "pointer",
              }}
            >
              {tab.label}
            </button>
          )}
        </For>
      </nav>
      <div style={{ flex: 1, "min-height": 0, "overflow-y": "auto", "overflow-x": "hidden" }}>
        <Switch>
          <Match when={terminal.state.tab === "plan"}>
            <PlanTab />
          </Match>
          <Match when={terminal.state.tab === "issues"}>
            <IssuesTab />
          </Match>
          <Match when={terminal.state.tab === "flow"}>
            <FlowTab />
          </Match>
        </Switch>
      </div>
    </aside>
  )
}

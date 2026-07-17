import { For, Show } from "solid-js"
import { useTerminalStore } from "../store"
import type { TerminalEventSource } from "../source"

export function resolveForkOption(source: Pick<TerminalEventSource, "resolveFork">, value: string) {
  source.resolveFork(value)
}

export function ForkBanner() {
  const terminal = useTerminalStore()

  return (
    <Show when={terminal.state.fork.open}>
      <section
        data-screen-label="Decision fork"
        style={{
          margin: "12px 16px 0",
          border: "1px solid var(--terminal-accent)",
          "border-radius": "6px",
          background: "var(--terminal-panel)",
          padding: "12px 14px",
        }}
      >
        <header style={{ display: "flex", "align-items": "baseline", gap: "8px" }}>
          <span
            aria-hidden="true"
            style={{
              color: "var(--terminal-accent)",
              animation: "terminal-pulse 1.4s ease-in-out infinite",
            }}
          >
            ⑂
          </span>
          <strong style={{ color: "var(--terminal-accent)", "font-size": "12.5px", "font-weight": 700 }}>
            decision fork — {terminal.state.fork.prompt}
          </strong>
          <span style={{ "margin-left": "auto", color: "var(--terminal-dim)", "font-size": "10.5px" }}>
            click, or press 1 / 2
          </span>
        </header>
        <div style={{ display: "flex", gap: "10px", "margin-top": "10px" }}>
          <For each={terminal.state.fork.options}>
            {(option) => {
              const value = option.value ?? option.key
              return (
                <button
                  type="button"
                  data-fork-option={value}
                  onClick={() => resolveForkOption(terminal.source, value)}
                  style={{
                    flex: 1,
                    border: "1px solid var(--terminal-border-strong)",
                    "border-radius": "5px",
                    padding: "9px 12px",
                    cursor: "pointer",
                    background: "transparent",
                    color: "var(--terminal-text)",
                    "font-family": "inherit",
                    "text-align": "left",
                  }}
                  onPointerEnter={(event) => {
                    event.currentTarget.style.borderColor = "var(--terminal-accent)"
                    event.currentTarget.style.background = "var(--terminal-raised)"
                  }}
                  onPointerLeave={(event) => {
                    event.currentTarget.style.borderColor = "var(--terminal-border-strong)"
                    event.currentTarget.style.background = "transparent"
                  }}
                >
                  <div style={{ color: "var(--terminal-text)", "font-size": "12px" }}>
                    {option.key} · {option.label}
                  </div>
                  <div style={{ color: "var(--terminal-muted)", "font-size": "11px", "margin-top": "3px" }}>
                    {option.note}
                  </div>
                </button>
              )
            }}
          </For>
        </div>
      </section>
    </Show>
  )
}

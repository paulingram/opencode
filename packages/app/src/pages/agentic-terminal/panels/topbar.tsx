import type { TerminalSourceStatus } from "../source"
import { useTerminalStore } from "../store"

export interface TerminalTopbarProps {
  sessionTitle?: string
  branch?: string
}

const statusPresentation = (status: TerminalSourceStatus) => {
  if (status.complete) return { label: "✓ complete", color: "var(--terminal-success)" }
  if (status.forkActive) return { label: "⑂ awaiting decision", color: "var(--terminal-accent)" }
  if (status.playing) return { label: "▶ live", color: "var(--terminal-primary)" }
  return { label: "⏸ paused", color: "var(--terminal-warn)" }
}

export function TerminalTopbar(props: TerminalTopbarProps) {
  const terminal = useTerminalStore()
  const sessionTitle = () => props.sessionTitle?.trim() || terminal.state.sessionTitle || "Untitled session"
  const activeView = (view: "mission" | "tui") => terminal.state.view === view

  return (
    <header
      data-screen-label="Top bar"
      data-testid="agentic-terminal-topbar"
      style={{
        display: "flex",
        "align-items": "center",
        gap: "12px",
        height: "46px",
        padding: "0 14px",
        "border-bottom": "1px solid var(--terminal-border)",
        "flex-shrink": "0",
        "white-space": "nowrap",
        overflow: "hidden",
      }}
    >
      <span style={{ color: "var(--terminal-primary)", "font-weight": 700, "letter-spacing": "0.5px", flex: "none" }}>
        ▌opencode
      </span>
      <span
        data-testid="terminal-session-title"
        title={sessionTitle()}
        style={{
          color: "var(--terminal-muted)",
          "font-size": "12px",
          flex: "0 1 auto",
          "min-width": 0,
          overflow: "hidden",
          "text-overflow": "ellipsis",
          "white-space": "nowrap",
        }}
      >
        {sessionTitle()}
      </span>
      <span
        style={{
          background: "var(--terminal-raised)",
          border: "1px solid var(--terminal-border-strong)",
          "border-radius": "4px",
          padding: "1px 8px",
          "font-size": "11px",
          color: "var(--terminal-muted)",
          flex: "none",
        }}
      >
         {props.branch ?? "feat/auth-refactor"}
      </span>
      <span
        data-testid="terminal-status"
        style={{ "font-size": "11px", color: statusPresentation(terminal.sourceStatus).color, flex: "none" }}
      >
        {statusPresentation(terminal.sourceStatus).label}
      </span>
      <span style={{ flex: 1 }} />
      <div style={{ display: "flex", "align-items": "center", gap: "4px", flex: "none" }}>
        {Array.from({ length: terminal.sourceStatus.lastStep + 1 }, (_, step) => (
          <button
            type="button"
            data-testid="terminal-scrubber-tick"
            title={`replay checkpoint ${step}`}
            aria-label={`replay through checkpoint ${step}`}
            onClick={() => terminal.source.jump(step)}
            style={{
              width: "11px",
              height: "5px",
              padding: 0,
              border: 0,
              "border-radius": "2px",
              background:
                step < terminal.sourceStatus.step
                  ? "var(--terminal-scrubber-past)"
                  : step === terminal.sourceStatus.step
                    ? "var(--terminal-primary)"
                    : "var(--terminal-border)",
              cursor: "pointer",
              flex: "none",
            }}
          />
        ))}
        <span data-testid="terminal-step-label" style={{ color: "var(--terminal-dim)", "font-size": "11px", "margin-left": "6px" }}>
          {terminal.sourceStatus.step}/{terminal.sourceStatus.lastStep}
        </span>
      </div>
      <button
        type="button"
        onClick={() => terminal.source.toggle()}
        style={{
          background: "var(--terminal-raised)",
          border: "1px solid var(--terminal-border-strong)",
          "border-radius": "4px",
          color: "var(--terminal-text)",
          "font-family": "inherit",
          "font-size": "11px",
          padding: "4px 10px",
          cursor: "pointer",
          flex: "none",
          "white-space": "nowrap",
        }}
      >
        {terminal.sourceStatus.playing ? "⏸ pause" : "▶ play"}
      </button>
      <div
        style={{
          display: "flex",
          border: "1px solid var(--terminal-border-strong)",
          "border-radius": "4px",
          overflow: "hidden",
          flex: "none",
        }}
      >
        <button
          type="button"
          aria-pressed={activeView("mission")}
          onClick={() => terminal.actions.setView("mission")}
          style={{
            background: activeView("mission") ? "var(--terminal-border)" : "transparent",
            border: "none",
            color: activeView("mission") ? "var(--terminal-text)" : "var(--terminal-muted)",
            "font-family": "inherit",
            "font-size": "11px",
            padding: "5px 10px",
            cursor: "pointer",
            "white-space": "nowrap",
          }}
        >
          mission control
        </button>
        <button
          type="button"
          aria-pressed={activeView("tui")}
          onClick={() => terminal.actions.setView("tui")}
          style={{
            background: activeView("tui") ? "var(--terminal-border)" : "transparent",
            border: "none",
            "border-left": "1px solid var(--terminal-border-strong)",
            color: activeView("tui") ? "var(--terminal-text)" : "var(--terminal-muted)",
            "font-family": "inherit",
            "font-size": "11px",
            padding: "5px 10px",
            cursor: "pointer",
            "white-space": "nowrap",
          }}
        >
          tui
        </button>
      </div>
    </header>
  )
}

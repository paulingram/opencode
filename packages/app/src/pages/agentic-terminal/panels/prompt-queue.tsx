import { createSignal, For, Show } from "solid-js"
import type { TerminalEventSource } from "../source"
import { useTerminalStore, type TerminalStoreContextValue } from "../store"

export function splitPromptChunks(value: string) {
  return value
    .split("|")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
}

export function sendPromptDraft(
  value: string,
  source: Pick<TerminalEventSource, "send">,
  actions: Pick<TerminalStoreContextValue["actions"], "enqueue">,
) {
  const chunks = splitPromptChunks(value)
  if (!chunks.length) return false
  source.send(chunks[0]!)
  actions.enqueue(chunks.slice(1))
  return true
}

export function queuePromptDraft(
  value: string,
  actions: Pick<TerminalStoreContextValue["actions"], "enqueue">,
) {
  const chunks = splitPromptChunks(value)
  if (!chunks.length) return false
  actions.enqueue(chunks)
  return true
}

export function PromptQueue() {
  const terminal = useTerminalStore()
  const [draft, setDraft] = createSignal("")

  const queueDraft = () => {
    if (queuePromptDraft(draft(), terminal.actions)) setDraft("")
  }

  const sendDraft = () => {
    if (sendPromptDraft(draft(), terminal.source, terminal.actions)) setDraft("")
  }

  const sendNext = () => {
    const next = terminal.actions.shiftQueue()
    if (next !== undefined) terminal.source.send(next)
  }

  return (
    <>
      <Show when={terminal.state.queue.length > 0}>
        <div
          data-screen-label="Prompt queue"
          style={{
            "flex-shrink": 0,
            display: "flex",
            "align-items": "center",
            gap: "8px",
            "border-top": "1px solid var(--terminal-border)",
            padding: "8px 16px",
            background: "var(--terminal-overlay)",
            "overflow-x": "auto",
          }}
        >
          <span style={{ "flex-shrink": 0, color: "var(--terminal-dim)", "font-size": "10px", "letter-spacing": "2px" }}>QUEUE</span>
          <For each={terminal.state.queue}>
            {(item, index) => (
              <span
                style={{
                  display: "inline-flex",
                  "align-items": "center",
                  gap: "7px",
                  "flex-shrink": 0,
                  "max-width": "340px",
                  background: "var(--terminal-raised)",
                  border: `1px solid ${index() === 0 ? "var(--terminal-primary)" : "var(--terminal-border-strong)"}`,
                  "border-radius": "4px",
                  padding: "3px 9px",
                  "font-size": "11px",
                }}
              >
                <span style={{ color: "var(--terminal-dim)" }}>#{index() + 1}</span>
                <span style={{ color: "var(--terminal-content)", "white-space": "nowrap", overflow: "hidden", "text-overflow": "ellipsis" }}>{item}</span>
                <button
                  type="button"
                  aria-label={`Remove queued prompt ${index() + 1}`}
                  onClick={() => terminal.actions.removeQueued(index())}
                  style={{ background: "transparent", border: "none", padding: 0, color: "var(--terminal-dim)", "font-family": "inherit", cursor: "pointer" }}
                >
                  ✕
                </button>
              </span>
            )}
          </For>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            onClick={sendNext}
            style={{ "flex-shrink": 0, background: "var(--terminal-raised)", border: "1px solid var(--terminal-border-strong)", "border-radius": "4px", color: "var(--terminal-text)", "font-family": "inherit", "font-size": "10.5px", padding: "3px 9px", cursor: "pointer" }}
          >
            send next ↑
          </button>
          <button
            type="button"
            onClick={() => terminal.actions.clearQueue()}
            style={{ "flex-shrink": 0, background: "transparent", border: "1px solid var(--terminal-border)", "border-radius": "4px", color: "var(--terminal-muted)", "font-family": "inherit", "font-size": "10.5px", padding: "3px 9px", cursor: "pointer" }}
          >
            clear
          </button>
          <span style={{ "flex-shrink": 0, color: "var(--terminal-dim)", "font-size": "10px" }}>auto-drains 1 / step</span>
        </div>
      </Show>

      <div
        data-screen-label="Prompt"
        style={{
          "flex-shrink": 0,
          display: "flex",
          "align-items": "center",
          gap: "10px",
          "border-top": "1px solid var(--terminal-border)",
          padding: "12px 16px",
          background: "var(--terminal-panel)",
        }}
      >
        <span style={{ color: "var(--terminal-primary)", "font-weight": 700 }}>❯</span>
        <input
          id="promptbox"
          value={draft()}
          onInput={(event) => setDraft(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return
            event.preventDefault()
            if (event.shiftKey) queueDraft()
            else sendDraft()
          }}
          placeholder="steer the orchestrator… enter sends · shift+enter queues · split chunks with |"
          style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "var(--terminal-text)", "font-family": "inherit", "font-size": "13px" }}
        />
        <button
          type="button"
          onClick={queueDraft}
          style={{ "flex-shrink": 0, background: "transparent", border: "1px solid var(--terminal-border-strong)", "border-radius": "4px", color: "var(--terminal-muted)", "font-family": "inherit", "font-size": "10.5px", padding: "4px 9px", cursor: "pointer" }}
        >
          + queue
        </button>
        <span style={{ color: "var(--terminal-dim)", "font-size": "10.5px", flex: "0 1 auto", "min-width": 0, "white-space": "nowrap", overflow: "hidden", "text-overflow": "ellipsis" }}>
          space play/pause · ←→ step · v view · click agent to filter
        </span>
      </div>
    </>
  )
}

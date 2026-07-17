import { For, Show, createEffect, on, onMount } from "solid-js"
import { useTerminalStore } from "../store"
import type { CommandPayload, DiffLine, FilePayload, SpawnPayload, TextPayload, TranscriptEvent } from "../types"

const formatTimestamp = (milliseconds: number) => {
  const seconds = Math.floor(milliseconds / 1_000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
}

const diffColor = (sign: DiffLine[0]) => {
  if (sign === "+") return { color: "var(--terminal-diff-add-fg)", background: "var(--terminal-diff-add-bg)" }
  if (sign === "-") return { color: "var(--terminal-diff-del-fg)", background: "var(--terminal-diff-del-bg)" }
  return { color: "var(--terminal-file)", background: "transparent" }
}

export function TerminalFeed() {
  const terminal = useTerminalStore()
  let feed: HTMLDivElement | undefined
  let pinned = true

  const visibleEvents = () =>
    terminal.state.filter === "all"
      ? terminal.state.transcript
      : terminal.state.transcript.filter((event) => event.agent === terminal.state.filter)

  const agent = (event: TranscriptEvent) => (event.agent === "user" ? undefined : terminal.state.agents[event.agent])
  const author = (event: TranscriptEvent) => (event.agent === "user" ? "you" : (agent(event)?.name ?? event.agent))
  const authorColor = (event: TranscriptEvent) =>
    event.agent === "user" ? "var(--terminal-text)" : (agent(event)?.color ?? "var(--terminal-muted)")
  const textPayload = (event: TranscriptEvent) => event.payload as TextPayload
  const spawnPayload = (event: TranscriptEvent) => event.payload as SpawnPayload
  const commandPayload = (event: TranscriptEvent) => event.payload as CommandPayload
  const filePayload = (event: TranscriptEvent) => event.payload as FilePayload

  const updatePinned = () => {
    if (!feed) return
    pinned = feed.scrollHeight - feed.scrollTop - feed.clientHeight <= 24
  }

  onMount(() => {
    if (feed) feed.scrollTop = feed.scrollHeight
  })

  createEffect(
    on(
      () => visibleEvents().length,
      () => {
        if (!pinned) return
        requestAnimationFrame(() => {
          if (feed) feed.scrollTop = feed.scrollHeight
        })
      },
    ),
  )

  return (
    <section
      data-testid="agentic-terminal-transcript"
      aria-label="transcript"
      style={{ display: "flex", "flex-direction": "column", "min-height": 0, "min-width": 0 }}
    >
      <Show when={terminal.state.filter !== "all"}>
        <div style={{ display: "flex", "align-items": "center", gap: "8px", padding: "8px 16px 0", flex: "none" }}>
          <button
            type="button"
            data-testid="terminal-filter-chip"
            onClick={() => terminal.actions.setFilter("all")}
            style={{
              background: "var(--terminal-raised)",
              border: "1px solid var(--terminal-border-strong)",
              "border-radius": "10px",
              padding: "2px 10px",
              "font-size": "11px",
              color: terminal.state.agents[terminal.state.filter]?.color ?? "var(--terminal-text)",
              cursor: "pointer",
              "font-family": "inherit",
            }}
          >
            filter: {terminal.state.agents[terminal.state.filter]?.name ?? terminal.state.filter} ✕
          </button>
        </div>
      </Show>
      <div
        ref={feed}
        id="feed"
        data-testid="terminal-feed"
        onScroll={updatePinned}
        style={{ flex: 1, "overflow-y": "auto", "overflow-x": "hidden", padding: "6px 0 12px" }}
      >
        <For each={visibleEvents()}>
          {(event) => (
            <article style={{ padding: "9px 18px", "border-bottom": "1px solid var(--terminal-feed-divider)" }}>
              <div style={{ display: "flex", "align-items": "baseline", gap: "8px" }}>
                <span style={{ "font-size": "11px", "font-weight": 700, color: authorColor(event) }}>{author(event)}</span>
                <span style={{ "font-size": "10px", color: "var(--terminal-timestamp)" }}>{formatTimestamp(event.ts)}</span>
              </div>
              <Show when={event.kind === "text" && event}>
                {(item) => (
                  <div
                    style={{
                      "font-size": "12.5px",
                      color: item().agent === "user" ? "var(--terminal-body-user)" : "var(--terminal-body-agent)",
                      "margin-top": "4px",
                      "line-height": 1.55,
                      "max-width": "760px",
                      "text-wrap": "pretty",
                    }}
                  >
                    {item().kind === "text" ? textPayload(item()).text : ""}
                  </div>
                )}
              </Show>
              <Show when={event.kind === "spawn" && event}>
                {(item) => (
                  <div style={{ "margin-top": "4px", "font-size": "12px", color: "var(--terminal-accent)" }}>
                    ◆ spawned <span style={{ "font-weight": 700 }}>{item().kind === "spawn" ? spawnPayload(item()).child : ""}</span>
                    <span style={{ color: "var(--terminal-muted)" }}>
                      {item().kind === "spawn" ? ` — ${spawnPayload(item()).task}` : ""}
                    </span>
                  </div>
                )}
              </Show>
              <Show when={event.kind === "cmd" && event}>
                {(item) => (
                  <div
                    style={{
                      "margin-top": "6px",
                      background: "var(--terminal-panel)",
                      border: "1px solid var(--terminal-border)",
                      "border-radius": "5px",
                      padding: "7px 10px",
                      "font-size": "12px",
                      "max-width": "760px",
                    }}
                  >
                    <div>
                      <span style={{ color: "var(--terminal-dim)" }}>$ </span>
                      <span style={{ color: "var(--terminal-text)" }}>{item().kind === "cmd" ? commandPayload(item()).cmd : ""}</span>
                    </div>
                    <div
                      data-testid="terminal-command-output"
                      style={{
                        color:
                          item().kind === "cmd" && commandPayload(item()).exit !== 0
                            ? "var(--terminal-error)"
                            : commandPayload(item()).outputColor ?? "var(--terminal-muted)",
                        "margin-top": "2px",
                      }}
                    >
                      {item().kind === "cmd" ? commandPayload(item()).out : ""}
                    </div>
                  </div>
                )}
              </Show>
              <Show when={event.kind === "file" && event}>
                {(item) => (
                  <div
                    style={{
                      "margin-top": "6px",
                      border: "1px solid var(--terminal-border)",
                      "border-radius": "5px",
                      "overflow-x": "auto",
                      "overflow-y": "hidden",
                      "max-width": "760px",
                    }}
                  >
                    <button
                      type="button"
                      data-testid="terminal-diff-header"
                      title="open in viewer"
                      onClick={() => item().kind === "file" && terminal.actions.openFile(filePayload(item()).path)}
                      style={{
                        width: "100%",
                        background: "var(--terminal-panel)",
                        padding: "4px 10px",
                        "font-size": "11px",
                        color: "var(--terminal-file)",
                        "border-top": 0,
                        "border-right": 0,
                        "border-bottom": "1px solid var(--terminal-border)",
                        "border-left": 0,
                        cursor: "pointer",
                        position: "sticky",
                        left: 0,
                        "font-family": "inherit",
                        "text-align": "left",
                      }}
                    >
                      ✎ {item().kind === "file" ? filePayload(item()).path : ""} ↗
                    </button>
                    <For each={item().kind === "file" ? filePayload(item()).diff.slice(0, 6) : []}>
                      {(line) => (
                        <div
                          data-testid="terminal-diff-row"
                          style={{
                            background: diffColor(line[0]).background,
                            color: diffColor(line[0]).color,
                            "font-size": "12px",
                            padding: "1px 10px",
                            "white-space": "pre",
                            width: "max-content",
                            "min-width": "100%",
                          }}
                        >
                          {line[0]} {line[1]}
                        </div>
                      )}
                    </For>
                  </div>
                )}
              </Show>
            </article>
          )}
        </For>
        <div style={{ padding: "10px 18px" }}>
          <span style={{ color: "var(--terminal-primary)", animation: "terminal-blink 1.1s step-end infinite" }}>▋</span>
        </div>
      </div>
    </section>
  )
}

import { describe, expect, test } from "bun:test"
import { createComponent, type JSX } from "solid-js"
import h from "solid-js/h"
import { unwrap } from "solid-js/store"
import { isServer, render } from "solid-js/web"
import { TerminalFeed } from "../panels/feed"
import { TerminalRail } from "../panels/rail"
import { TerminalTopbar } from "../panels/topbar"
import { TerminalTui } from "../panels/tui"
import type { TerminalEventSource } from "../source"
import { TerminalStoreProvider, useTerminalStore } from "../store"
import type { AgentRegistryEntry, TerminalEvent } from "../types"
import { TestTerminalSource } from "./test-source"

const React = { createElement: h, Fragment: h.Fragment }
Object.assign(globalThis, { React })

const agents: AgentRegistryEntry[] = [
  { id: "orch", name: "orchestrator", color: "#fab283" },
  { id: "coder", name: "coder", parent: "orch", color: "#5c9cf5" },
]

function mount(
  children: () => JSX.Element,
  registry: readonly AgentRegistryEntry[] = agents,
  source: TerminalEventSource = new TestTerminalSource({ agents: registry }),
) {
  const host = document.createElement("div")
  host.className = "agentic-terminal"
  host.style.cssText = [
    "--terminal-primary:#fab283",
    "--terminal-muted:#808080",
    "--terminal-error:#e06c75",
    "--terminal-success:#7fd88f",
    "--terminal-warn:#e5c07b",
    "--terminal-accent:#9d7cd8",
    "--terminal-border:#282828",
    "--terminal-scrubber-past:#4a5c50",
    "--terminal-diff-add-fg:#4fd6be",
    "--terminal-diff-add-bg:#20303b",
    "--terminal-diff-del-fg:#e26a75",
    "--terminal-diff-del-bg:#37222c",
    "--terminal-file:#828bb8",
  ].join(";")
  document.body.append(host)
  const dispose = render(
    () =>
      createComponent(TerminalStoreProvider, {
        agents: registry,
        source,
        get children() {
          return children()
        },
      }),
    host,
  )
  return {
    host,
    dispose() {
      dispose()
      host.remove()
    },
  }
}

describe.skipIf(isServer)("TerminalTopbar", () => {
  test("derives live, paused, decision, and complete status with the binding colors", () => {
    const source = new TestTerminalSource({ agents, status: { state: "running", playing: true } })

    const assertStatus = (status: Parameters<TestTerminalSource["setStatus"]>[0], label: string, color: string) => {
      source.setStatus(status)
      const view = mount(() => <TerminalTopbar />, agents, source)
      const element = view.host.querySelector<HTMLElement>("[data-testid='terminal-status']")!
      expect(element.textContent).toBe(label)
      expect(getComputedStyle(element).color).toBe(color)
      view.dispose()
    }

    assertStatus({ state: "running", playing: true, complete: false, forkActive: false }, "▶ live", "#fab283")
    assertStatus({ state: "paused", playing: false }, "⏸ paused", "#e5c07b")
    assertStatus({ state: "awaiting-decision", forkActive: true }, "⑂ awaiting decision", "#9d7cd8")
    assertStatus({ state: "complete", complete: true, forkActive: false }, "✓ complete", "#7fd88f")

    source.dispose()
  })

  test("renders the trimmed live session title with genuine ellipsis styling", () => {
    const source = new TestTerminalSource({ agents, status: { state: "running", playing: true } })
    const title = "  Agentic terminal real backend acceptance fixture with an intentionally long title  "

    function LiveTitle() {
      const terminal = useTerminalStore()
      terminal.actions.setSessionTitle(title)
      return <TerminalTopbar />
    }

    const view = mount(() => <LiveTitle />, agents, source)
    const element = view.host.querySelector<HTMLElement>("[data-testid='terminal-session-title']")!

    expect(element.textContent).toBe(title.trim())
    expect(element.title).toBe(title.trim())
    expect(element.textContent).not.toBe("refactor auth → session tokens")
    expect(getComputedStyle(element).overflow).toBe("hidden")
    expect(getComputedStyle(element).textOverflow).toBe("ellipsis")
    expect(getComputedStyle(element).whiteSpace).toBe("nowrap")
    expect(["0", "0px"]).toContain(getComputedStyle(element).minWidth)

    view.dispose()
    source.dispose()
  })

  test("renders live replay checkpoints and clicking a tick projects that recorded prefix", () => {
    const events = Array.from({ length: 13 }, (_, index): TerminalEvent => ({
      id: `event-${index}`,
      ts: index * 1_000,
      agent: "coder",
      kind: "text",
      payload: { text: `event ${index}` },
    }))
    const source = new TestTerminalSource({ agents, events, status: { state: "paused", step: 4, playing: false } })
    const view = mount(() => <TerminalTopbar />, agents, source)

    const ticks = [...view.host.querySelectorAll<HTMLElement>("[data-testid='terminal-scrubber-tick']")]
    expect(ticks).toHaveLength(13)
    expect(getComputedStyle(ticks[3]!).backgroundColor).toBe("#4a5c50")
    expect(getComputedStyle(ticks[4]!).backgroundColor).toBe("#fab283")
    expect(getComputedStyle(ticks[5]!).backgroundColor).toBe("#282828")
    expect(ticks[8]?.getAttribute("aria-label")).toBe("replay through checkpoint 8")

    ticks[8]!.click()
    expect(source.status()).toMatchObject({ step: 8, playing: false })
    view.dispose()

    const replayView = mount(() => <TerminalTopbar />, agents, source)
    expect(replayView.host.querySelector("[data-testid='terminal-step-label']")?.textContent).toBe("8/12")

    replayView.dispose()
    source.dispose()
  })
})

describe.skipIf(isServer)("TerminalRail and TerminalFeed", () => {
  test("renders an agent filter and clears it from the chip or all-activity row", () => {
    const source = new TestTerminalSource({ agents })
    let terminal!: ReturnType<typeof useTerminalStore>

    function FilteredPanels() {
      terminal = useTerminalStore()
      terminal.actions.setFilter("coder")
      return (
        <div>
          <TerminalRail showCost={true} />
          <TerminalFeed />
        </div>
      )
    }

    const view = mount(() => <FilteredPanels />, agents, source)
    const chip = view.host.querySelector<HTMLElement>("[data-testid='terminal-filter-chip']")!
    expect(chip.textContent ?? "").toContain("filter: coder ✕")
    chip.click()
    expect(terminal.state.filter).toBe("all")

    terminal.actions.setFilter("coder")
    view.host.querySelector<HTMLElement>("[data-testid='terminal-all-activity']")!.click()
    expect(terminal.state.filter).toBe("all")

    view.dispose()
    source.dispose()
  })

  test("skips stale ordered agent and file rows without crashing mission control or TUI", () => {
    const source = new TestTerminalSource({ agents })

    function DesynchronizedPanels() {
      const context = useTerminalStore()
      const state = unwrap(context.state)
      state.agentOrder.push("missing-agent")
      state.fileOrder.push("missing-file.ts")
      return (
        <div>
          <TerminalRail showCost={true} />
          <TerminalTui showCost={true} />
        </div>
      )
    }

    expect(() => {
      const view = mount(() => <DesynchronizedPanels />, agents, source)
      expect(view.host.querySelector("[data-agent-id='missing-agent']")).toBeNull()
      expect(view.host.textContent).not.toContain("missing-file.ts")
      expect(view.host.querySelectorAll("[data-agent-id]")).toHaveLength(agents.length)
      view.dispose()
    }).not.toThrow()

    source.dispose()
  })

  test("limits a diff card to six rows and applies exact add, delete, and context colors", () => {
    const source = new TestTerminalSource({ agents })
    const fileEvent: TerminalEvent = {
      id: "file",
      ts: 66_000,
      agent: "coder",
      kind: "file",
      payload: {
        path: "src/auth/token.ts",
        stat: "+4 −1",
        lang: "ts",
        diff: [
          ["+", "added"],
          ["-", "deleted"],
          [" ", "context"],
          ["+", "four"],
          ["+", "five"],
          ["+", "six"],
          ["+", "must not render"],
        ],
        content: "added",
      },
    }

    function SeededFeed() {
      const terminal = useTerminalStore()
      terminal.actions.fold(fileEvent)
      return <TerminalFeed />
    }

    const view = mount(() => <SeededFeed />)
    const rows = [...view.host.querySelectorAll<HTMLElement>("[data-testid='terminal-diff-row']")]
    expect(rows).toHaveLength(6)
    expect(getComputedStyle(rows[0]!).color).toBe("#4fd6be")
    expect(getComputedStyle(rows[0]!).backgroundColor).toBe("#20303b")
    expect(getComputedStyle(rows[1]!).color).toBe("#e26a75")
    expect(getComputedStyle(rows[1]!).backgroundColor).toBe("#37222c")
    expect(getComputedStyle(rows[2]!).color).toBe("#828bb8")
    expect(getComputedStyle(view.host.querySelector<HTMLElement>("[data-testid='terminal-diff-header']")!).position).toBe(
      "sticky",
    )

    view.dispose()
    source.dispose()
  })
})

describe.skipIf(isServer)("command output colors", () => {
  test("renders a successful live command with the green token in Mission Control and TUI", () => {
    const source = new TestTerminalSource({ agents })
    const command: TerminalEvent = {
      id: "command-success",
      ts: 8_000,
      agent: "coder",
      kind: "cmd",
      payload: { cmd: "bun test", out: "✓ 44 passed", exit: 0, outputColor: "var(--terminal-success)" },
    }

    function SeededOutputs() {
      const terminal = useTerminalStore()
      terminal.actions.fold(command)
      return (
        <div>
          <TerminalFeed />
          <TerminalTui showCost={true} />
        </div>
      )
    }

    const view = mount(() => <SeededOutputs />, agents, source)
    const feedOutput = [...view.host.querySelectorAll<HTMLElement>("[data-testid='terminal-command-output']")].find(
      (item) => item.textContent === "✓ 44 passed",
    )!
    const tuiOutput = [...view.host.querySelectorAll<HTMLElement>("[data-testid='terminal-tui-transcript-line']")]
      .flatMap((line) => [...line.querySelectorAll<HTMLElement>("span")])
      .find((item) => item.textContent === "✓ 44 passed")!

    expect(getComputedStyle(feedOutput).color).toBe("#7fd88f")
    expect(getComputedStyle(tuiOutput).color).toBe("#7fd88f")

    view.dispose()
    source.dispose()
  })
})

describe.skipIf(isServer)("TerminalTui", () => {
  test("projects only the last 15 transcript lines and truncates text to the prototype width", () => {
    const source = new TestTerminalSource({ agents })
    const events = Array.from({ length: 20 }, (_, index): TerminalEvent => ({
      id: `text-${index}`,
      ts: index * 1_000,
      agent: "coder",
      kind: "text",
      payload: { text: `event-${index} ${"x".repeat(100)}` },
    }))

    function SeededTui() {
      const terminal = useTerminalStore()
      terminal.actions.foldMany(events)
      return <TerminalTui showCost={true} />
    }

    const view = mount(() => <SeededTui />, agents, source)
    const lines = [...view.host.querySelectorAll<HTMLElement>("[data-testid='terminal-tui-transcript-line']")]
    expect(lines).toHaveLength(15)
    expect(lines[0]!.textContent).toContain("event-5")
    expect(lines.at(-1)!.textContent).toContain("event-19")
    expect(lines.at(-1)!.textContent).toContain("…")
    expect(lines.at(-1)!.textContent).not.toContain("x".repeat(100))
    expect(getComputedStyle(lines[0]!).minHeight).toBe("19px")
    expect(getComputedStyle(lines[0]!).whiteSpace).toBe("pre")

    view.dispose()
    source.dispose()
  })
})

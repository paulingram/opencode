import { describe, expect, test } from "bun:test"
import { createComponent, type JSX } from "solid-js"
import h from "solid-js/h"
import { isServer, render } from "solid-js/web"
import { handleTerminalHotkey } from "../hotkeys"
import { ForkBanner, resolveForkOption } from "../panels/fork-banner"
import { queuePromptDraft, sendPromptDraft, splitPromptChunks } from "../panels/prompt-queue"
import { RightPanel } from "../panels/right-panel"
import { parseMarkdownBlocks } from "../panels/viewer"
import { createTerminalStore, TerminalStoreProvider, type TerminalStoreContextValue, useTerminalStore } from "../store"
import type { AgentRegistryEntry, TerminalEvent } from "../types"
import { TestTerminalSource } from "./test-source"

const React = { createElement: h, Fragment: h.Fragment }
Object.assign(globalThis, { React })

const agents: AgentRegistryEntry[] = [
  { id: "orch", name: "orchestrator", color: "#fab283" },
  { id: "coder1", name: "coder-1", parent: "orch", color: "#5c9cf5" },
  { id: "coder2", name: "coder-2", parent: "orch", color: "#e5c07b" },
  { id: "reviewer", name: "reviewer", parent: "orch", color: "#9d7cd8" },
]

function mount(
  children: () => JSX.Element,
  registry: readonly AgentRegistryEntry[] = agents,
  source: TestTerminalSource = new TestTerminalSource({ agents: registry }),
) {
  const host = document.createElement("div")
  host.className = "agentic-terminal"
  host.style.cssText = [
    "--terminal-plan-done:#b8b8b8",
    "--terminal-flow-label:#a0a0a0",
    "--terminal-flow-done:#3f5c48",
    "--terminal-flow-handoff:#2f4a52",
    "--terminal-flow-handoff-review:#4a3f5c",
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

function keyEvent(key: string, target?: EventTarget) {
  const event = new KeyboardEvent("keydown", { key, cancelable: true })
  if (target) Object.defineProperty(event, "target", { value: target })
  return event
}

const forkOpen: TerminalEvent = {
  id: "fork-open",
  ts: 1,
  agent: "orch",
  kind: "fork",
  payload: {
    op: "open",
    prompt: "Choose an approach",
    options: [
      { key: "1", value: "mocks", label: "patch per-test mocks", note: "fast" },
      { key: "2", value: "fixture", label: "rewrite shared auth fixture", note: "one source of truth" },
    ],
  },
}

const planAndFlowEvents: TerminalEvent[] = [
  { id: "plan-root", ts: 2, agent: "orch", kind: "plan", payload: { op: "add", node: "plan-2", label: "repair auth" } },
  { id: "plan-branch", ts: 3, agent: "orch", kind: "plan", payload: { op: "add", node: "plan-3", label: "choose repair", parent: "plan-2" } },
  {
    id: "plan-mocks",
    ts: 4,
    agent: "orch",
    kind: "plan",
    payload: { op: "add", node: "plan-4", label: "patch per-test mocks", parent: "plan-3", fork: "mocks" },
  },
  {
    id: "plan-fixture",
    ts: 5,
    agent: "orch",
    kind: "plan",
    payload: { op: "add", node: "plan-5", label: "rewrite shared auth fixture", parent: "plan-3", fork: "fixture" },
  },
  { id: "plan-start", ts: 5, agent: "orch", kind: "plan", payload: { op: "start", node: "plan-5" } },
  { id: "plan-done", ts: 5, agent: "orch", kind: "plan", payload: { op: "done", node: "plan-5" } },
  { id: "plan-reject", ts: 5, agent: "orch", kind: "plan", payload: { op: "reject", node: "plan-4" } },
  { id: "fork-resolve", ts: 5, agent: "user", kind: "fork", payload: { op: "resolve", choice: "fixture" } },
  { id: "handoff-1", ts: 6, agent: "orch", kind: "spawn", payload: { child: "coder1", task: "implement", handoff: true } },
  { id: "handoff-2", ts: 7, agent: "orch", kind: "spawn", payload: { child: "coder2", task: "verify", handoff: true } },
  { id: "handoff-3", ts: 8, agent: "coder1", kind: "spawn", payload: { child: "reviewer", task: "review", handoff: true } },
  { id: "handoff-4", ts: 9, agent: "coder2", kind: "spawn", payload: { child: "reviewer", task: "review", handoff: true } },
]

describe("agentic terminal panel B behavior", () => {
  test("splits prompt chunks, trims each chunk, and drops empty chunks", () => {
    expect(splitPromptChunks("  a | b ||  c  | ")).toEqual(["a", "b", "c"])
    expect(splitPromptChunks("   ")).toEqual([])
  })

  test("enter sends the first prompt chunk and queues the rest while shift+enter queues all", () => {
    const terminal = createTerminalStore({ agents })
    const sent: string[] = []
    const source = { send: (value: string) => sent.push(value) }

    expect(sendPromptDraft("a | b | c", source, terminal.actions)).toBe(true)
    expect(sent).toEqual(["a"])
    expect(terminal.state.queue).toEqual(["b", "c"])

    expect(queuePromptDraft("d | e", terminal.actions)).toBe(true)
    expect(sent).toEqual(["a"])
    expect(terminal.state.queue).toEqual(["b", "c", "d", "e"])
    expect(sendPromptDraft("   ", source, terminal.actions)).toBe(false)
    expect(queuePromptDraft(" | ", terminal.actions)).toBe(false)
  })

  test.skipIf(isServer)("a built-in Prompt-shaped fork renders option cards", () => {
    const source = new TestTerminalSource({ agents, status: { state: "awaiting-decision", forkActive: true } })
    function PromptFork() {
      const terminal = useTerminalStore()
      terminal.actions.fold(forkOpen)
      return <ForkBanner />
    }
    const view = mount(() => <PromptFork />, agents, source)

    expect(view.host.textContent).toContain("decision fork — Choose an approach")
    expect(view.host.querySelectorAll("[data-fork-option]")).toHaveLength(2)
    view.dispose()
    source.dispose()
  })

  test("banner, plan, and number hotkey resolution share the source resolver", () => {
    const choices: string[] = []

    for (const resolve of [
      (terminal: TerminalStoreContextValue, source: TestTerminalSource) => resolveForkOption(source, "fixture"),
      (terminal: TerminalStoreContextValue, source: TestTerminalSource) => resolveForkOption(source, "fixture"),
      (terminal: TerminalStoreContextValue) => handleTerminalHotkey(keyEvent("2"), terminal),
    ]) {
      const source = new TestTerminalSource({ agents, status: { state: "awaiting-decision", forkActive: true } })
      const terminal = createTerminalStore({ source })
      terminal.actions.fold(forkOpen)
      resolve(terminal, source)
      choices.push(...source.resolved)
      source.dispose()
    }

    expect(choices).toEqual(["fixture", "fixture", "fixture"])
  })

  test.skipIf(isServer)("renders plan indentation, rejected fork notes, and dashed live handoffs", () => {
    const source = new TestTerminalSource({ agents })
    let terminal!: TerminalStoreContextValue

    function PlanRightPanel() {
      terminal = useTerminalStore()
      terminal.actions.fold(forkOpen)
      terminal.actions.foldMany(planAndFlowEvents)
      return <RightPanel />
    }

    const planView = mount(() => <PlanRightPanel />, agents, source)
    const forkOption = planView.host.querySelector<HTMLElement>("[data-plan-fork-option='fixture']")!
    expect(getComputedStyle(forkOption).paddingLeft).toBe("48px")
    expect(terminal.state.plan["plan-4"]?.state).toBe("rejected")
    expect(terminal.state.plan["plan-5"]?.state).toBe("done")
    expect(planView.host.querySelector("[data-panel-tab='plan']")?.textContent).toBe("plan 1/4")
    const rejected = planView.host.querySelector<HTMLElement>("[data-plan-fork-option='mocks']")!
    expect(rejected.textContent).toContain("rejected at fork")
    const rejectedLabel = [...rejected.querySelectorAll("span")].find((item) => item.textContent === "patch per-test mocks")!
    expect(rejectedLabel.getAttribute("style")).toContain("text-decoration: line-through")
    planView.dispose()

    function FlowRightPanel() {
      terminal = useTerminalStore()
      terminal.actions.foldMany(planAndFlowEvents)
      terminal.actions.setTab("flow")
      return <RightPanel />
    }

    const flowView = mount(() => <FlowRightPanel />, agents, source)
    const dashed = [...flowView.host.querySelectorAll<SVGLineElement>("line[stroke-dasharray='3 3']")]
    expect(dashed).toHaveLength(4)
    expect(dashed.map((edge) => edge.getAttribute("stroke"))).toEqual([
      "var(--terminal-flow-handoff)",
      "var(--terminal-flow-handoff)",
      "var(--terminal-flow-handoff-review)",
      "var(--terminal-flow-handoff-review)",
    ])

    flowView.dispose()
    source.dispose()
  })

  test("viewer edits save session-locally and revert to canonical content", () => {
    const terminal = createTerminalStore({ agents })
    const file: TerminalEvent = {
      id: "file",
      ts: 1,
      agent: "coder1",
      kind: "file",
      payload: {
        path: "src/auth/token.ts",
        stat: "+1",
        lang: "ts",
        diff: [["+", "return token"]],
        content: "export const canonical = true",
      },
    }
    terminal.actions.fold(file)
    terminal.actions.openFile(file.payload.path)
    terminal.actions.setEditing(true)
    terminal.actions.saveFileEdit(file.payload.path, "export const edited = true")

    expect(terminal.state.fileEdits[file.payload.path]).toBe("export const edited = true")
    expect(terminal.state.editing).toBe(false)
    terminal.actions.revertFileEdit(file.payload.path)
    expect(terminal.state.fileEdits[file.payload.path]).toBeUndefined()
    expect(terminal.state.files[file.payload.path]?.content).toBe("export const canonical = true")
  })

  test("parses the viewer markdown vocabulary exactly", () => {
    expect(parseMarkdownBlocks("# Title\n_meta_\n## Changes\n- one\n```ts\nconst one = 1\n```")).toEqual([
      { text: "Title", kind: "h1" },
      { text: "meta", kind: "meta" },
      { text: "Changes", kind: "h2" },
      { text: "• one", kind: "bullet" },
      { text: "const one = 1", kind: "code" },
    ])
  })

  test("hotkeys guard inputs except escape and lock forward replay at a live fork", () => {
    const calls = { toggle: 0, forward: 0, backward: 0 }
    const source = new TestTerminalSource({ agents })
    source.toggle = () => calls.toggle++
    source.stepForward = () => calls.forward++
    source.stepBackward = () => calls.backward++
    const terminal = createTerminalStore({ source })
    terminal.actions.openFile("src/auth/token.ts")
    const input = document.createElement("input")

    handleTerminalHotkey(keyEvent(" ", input), terminal)
    expect(calls.toggle).toBe(0)

    handleTerminalHotkey(keyEvent("Escape", input), terminal)
    expect(terminal.state.openFile).toBeNull()

    terminal.actions.fold(forkOpen)
    handleTerminalHotkey(keyEvent("ArrowRight"), terminal)
    expect(calls.forward).toBe(0)

    const space = new KeyboardEvent("keydown", { key: " ", cancelable: true })
    handleTerminalHotkey(space, terminal)
    expect(calls.toggle).toBe(1)
    expect(space.defaultPrevented).toBe(true)
  })
})

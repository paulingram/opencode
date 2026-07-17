import { describe, expect, test } from "bun:test"
import { createComputed, createRoot } from "solid-js"
import { createTerminalStore } from "../store"
import type { AgentRegistryEntry, TerminalEvent } from "../types"
import { TestTerminalSource } from "./test-source"

const agents: AgentRegistryEntry[] = [
  { id: "orch", name: "orchestrator", color: "#fab283" },
  { id: "coder", name: "coder", parent: "orch", color: "#5c9cf5" },
]

const event = <T extends TerminalEvent>(value: T) => value

describe("terminal event fold", () => {
  test("projects ordered transcript, agent status, resources, and delegation from one stream", () => {
    const terminal = createTerminalStore({ agents })

    terminal.actions.foldMany([
      event({ id: "1", ts: 1_000, agent: "orch", kind: "text", payload: { text: "Starting." } }),
      event({
        id: "2",
        ts: 2_000,
        agent: "orch",
        kind: "spawn",
        payload: { child: "coder", task: "implement the fold" },
      }),
      event({
        id: "3",
        ts: 3_000,
        agent: "coder",
        kind: "status",
        payload: { status: "work", task: "implementing event fold" },
      }),
      event({
        id: "4",
        ts: 4_000,
        agent: "coder",
        kind: "resource",
        payload: { tokens: 3_100, costUsd: 0.0465, ctxPct: 16 },
      }),
      event({
        id: "5",
        ts: 5_000,
        agent: "coder",
        kind: "cmd",
        payload: { cmd: "bun test", out: "all green", exit: 0 },
      }),
    ])

    expect(terminal.state.transcript.map((item) => item.id)).toEqual(["1", "2", "5"])
    expect(terminal.state.agents.coder).toMatchObject({
      parent: "orch",
      status: "work",
      task: "implementing event fold",
      tokens: 3_100,
      costUsd: 0.0465,
      ctxPct: 16,
    })
    expect(terminal.state.delegations).toEqual([{ parent: "orch", child: "coder", task: "implement the fold" }])
  })

  test("folds plan, issue, file, and fork lifecycles idempotently", () => {
    const terminal = createTerminalStore({ agents })
    const events: TerminalEvent[] = [
      event({
        id: "plan-add",
        ts: 1,
        agent: "orch",
        kind: "plan",
        payload: { op: "add", node: "fix", label: "fix the tests", by: "orchestrator" },
      }),
      event({ id: "plan-start", ts: 2, agent: "orch", kind: "plan", payload: { op: "start", node: "fix" } }),
      event({
        id: "issue-open",
        ts: 3,
        agent: "coder",
        kind: "issue",
        payload: { op: "open", issueId: "iss_1", title: "tests fail", agent: "coder", detail: "fixture drift" },
      }),
      event({
        id: "file",
        ts: 4,
        agent: "coder",
        kind: "file",
        payload: {
          path: "test/auth.ts",
          stat: "+1 −1",
          lang: "ts",
          diff: [["+", "export const token = issueToken()"]],
          content: "export const token = issueToken()",
        },
      }),
      event({
        id: "fork-open",
        ts: 5,
        agent: "orch",
        kind: "fork",
        payload: {
          op: "open",
          prompt: "coder blocked, session paused",
          options: [
            { key: "1", label: "patch mocks", note: "fast — but drifts", value: "mocks" },
            { key: "2", label: "rewrite fixture", note: "one source of truth", value: "fixture" },
          ],
        },
      }),
      event({
        id: "fork-resolve",
        ts: 6,
        agent: "user",
        kind: "fork",
        payload: { op: "resolve", choice: "fixture" },
      }),
      event({ id: "plan-done", ts: 7, agent: "coder", kind: "plan", payload: { op: "done", node: "fix" } }),
      event({
        id: "issue-fixing",
        ts: 8,
        agent: "coder",
        kind: "issue",
        payload: { op: "fixing", issueId: "iss_1" },
      }),
      event({
        id: "issue-resolved",
        ts: 9,
        agent: "coder",
        kind: "issue",
        payload: { op: "resolved", issueId: "iss_1", resolution: "fixture rewritten" },
      }),
    ]

    terminal.actions.foldMany(events)
    terminal.actions.foldMany(events)

    expect(terminal.state.plan.fix).toMatchObject({ state: "done", label: "fix the tests" })
    expect(terminal.state.issues.iss_1).toMatchObject({ state: "resolved", resolution: "fixture rewritten" })
    expect(terminal.state.files["test/auth.ts"]).toMatchObject({ content: "export const token = issueToken()" })
    expect(terminal.state.fork).toMatchObject({ open: false, choice: "fixture" })
    expect(terminal.state.transcript.filter((item) => item.id === "file")).toHaveLength(1)
    expect(Object.keys(terminal.state.seenEventIds)).toHaveLength(events.length)
  })

  test("registers rail-only files without creating transcript rows", () => {
    const terminal = createTerminalStore({ agents })
    terminal.actions.registerFiles([
      {
        path: "reports/auth-callsites.md",
        payload: {
          path: "reports/auth-callsites.md",
          stat: "new",
          lang: "md",
          diff: [],
          content: "# report",
          agent: "orch",
          updatedAt: 1,
        },
      },
    ])

    expect(terminal.state.fileOrder).toEqual(["reports/auth-callsites.md"])
    expect(terminal.state.files["reports/auth-callsites.md"]?.content).toBe("# report")
    expect(terminal.state.transcript).toEqual([])
  })

  test("publishes every ordered record atomically across registration and fold paths", () => {
    createRoot((dispose) => {
      const terminal = createTerminalStore()
      const invalidSnapshots: string[] = []
      createComputed(() => {
        for (const id of terminal.state.agentOrder) {
          if (!terminal.state.agents[id]) invalidSnapshots.push(`agent:${id}`)
        }
        for (const path of terminal.state.fileOrder) {
          if (!terminal.state.files[path]) invalidSnapshots.push(`file:${path}`)
        }
        for (const id of terminal.state.planOrder) {
          if (!terminal.state.plan[id]) invalidSnapshots.push(`plan:${id}`)
        }
        for (const id of terminal.state.issueOrder) {
          if (!terminal.state.issues[id]) invalidSnapshots.push(`issue:${id}`)
        }
      })

      terminal.actions.registerAgents([{ id: "registered", name: "registered", color: "#fff" }])
      terminal.actions.registerFiles([{
        path: "registered.ts",
        payload: {
          path: "registered.ts",
          stat: "new",
          lang: "ts",
          diff: [],
          content: "export {}",
          agent: "registered",
          updatedAt: 1,
        },
      }])
      terminal.actions.foldMany([
        event({ id: "implicit", ts: 2, agent: "implicit", kind: "text", payload: { text: "hello" } }),
        event({
          id: "fold-file",
          ts: 3,
          agent: "implicit",
          kind: "file",
          payload: { path: "folded.ts", stat: "new", lang: "ts", diff: [], content: "export {}" },
        }),
        event({ id: "fold-plan", ts: 4, agent: "implicit", kind: "plan", payload: { op: "add", node: "node" } }),
        event({
          id: "fold-issue",
          ts: 5,
          agent: "implicit",
          kind: "issue",
          payload: { op: "open", issueId: "issue", title: "Issue", detail: "Detail" },
        }),
      ])

      expect(invalidSnapshots).toEqual([])
      expect(terminal.state.agentOrder.every((id) => !!terminal.state.agents[id])).toBe(true)
      expect(terminal.state.fileOrder.every((path) => !!terminal.state.files[path])).toBe(true)
      expect(terminal.state.planOrder.every((id) => !!terminal.state.plan[id])).toBe(true)
      expect(terminal.state.issueOrder.every((id) => !!terminal.state.issues[id])).toBe(true)
      dispose()
    })
  })

  test("exposes the store-context surface through a TerminalEventSource test double", () => {
    const source = new TestTerminalSource({ agents })
    const terminal = createTerminalStore({ source })

    expect(terminal.source).toBe(source)
    expect(terminal.sourceStatus).toMatchObject({ connected: true, state: "paused", playing: false })
    source.setStatus({ state: "running", playing: true })
    expect(terminal.sourceStatus).toMatchObject({ state: "running", playing: true })

    const liveEvent = event({ id: "source-text", ts: 1, agent: "orch", kind: "text", payload: { text: "Live event" } })
    const unsubscribe = source.subscribe(terminal.actions.fold)
    source.emit(liveEvent)
    expect(terminal.state.transcript).toEqual([liveEvent])
    unsubscribe()
  })

  test("keeps transport concerns out of the fold and preserves UI state on projection reset", () => {
    const terminal = createTerminalStore({ agents })
    terminal.actions.setView("tui")
    terminal.actions.setTab("issues")
    terminal.actions.setFilter("coder")
    terminal.actions.enqueue(["first", "second"])
    terminal.actions.openFile("test/auth.ts")
    terminal.actions.saveFileEdit("test/auth.ts", "edited")
    terminal.actions.fold(
      event({ id: "text", ts: 1, agent: "orch", kind: "text", payload: { text: "transient transcript" } }),
    )

    terminal.actions.resetProjection({ preserveUi: true, preserveQueue: true, preserveFileEdits: true })

    expect(terminal.state.transcript).toEqual([])
    expect(terminal.state.view).toBe("tui")
    expect(terminal.state.tab).toBe("issues")
    expect(terminal.state.filter).toBe("all")
    expect(terminal.state.queue).toEqual(["first", "second"])
    expect(terminal.state.fileEdits).toEqual({ "test/auth.ts": "edited" })
    expect(terminal.state.openFile).toBe("test/auth.ts")
    expect("playing" in terminal.state).toBe(false)
    expect("step" in terminal.state).toBe(false)
  })
})

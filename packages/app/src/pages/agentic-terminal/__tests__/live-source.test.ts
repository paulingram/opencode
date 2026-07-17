import { describe, expect, test } from "bun:test"
import type { Session } from "@opencode-ai/sdk/v2/client"
import { createComputed, createRoot } from "solid-js"
import { isServer } from "solid-js/web"
import { LiveSessionSource } from "../live/live-source"
import type { OpenCodeEvent } from "../live/adapters"
import { createTerminalStore } from "../store"
import type { TerminalEvent } from "../types"

const root: Session = {
  id: "ses_root",
  slug: "ses_root",
  projectID: "project",
  directory: "C:/work",
  title: "Live work",
  agent: "orchestrator",
  version: "1",
  time: { created: 100, updated: 200 },
}

function harness() {
  const calls: string[] = []
  const projected: TerminalEvent[] = []
  const directoryListeners = new Set<(event: OpenCodeEvent) => void>()
  const globalListeners = new Set<(event: OpenCodeEvent) => void>()
  const replies: unknown[] = []
  const prompts: unknown[] = []
  const source = new LiveSessionSource({
    sessionID: root.id,
    directory: root.directory,
    async syncSession(_id, options) {
      calls.push(options?.force ? "sync:force" : "sync")
    },
    snapshot: () => ({ rootSessionID: root.id, sessions: [root], messages: { [root.id]: [] }, parts: {} }),
    subscribeDirectory(_directory, listener) {
      calls.push("listen:directory")
      directoryListeners.add(listener)
      return () => directoryListeners.delete(listener)
    },
    subscribeGlobal(listener) {
      calls.push("listen:global")
      globalListeners.add(listener)
      return () => globalListeners.delete(listener)
    },
    startEvents() {
      calls.push("event:start")
    },
    async replyQuestion(input) {
      replies.push(input)
    },
    async promptAsync(input) {
      prompts.push(input)
    },
    sessionStatus: async () => ({ type: "idle" }),
    onEvent: (event) => projected.push(event),
    onReset: () => {
      calls.push("reset")
      projected.length = 0
    },
    now: () => 1_000,
  })
  return { source, calls, projected, directoryListeners, globalListeners, replies, prompts }
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

describe("LiveSessionSource", () => {
  test("loads before subscribing and starts the existing wrapper lazily and idempotently", async () => {
    const test = harness()
    test.source.start()
    test.source.start()
    await flush()

    expect(test.calls).toEqual(["sync", "sync", "reset", "listen:directory", "listen:global", "event:start"])
    expect(test.source.status()).toMatchObject({ connected: true, playing: true, state: "running" })
    test.source.dispose()
  })

  test("publishes the trimmed title from the attached session snapshot", async () => {
    const titles: string[] = []
    const source = new LiveSessionSource({
      sessionID: root.id,
      directory: root.directory,
      syncSession: async () => {},
      snapshot: () => ({ rootSessionID: root.id, sessions: [{ ...root, title: "  Real opening prompt  " }], messages: { [root.id]: [] }, parts: {} }),
      subscribeDirectory: () => () => {},
      subscribeGlobal: () => () => {},
      startEvents: () => {},
      replyQuestion: async () => {},
      promptAsync: async () => {},
      onSessionTitle: (title) => titles.push(title),
    })

    source.start()
    await flush()

    expect(titles).toEqual(["Real opening prompt"])
    source.dispose()
  })

  test.skipIf(isServer)("publishes a reactive replay tail from the production fold seam while scrubbing and resuming", async () => {
    const directoryListeners = new Set<(event: OpenCodeEvent) => void>()
    let source!: LiveSessionSource
    const terminal = createTerminalStore({
      createSource: (actions) => {
        source = new LiveSessionSource({
          sessionID: root.id,
          directory: root.directory,
          syncSession: async () => {},
          snapshot: () => ({ rootSessionID: root.id, sessions: [root], messages: { [root.id]: [] }, parts: {} }),
          subscribeDirectory: (_directory, listener) => {
            directoryListeners.add(listener)
            return () => directoryListeners.delete(listener)
          },
          subscribeGlobal: () => () => {},
          startEvents: () => {},
          replyQuestion: async () => {},
          promptAsync: async () => {},
          onReset: () => actions.resetProjection({ preserveUi: true, preserveQueue: true, preserveFileEdits: true }),
          onEvent: actions.fold,
        })
        return source
      },
    })

    const observedTails: number[] = []
    const disposeReactiveConsumer = createRoot((dispose) => {
      createComputed(() => observedTails.push(terminal.sourceStatus.lastStep))
      return dispose
    })

    source.start()
    await flush()
    directoryListeners.forEach((listener) => listener({
      id: "evt_000000000001todo0000000000",
      type: "todo.updated",
      properties: { sessionID: root.id, todos: [{ content: "Live plan", status: "in_progress", priority: "high" }] },
    }))
    await flush()

    expect(Object.keys(terminal.state.seenEventIds)).toHaveLength(2)
    expect(Object.values(terminal.state.plan)).toHaveLength(1)
    expect(Object.values(terminal.state.plan)[0]?.state).toBe("active")
    expect(terminal.sourceStatus).toMatchObject({ step: 1, lastStep: 1, checkpointCount: 2 })
    expect(observedTails).toContain(1)
    expect(source.status().step).toBe(source.lastStep)
    expect(source.lastStep).toBe(1)

    source.pause()
    directoryListeners.forEach((listener) => listener({
      id: "evt_000000000002todo0000000000",
      type: "todo.updated",
      properties: { sessionID: root.id, todos: [{ content: "Buffered plan", status: "completed", priority: "medium" }] },
    }))
    await flush()

    expect(Object.values(terminal.state.plan)).toHaveLength(1)
    expect(source.lastStep).toBe(1)

    source.play()
    expect(Object.keys(terminal.state.seenEventIds)).toHaveLength(4)
    expect(Object.values(terminal.state.plan)).toHaveLength(2)
    expect(Object.values(terminal.state.plan).find((plan) => plan.label === "Buffered plan")?.state).toBe("done")
    expect(terminal.sourceStatus).toMatchObject({ step: 3, lastStep: 3, checkpointCount: 4 })
    expect(observedTails.at(-1)).toBe(3)
    expect(source.status().step).toBe(source.lastStep)
    expect(source.lastStep).toBe(3)

    source.jump(0)
    expect(terminal.sourceStatus).toMatchObject({ playing: false, step: 0 })
    expect(Object.values(terminal.state.plan)).toHaveLength(1)
    expect(Object.values(terminal.state.plan)[0]?.state).toBe("pending")

    source.play()
    expect(Object.keys(terminal.state.seenEventIds)).toHaveLength(4)
    expect(Object.values(terminal.state.plan)).toHaveLength(2)
    expect(Object.values(terminal.state.plan).find((plan) => plan.label === "Buffered plan")?.state).toBe("done")
    expect(terminal.sourceStatus).toMatchObject({ playing: true, step: source.lastStep, lastStep: source.lastStep })
    expect(source.status().step).toBe(source.lastStep)
    disposeReactiveConsumer()
    source.dispose()
  })

  test("deduplicates duplicate envelopes at the production fold seam without advancing the replay tail", async () => {
    const test = harness()
    test.source.start()
    await flush()
    const event: OpenCodeEvent = {
      id: "evt_000000000003todo0000000000",
      type: "todo.updated",
      properties: { sessionID: root.id, todos: [{ content: "Only once", status: "pending", priority: "low" }] },
    }

    test.directoryListeners.forEach((listener) => listener(event))
    await flush()
    const lastStep = test.source.lastStep
    const projected = [...test.projected]
    test.directoryListeners.forEach((listener) => listener(event))
    await flush()

    expect(test.source.lastStep).toBe(lastStep)
    expect(test.source.status().step).toBe(lastStep)
    expect(test.projected).toEqual(projected)
    test.source.dispose()
  })

  test("resnapshots on server.connected without depending on a replay stream", async () => {
    const test = harness()
    test.source.start()
    await flush()

    test.globalListeners.forEach((listener) => listener({ id: "evt_000000000001connected000", type: "server.connected", properties: {} }))
    await flush()

    expect(test.calls.filter((call) => call === "sync:force")).toHaveLength(1)
    expect(test.calls.filter((call) => call === "reset")).toHaveLength(2)
    test.source.dispose()
  })

  test("starts the wrapper before the first prompt creates and attaches a missing session", async () => {
    const calls: string[] = []
    const prompts: unknown[] = []
    const listeners = new Set<(event: OpenCodeEvent) => void>()
    const source = new LiveSessionSource({
      syncSession: async (sessionID) => {
        calls.push(`sync:${sessionID}`)
      },
      snapshot: (sessionID) => ({ rootSessionID: sessionID, sessions: [root], messages: { [sessionID]: [] }, parts: {} }),
      subscribeDirectory: (directory, listener) => {
        calls.push(`listen:${directory}`)
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
      subscribeGlobal: () => () => {},
      startEvents: () => {
        calls.push("event:start")
      },
      replyQuestion: async () => {},
      promptAsync: async (input) => {
        prompts.push(input)
      },
      sessionStatus: async () => ({ type: "idle" }),
      createSession: async () => {
        calls.push("session:create")
        return root
      },
    })

    source.start()
    await flush()
    source.send("Start the live session")
    await flush()

    expect(calls).toEqual(["event:start", "session:create", `sync:${root.id}`, `sync:${root.id}`, `listen:${root.directory}`])
    expect(prompts).toHaveLength(1)
    expect(prompts[0]).toMatchObject({
      sessionID: root.id,
      messageID: expect.stringMatching(/^msg_/),
      parts: [{ id: expect.stringMatching(/^prt_/), type: "text", text: "Start the live session" }],
    })
    source.dispose()
  })

  test("held forks synthesize option plan children under the current active node", async () => {
    const test = harness()
    test.source.start()
    await flush()

    test.directoryListeners.forEach((listener) => listener({
      id: "evt_000000000009todo0000000000",
      type: "todo.updated",
      properties: {
        sessionID: root.id,
        todos: [{ content: "Choose repair", status: "in_progress", priority: "high" }],
      },
    }))
    test.directoryListeners.forEach((listener) => listener({
      id: "evt_000000000010question000000",
      type: "question.asked",
      properties: {
        id: "que_plan",
        sessionID: root.id,
        questions: [{
          header: "Approach",
          question: "Choose an approach",
          multiple: false,
          custom: false,
          options: [{ label: "Fixture", description: "Stable" }, { label: "Mocks", description: "Fast" }],
        }],
      },
    }))
    await flush()

    const active = test.projected.findLast(
      (event) => event.kind === "plan" && event.payload.op === "start" && event.payload.label === undefined,
    )
    expect(active?.kind === "plan" ? active.payload.node : undefined).toBeDefined()
    const options = test.projected.filter(
      (event) => event.kind === "plan" && event.payload.op === "add" && event.payload.fork,
    )
    expect(options).toHaveLength(2)
    expect(options.map((event) => event.kind === "plan" && event.payload)).toEqual([
      expect.objectContaining({
        node: expect.stringMatching(/^live:que_plan:fork:option:1:/),
        label: "Fixture",
        parent: active?.kind === "plan" ? active.payload.node : undefined,
        fork: "Fixture",
      }),
      expect.objectContaining({
        node: expect.stringMatching(/^live:que_plan:fork:option:2:/),
        label: "Mocks",
        parent: active?.kind === "plan" ? active.payload.node : undefined,
        fork: "Mocks",
      }),
    ])
    test.source.dispose()
  })

  test("resolves only gated forks through question.reply and sends structured viewer edit prompts", async () => {
    const test = harness()
    test.source.start()
    await flush()

    test.directoryListeners.forEach((listener) => listener({
      id: "evt_000000000010question000000",
      type: "question.asked",
      properties: {
        id: "que_1",
        sessionID: root.id,
        questions: [{
          header: "Approach",
          question: "Choose an approach",
          multiple: false,
          custom: false,
          options: [{ label: "Fixture", description: "Stable" }, { label: "Mocks", description: "Fast" }],
        }],
      },
    }))
    await flush()

    expect(test.source.status().forkActive).toBe(true)
    const forkNodes = test.projected
      .filter((event) => event.kind === "plan" && event.payload.op === "add" && event.payload.fork)
      .map((event) => event.kind === "plan" ? [event.payload.fork, event.payload.node] as const : [undefined, undefined] as const)
    test.source.resolveFork("Fixture")
    await flush()

    expect(test.replies).toEqual([{ requestID: "que_1", answers: [["Fixture"]] }])
    expect(test.source.status().forkActive).toBe(false)
    const fixtureNode = forkNodes.find(([identity]) => identity === "Fixture")?.[1]
    const mocksNode = forkNodes.find(([identity]) => identity === "Mocks")?.[1]
    expect(test.projected.filter((event) => event.kind === "plan" && event.payload.node === fixtureNode).map((event) => event.kind === "plan" && event.payload.op)).toEqual(["add", "start", "done"])
    expect(test.projected.findLast((event) => event.kind === "plan" && event.payload.node === mocksNode)).toMatchObject({ kind: "plan", payload: { op: "reject" } })

    test.source.saveFileEdit?.("src/auth.ts", "export const edited = true")
    await flush()
    expect(test.prompts.at(-1)).toMatchObject({ sessionID: root.id })
    expect(JSON.stringify(test.prompts.at(-1))).toContain("<user_edit>")
    expect(JSON.stringify(test.prompts.at(-1))).toContain("src/auth.ts")
    expect(JSON.stringify(test.prompts.at(-1))).toContain("export const edited = true")
    test.source.dispose()
  })

  test("external matching replies clear the held fork while unrelated replies do not", async () => {
    const test = harness()
    test.source.start()
    await flush()
    test.directoryListeners.forEach((listener) => listener({
      id: "evt_000000000010question000000",
      type: "question.asked",
      properties: {
        id: "que_held",
        sessionID: root.id,
        questions: [{
          header: "Approach",
          question: "Choose an approach",
          options: [{ label: "Fixture", description: "Stable" }, { label: "Mocks", description: "Fast" }],
        }],
      },
    }))
    await flush()
    const beforeUnrelated = [...test.projected]
    test.directoryListeners.forEach((listener) => listener({
      id: "evt_000000000020unrelated0000",
      type: "question.replied",
      properties: { sessionID: root.id, requestID: "que_other", answers: [["Mocks"]] },
    }))
    await flush()
    expect(test.source.status().forkActive).toBe(true)
    expect(test.projected.filter((event) => event.kind === "plan" && event.payload.fork)).toHaveLength(2)
    expect(test.projected).toEqual(beforeUnrelated)

    test.directoryListeners.forEach((listener) => listener({
      id: "evt_000000000030reply00000000",
      type: "question.replied",
      properties: { sessionID: root.id, requestID: "que_held", answers: [["Fixture"]] },
    }))
    await flush()

    expect(test.source.status()).toMatchObject({ forkActive: false, choice: "Fixture" })
    expect(test.projected.at(-1)).toMatchObject({ kind: "fork", payload: { op: "resolve", choice: "Fixture" } })
    const planResolution = test.projected.filter(
      (event) => event.kind === "plan" && (event.payload.op === "start" || event.payload.op === "done" || event.payload.op === "reject"),
    )
    expect(planResolution.map((event) => event.kind === "plan" && event.payload.op)).toEqual(["start", "done", "reject"])
    test.source.dispose()
  })

  test("external matching rejection clears the held fork", async () => {
    const test = harness()
    test.source.start()
    await flush()
    test.directoryListeners.forEach((listener) => listener({
      id: "evt_000000000010question000000",
      type: "question.asked",
      properties: {
        id: "que_reject",
        sessionID: root.id,
        questions: [{
          header: "Approach",
          question: "Choose an approach",
          options: [{ label: "Fixture", description: "Stable" }, { label: "Mocks", description: "Fast" }],
        }],
      },
    }))
    await flush()
    test.directoryListeners.forEach((listener) => listener({
      id: "evt_000000000020reject0000000",
      type: "question.rejected",
      properties: { sessionID: root.id, requestID: "que_reject" },
    }))
    await flush()

    expect(test.source.status()).toMatchObject({ forkActive: false, choice: "" })
    expect(test.projected.at(-1)).toMatchObject({ kind: "fork", payload: { op: "resolve", choice: "" } })
    test.source.dispose()
  })

  test("idle remains live and reusable while preserving pause and replay controls", async () => {
    const queued = ["follow-up"]
    const test = harness()
    const source = new LiveSessionSource({
      sessionID: root.id,
      directory: root.directory,
      syncSession: async () => {},
      snapshot: () => ({ rootSessionID: root.id, sessions: [root], messages: { [root.id]: [] }, parts: {} }),
      subscribeDirectory: (_directory, listener) => {
        test.directoryListeners.add(listener)
        return () => test.directoryListeners.delete(listener)
      },
      subscribeGlobal: () => () => {},
      startEvents: () => {},
      replyQuestion: async () => {},
      promptAsync: async (input) => { test.prompts.push(input) },
      sessionStatus: async () => ({ type: "idle" }),
      dequeue: () => queued.shift(),
    })
    source.start()
    await flush()
    test.directoryListeners.forEach((listener) => listener({ id: "evt_000000000010status000000", type: "session.status", properties: { sessionID: root.id, status: { type: "idle" } } }))
    await flush()
    expect(test.prompts).toHaveLength(0)

    test.directoryListeners.forEach((listener) => listener({ id: "evt_000000000011idle00000000", type: "session.idle", properties: { sessionID: root.id } }))
    await flush()
    expect(source.status()).toMatchObject({ complete: false, playing: true, state: "running" })
    expect(test.prompts).toHaveLength(1)
    const prompt = test.prompts[0] as { messageID: string }
    test.directoryListeners.forEach((listener) => listener({
      id: "evt_000000000012user00000000",
      type: "message.updated",
      properties: { sessionID: root.id, info: { id: prompt.messageID, sessionID: root.id, role: "user", time: { created: 1_010 }, agent: "build", model: { providerID: "test", modelID: "test" } } },
    }))
    test.directoryListeners.forEach((listener) => listener({
      id: "evt_000000000013assistant0000",
      type: "message.updated",
      properties: { sessionID: root.id, info: { id: "msg_assistant", sessionID: root.id, parentID: prompt.messageID, role: "assistant", time: { created: 1_011 }, agent: "build", mode: "build", path: { cwd: root.directory, root: root.directory }, cost: 0, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }, providerID: "test", modelID: "test" } },
    }))
    await flush()

    test.directoryListeners.forEach((listener) => listener({ id: "evt_000000000020status000000", type: "session.status", properties: { sessionID: root.id, status: { type: "idle" } } }))
    test.directoryListeners.forEach((listener) => listener({ id: "evt_000000000021idle00000000", type: "session.idle", properties: { sessionID: root.id } }))
    await flush()
    expect(source.status()).toMatchObject({ complete: false, playing: true, state: "running" })
    const retainedLastStep = source.lastStep
    expect(retainedLastStep).toBeGreaterThan(0)

    source.send("another turn")
    await flush()
    expect(test.prompts).toHaveLength(2)
    expect(test.prompts[1]).toMatchObject({ parts: [{ text: "another turn" }] })
    expect(source.lastStep).toBe(retainedLastStep)

    source.pause()
    test.directoryListeners.forEach((listener) => listener({ id: "evt_000000000030busy00000000", type: "session.status", properties: { sessionID: root.id, status: { type: "busy" } } }))
    await flush()
    expect(source.status()).toMatchObject({ complete: false, playing: false, state: "paused" })
    source.play()
    expect(source.status()).toMatchObject({ complete: false, playing: true, state: "running" })
    source.dispose()
  })

  test("root session deletion is the only live terminal signal", async () => {
    const test = harness()
    test.source.start()
    await flush()

    test.directoryListeners.forEach((listener) => listener({
      id: "evt_000000000022delete00000000",
      type: "session.deleted",
      properties: { sessionID: root.id, info: root },
    }))
    await flush()

    expect(test.source.status()).toMatchObject({ complete: true, playing: false, state: "complete" })
    test.source.dispose()
  })

  test("retries an accepted user message once when no assistant turn starts after idle", async () => {
    const test = harness()
    const statuses: Array<{ type: string }> = [{ type: "idle" }]
    const source = new LiveSessionSource({
      sessionID: root.id,
      directory: root.directory,
      syncSession: async () => {},
      snapshot: () => ({ rootSessionID: root.id, sessions: [root], messages: { [root.id]: [] }, parts: {} }),
      subscribeDirectory: (_directory, listener) => {
        test.directoryListeners.add(listener)
        return () => test.directoryListeners.delete(listener)
      },
      subscribeGlobal: () => () => {},
      startEvents: () => {},
      replyQuestion: async () => {},
      promptAsync: async (input) => { test.prompts.push(input) },
      sessionStatus: async () => statuses[0],
      deliveryTimeoutMs: 5,
    })
    source.start()
    await flush()
    source.send("edit file")
    await flush()
    const first = test.prompts[0] as { messageID: string }
    test.directoryListeners.forEach((listener) => listener({
      id: "evt_000000000030user00000000",
      type: "message.updated",
      properties: { sessionID: root.id, info: { id: first.messageID, sessionID: root.id, role: "user", time: { created: 1_020 }, agent: "build", model: { providerID: "test", modelID: "test" } } },
    }))
    await new Promise((resolve) => setTimeout(resolve, 15))

    expect(test.prompts).toHaveLength(2)
    expect(test.prompts[1]).toEqual(test.prompts[0])
    await new Promise((resolve) => setTimeout(resolve, 15))
    expect(test.prompts).toHaveLength(2)
    source.dispose()
  })

  test("an assistant child acknowledges delivery and prevents retry", async () => {
    const test = harness()
    const source = new LiveSessionSource({
      sessionID: root.id,
      directory: root.directory,
      syncSession: async () => {},
      snapshot: () => ({ rootSessionID: root.id, sessions: [root], messages: { [root.id]: [] }, parts: {} }),
      subscribeDirectory: (_directory, listener) => {
        test.directoryListeners.add(listener)
        return () => test.directoryListeners.delete(listener)
      },
      subscribeGlobal: () => () => {},
      startEvents: () => {},
      replyQuestion: async () => {},
      promptAsync: async (input) => { test.prompts.push(input) },
      sessionStatus: async () => ({ type: "idle" }),
      deliveryTimeoutMs: 5,
    })
    source.start()
    await flush()
    source.send("happy path")
    await flush()
    const prompt = test.prompts[0] as { messageID: string }
    test.directoryListeners.forEach((listener) => listener({
      id: "evt_000000000040assistant0000",
      type: "message.updated",
      properties: { sessionID: root.id, info: { id: "msg_started", sessionID: root.id, parentID: prompt.messageID, role: "assistant", time: { created: 1_030 }, agent: "build", mode: "build", path: { cwd: root.directory, root: root.directory }, cost: 0, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }, providerID: "test", modelID: "test" } },
    }))
    await new Promise((resolve) => setTimeout(resolve, 15))

    expect(test.prompts).toHaveLength(1)
    source.dispose()
  })

  test("holds a second manual prompt until the first assistant turn reaches confirmed idle", async () => {
    const test = harness()
    const source = new LiveSessionSource({
      sessionID: root.id,
      directory: root.directory,
      syncSession: async () => {},
      snapshot: () => ({ rootSessionID: root.id, sessions: [root], messages: { [root.id]: [] }, parts: {} }),
      subscribeDirectory: (_directory, listener) => {
        test.directoryListeners.add(listener)
        return () => test.directoryListeners.delete(listener)
      },
      subscribeGlobal: () => () => {},
      startEvents: () => {},
      replyQuestion: async () => {},
      promptAsync: async (input) => { test.prompts.push(input) },
      sessionStatus: async () => ({ type: "idle" }),
      deliveryTimeoutMs: 5,
    })
    source.start()
    await flush()
    source.send("first")
    await flush()
    const prompt = test.prompts[0] as { messageID: string }
    test.directoryListeners.forEach((listener) => listener({
      id: "evt_000000000050assistant0000",
      type: "message.updated",
      properties: { sessionID: root.id, info: { id: "msg_first_assistant", sessionID: root.id, parentID: prompt.messageID, role: "assistant", time: { created: 1_040 }, agent: "build", mode: "build", path: { cwd: root.directory, root: root.directory }, cost: 0, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }, providerID: "test", modelID: "test" } },
    }))
    source.send("second")
    await flush()
    expect(test.prompts).toHaveLength(1)

    test.directoryListeners.forEach((listener) => listener({ id: "evt_000000000051status000000", type: "session.status", properties: { sessionID: root.id, status: { type: "idle" } } }))
    await flush()
    expect(test.prompts).toHaveLength(1)
    test.directoryListeners.forEach((listener) => listener({ id: "evt_000000000052idle00000000", type: "session.idle", properties: { sessionID: root.id } }))
    await flush()

    expect(test.prompts).toHaveLength(2)
    expect(test.prompts[1]).toMatchObject({ parts: [{ text: "second" }] })
    expect((test.prompts[1] as { messageID: string }).messageID).not.toBe(prompt.messageID)
    source.dispose()
  })
})

import { describe, expect, test } from "bun:test"
import type { AssistantMessage, Session, ToolPart } from "@opencode-ai/sdk/v2/client"
import { IssueSynthesizer, LiveEventAdapter, forkFromQuestion, salientDiff } from "../live/adapters"
import type { TerminalEvent } from "../types"

const session = (input: Partial<Session> & Pick<Session, "id">): Session => ({
  slug: input.id,
  projectID: "project",
  directory: "C:/work",
  title: "Implement live terminal",
  version: "1",
  time: { created: 100, updated: 200 },
  ...input,
})

const message = (input: Partial<AssistantMessage> & Pick<AssistantMessage, "id" | "sessionID">): AssistantMessage => ({
  role: "assistant",
  time: { created: 120, completed: 150 },
  parentID: "msg_user",
  modelID: "model",
  providerID: "provider",
  mode: "normal",
  agent: "build",
  path: { cwd: "C:/work", root: "C:/work" },
  cost: 0.25,
  tokens: { input: 10, output: 15, reasoning: 5, cache: { read: 2, write: 1 } },
  ...input,
})

const tool = (input: Partial<ToolPart> & Pick<ToolPart, "id" | "sessionID" | "messageID" | "tool">): ToolPart => ({
  type: "tool",
  callID: `call_${input.id}`,
  state: {
    status: "completed",
    input: {},
    output: "ok",
    title: "completed",
    metadata: {},
    time: { start: 130, end: 140 },
  },
  ...input,
})

const lookup = (sessions: Session[], messages: AssistantMessage[] = []) => ({
  rootSessionID: sessions[0]!.id,
  session: (id: string) => sessions.find((item) => item.id === id),
  message: (id: string) => messages.find((item) => item.id === id),
  parts: () => [],
  now: () => 999,
})

describe("live fork shape gating", () => {
  const base = {
    id: "que_1",
    sessionID: "ses_root",
    questions: [
      {
        header: "Strategy",
        question: "Which strategy should continue?",
        options: [
          { label: "Fixture", description: "One source of truth" },
          { label: "Mocks", description: "Fast but prone to drift" },
        ],
        multiple: false,
      },
    ],
  }

  test("maps the built-in Prompt shape with one single-select question and at least two options", () => {
    const fork = forkFromQuestion(base, "evt_question")

    expect(fork?.request).toMatchObject({
      requestID: "que_1",
      planOptions: [
        { node: expect.stringMatching(/^live:que_1:fork:option:1:/), identity: "Fixture", label: "Fixture" },
        { node: expect.stringMatching(/^live:que_1:fork:option:2:/), identity: "Mocks", label: "Mocks" },
      ],
    })
    expect(fork?.event).toMatchObject({
      kind: "fork",
      payload: {
        op: "open",
        prompt: "Which strategy should continue?",
        options: [
          { key: "1", value: "Fixture", note: "One source of truth" },
          { key: "2", value: "Mocks", note: "Fast but prone to drift" },
        ],
      },
    })
  })

  test("bypasses multi-question, multi-select, explicit free-text, and underspecified choices", () => {
    expect(forkFromQuestion({ ...base, questions: [...base.questions, ...base.questions] })).toBeUndefined()
    expect(forkFromQuestion({ ...base, questions: [{ ...base.questions[0], multiple: true }] })).toBeUndefined()
    expect(forkFromQuestion({ ...base, questions: [{ ...base.questions[0], custom: true }] })).toBeUndefined()
    expect(forkFromQuestion({ ...base, questions: [{ ...base.questions[0], options: base.questions[0].options.slice(0, 1) }] })).toBeUndefined()
  })
})

describe("issue synthesis", () => {
  test("opens from a schema-shaped shell error state and pairs a matching success", () => {
    const root = session({ id: "ses_root", agent: "orchestrator" })
    const assistant = message({ id: "msg_issue", sessionID: root.id, agent: "build" })
    const adapter = new LiveEventAdapter()
    const failed = tool({
      id: "prt_schema_error",
      sessionID: root.id,
      messageID: assistant.id,
      tool: "bash",
      state: {
        status: "error",
        input: { command: "bun test src/auth.test.ts" },
        error: "3 tests failed",
        time: { start: 1, end: 2 },
      },
    })
    const passing = tool({
      id: "prt_schema_success",
      sessionID: root.id,
      messageID: assistant.id,
      tool: "bash",
      state: {
        status: "completed",
        input: { command: "bun test src/auth.test.ts" },
        output: "44 tests passed",
        title: "bun test src/auth.test.ts",
        metadata: { exit: 0 },
        time: { start: 3, end: 4 },
      },
    })

    const opened = adapter.adapt({
      id: "evt_000000000020failure0000000",
      type: "message.part.updated",
      properties: { sessionID: root.id, part: failed, time: 2 },
    }, lookup([root], [assistant])).events
    const resolved = adapter.adapt({
      id: "evt_000000000040success0000000",
      type: "message.part.updated",
      properties: { sessionID: root.id, part: passing, time: 4 },
    }, lookup([root], [assistant])).events

    expect(opened.find((event) => event.kind === "cmd")).toMatchObject({
      payload: { cmd: "bun test src/auth.test.ts", out: "3 tests failed", exit: 1 },
    })
    expect(opened.find((event) => event.kind === "issue")).toMatchObject({
      payload: { op: "open", agent: "build · src/auth.test.ts", detail: "3 tests failed" },
    })
    expect(resolved.filter((event) => event.kind === "issue").map((event) => event.kind === "issue" && event.payload.op)).toEqual(["fixing", "resolved"])
    expect(resolved.findLast((event) => event.kind === "issue")).toMatchObject({ payload: { resolution: "44 tests passed" } })
  })

  test("pairs a failed command with a subsequent matching success", () => {
    const issues = new IssueSynthesizer()
    const opened = issues.failCommand({
      command: "bun test src/auth.test.ts",
      output: "3 tests failed",
      agent: "coder",
      ts: 1,
      sourceID: "failure",
    })
    const resolved = issues.succeedCommand({
      command: "bun test src/auth.test.ts",
      output: "44 tests passed",
      agent: "coder",
      ts: 2,
      sourceID: "success",
    })

    expect(opened[0]).toMatchObject({
      kind: "issue",
      payload: { op: "open", agent: "coder · src/auth.test.ts", detail: "3 tests failed" },
    })
    expect(resolved.map((event) => event.kind === "issue" && event.payload.op)).toEqual(["fixing", "resolved"])
    expect(resolved[1]).toMatchObject({ payload: { resolution: "44 tests passed" } })
    expect(issues.unresolved()).toEqual([])
  })

  test("leaves failures visibly unresolved unless success or completion pairs them", () => {
    const issues = new IssueSynthesizer()
    issues.sessionError({ detail: "Provider failed in src/client.ts", agent: "orchestrator", ts: 1, sourceID: "error" })

    expect(issues.unresolved()).toHaveLength(1)
  })
})

describe("live kind adapters", () => {
  test("maps text, spawn, cmd, file, status, plan, issue, fork, and resource from grounded sources", () => {
    const root = session({ id: "ses_root", agent: "orchestrator" })
    const child = session({ id: "ses_child", parentID: root.id, agent: "review", title: "Review auth changes" })
    const assistant = message({ id: "msg_a", sessionID: root.id, agent: "build" })
    const adapter = new LiveEventAdapter()
    const kinds = new Set<TerminalEvent["kind"]>()

    for (const event of adapter.adapt({
      id: "created",
      type: "session.created",
      properties: { sessionID: child.id, info: child },
    }, lookup([root, child], [assistant])).events) kinds.add(event.kind)

    for (const event of adapter.adapt({
      id: "evt_00000008c000text0000000000",
      type: "message.part.updated",
      properties: {
        sessionID: root.id,
        part: { id: "prt_text", sessionID: root.id, messageID: assistant.id, type: "text", text: "First sentence. Second sentence. Third sentence.", time: { start: 130, end: 140 } },
        time: 140,
      },
    }, lookup([root, child], [assistant])).events) kinds.add(event.kind)

    const failed = tool({
      id: "prt_bash",
      sessionID: root.id,
      messageID: assistant.id,
      tool: "bash",
      state: {
        status: "completed",
        input: { command: "bun test" },
        output: "failure line one\nfailure line two",
        title: "bun test",
        metadata: { exit: 1, output: "failure line one\nfailure line two" },
        time: { start: 130, end: 140 },
      },
    })
    for (const event of adapter.adapt({ id: "cmd", type: "message.part.updated", properties: { sessionID: root.id, part: failed, time: 140 } }, lookup([root, child], [assistant])).events) kinds.add(event.kind)

    const edit = tool({
      id: "prt_edit",
      sessionID: root.id,
      messageID: assistant.id,
      tool: "edit",
      state: {
        status: "completed",
        input: { filePath: "src/auth.ts" },
        output: "Edit applied",
        title: "src/auth.ts",
        metadata: { diff: "@@ -1 +1 @@\n-old\n+new", filediff: { file: "src/auth.ts", additions: 1, deletions: 1, after: "new" } },
        time: { start: 140, end: 150 },
      },
    })
    for (const event of adapter.adapt({ id: "file", type: "message.part.updated", properties: { sessionID: root.id, part: edit, time: 150 } }, lookup([root, child], [assistant])).events) kinds.add(event.kind)

    for (const event of adapter.adapt({ id: "status", type: "session.status", properties: { sessionID: root.id, status: { type: "busy" } } }, lookup([root, child], [assistant])).events) kinds.add(event.kind)
    for (const event of adapter.adapt({ id: "todo", type: "todo.updated", properties: { sessionID: root.id, todos: [{ content: "Fix tests", status: "in_progress", priority: "high" }] } }, lookup([root, child], [assistant])).events) kinds.add(event.kind)
    for (const event of adapter.adapt({ id: "question", type: "question.asked", properties: { id: "que", sessionID: root.id, questions: [{ header: "Path", question: "Choose path", multiple: false, custom: false, options: [{ label: "A", description: "First" }, { label: "B", description: "Second" }] }] } }, lookup([root, child], [assistant])).events) kinds.add(event.kind)
    for (const event of adapter.adapt({ id: "resource", type: "message.updated", properties: { sessionID: root.id, info: assistant } }, lookup([root, child], [assistant])).events) kinds.add(event.kind)

    expect([...kinds].sort()).toEqual(["cmd", "file", "fork", "issue", "plan", "resource", "spawn", "status", "text"])
  })

  test("keeps registry-only session diffs transcript-invisible and truncates salient hunks to six lines", () => {
    const root = session({ id: "ses_root", agent: "orchestrator" })
    const adapter = new LiveEventAdapter()
    const result = adapter.adapt({
      id: "diff",
      type: "session.diff",
      properties: {
        sessionID: root.id,
        diff: [{ file: "src/file.ts", additions: 7, deletions: 1, patch: "@@ -1 +1 @@\n-a\n+b\n c\n d\n e\n f\n g\n h" }],
      },
    }, lookup([root]))

    expect(result.events).toEqual([])
    expect(result.files[0]).toMatchObject({ path: "src/file.ts", payload: { stat: "+7 −1" } })
    expect(result.files[0]?.payload.diff).toHaveLength(6)
    expect(salientDiff("@@ -1 +1 @@\n-a\n+b")).toEqual([["-", "a"], ["+", "b"]])
  })

  test("maps retry status with its complete structured payload", () => {
    const root = session({ id: "ses_root", agent: "orchestrator" })
    const adapter = new LiveEventAdapter()
    const result = adapter.adapt({
      id: "evt_0000004d2000retry000000000",
      type: "session.status",
      properties: { sessionID: root.id, status: { type: "retry", attempt: 2, message: "Rate limited", next: 1234, action: { reason: "quota", provider: "provider", title: "Upgrade", message: "Increase quota", label: "Upgrade" } } },
    }, lookup([root]))

    expect(result.events[0]).toMatchObject({
      ts: 1234,
      kind: "status",
      payload: { status: "wait", retry: { attempt: 2, message: "Rate limited", next: 1234, action: { label: "Upgrade" } } },
    })
  })

  test("carries message.part.updated properties.time instead of part or receipt time", () => {
    const root = session({ id: "ses_root", agent: "orchestrator" })
    const assistant = message({ id: "msg_time", sessionID: root.id, time: { created: 10, completed: 20 } })
    const result = new LiveEventAdapter().adapt({
      id: "evt_000000000010part0000000000",
      type: "message.part.updated",
      properties: {
        sessionID: root.id,
        time: 777,
        part: { id: "prt_time", sessionID: root.id, messageID: assistant.id, type: "text", text: "Timestamped", time: { start: 30, end: 40 } },
      },
    }, lookup([root], [assistant]))

    expect(result.events[0]?.ts).toBe(777)
  })

  test("does not resolve open issues when the session is deleted", () => {
    const root = session({ id: "ses_root", agent: "orchestrator" })
    const assistant = message({ id: "msg_delete", sessionID: root.id })
    const adapter = new LiveEventAdapter()
    const failed = tool({
      id: "prt_delete",
      sessionID: root.id,
      messageID: assistant.id,
      tool: "bash",
      state: { status: "completed", input: { command: "bun test" }, output: "failed", title: "bun test", metadata: { exit: 1 }, time: { start: 1, end: 2 } },
    })
    adapter.adapt({ id: "evt_000000000020fail0000000000", type: "message.part.updated", properties: { sessionID: root.id, part: failed, time: 2 } }, lookup([root], [assistant]))
    const deleted = adapter.adapt({ id: "evt_000000000030delete00000000", type: "session.deleted", properties: { sessionID: root.id, info: root } }, lookup([root], [assistant]))

    expect(deleted.events).toEqual([])
  })
})

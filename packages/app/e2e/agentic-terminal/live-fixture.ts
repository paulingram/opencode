import { expect, test as base, type ConsoleMessage, type Locator, type Page } from "@playwright/test"
import { mkdir, rm, writeFile } from "node:fs/promises"
import { createWriteStream } from "node:fs"
import { spawn, type ChildProcess } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { ManagedRuntime } from "effect"
import { TestLLMServer, reply } from "../../../opencode/test/lib/llm-server"
import { testProviderConfig } from "../../../opencode/test/lib/test-provider"

export type ForkResolutionPath = "card" | "key" | "plan-row"
export type ScriptName =
  | "narrate"
  | "run-failing-command"
  | "run-passing-command"
  | "ask-fork-question"
  | "ask-multi-select-question"
  | "edit-file"
  | "queue-turn"

interface BrowserError {
  source: "console" | "pageerror"
  text: string
  url: string
}

interface SessionInfo {
  id: string
  directory: string
}

interface QuestionRequest {
  id: string
  sessionID: string
}

interface MessageWithParts {
  info: { role: string }
  parts: Array<Record<string, unknown>>
}

interface BootLog {
  server: string
  llm: string
}

interface BackendState {
  origin: string
  directory: string
  bootLog: BootLog
  modelUrl: string
  port: number
  push(...responses: ReturnType<typeof reply>[]): Promise<void>
  restart(): Promise<void>
}

interface BackendFixture {
  state: BackendState
}

export interface AgenticTerminalFixture {
  page: Page
  root: Locator
  session: SessionInfo
  createSession(title?: string): Promise<SessionInfo>
  removeSession(sessionID: string): Promise<void>
  directory: string
  origin: string
  bootLog: BootLog
  browserErrors: BrowserError[]
  unexpectedBrowserErrors(): BrowserError[]
  primeScript(name: ScriptName, count?: number): Promise<void>
  promptForScript(name: ScriptName, prompt?: string): Promise<void>
  postPrompt(prompt: string): Promise<void>
  waitForUserPrompt(prompt: string, sessionID?: string): Promise<void>
  waitForAssistantCompletion(prompt: string, sessionID?: string): Promise<void>
  messages(sessionID?: string): Promise<MessageWithParts[]>
  pendingQuestions(): Promise<QuestionRequest[]>
  waitForIdle(sessionID?: string): Promise<void>
  resolveFork(path: ForkResolutionPath): Promise<void>
  restartBackend(): Promise<void>
  markIssueFixed(): Promise<void>
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..")
const opencodeRoot = path.join(repoRoot, "packages/opencode")
const evidenceRoot = path.join(repoRoot, ".architect-team/reviews/agentic-retarget-artifacts")
const configuredPort = Number(process.env.PLAYWRIGHT_SERVER_PORT ?? 4096)
const origin = `http://127.0.0.1:${configuredPort}`
const bunCommand = process.env.BUN_EXECUTABLE ?? path.join(process.env.LOCALAPPDATA ?? "", "npm-cache", "_npx", "60c3515df86f25b1", "node_modules", "bun", "bin", "bun.exe")
const bunPrefix: string[] = []

const scenarioPrompt: Record<ScriptName, string> = {
  narrate: "narrate fixture activity",
  "run-failing-command": "run failing command",
  "run-passing-command": "run passing command",
  "ask-fork-question": "ask fork question",
  "ask-multi-select-question": "ask multi-select question",
  "edit-file": "edit file",
  "queue-turn": "queue turn",
}

function consoleError(message: ConsoleMessage): BrowserError {
  return { source: "console", text: message.text(), url: message.location().url }
}

function cleanEnv(modelUrl: string) {
  const config = {
    ...testProviderConfig(modelUrl),
    model: "test/test-model",
    small_model: "test/test-model",
    permission: { "*": "allow" },
  }
  const home = path.join(evidenceRoot, `test-home-${process.pid}`)
  // The scripted harness commands are PowerShell-shaped on Windows; a Git-Bash
  // parent's SHELL would otherwise steer the server's shell selection to bash.
  const { SHELL: _parentShell, ...inherited } = process.env
  return {
    ...inherited,
    OPENCODE_TEST_HOME: home,
    HOME: home,
    XDG_CONFIG_HOME: path.join(home, ".config"),
    XDG_DATA_HOME: path.join(home, ".local/share"),
    XDG_STATE_HOME: path.join(home, ".local/state"),
    XDG_CACHE_HOME: path.join(home, ".cache"),
    OPENCODE_CONFIG_CONTENT: JSON.stringify(config),
    OPENCODE_DISABLE_PROJECT_CONFIG: "1",
    OPENCODE_PURE: "1",
    OPENCODE_DISABLE_AUTOUPDATE: "1",
    OPENCODE_DISABLE_AUTOCOMPACT: "1",
    OPENCODE_DISABLE_MODELS_FETCH: "1",
    OPENCODE_AUTH_CONTENT: "{}",
    // The per-pid HOME above gives every worker a cold bun transpiler cache,
    // making each server boot re-transpile the whole opencode package (the
    // recurring boot-readiness timeouts). Share the transpiler cache across
    // boots; it holds no session state.
    BUN_RUNTIME_TRANSPILER_CACHE_PATH: path.join(evidenceRoot, "bun-transpiler-cache"),
  }
}

function startServer(modelUrl: string, logPath: string, port: number) {
  const child = spawn(
    bunCommand,
    [...bunPrefix, "run", "--conditions=browser", "./src/index.ts", "serve", "--port", String(port), "--hostname", "127.0.0.1"],
    { cwd: opencodeRoot, env: cleanEnv(modelUrl), stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
  )
  const log = createWriteStream(logPath, { flags: "a" })
  child.stdout?.pipe(log, { end: false })
  child.stderr?.pipe(log, { end: false })
  child.once("exit", (code, signal) => log.write(`\n[exit code=${code} signal=${signal}]\n`))
  return { child, log }
}

async function ready(child: ChildProcess, logPath: string, origin: string) {
  const deadline = Date.now() + 300_000
  for (;;) {
    if (child.exitCode !== null) throw new Error(`opencode serve exited ${child.exitCode}; see ${logPath}`)
    try {
      const response = await fetch(`${origin}/global/health`)
      if (response.ok) return
    } catch {}
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${origin}; see ${logPath}`)
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}

async function stopPortOwner(port: number) {
  if (process.platform !== "win32") return
  await new Promise<void>((resolve) => {
    const child = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        `$connections = Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue; $connections | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }`,
      ],
      { windowsHide: true },
    )
    child.once("exit", () => resolve())
    child.once("error", () => resolve())
  })
}

async function stop(child: ChildProcess | undefined) {
  if (!child || child.exitCode !== null) return
  if (process.platform === "win32" && child.pid) {
    await new Promise<void>((resolve) => {
      const killer = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { windowsHide: true })
      killer.once("exit", () => resolve())
      killer.once("error", () => resolve())
    })
  } else {
    child.kill("SIGTERM")
  }
  await Promise.race([
    new Promise<void>((resolve) => child.once("exit", () => resolve())),
    new Promise<void>((resolve) => setTimeout(resolve, 5_000)),
  ])
  if (child.exitCode === null) child.kill("SIGKILL")
}

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  if (!response.ok) throw new Error(`${init?.method ?? "GET"} ${url} -> ${response.status}: ${await response.text()}`)
  const text = await response.text()
  return (text ? JSON.parse(text) : undefined) as T
}

function query(directory: string) {
  return `directory=${encodeURIComponent(directory)}`
}

function promptPayload(text: string) {
  return {
    agent: "build",
    model: { providerID: "test", modelID: "test-model" },
    parts: [{ type: "text", text }],
  }
}

function scripted(name: ScriptName, directory: string) {
  const filePath = path.join(directory, "src", "fixture.ts")
  if (name === "run-failing-command") {
    return [
      reply().tool("bash", { command: "if (Test-Path '.fixture-fixed') { Write-Output 'fixture repaired' } else { Write-Output 'fixture failure'; exit 1 }" }),
      reply().text("Observed the failing command.").usage({ input: 9, output: 4 }).stop(),
    ]
  }
  if (name === "run-passing-command") {
    return [
      reply().tool("bash", { command: "if (Test-Path '.fixture-fixed') { Write-Output 'fixture repaired' } else { Write-Output 'fixture failure'; exit 1 }" }),
      reply().text("Observed the passing command.").usage({ input: 8, output: 4 }).stop(),
    ]
  }
  if (name === "ask-fork-question") {
    return [
      reply().tool("question", {
        questions: [{
          header: "Repair strategy",
          question: "Choose the repair strategy",
          options: [
            { label: "Rewrite shared fixture", description: "Fix the common path once." },
            { label: "Patch per-test mocks", description: "Keep local workarounds." },
          ],
          multiple: false,
        }],
      }),
      reply().text("Fork reply acknowledged; continuing the real session.").usage({ input: 12, output: 5 }).stop(),
    ]
  }
  if (name === "ask-multi-select-question") {
    return [
      reply().tool("question", {
        questions: [{
          header: "Verification",
          question: "Select every verification path",
          options: [
            { label: "Unit", description: "Run the unit suite." },
            { label: "E2E", description: "Run browser flows." },
          ],
          multiple: true,
        }],
      }),
    ]
  }
  if (name === "edit-file") {
    return [
      reply().tool("write", {
        filePath,
        content: "export const fixtureValue = 'live'\nexport const horizontalOverflowWitness = 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'\n",
      }),
      reply().text("Wrote the live fixture file.").usage({ input: 10, output: 3 }).stop(),
    ]
  }
  if (name === "queue-turn") return [reply().text("Queue turn completed.").usage({ input: 6, output: 3 }).stop()]
  return [reply().text("Live fixture narration completed.").usage({ input: 7, output: 3 }).stop()]
}

async function waitFor(predicate: () => Promise<boolean>, description: string, timeout = 30_000) {
  const deadline = Date.now() + timeout
  for (;;) {
    if (await predicate()) return
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${description}`)
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}

base.setTimeout(120_000)

export const test = base.extend<{ backend: BackendFixture; agentic: AgenticTerminalFixture }, { backendState: BackendState }>({
  backendState: [async ({}, use) => {
    await stopPortOwner(configuredPort)
    await mkdir(evidenceRoot, { recursive: true })
    const runtime = ManagedRuntime.make(TestLLMServer.layer)
    const llm = await runtime.runPromise(TestLLMServer)
    const bootLog = {
      server: path.join(evidenceRoot, `opencode-serve-${process.pid}.log`),
      llm: path.join(evidenceRoot, `test-llm-server-${process.pid}.log`),
    }
    await writeFile(bootLog.server, "", "utf8")
    await writeFile(bootLog.llm, `TestLLMServer ${llm.url}\n`, "utf8")
    let processState = startServer(llm.url, bootLog.server, configuredPort)
    await ready(processState.child, bootLog.server, origin)

    const state: BackendState = {
      origin,
      directory: "",
      bootLog,
      modelUrl: llm.url,
      push: (...responses) => runtime.runPromise(llm.push(...responses)),
      async restart() {
        await stop(processState.child)
        processState.log.end()
        processState = startServer(llm.url, bootLog.server, configuredPort)
        await ready(processState.child, bootLog.server, origin)
      },
    }

    await use(state)
    await stop(processState.child)
    processState.log.end()
    await runtime.dispose()
  }, { scope: "worker", auto: true, timeout: 600_000 }],

  backend: async ({ backendState }, use, testInfo) => {
    const directory = testInfo.outputPath("workspace")
    await mkdir(path.join(directory, "src"), { recursive: true })
    await writeFile(path.join(directory, "README.md"), "# Live fixture\n", "utf8")
    backendState.directory = directory
    await use({ state: backendState })
    const pending = await json<QuestionRequest[]>(`${origin}/question?${query(directory)}`).catch(() => [])
    await Promise.all(pending.map((item) => json(`${origin}/question/${item.id}/reject?${query(directory)}`, { method: "POST" }).catch(() => undefined)))
    await rm(directory, { recursive: true, force: true }).catch(() => undefined)
  },

  agentic: async ({ page, backend }, use) => {
    const state = backend.state
    const session = await json<SessionInfo>(`${origin}/session?${query(state.directory)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Agentic terminal real backend acceptance fixture with an intentionally long title" }),
    })
    const browserErrors: BrowserError[] = []
    page.on("console", (message) => {
      if (message.type() === "error") browserErrors.push(consoleError(message))
    })
    page.on("pageerror", (error) => browserErrors.push({ source: "pageerror", text: error.stack ?? error.message, url: "" }))
    await page.addInitScript(() => localStorage.setItem("settings.v3", JSON.stringify({ general: { newLayoutDesigns: true } })))
    await page.goto(`/agentic?session=${session.id}`)
    const root = page.getByTestId("agentic-terminal")
    await expect(root).toBeVisible()

    const messages = (sessionID = session.id) => json<MessageWithParts[]>(`${origin}/session/${sessionID}/message?${query(state.directory)}`)
    const pendingQuestions = () => json<QuestionRequest[]>(`${origin}/question?${query(state.directory)}`)
    const waitForUserPrompt = async (prompt: string, sessionID = session.id) => {
      await waitFor(async () => {
        const transcript = await messages(sessionID)
        return transcript.some((message) => message.info.role === "user" && message.parts.some((part) => part.type === "text" && part.text === prompt))
      }, `user prompt ${prompt}`)
    }
    const waitForAssistantCompletion = async (prompt: string, sessionID = session.id) => {
      await waitFor(async () => {
        const transcript = await messages(sessionID)
        const userIndex = transcript.findIndex((message) => message.info.role === "user" && message.parts.some((part) => part.type === "text" && part.text === prompt))
        if (userIndex < 0) return false
        return transcript.slice(userIndex + 1).some((message) => message.info.role === "assistant" && message.parts.some((part) => {
          if (part.type === "text") return typeof part.text === "string" && part.text.length > 0
          return part.type === "tool" && typeof part.state === "object" && part.state !== null && "status" in part.state && ["completed", "error"].includes(String(part.state.status))
        }))
      }, `assistant completion after ${prompt}`)
    }
    const waitForIdle = async (sessionID = session.id) => {
      await waitFor(async () => {
        const status = await json<Record<string, { type?: string }>>(`${origin}/session/status?${query(state.directory)}`)
        const current = status[sessionID]?.type
        return !current || current === "idle"
      }, `session ${sessionID} idle`)
    }
    const sendPrompt = async (text: string, asynchronous: boolean) => {
      await json(`${origin}/session/${session.id}/${asynchronous ? "prompt_async" : "message"}?${query(state.directory)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(promptPayload(text)),
      })
    }
    const postPrompt = (text: string) => sendPrompt(text, false)
    const promptForScript = async (name: ScriptName, prompt = scenarioPrompt[name]) => {
      await state.push(...scripted(name, state.directory))
      await sendPrompt(prompt, name === "ask-fork-question" || name === "ask-multi-select-question")
    }

    const fixture: AgenticTerminalFixture = {
      page,
      root,
      session,
      createSession: (title = "Additional live fixture session") => json<SessionInfo>(`${origin}/session?${query(state.directory)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title }),
      }),
      removeSession: (sessionID) => json(`${origin}/session/${sessionID}?${query(state.directory)}`, { method: "DELETE" }).then(() => undefined),
      directory: state.directory,
      origin,
      bootLog: state.bootLog,
      browserErrors,
      unexpectedBrowserErrors: () => browserErrors.filter((error) => {
        const backendRequest = /^http:\/\/(?:127\.0\.0\.1|localhost):4096\//.test(error.url)
        const restartFailure = /ERR_CONNECTION_(?:REFUSED|RESET)|event stream error/i.test(error.text)
        const deletedSession = backendRequest && error.url.includes(`/session/${session.id}`) && /404 \(Not Found\)/.test(error.text)
        return !(backendRequest && restartFailure) && !deletedSession && !(error.url.includes("/api/reference") && /500 \(Internal Server Error\)/.test(error.text))
      }),
      primeScript: async (name, count = 1) => {
        for (let index = 0; index < count; index += 1) await state.push(...scripted(name, state.directory))
      },
      promptForScript,
      postPrompt,
      waitForUserPrompt,
      waitForAssistantCompletion,
      messages,
      pendingQuestions,
      waitForIdle,
      async resolveFork(path) {
        await expect(page.locator('[data-screen-label="Decision fork"]')).toBeVisible()
        if (path === "card") await page.locator('[data-fork-option="Rewrite shared fixture"]').click()
        if (path === "key") await page.keyboard.press("1")
        if (path === "plan-row") await page.locator('[data-plan-fork-option="Rewrite shared fixture"]').click()
        await expect(page.locator('[data-screen-label="Decision fork"]')).toHaveCount(0)
        await waitForIdle()
        await expect(page.getByTestId("terminal-feed")).toContainText("Fork reply acknowledged")
      },
      async restartBackend() {
        await state.restart()
        await waitFor(async () => {
          try { return (await fetch(`${origin}/global/health`)).ok } catch { return false }
        }, "restarted backend health")
      },
      markIssueFixed: () => writeFile(path.join(state.directory, ".fixture-fixed"), "fixed\n", "utf8"),
    }

    await use(fixture)
    expect(fixture.unexpectedBrowserErrors()).toEqual([])
    await json(`${origin}/session/${session.id}?${query(state.directory)}`, { method: "DELETE" }).catch(() => undefined)
  },
})

export { expect }

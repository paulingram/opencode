import { test, expect } from "./fixture"

const feed = (page: import("@playwright/test").Page) => page.getByTestId("terminal-feed")

test("live load-before-listen renders synced history before subsequent streamed parts", async ({ agentic, page }) => {
  await agentic.promptForScript("narrate", "history before attach")
  await agentic.waitForIdle()
  await page.goto("/")
  await page.goto(`/agentic?session=${agentic.session.id}`)
  await expect(feed(page)).toContainText("history before attach")
  await expect(feed(page)).toContainText("Live fixture narration completed")
  await agentic.promptForScript("narrate", "streamed after attach")
  await agentic.waitForIdle()
  const text = await feed(page).innerText()
  expect(text.indexOf("history before attach")).toBeLessThan(text.indexOf("streamed after attach"))
})

test("live reconnect resnapshots without duplicate or lost rendered entries", async ({ agentic, page }) => {
  await agentic.promptForScript("narrate", "before reconnect")
  await agentic.waitForIdle()
  await expect(feed(page).getByText("before reconnect", { exact: true })).toHaveCount(1)
  await agentic.restartBackend()
  await expect.poll(() => agentic.messages()).not.toHaveLength(0)
  await agentic.promptForScript("narrate", "after reconnect")
  await agentic.waitForIdle()
  await expect(feed(page).getByText("before reconnect", { exact: true })).toHaveCount(1)
  await expect(feed(page).getByText("after reconnect", { exact: true })).toHaveCount(1)
  agentic.browserErrors.splice(
    0,
    agentic.browserErrors.length,
    ...agentic.browserErrors.filter((error) => !/ERR_CONNECTION_RESET|event stream error/i.test(error.text)),
  )
})

test("live multi-select question bypasses fork banner and remains on the real question surface", async ({ agentic, page }) => {
  await agentic.promptForScript("ask-multi-select-question")
  await expect.poll(() => agentic.pendingQuestions()).toHaveLength(1)
  await expect(page.locator('[data-screen-label="Decision fork"]')).toHaveCount(0)
})

test("live failing then fixing commands synthesize an issue through open, fixing, and resolved", async ({ agentic, page }) => {
  await agentic.promptForScript("run-failing-command")
  await agentic.waitForIdle()
  await page.getByRole("button", { name: "issues" }).click()
  const panel = page.locator('[data-screen-label="Right panel"]')
  await expect(panel).toContainText("open")
  await expect(panel).toContainText("fixture failure")
  await agentic.markIssueFixed()
  await agentic.promptForScript("run-passing-command")
  await agentic.waitForIdle()
  await expect(panel).toContainText("resolved")
  await expect(panel).toContainText("↳")
})

test("live viewer save sends a structured user_edit prompt_async notification", async ({ agentic, page }) => {
  await agentic.promptForScript("edit-file")
  await agentic.waitForIdle()
  await page.getByTestId("terminal-diff-header").filter({ hasText: "fixture.ts" }).click()
  const requests: Record<string, unknown>[] = []
  page.on("request", (request) => {
    if (request.method() !== "POST" || !request.url().includes(`/session/${agentic.session.id}/prompt_async`)) return
    try { requests.push(request.postDataJSON() as Record<string, unknown>) } catch {}
  })
  const viewer = page.locator('[data-screen-label="File viewer"]')
  await viewer.locator('[data-viewer-action="edit"]').click()
  await page.locator("#fileeditor").fill("export const userEdit = true\n")
  await viewer.locator('[data-viewer-action="save"]').click()
  await expect.poll(() => requests.length).toBe(1)
  const body = JSON.stringify(requests[0])
  expect(body).toContain("<user_edit>")
  expect(body).toContain("fixture.ts")
  expect(body).toContain("export const userEdit")
})

test("live explicit session target, most-recent default, and create-on-prompt all work", async ({ agentic, page }) => {
  const explicit = await agentic.createSession("Explicit target session")
  await page.goto(`/agentic?session=${explicit.id}`)
  await expect(page).toHaveURL(new RegExp(`session=${explicit.id}`))
  await expect(page.getByTestId("agentic-terminal")).toBeVisible()

  const recent = await agentic.createSession("Most recent target session")
  await page.goto("/agentic")
  await expect(page.getByTestId("agentic-terminal")).toBeVisible()
  await page.locator("#promptbox").fill("default target prompt")
  await page.locator("#promptbox").press("Enter")
  await expect.poll(() => agentic.messages(recent.id)).not.toHaveLength(0)

  await agentic.removeSession(explicit.id)
  await agentic.removeSession(recent.id)
  await agentic.removeSession(agentic.session.id)
  await page.goto("/agentic")
  await expect(page.getByTestId("agentic-terminal")).toBeVisible()
  await page.locator("#promptbox").fill("created by first prompt")
  await page.locator("#promptbox").press("Enter")
  await expect(page).toHaveURL(/session=ses/)
})

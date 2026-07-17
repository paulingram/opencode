import { test, expect } from "./fixture"

const viewer = (page: import("@playwright/test").Page) => page.locator('[data-screen-label="File viewer"]')

test("s12-07 live file event opens viewer, saves a user_edit notification, reverts, and closes", async ({ agentic, page }) => {
  await agentic.promptForScript("edit-file")
  await agentic.waitForIdle()
  const header = page.getByTestId("terminal-diff-header").filter({ hasText: "fixture.ts" })
  await expect(header).toBeVisible()
  await header.click()
  await expect(viewer(page)).toContainText("fixture.ts")
  await expect(viewer(page).getByText(/fixtureValue/)).toBeVisible()
  await expect(viewer(page).getByText(/^\s*1$/)).toBeVisible()

  const notifications: Record<string, unknown>[] = []
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes(`/session/${agentic.session.id}/prompt_async`)) {
      try { notifications.push(request.postDataJSON() as Record<string, unknown>) } catch {}
    }
  })

  await viewer(page).locator('[data-viewer-action="edit"]').click()
  const editor = page.locator("#fileeditor")
  const canonical = await editor.inputValue()
  const edited = `${canonical}\n// e2e session-local edit`
  await editor.fill(edited)
  await viewer(page).locator('[data-viewer-action="save"]').click()
  await expect(viewer(page).locator('[data-viewer-modified="true"]')).toHaveText("modified")
  await expect(page.getByTestId("agentic-terminal-agent-rail").getByText("modified", { exact: true })).toBeVisible()
  await expect(viewer(page)).toContainText("// e2e session-local edit")
  await expect.poll(() => notifications.length).toBe(1)
  expect(JSON.stringify(notifications[0])).toContain("<user_edit>")
  expect(JSON.stringify(notifications[0])).toContain("fixture.ts")
  expect(JSON.stringify(notifications[0])).toContain("e2e session-local edit")

  await viewer(page).locator('[data-viewer-action="revert"]').click()
  await expect(viewer(page).locator('[data-viewer-modified="true"]')).toHaveCount(0)
  await expect(viewer(page)).not.toContainText("// e2e session-local edit")
  await viewer(page).locator('[data-viewer-action="edit"]').click()
  await editor.focus()
  await editor.press("Escape")
  await expect(viewer(page)).toHaveCount(0)
})

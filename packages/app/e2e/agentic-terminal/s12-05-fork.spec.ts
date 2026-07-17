import { test, expect, type ForkResolutionPath } from "./fixture"

const paths: ForkResolutionPath[] = ["card", "key", "plan-row"]

for (const path of paths) {
  test(`s12-05 real single-select question holds and resolves via ${path}`, async ({ agentic, page }) => {
    const replies: string[] = []
    page.on("request", (request) => {
      if (request.method() === "POST" && /\/question\/que[^/]+\/reply/.test(request.url())) replies.push(request.url())
    })

    await agentic.promptForScript("ask-fork-question")
    await expect(page.locator('[data-screen-label="Decision fork"]')).toBeVisible()
    await expect.poll(() => agentic.pendingQuestions()).toHaveLength(1)
    await expect(page.getByTestId("terminal-status")).toHaveText("⑂ awaiting decision")

    const prompt = page.locator("#promptbox")
    await prompt.fill("held-a | held-b")
    await prompt.press("Shift+Enter")
    const queue = page.locator('[data-screen-label="Prompt queue"]')
    await expect(queue).toContainText("held-a")
    await expect(queue).toContainText("held-b")
    await page.getByRole("button", { name: "⏸ pause" }).click()
    await expect(page.getByRole("button", { name: "▶ play" })).toBeVisible()
    await expect(page.getByTestId("terminal-feed")).not.toContainText("held-a")

    await page.getByRole("button", { name: "▶ play" }).click()
    await agentic.resolveFork(path)
    expect(replies).toHaveLength(1)
    await expect.poll(() => agentic.pendingQuestions()).toHaveLength(0)
    await expect(page.getByTestId("terminal-feed")).toContainText("Fork reply acknowledged")
  })
}

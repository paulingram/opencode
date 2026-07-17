import { test, expect } from "./fixture"

const queue = (page: import("@playwright/test").Page) => page.locator('[data-screen-label="Prompt queue"]')

test("s12-06 live queue chunks, holds while paused, drains on idle, sends manually, clears, and replays", async ({ agentic, page }) => {
  await page.getByRole("button", { name: "⏸ pause" }).click()
  const prompt = page.locator("#promptbox")
  await prompt.fill("queue turn | queued second | queued third")
  await prompt.press("Enter")
  await expect(queue(page)).toContainText("#1queued second")
  await expect(queue(page)).toContainText("#2queued third")
  const chips = queue(page).locator(":scope > span").filter({ has: page.getByRole("button", { name: /Remove queued prompt/ }) })
  await expect(chips).toHaveCount(2)
  await expect(chips.nth(0)).toHaveCSS("border-color", "rgb(250, 178, 131)")
  await expect(chips.nth(1)).toHaveCSS("border-color", "rgb(60, 60, 60)")
  await expect(page.getByTestId("terminal-feed")).not.toContainText("Queue turn completed")

  await page.getByRole("button", { name: "▶ play" }).click()
  await agentic.waitForIdle()
  await expect(page.getByTestId("terminal-feed")).toContainText("queue turn")
  await expect(queue(page)).not.toContainText("queued second")
  await expect(queue(page)).toContainText("#1queued third")

  await queue(page).getByRole("button", { name: "send next ↑" }).click()
  await agentic.waitForIdle()
  await expect(queue(page)).toHaveCount(0)
  await expect(page.getByTestId("terminal-feed")).toContainText("queued third")

  await prompt.fill("remove me | clear me")
  await prompt.press("Shift+Enter")
  await queue(page).getByRole("button", { name: "Remove queued prompt 1" }).click()
  await expect(queue(page)).toContainText("clear me")
  await expect(queue(page)).not.toContainText("remove me")
  await queue(page).getByRole("button", { name: "clear" }).click()
  await expect(queue(page)).toHaveCount(0)

  const label = page.getByTestId("terminal-step-label")
  // The live session can still be streaming trailing turns here; capture the
  // scrub baseline only once the step counter has been quiet for a beat, or
  // the final resume assertion races whatever arrives after the snapshot.
  await expect(async () => {
    const first = await label.innerText()
    await page.waitForTimeout(1_500)
    expect(await label.innerText()).toBe(first)
  }).toPass({ timeout: 30_000 })
  const before = await label.innerText()
  const last = Number(before.split("/")[1])
  expect(last).toBeGreaterThan(0)
  await page.keyboard.press("ArrowLeft")
  await expect(label).not.toHaveText(before)
  await expect(page.getByRole("button", { name: "▶ play" })).toBeVisible()
  await page.getByRole("button", { name: "▶ play" }).click()
  await expect(label).toHaveText(`${last}/${last}`)
})

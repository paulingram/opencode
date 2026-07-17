import { test, expect } from "./fixture"

test("s12-04 live TUI lines are single-spaced and only diff/code bodies x-scroll", async ({ agentic, page }) => {
  await page.setViewportSize({ width: 900, height: 700 })
  await agentic.primeScript("run-failing-command")
  await agentic.primeScript("edit-file")
  await agentic.postPrompt("run failing command")
  await agentic.waitForAssistantCompletion("run failing command")
  await agentic.waitForIdle()
  await agentic.postPrompt("edit file")
  await expect(page.getByTestId("terminal-diff-header")).toBeVisible()
  await agentic.waitForIdle()

  await page.keyboard.press("v")
  await expect(agentic.root).toHaveAttribute("data-view", "tui")
  const lines = page.getByTestId("terminal-tui-transcript-line")
  expect(await lines.count()).toBeGreaterThan(0)
  const geometry = await lines.evaluateAll((elements) => elements.map((element) => {
    const box = element.getBoundingClientRect()
    const style = getComputedStyle(element)
    return { top: box.top, bottom: box.bottom, height: box.height, minHeight: style.minHeight, whiteSpace: style.whiteSpace }
  }))
  expect(geometry.every((line) => line.minHeight === "19px" && line.whiteSpace === "pre")).toBe(true)
  for (let index = 1; index < geometry.length; index += 1) {
    expect(geometry[index]!.top).toBeGreaterThanOrEqual(geometry[index - 1]!.bottom - 0.5)
    expect(geometry[index]!.height).toBeCloseTo(geometry[index - 1]!.height, 1)
  }

  await page.keyboard.press("v")
  const diffHeader = page.getByTestId("terminal-diff-header").last()
  const diffBlock = diffHeader.locator("..")
  const diff = await diffBlock.evaluate((element) => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth, overflowX: getComputedStyle(element).overflowX }))
  expect(diff.overflowX).toBe("auto")
  expect(diff.scrollWidth).toBeGreaterThan(diff.clientWidth)
  await diffBlock.evaluate((element) => element.scrollTo({ left: element.scrollWidth }))
  await expect(diffHeader).toHaveCSS("position", "sticky")
  await expect(diffHeader).toHaveCSS("left", "0px")

  await diffHeader.click()
  const viewer = page.locator('[data-screen-label="File viewer"]')
  await viewer.locator('[data-viewer-action="edit"]').click()
  const editor = page.locator("#fileeditor")
  const canonical = await editor.inputValue()
  await editor.fill(`${canonical}\nexport const secondOverflowWitness = "${"x".repeat(180)}"`)
  await viewer.locator('[data-viewer-action="save"]').click()
  const codeBody = viewer.locator(":scope > div").first()
  const code = await codeBody.evaluate((element) => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth, overflowX: getComputedStyle(element).overflowX }))
  expect(code.overflowX).toBe("auto")
  expect(code.scrollWidth).toBeGreaterThan(code.clientWidth)
})

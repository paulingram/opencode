import { test, expect } from "./fixture"

const widths = [900, 1280, 1920]

for (const width of widths) {
  test(`s12-02 live content has no horizontal overflow and the whole rail scrolls at ${width}px`, async ({ agentic, page }) => {
    await page.setViewportSize({ width, height: 360 })
    await agentic.primeScript("run-failing-command")
    await agentic.primeScript("edit-file")
    await agentic.postPrompt("run failing command")
    await agentic.waitForAssistantCompletion("run failing command")
    await agentic.waitForIdle()
    await agentic.postPrompt("edit file")
    await expect(page.getByTestId("terminal-diff-header")).toBeVisible()
    await agentic.waitForIdle()
    await expect(page.getByTestId("terminal-command-output")).toBeVisible()

    const mission = await page.evaluate(() => {
      const measure = (selector: string) => {
        const element = document.querySelector<HTMLElement>(selector)
        if (!element) throw new Error(`Missing ${selector}`)
        const style = getComputedStyle(element)
        return {
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
          clientHeight: element.clientHeight,
          scrollHeight: element.scrollHeight,
          overflowX: style.overflowX,
          overflowY: style.overflowY,
        }
      }
      return {
        root: measure('[data-testid="agentic-terminal"]'),
        feed: measure('[data-testid="terminal-feed"]'),
        panel: measure('[data-screen-label="Right panel"] > div:last-child'),
        rail: measure('[data-testid="agentic-terminal-agent-rail"]'),
      }
    })

    expect(mission.root.scrollWidth).toBeLessThanOrEqual(mission.root.clientWidth)
    expect(mission.feed.scrollWidth).toBeLessThanOrEqual(mission.feed.clientWidth)
    expect(mission.panel.scrollWidth).toBeLessThanOrEqual(mission.panel.clientWidth)
    expect(mission.rail.scrollWidth).toBeLessThanOrEqual(mission.rail.clientWidth)
    expect(mission.rail.scrollHeight).toBeGreaterThan(mission.rail.clientHeight)
    expect(mission.rail.overflowY).toBe("auto")

    const rail = page.getByTestId("agentic-terminal-agent-rail")
    await rail.evaluate((element) => element.scrollTo({ top: element.scrollHeight }))
    await expect(rail.getByText("RESOURCES")).toBeVisible()

    await page.getByRole("button", { name: "tui" }).click()
    const tui = await page.getByTestId("agentic-terminal-tui").evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      overflowX: getComputedStyle(element).overflowX,
    }))
    expect(tui.scrollWidth).toBeLessThanOrEqual(tui.clientWidth)
    expect(tui.overflowX).toBe("hidden")
  })
}

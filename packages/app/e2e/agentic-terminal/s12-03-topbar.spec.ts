import { test, expect } from "./fixture"

test("s12-03 live topbar ellipsizes the long title without wrapping controls", async ({ agentic, page }) => {
  await page.setViewportSize({ width: 900, height: 700 })
  await agentic.promptForScript("narrate")
  await agentic.waitForIdle()

  const topbar = page.getByTestId("agentic-terminal-topbar")
  const title = page.getByTestId("terminal-session-title")
  await expect(title).toHaveAttribute("title", "Agentic terminal real backend acceptance fixture with an intentionally long title")
  const status = page.getByTestId("terminal-status")
  const branch = topbar.locator("span").filter({ hasText: "" })
  const controls = [
    branch,
    status,
    topbar.getByRole("button", { name: /^(?:▶ play|⏸ pause)$/ }),
    topbar.getByRole("button", { name: "mission control" }),
    topbar.getByRole("button", { name: "tui" }),
  ]

  const titleStyle = await title.evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      overflow: style.overflow,
      textOverflow: style.textOverflow,
      whiteSpace: style.whiteSpace,
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      height: element.getBoundingClientRect().height,
      lineHeight: Number.parseFloat(style.lineHeight),
    }
  })
  expect(titleStyle.overflow).toBe("hidden")
  expect(titleStyle.textOverflow).toBe("ellipsis")
  expect(titleStyle.whiteSpace).toBe("nowrap")
  expect(titleStyle.scrollWidth).toBeGreaterThanOrEqual(titleStyle.clientWidth)
  expect(titleStyle.height).toBeLessThanOrEqual(titleStyle.lineHeight)

  const boxes = await Promise.all(controls.map((control) => control.boundingBox()))
  expect(boxes.every(Boolean)).toBe(true)
  const centers = boxes.map((box) => Math.round(box!.y + box!.height / 2))
  expect(new Set(centers).size).toBe(1)
  await expect(topbar).toHaveCSS("white-space", "nowrap")
  await expect(agentic.root).toHaveAttribute("data-view", "mission")
})

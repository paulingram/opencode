import { test, expect } from "./fixture"

const terminalTokens = {
  "--terminal-bg": "#0a0a0a",
  "--terminal-panel": "#141414",
  "--terminal-raised": "#1e1e1e",
  "--terminal-border": "#282828",
  "--terminal-border-strong": "#3c3c3c",
  "--terminal-text": "#eeeeee",
  "--terminal-muted": "#808080",
  "--terminal-dim": "#606060",
  "--terminal-primary": "#fab283",
  "--terminal-secondary": "#5c9cf5",
  "--terminal-accent": "#9d7cd8",
  "--terminal-error": "#e06c75",
  "--terminal-success": "#7fd88f",
  "--terminal-info": "#56b6c2",
  "--terminal-warn": "#e5c07b",
  "--terminal-file": "#828bb8",
  "--terminal-diff-add-fg": "#4fd6be",
  "--terminal-diff-add-bg": "#20303b",
  "--terminal-diff-del-fg": "#e26a75",
  "--terminal-diff-del-bg": "#37222c",
} as const

test("s12-01 live route loads console-clean with JetBrains Mono and terminal tokens", async ({ agentic, page }) => {
  await agentic.promptForScript("narrate")
  await agentic.waitForIdle()
  await expect(page.getByTestId("terminal-feed")).toContainText("Live fixture narration completed")
  await expect.poll(() => agentic.unexpectedBrowserErrors()).toEqual([])
  await expect.poll(() => page.evaluate(() => document.fonts.check('13px "JetBrains Mono"'))).toBe(true)

  const styles = await agentic.root.evaluate((element, expected) => {
    const computed = getComputedStyle(element)
    const tokens = Object.fromEntries(Object.keys(expected).map((token) => [token, computed.getPropertyValue(token).trim().toLowerCase()]))
    const unresolved = Array.from(element.querySelectorAll<HTMLElement>("*"))
      .flatMap((node) => {
        const style = getComputedStyle(node)
        return [style.color, style.backgroundColor, style.borderColor, style.fontFamily]
      })
      .filter((value) => value.includes("terminal-"))
    return { fontFamily: computed.fontFamily, tokens, unresolved }
  }, terminalTokens)

  expect(styles.fontFamily).toContain("JetBrains Mono")
  expect(styles.tokens).toEqual(terminalTokens)
  expect(styles.unresolved).toEqual([])
})

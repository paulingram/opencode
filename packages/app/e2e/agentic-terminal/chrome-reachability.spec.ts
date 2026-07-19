import { test, expect } from "@playwright/test"

// PROD-SAFETY: This test validates web-rendered chrome navigation to the agentic terminal.
// The test drives real user interactions (click + keyboard) against the running application.
// This is a frontend-only surface test that does not depend on backend state.

test.describe("Agentic Terminal Chrome Reachability", () => {
  test("should navigate to /agentic via palette command", async ({ page }) => {
    // PROD-SAFETY: This test uses the command palette (Cmd+K / Ctrl+K) which is a core navigation mechanism.
    // It verifies that the "Open Agentic Terminal" command is discoverable and functional.

    await page.goto("http://localhost:5173")

    // Open the command palette
    const isMac = process.platform === "darwin"
    const modifier = isMac ? "Meta" : "Control"
    await page.keyboard.press(`${modifier}+K`)

    // Wait for palette to appear
    await page.waitForSelector('[role="combobox"]')

    // Type "agentic" to filter commands
    await page.keyboard.type("agentic")

    // Wait for the "Open Agentic Terminal" command to appear
    const agenticCommand = page.locator('text="Open Agentic Terminal"')
    await agenticCommand.waitFor({ state: "visible" })

    // Select the command
    await page.keyboard.press("Enter")

    // Verify we navigated to /agentic
    await page.waitForURL("**/agentic")
    expect(page.url()).toContain("/agentic")

    // Verify the agentic terminal component renders
    await page.waitForSelector("[data-testid='agentic-terminal-root']")
  })

  test("should render agentic terminal at /agentic route", async ({ page }) => {
    // PROD-SAFETY: This test verifies direct route navigation to /agentic renders the terminal.
    // It confirms the route handler and component initialization are correct.

    await page.goto("http://localhost:5173/agentic")

    // Wait for the agentic terminal root element to appear
    await page.waitForSelector("[data-testid='agentic-terminal-root']")

    // Verify the component is visible
    const terminal = page.locator("[data-testid='agentic-terminal-root']")
    await expect(terminal).toBeVisible()
  })

  test("should have accessible navigation via sidebar/titlebar (legacy layout)", async ({ page }) => {
    // PROD-SAFETY: This test verifies the legacy layout provides a navigation entry to /agentic.
    // It tests visibility and aria-label for accessibility.

    await page.goto("http://localhost:5173")

    // Wait for layout to render
    await page.waitForSelector("[data-component='sidebar-nav-desktop']")

    // Look for the agentic terminal navigation button/link
    // The button should have an aria-label for accessibility
    const agenticNavButton = page.locator('button[aria-label*="Agentic"], a[aria-label*="Agentic"]')

    // Verify the button/link is visible
    await expect(agenticNavButton.first()).toBeVisible()

    // Click the navigation entry
    await agenticNavButton.first().click()

    // Verify we navigated to /agentic
    await page.waitForURL("**/agentic")
    expect(page.url()).toContain("/agentic")
  })
})

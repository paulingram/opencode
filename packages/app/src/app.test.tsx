import { describe, expect, test } from "bun:test"
import { DESKTOP_MENU } from "./desktop-menu"

describe("agentic terminal menu registration", () => {
  test("View menu contains agentic.open command entry", () => {
    const viewMenu = DESKTOP_MENU.find((menu) => menu.id === "view")
    expect(viewMenu).toBeDefined()
    expect(viewMenu?.items).toBeDefined()

    const agenticEntry = viewMenu?.items?.find(
      (item) => item.type === "item" && item.command === "agentic.open",
    )
    expect(agenticEntry).toBeDefined()
    expect(agenticEntry?.type).toBe("item")
    if (agenticEntry?.type === "item") {
      expect(agenticEntry.label).toBe("Agentic Terminal")
    }
  })
})

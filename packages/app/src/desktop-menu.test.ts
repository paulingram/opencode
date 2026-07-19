import { describe, expect, test } from "bun:test"
import { DESKTOP_MENU } from "./desktop-menu"

describe("desktop menu", () => {
  test("exports logs through the desktop command registry", () => {
    const items = DESKTOP_MENU.flatMap((menu) => menu.items ?? []).filter(
      (item) => item.type === "item" && item.label === "Export Logs...",
    )

    expect(items).toHaveLength(2)
    expect(items.every((item) => item.type === "item" && item.command === "logs.export" && !item.action)).toBe(true)
  })

  test("View menu contains Agentic Terminal command entry", () => {
    const viewMenu = DESKTOP_MENU.find((menu) => menu.id === "view")
    expect(viewMenu).toBeDefined()

    const agenticEntry = viewMenu?.items?.find(
      (item) => item.type === "item" && item.label === "Agentic Terminal",
    )

    expect(agenticEntry).toBeDefined()
    expect(agenticEntry?.type).toBe("item")
    if (agenticEntry?.type === "item") {
      expect(agenticEntry.command).toBe("agentic.open")
      expect(agenticEntry.action).toBeUndefined()
    }
  })
})

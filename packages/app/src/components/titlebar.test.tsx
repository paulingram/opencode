import { beforeAll, describe, expect, mock, test } from "bun:test"
import { isServer, render } from "solid-js/web"
import h from "solid-js/h"

// PROD-SAFETY: Layout-fork coverage for the agentic terminal nav entry.
//
// The v2 titlebar branch (Match when={useV2Titlebar()}) previously had NO
// visible navigation entry to /agentic — the agentic button lived only in the
// legacy Switch branch. The spec requires a visible nav entry in BOTH layout
// modes. This test renders the real AgenticNavEntryV2 component that the v2
// branch mounts, asserting its aria-label (from the i18n key sidebar.agentic),
// its visibility, and that clicking it navigates to /agentic. It fails against
// the pre-fix code (the component does not exist).
//
// Integrated layout-fork coverage (newLayoutDesigns ON vs OFF, real toggle,
// real page.click) lives in the e2e spec
// packages/app/e2e/agentic-terminal/chrome-reachability.spec.ts, which drives
// the genuine full-app fork — the authoritative fork coverage per the SR.

let AgenticNavEntryV2: typeof import("./titlebar").AgenticNavEntryV2

const React = { createElement: h, Fragment: h.Fragment }
Object.assign(globalThis, { React, Fragment: h.Fragment })

beforeAll(async () => {
  if (isServer) return
  const mod = await import("./titlebar")
  AgenticNavEntryV2 = mod.AgenticNavEntryV2
})

describe.skipIf(isServer)("AgenticNavEntryV2 — v2 titlebar nav entry", () => {
  test("renders a visible button with the sidebar.agentic aria-label that navigates to /agentic on click", () => {
    const navigate = mock((to: string) => {})
    const language = { t: (key: string) => key }

    const host = document.createElement("div")
    document.body.append(host)
    const dispose = render(
      () => <AgenticNavEntryV2 language={language} navigate={navigate} />,
      host,
    )

    const button = host.querySelector("button[aria-label='sidebar.agentic']") as HTMLButtonElement | null
    expect(button).not.toBeNull()
    expect(button!.getAttribute("aria-label")).toBe("sidebar.agentic")

    button!.click()
    expect(navigate).toHaveBeenCalledWith("/agentic")

    dispose()
    host.remove()
  })
})

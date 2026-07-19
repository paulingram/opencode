import { test, expect } from "@playwright/test"
import { mockOpenCodeServer } from "../utils/mock-server"

// PROD-SAFETY: Genuine layout-fork coverage for the agentic terminal nav entry.
//
// Prior coverage was vacuous: the "legacy layout" test waited for the legacy
// sidebar selector (`[data-component='sidebar-nav-desktop']`, legacy-only) and
// never enabled or toggled `newLayoutDesigns`, so the v2 titlebar branch (Match
// when={useV2Titlebar()}) was never exercised — and the agentic nav button
// lived ONLY in that legacy branch, meaning new-layout users had no visible
// nav entry while the suite claimed green. It also asserted a non-existent
// `[data-testid='agentic-terminal-root']` selector (the real testid is
// `agentic-terminal`). These tests drive the real fork: `newLayoutDesigns` is
// set genuinely (via localStorage init before first paint) and the nav entry is
// clicked for real in each layout mode, plus a toggle-survival path that flips
// the setting in-app (no page reload) and re-verifies the entry.
//
// The nav entry's aria-label is the localized `sidebar.agentic` value
// ("Agentic Terminal" in en) — the same i18n key used by both the v2 titlebar
// entry (AgenticNavEntryV2) and the legacy sidebar/titlebar entries.
//
// PALETTE-STEP REPAIR (diagnostic plan §6b): tests 1 and 4 previously drove
// Ctrl+K and waited on an invented `[role="combobox"]` from "/" and "/agentic".
// Neither works: the palette opens via showPalette() -> run("file.open",
// "palette") (context/command.tsx:377-379), and the ONLY "file.open"
// registration is session-page-scoped (pages/session/use-session-commands.tsx),
// keybind "mod+k,mod+p" — it does not exist on "/" or "/agentic", so no
// keybind opens anything there, and neither palette variant
// (dialog-select-file.tsx's legacy List / dialog-command-palette-v2.tsx) ever
// renders role="combobox" (that role only exists in
// dialog-select-directory-v2.tsx and the session-review filter). Repair
// direction taken here, per the plan's two sanctioned options:
//  - Test 1 ("navigate via palette command"): reaches a REAL session page
//    (mocked backend + the same localStorage-draft-tab + /new-session redirect
//    pattern already established by e2e/regression/legacy-new-session.spec.ts
//    in this suite) so file.open is genuinely registered, then drives the
//    REAL palette DOM (`[data-slot="list-search"]`, no invented role) for real.
//  - Test 4's settings-open step: switched to the real sidebar Settings
//    button (aria-label "Settings", pages/layout/sidebar-shell.tsx) — a real
//    UI control, not a palette that cannot open on "/agentic" (which renders
//    outside LegacyLayout and has no sidebar/palette surface at all).
// Tests 2 and 3, the setLayoutMode/toggle machinery, and test 4's toggle
// mechanics are untouched.

const AGENTIC_LABEL = "Agentic Terminal"
const OPEN_AGENTIC_COMMAND_LABEL = "Open Agentic Terminal"

// Pre-seed the settings store so newLayoutDesigns is deterministically ON or
// OFF before the app first paints. The settings context merges this partial
// over its defaults (packages/app/src/context/settings.tsx persisted
// "settings.v3"), so only the newLayoutDesigns preference needs to be set.
//
// SCOPE-AMENDED FIX (orchestrator follow-up, citing
// .architect-team/diagnostic-research/agentic-commands-context/counter-evidence-20260719T163707Z.md):
// without also seeding "app-version.v1", context/settings.tsx's first-launch
// classification effect (settings.tsx:286-294) sees no "previous" app
// version, and shouldEnableNewLayout() (settings.tsx:92-104) force-overrides
// newLayoutDesigns to true for any current app version past the "1.17.19"
// cutoff (packages/app is 1.18.2) -- silently discarding the
// newLayoutDesigns:false seed above regardless of what mode is requested.
// Seeding "previous" == the current app version makes isAppUpgrade() false,
// so the override never fires. Matches the same seed
// e2e/regression/legacy-new-session.spec.ts already uses for exactly this
// reason, and the identical fix this task's own palette-reachability test
// already validated working live.
//
// SECOND SCOPE-AMENDED FIX (orchestrator follow-up, same family): the
// Settings dialog's "New layout designs" toggle row (settings-general.tsx:748)
// only renders when settings.general.layoutTransitionAvailable() is true
// (settings.tsx:419) -- which requires the persisted general.layoutTransitionEligible
// flag to be true (settings.tsx:242-243, layoutTransitionState at :106-111:
// available = scheduled && eligible && !retired). A fresh profile never has
// this flag set, so the toggle row is correctly hidden for it -- a product
// fact (legacy-interface-sunset transition gating), not a bug. Seeding it
// alongside "settings.v3" makes the row render so test 4's UI-drive of the
// toggle can proceed.
// THIRD SCOPE-AMENDED FIX (orchestrator follow-up, per the approved diagnostic
// plan .architect-team/diagnostic-research/layout-toggle-no-flip/diagnostic-plan-20260719T1200Z.md
// §3.1): seed FIRST DOCUMENT ONLY. setNewLayoutDesigns (settings.tsx:411,
// upstream 4a181c357) performs a product-initiated window.location.reload();
// Playwright init scripts re-run on that reload, and an unconditional seed
// would clobber the product's just-persisted write (the root cause of the
// 2026-07-19 test-4 failure -- confirmed by three independent live probes,
// not a product defect). sessionStorage survives the same-tab reload but is
// fresh per Playwright context, so each test still seeds exactly once.
async function setLayoutMode(page: import("@playwright/test").Page, enabled: boolean) {
  await page.addInitScript((mode) => {
    try {
      if (sessionStorage.getItem("__setLayoutModeSeeded")) return
      localStorage.setItem(
        "settings.v3",
        JSON.stringify({ general: { newLayoutDesigns: mode, layoutTransitionEligible: true } }),
      )
      localStorage.setItem("app-version.v1", JSON.stringify({ version: "1.18.2" }))
      sessionStorage.setItem("__setLayoutModeSeeded", "1")
    } catch {
      // ignore — the test will fail at the assertion if the setting didn't land
    }
  }, enabled)
}

test.describe("Agentic Terminal Chrome Reachability", () => {
  test("should navigate to /agentic via palette command", async ({ page }) => {
    // PROD-SAFETY: command palette (Cmd/Ctrl+K) is a core navigation mechanism;
    // verifies the "Open Agentic Terminal" command is discoverable + functional
    // from the real palette DOM. "file.open" (the command the palette keybind
    // triggers) is registered only on a real session page, so this reaches one
    // via the same mocked-backend + draft-tab + /new-session redirect pattern
    // e2e/regression/legacy-new-session.spec.ts already establishes in this
    // suite -- a real app navigation, not a shortcut around the UI.
    const directory = "C:/OpenCode/PaletteReachability"
    const draftID = "draft_palette_reachability"
    const server = `http://${process.env.PLAYWRIGHT_SERVER_HOST ?? "127.0.0.1"}:${process.env.PLAYWRIGHT_SERVER_PORT ?? "4096"}`

    await mockOpenCodeServer(page, {
      directory,
      project: {
        id: "proj_palette_reachability",
        worktree: directory,
        vcs: "git",
        name: "palette-reachability",
        time: { created: 1700000000000, updated: 1700000000000 },
        sandboxes: [],
      },
      provider: { all: [], connected: [], default: {} },
      sessions: [],
      pageMessages: () => ({ items: [] }),
      // Typing into the palette triggers a real /find/file search
      // (command-palette.ts's file.searchFiles, alongside the command list).
      // Without a findFiles handler the request falls through to
      // route.fallback() -> a real network call that fails, and
      // Promise.all(...) in dialog-select-file.tsx's items() rejects,
      // corrupting the whole page (not just the dialog).
      findFiles: () => [],
    })
    await page.addInitScript(
      ({ directory, draftID, server }) => {
        try {
          localStorage.setItem("settings.v3", JSON.stringify({ general: { newLayoutDesigns: false } }))
          // Without this, context/settings.tsx's launch-classification effect
          // (settings.tsx:286-294) sees no "previous" app-version, treats this
          // as a first-ever launch, and shouldEnableNewLayout() (settings.tsx:92-104)
          // force-upgrades newLayoutDesigns to true for any version past the
          // "1.17.19" cutoff — packages/app is 1.18.2 — overriding the
          // newLayoutDesigns:false seed above regardless. Matches the same
          // seed e2e/regression/legacy-new-session.spec.ts already uses for
          // exactly this reason.
          localStorage.setItem("app-version.v1", JSON.stringify({ version: "1.18.2" }))
          localStorage.setItem(
            "opencode.window.browser.dat:tabs",
            JSON.stringify([{ type: "draft", draftID, server, directory }]),
          )
        } catch {
          // ignore — the test will fail at the assertion if the setting didn't land
        }
      },
      { directory, draftID, server },
    )

    await page.goto(`/new-session?draftId=${draftID}`)
    await page.waitForSelector('[data-component="prompt-input"]')

    const isMac = process.platform === "darwin"
    const modifier = isMac ? "Meta" : "Control"
    await page.keyboard.press(`${modifier}+K`)
    // Real palette DOM: the search box lives inside [data-slot="list-search"]
    // (packages/ui/src/components/list.tsx); no invented role="combobox".
    await page.waitForSelector('[data-slot="list-search"]')
    await page.keyboard.type("agentic")

    const agenticCommand = page.locator(`text="${OPEN_AGENTIC_COMMAND_LABEL}"`)
    await agenticCommand.waitFor({ state: "visible" })
    await page.keyboard.press("Enter")

    await page.waitForURL("**/agentic")
    expect(page.url()).toContain("/agentic")
  })

  test("new layout (newLayoutDesigns ON): v2 titlebar nav entry is visible and navigates to /agentic", async ({ page }) => {
    // PROD-SAFETY: exercises the v2 titlebar branch (Match when={useV2Titlebar()})
    // — the branch that previously had NO agentic nav entry. Real page.click.
    await setLayoutMode(page, true)
    await page.goto("/")

    // The v2 titlebar header is tagged data-slot="titlebar-v2"; confirm the
    // new-layout branch actually rendered (guards against the setting not
    // landing and the test silently running in legacy).
    await page.waitForSelector('[data-slot="titlebar-v2"]')

    const entry = page.getByRole("button", { name: AGENTIC_LABEL }).first()
    await expect(entry).toBeVisible()
    await entry.click()

    await page.waitForURL("**/agentic")
    expect(page.url()).toContain("/agentic")
  })

  test("legacy layout (newLayoutDesigns OFF): legacy nav entry is visible and navigates to /agentic", async ({ page }) => {
    // PROD-SAFETY: exercises the legacy Switch branch — the sidebar rail entry
    // (and project-scoped titlebar entry) that were the ONLY entries before.
    await setLayoutMode(page, false)
    await page.goto("/")

    // Legacy chrome renders the sidebar nav (no v2 titlebar slot).
    await page.waitForSelector("[data-component='sidebar-nav-desktop']")
    expect(await page.locator('[data-slot="titlebar-v2"]').count()).toBe(0)

    const entry = page.getByRole("button", { name: AGENTIC_LABEL }).first()
    await expect(entry).toBeVisible()
    await entry.click()

    await page.waitForURL("**/agentic")
    expect(page.url()).toContain("/agentic")
  })

  test("entry survives layout-mode toggle (legacy -> new layout, via product-initiated reload)", async ({ page }) => {
    // PROD-SAFETY: spec scenario "Entry survives layout-mode toggle" — toggling
    // newLayoutDesigns persists the choice and performs a product-initiated full
    // window.location.reload() (settings.tsx:411, upstream 4a181c357); the entry
    // must be present and functional in the newly-active shell after that reload.
    await setLayoutMode(page, false)
    await page.goto("/")
    await page.waitForSelector("[data-component='sidebar-nav-desktop']")

    // 1. Legacy entry navigates to /agentic.
    const legacyEntry = page.getByRole("button", { name: AGENTIC_LABEL }).first()
    await expect(legacyEntry).toBeVisible()
    await legacyEntry.click()
    await page.waitForURL("**/agentic")

    // 2. Return to the home shell -- the legacy /agentic route renders OUTSIDE
    // LegacyLayout (Routes() in app.tsx puts it as a sibling of the
    // LegacyServerLayout-wrapped routes) and has no sidebar/palette surface at
    // all. Going back (real browser back, not a page.goto reload -- solid
    // router's History-API navigation pops the SPA state, no full reload)
    // returns to the legacy shell where the real Settings button lives.
    await page.goBack()
    await page.waitForSelector("[data-component='sidebar-nav-desktop']")

    // Open Settings via the real sidebar control (aria-label "Settings",
    // pages/layout/sidebar-shell.tsx) -- not the command palette, which
    // cannot open here: "file.open" (what the palette keybind triggers) is
    // registered only on a real session page
    // (pages/session/use-session-commands.tsx), and neither "/" nor
    // "/agentic" mount one.
    const settingsButton = page.getByRole("button", { name: "Settings" }).first()
    await expect(settingsButton).toBeVisible()
    await settingsButton.click()

    // THIRD SCOPE-AMENDED FIX (orchestrator follow-up): the prior selector
    // resolved to the visually-hidden [data-slot="switch-input"] checkbox,
    // whose pointer events are intercepted by the styled control on top of
    // it -- a selector-ergonomics issue, not a timing or product defect.
    // e2e/regression/remote-session-settings.spec.ts already establishes the
    // correct idiom for driving these Switch controls: click the STYLED
    // control element, [data-slot="switch-control"], not the hidden input.
    const toggleRow = page.locator('[data-action="settings-new-layout-designs"]')
    const toggleInput = toggleRow.getByRole("switch")
    await toggleInput.waitFor({ state: "visible" })
    await toggleRow.locator('[data-slot="switch-control"]').scrollIntoViewIfNeeded()

    // 3. The product persists the toggle and reloads the document
    // (settings.tsx:411); the post-reload boot renders the v2 shell. Register
    // the load-wait BEFORE the click (race-free -- the reload fires on a 0ms
    // macrotask and can complete before a post-click listener attaches), then
    // wait for the reload to settle before asserting anything on the document.
    const reloadSettled = page.waitForEvent("load") // product-initiated reload, settings.tsx:411
    await toggleRow.locator('[data-slot="switch-control"]').click()
    await reloadSettled

    // Guard against seed-clobber regressions: the post-reload document must
    // still carry the toggled preference (a readable failure vs a 60s
    // selector timeout).
    expect(
      await page.evaluate(() => JSON.parse(localStorage.getItem("settings.v3") ?? "{}").general?.newLayoutDesigns),
    ).toBe(true)

    // The post-reload boot must render the v2 shell; the v2 titlebar entry
    // must appear and navigate to /agentic.
    await page.waitForSelector('[data-slot="titlebar-v2"]')
    const v2Entry = page.getByRole("button", { name: AGENTIC_LABEL }).first()
    await expect(v2Entry).toBeVisible()
    await v2Entry.click()
    await page.waitForURL("**/agentic")
    expect(page.url()).toContain("/agentic")
  })
})

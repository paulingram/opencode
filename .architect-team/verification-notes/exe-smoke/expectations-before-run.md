# Exe Smoke — Per-Item Expectations (written BEFORE the run)

Discipline: record the expected outcome for every checklist item before executing, so a post-run
verdict can be compared against a prior expectation rather than rationalized after the fact.

Driver: Node + Playwright `chromium.connectOverCDP` against the packaged `win-unpacked` exe launched
with `--remote-debugging-port=9333`. The desktop renderer uses a SolidJS `MemoryRouter`
(`packages/desktop/src/renderer/index.tsx:105-110`), so `page.url()` is the renderer-protocol URL
(`app://...`), NOT the router path. Route assertions therefore use:
  (a) presence of `[data-testid='agentic-terminal']` (proves `/agentic` rendered), and
  (b) `localStorage.getItem('opencode.desktop.window.<windowID>.last-active-url')` via
      `page.evaluate` (proves the persisted/restored router path).

The exe's sidecar is in-process (`virtual:opencode-server` → bundled opencode server), so "live
sidecar data" = real server responses, no mocks.

## §1 Menu Entry
- 1a macOS View menu: N/A on Windows exe — `not-verified` (impossibility: no macOS native menu on a
  Windows-packaged exe; this is a macOS-only surface).
- 1b Windows in-app View menu contains "Agentic Terminal": EXPECT pass. The WindowsAppMenu renders
  DESKTOP_MENU including the View submenu (`desktop-menu.ts:144` has the `agentic.open` entry). The
  entry is enabled iff `agentic.open` is registered (AgenticCommands mounts in both layout modes).
  Automation: open the OpenCode menu (icon button aria-label "OpenCode menu"), hover/click "View"
  submenu, assert a menu item with text "Agentic Terminal" exists and is not disabled.
- 1c Clicking the menu item navigates to /agentic: EXPECT pass. `runEntry` → `runCommand("agentic.open")`
  → `command.trigger` → `onSelect: () => navigate("/agentic")`. Assert
  `[data-testid='agentic-terminal']` appears and last-active-url becomes `/agentic`.

## §2 Navigation Entry: Legacy Layout (New Layout Designs OFF)
- 2a–2e: EXPECT pass. Sidebar rail (`sidebar-shell.tsx:94-103`) renders a terminal-icon button with
  aria-label "Agentic Terminal". Automation: ensure newLayoutDesigns OFF (Settings > General), assert
  `button[aria-label*="Agentic"]` visible in sidebar, click, assert /agentic renders. Tooltip (2c)
  is harder to assert reliably via CDP (hover-triggered, CSS-driven) — if the title/aria attribute is
  present I record `automated-cdp` for the label and `human-recorded` for the visual tooltip popup
  only if I can capture it; otherwise `not-verified` with the impossibility stated (tooltip timing is
  not a reachability guarantee).

## §3 Navigation Entry: New Layout (New Layout Designs ON)
- 3a–3f: EXPECT pass. Titlebar (`titlebar.tsx:663-668`) renders the same button. Automation: toggle
  newLayoutDesigns ON via Settings UI, assert button in titlebar, click, assert /agentic. Same
  tooltip caveat as 2c. Responsive viewports (3f): resize the CDP window; if the button stays visible
  at a narrow width, `automated-cdp`; otherwise `not-verified` with reason.

## §4 Command Palette Integration
- 4a–4c: EXPECT pass. Ctrl+K opens palette (`[role="combobox"]`), type "agentic", assert
  "Open Agentic Terminal" visible, Enter, assert /agentic. Category "View": assert the palette item
  shows the View category label (per `command.category.view` i18n key).

## §5 Relaunch State Restore
- 5a bare /agentic: navigate to /agentic, quit exe (kill process), relaunch with CDP, re-attach,
  assert `localStorage` last-active-url == `/agentic` AND `[data-testid='agentic-terminal']` renders
  on boot. EXPECT pass (renderer/index.tsx:108 restores via history.set).
- 5b /agentic?session=<real-session-id>: need a REAL session id from the live sidecar. Create a
  session via the sidecar (the app creates one on first run / via the agentic terminal surface), read
  its id from live data, navigate to `/agentic?session=<id>`, quit, relaunch, assert restored URL
  equals `/agentic?session=<id>`. EXPECT pass; if session creation is not automatable from CDP I will
  use the newest session id exposed by the live sidecar and record `automated-cdp` with the id
  captured; if no session can be obtained I record `not-verified` with the impossibility stated.

## §6 Route and Component Loading
- 6a direct /agentic renders component: EXPECT pass (palette or nav click).
- 6b visible + interactive: EXPECT pass (assert visible; interactivity = a child element like
  terminal-feed or agent-rail present).
- 6c no console errors on init: EXPECT pass — capture `page.on('console')` + `page.on('pageerror')`
  during /agentic load, assert no error-level messages. Note: dev-channel warnings/Sentry are
  acceptable; only `error` type / uncaught exceptions fail.
- 6d survives layout toggle: EXPECT pass — on /agentic, toggle newLayoutDesigns, assert
  `[data-testid='agentic-terminal']` still present immediately after toggle.

## Platforms (honesty correction per D9)
- macOS: `not-verified` (no macOS machine this run; was pre-ticked — corrected).
- Linux: `not-verified` (no Linux machine this run; was pre-ticked — corrected).
- Windows: `automated-cdp` (this run).
- Web: `automated-cdp` per the existing `chrome-reachability.spec.ts` (prior task 4.1–4.2, not
  re-run here unless a regression is needed).

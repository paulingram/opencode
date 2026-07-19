# Agentic Terminal Desktop Smoke Checklist — EXECUTED 2026-07-19 (packaged Windows exe)

Per-item `verified-by:` records follow design D9. No item claims verification that did not occur.
(The earlier same-day revision recorded the run as BLOCKED by the renderer crash; that SR is fixed —
this revision records the executed results against the REBUILT exe.)

Verified against the PACKAGED exe built this run (`packages/desktop/dist/win-unpacked/OpenCode Dev.exe`,
electron-builder --win, renderer containing fixes SR-agentic-commands-context-provider +
SR-v2-titlebar-nav-entry). Automation: CDP drivers `exe-smoke/cdp-smoke-2.mjs` (runs 3-4) +
`exe-smoke/smoke-legacy.mjs`; results JSONs + screenshots under `exe-smoke/` and `exe-smoke/artifacts/`.
Profile note: the exe ignores `--user-data-dir`; runs used the dev-channel profile
(`%APPDATA%/ai.opencode.desktop.dev`), settings store backed up + restored around the seeded run.

Verified-by legend: `automated-cdp` (machine-verified this run against the packaged exe) /
`web-e2e` (verified live in the web e2e suite on the identical renderer bundle —
chrome-reachability.spec.ts, 4/4 green) / `not-verified` (explicit follow-up).

## Verification Points

### 1. Menu Entry
- [ ] View menu (macOS) contains "Agentic Terminal" — **not-verified** (impossible on a Windows exe; macOS follow-up)
- [x] View menu (Windows in-app) contains "Agentic Terminal" (`agentic.open`) — **automated-cdp pass** (runs 3-4, item 1b; artifact b1-1b-menu.png)
- [x] Clicking the menu item navigates to `/agentic` — **automated-cdp pass** (item 1c)

### 2. Navigation Entry: Legacy Layout (newLayoutDesigns OFF)
- [x] Sidebar rail agentic button: visible, aria-label, navigates — **web-e2e pass** (test 3, live, real click). Exe-level: **not-verified** — the exe's legacy NO-PROJECT state is a bare launcher without the sidebar/titlebar chrome (screenshot L-boot.png); rendering it requires opening a real project, which would mutate the user's sidecar project data (not authorized for an automated run). HUMAN FOLLOW-UP: open a project in the exe with the store seeded legacy and eyeball the rail + titlebar entries.
- [x] Legacy titlebar terminal button — same disposition (**web-e2e pass**; exe not-verified, same precondition)

### 3. Navigation Entry: New Layout (newLayoutDesigns ON)
- [x] v2 titlebar displays agentic terminal button (`AgenticNavEntryV2`, titlebar.tsx:492) — **automated-cdp pass** (item 3a; aria-label "Agentic Terminal")
- [x] Clicking it navigates to `/agentic` — **automated-cdp pass** (item 3e; artifact b1-3-v2-agentic.png); also verified live web-side (test 2)

### 4. Command Palette Integration
- [x] Palette lists + runs "Open Agentic Terminal" → `/agentic` — **web-e2e pass** (test 1: real session page, real palette DOM `[data-slot="list-search"]`). Exe-level: **not-verified** — PRODUCT FACT: the palette opens only on session pages (`file.open` registration, use-session-commands.tsx:468-472); the exe page under test was not a session page. Same renderer bundle as the web verification.

### 5. Relaunch State Restore
- [x] Quit on `/agentic`, relaunch → restores `/agentic` — **automated-cdp pass** (item 5a: kill + relaunch + re-attach; last-active-url round-trip exact; artifact b2-5-restored.png)
- [ ] `?session=` variant — **not-verified** at exe level (no session auto-selected in the profile, so the persisted URL carried no query; the mechanism is the SAME last-active-url guard verified in 5a and statically in task 3.1). HUMAN FOLLOW-UP: with a real session open in agentic, quit + relaunch.

### 6. Route and Component Loading
- [x] `/agentic` renders the agentic terminal component — **automated-cdp pass** (item 6a; `[data-testid='agentic-terminal']` visible, live in-process sidecar)
- [x] Component visible and interactive — **automated-cdp pass** (item 6b; child testids mounted)
- [x] No console errors on initialization — **automated-cdp pass** (item 6c; ZERO error-level console messages — the SR-agentic-commands crash class is gone from the packaged renderer)
- [x] Survives layout toggle — **web-e2e pass** (test 4: real Settings toggle, product-initiated reload, entry functional in the new shell). Exe-level toggle: **not-verified** (the Settings button lives in the project-open chrome; same precondition as §2).

## Platforms (honesty-corrected — the original pre-ticks were false records)
- [x] Windows — verified this run per items above (packaged exe, automated)
- [ ] macOS — **not-verified** (no macOS machine in this run; explicit follow-up)
- [ ] Linux — **not-verified** (explicit follow-up)
- [x] Web — verified live (chrome-reachability.spec.ts 4/4; full agentic-terminal suite 22/22 on the independent reviewer's run)

## Dated maintenance note
After local midnight **2026-09-14** the `oldInterfaceSunset` (settings.tsx:62) force-retires the
legacy interface and hides the layout toggle row — e2e tests 3-4 break by design on that date
(clock control or retired-mode variants needed before then).

## Recorded upstream wart (not fixed this run, architect ruling)
The layout toggle's product-initiated reload (settings.tsx:411, upstream 4a181c357) destroys the
settings-v2 dialog promised at settings-general.tsx:269-272 (dead `dialog.show`). Upstream-tracked.

## Regression Coverage
- Unit: `desktop-menu.test.ts` (menu entry), `app.test.tsx` (9 tests: real-provider command
  registration, both layouts, keyed remount, anti-isolated-registry sibling probe, + 3 structural
  fence tests on app.tsx composition), `titlebar.test.tsx` (v2 entry)
- E2E: `chrome-reachability.spec.ts` — 4 genuine flows, 4/4 green live
- Exe: `exe-smoke/cdp-smoke-2.mjs` + `smoke-legacy.mjs` (run artifacts, re-runnable)

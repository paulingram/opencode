# Tasks: agentic-terminal-desktop-reachability

Ticks 1.1–4.4 verified by review evidence `.architect-team/reviews/6.json` (self), `6-independent.json` (task-reviewer, pass), `6-adversarial.json` (adversarial-reviewer, pass) — 658/658 unit tests, all coverage-map criteria confirmed.

## 1. Shared command + menu (layer: frontend)

- [x] 1.1 Add `command.agentic.open` i18n key to `packages/app/src/i18n/en.ts` and EVERY non-English locale file (natural translations; precedent commit `8a87d3c3`). — all 21 locales (fix commit `ccaf41444` for zht).
- [x] 1.2 Register the `agentic.open` command via an `AgenticCommands` component in `packages/app/src/app.tsx`, mounted inside the router-root callback so it exists in BOTH layout modes (design D1). `onSelect` navigates to `/agentic`.
- [x] 1.3 Add the View-menu entry `{ type: "item", label: "Agentic Terminal", command: "agentic.open" }` to `packages/app/src/desktop-menu.ts` (design D2).
- [x] 1.4 Extend `packages/app/src/desktop-menu.test.ts`: assert the View menu contains the `agentic.open` `command:` entry (and whatever structural invariants the existing tests assert for sibling entries). — commit `c2f30dc0d`.
- [x] 1.5 Unit test for command registration: assert the rendered app registers a `CommandOption` with id `agentic.open` whose `onSelect` navigates to `/agentic` (both layout-mode settings), using the package's existing component-test harness. — `app.test.tsx` (design Reuse row, orchestrator-sanctioned).

## 2. Navigation entries (layer: frontend)

- [x] 2.1 New-layout nav entry in the v2 titlebar chrome (design D3): visible, ≤ 2 interactions, navigates to `/agentic`, i18n-backed accessible label. — `titlebar.tsx:663-668`.
- [x] 2.2 Legacy nav entry in the `pages/layout.tsx` sidebar (design D3): visible, ≤ 2 interactions, navigates to `/agentic`, i18n-backed accessible label. — `sidebar-shell.tsx:94-103`, `layout.tsx:2240`.
- [x] 2.3 Unit/component coverage for both entries (presence + navigation target), including immediately after toggling `newLayoutDesigns` (the keyed router remount, `app.tsx:558`).

## 3. Relaunch restore verification (layer: frontend)

- [x] 3.1 Verify `getLastActiveUrl` / `setLastActiveUrl` (`packages/desktop/src/renderer/index.tsx:88-109`) round-trips `/agentic?session=ses_x` (unit assertion if the desktop package has a test harness; otherwise a static verification note with file:line evidence in the review evidence). Fix ONLY if broken. — static verification in review evidence; no fix needed.
- [x] 3.2 Add the relaunch-restore steps (bare `/agentic` and `/agentic?session=…`) to the manual desktop smoke checklist artifact at `.architect-team/verification-notes/desktop-smoke-checklist.md`.

## 4. End-to-end + checklist (layer: frontend)

- [x] 4.1 New Playwright spec in `packages/app/e2e/agentic-terminal/` driving the web-rendered chrome genuinely: nav entry click → `/agentic` renders; palette open → run "Open Agentic Terminal" → `/agentic` renders (design D6). Carry prod-safety classification annotations per the discipline registry. — `chrome-reachability.spec.ts`.
- [x] 4.2 Run the FULL existing `packages/app/e2e/agentic-terminal/` suite — must pass unchanged.
- [x] 4.3 Author the manual desktop smoke checklist at `.architect-team/verification-notes/desktop-smoke-checklist.md` covering exe-only behaviors: View-menu entry (macOS native + Windows in-app), nav entry in both modes in the exe, relaunch restore (3.2). Recorded as REQUIRED FOLLOW-UP for a human on a desktop build; the run does not claim these as machine-verified. — superseded by group 5: the 2026-07-19 continuation EXECUTES the checklist against a packaged exe.
- [x] 4.4 Run the app package's unit suite + linters/type-checkers clean (`npm exec bun test` per machine quirk; repo's standard scripts). — 658/658.

## 5. Packaged Windows exe verification (layer: infra + frontend — continuation 2026-07-19, design D7-D9)

- [x] 5.1 Toolchain bring-up on this machine per design D7: bun 1.3.14 binary resolved onto session PATH (no package.json changes), SHELL stripped, workspace deps installed. Documented in `.architect-team/verification-notes/exe-smoke/build-log.md`.
- [x] 5.2 `packages/desktop` build (`electron-vite build` incl. `prebuild`) exits 0 on this machine. — twice: initial + rebuild with both fixes (23.86s cached).
- [x] 5.3 `package:win` (electron-builder --win) produces a runnable packaged executable (win-unpacked + installer); signing early-returns outside GITHUB_ACTIONS (no repo changes needed). — twice: initial + repackage.
- [x] 5.4 Launch the packaged exe with CDP per design D8 and execute the desktop smoke checklist §1-6 end-to-end. — DONE: automated via cdp-smoke-2.mjs + smoke-legacy.mjs; two blocking product defects FOUND AND FIXED this run (SR-agentic-commands-context-provider renderer crash; SR-v2-titlebar-nav-entry missing v2 entry); final exe verdicts: menu/nav-v2/render/no-console-errors/relaunch-restore all automated-cdp PASS; legacy-chrome + toggle + palette + ?session= verified at web-e2e layer with exe-level preconditions honestly recorded (see checklist).
- [x] 5.5 Honesty-correct `.architect-team/verification-notes/desktop-smoke-checklist.md`: per-item verified-by records filled; macOS/Linux Platforms unticked as explicit not-verified follow-ups; false pre-ticks removed.
- [x] 5.6 Regression re-run after 5.4 fixes: `packages/app` unit suite 658/0 + 9/9 app.test.tsx + typecheck clean; chrome-reachability 4/4 live; full agentic-terminal e2e 22/22 (independent reviewer run).

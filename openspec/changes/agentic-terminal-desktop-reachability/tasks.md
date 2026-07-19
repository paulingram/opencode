# Tasks: agentic-terminal-desktop-reachability

## 1. Shared command + menu (layer: frontend)

- [ ] 1.1 Add `command.agentic.open` i18n key to `packages/app/src/i18n/en.ts` and EVERY non-English locale file (natural translations; precedent commit `8a87d3c3`).
- [ ] 1.2 Register the `agentic.open` command via an `AgenticCommands` component in `packages/app/src/app.tsx`, mounted inside the router-root callback so it exists in BOTH layout modes (design D1). `onSelect` navigates to `/agentic`.
- [ ] 1.3 Add the View-menu entry `{ type: "item", label: "Agentic Terminal", command: "agentic.open" }` to `packages/app/src/desktop-menu.ts` (design D2).
- [ ] 1.4 Extend `packages/app/src/desktop-menu.test.ts`: assert the View menu contains the `agentic.open` `command:` entry (and whatever structural invariants the existing tests assert for sibling entries).
- [ ] 1.5 Unit test for command registration: assert the rendered app registers a `CommandOption` with id `agentic.open` whose `onSelect` navigates to `/agentic` (both layout-mode settings), using the package's existing component-test harness.

## 2. Navigation entries (layer: frontend)

- [ ] 2.1 New-layout nav entry in the v2 titlebar chrome (design D3): visible, ≤ 2 interactions, navigates to `/agentic`, i18n-backed accessible label.
- [ ] 2.2 Legacy nav entry in the `pages/layout.tsx` sidebar (design D3): visible, ≤ 2 interactions, navigates to `/agentic`, i18n-backed accessible label.
- [ ] 2.3 Unit/component coverage for both entries (presence + navigation target), including immediately after toggling `newLayoutDesigns` (the keyed router remount, `app.tsx:558`).

## 3. Relaunch restore verification (layer: frontend)

- [ ] 3.1 Verify `getLastActiveUrl` / `setLastActiveUrl` (`packages/desktop/src/renderer/index.tsx:88-109`) round-trips `/agentic?session=ses_x` (unit assertion if the desktop package has a test harness; otherwise a static verification note with file:line evidence in the review evidence). Fix ONLY if broken.
- [ ] 3.2 Add the relaunch-restore steps (bare `/agentic` and `/agentic?session=…`) to the manual desktop smoke checklist artifact at `.architect-team/verification-notes/desktop-smoke-checklist.md`.

## 4. End-to-end + checklist (layer: frontend)

- [ ] 4.1 New Playwright spec in `packages/app/e2e/agentic-terminal/` driving the web-rendered chrome genuinely: nav entry click → `/agentic` renders; palette open → run "Open Agentic Terminal" → `/agentic` renders (design D6). Carry prod-safety classification annotations per the discipline registry.
- [ ] 4.2 Run the FULL existing `packages/app/e2e/agentic-terminal/` suite — must pass unchanged.
- [ ] 4.3 Author the manual desktop smoke checklist at `.architect-team/verification-notes/desktop-smoke-checklist.md` covering exe-only behaviors: View-menu entry (macOS native + Windows in-app), nav entry in both modes in the exe, relaunch restore (3.2). Recorded as REQUIRED FOLLOW-UP for a human on a desktop build; the run does not claim these as machine-verified.
- [ ] 4.4 Run the app package's unit suite + linters/type-checkers clean (`npm exec bun test` per machine quirk; repo's standard scripts).

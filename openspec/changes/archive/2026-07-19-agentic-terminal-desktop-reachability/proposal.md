# Proposal: agentic-terminal-desktop-reachability

## Why

The Agentic Terminal surface (shipped 2026-07-17, change `add-agentic-terminal`, commit `2d2339f51`) is registered at `/agentic` in both layout-mode route forks, but **no navigation element anywhere in the product links to it** — verified by grep across `packages/` (only the two route registrations and e2e `page.goto` hits). The desktop executable mounts the same route tree inside a `MemoryRouter` with no address bar, so the surface is completely unreachable in the desktop app. The user's mandate (refined prompt, grade A 96/100): make it a first-class, fully reachable, sidecar-backed surface in the desktop executable.

## What Changes

- Add a visible navigation entry that opens Agentic Terminal in BOTH layout modes (`settings.general.newLayoutDesigns()` on and off); host surface per mode is implementer's choice grounded in each shell's idiom. The entry survives the keyed router remount on layout-mode toggle (`app.tsx:558`).
- Add an "Open Agentic Terminal" command-palette action registered in the existing `useCommand` system.
- Add a shared `DESKTOP_MENU` `command:` entry (`agentic.open`) in the View menu (`packages/app/src/desktop-menu.ts`), reaching the native macOS menu via `packages/desktop/src/main/menu.ts` and the Windows in-app menu via `packages/app/src/components/windows-app-menu.tsx`.
- Verify (and fix if broken) relaunch restore of the FULL last-active URL including `?session=…` for `/agentic` via the existing `DesktopMemoryRouter` persistence (`packages/desktop/src/renderer/index.tsx:88-109`).
- New user-facing labels follow the existing i18n pattern including non-English locale files.

Explicitly OUT of scope (user-authorized during refinement): the web no-backend `/agentic` failure; a standalone codebase-audit artifact; redesigning the Agentic Terminal surface itself; a desktop-executable e2e harness.

## Continuation (2026-07-19, refined prompt A/92 — supersedes the exe-verification deferral above)

The implementation shipped and passed review (658/658 unit tests, independent + adversarial verdicts) but was never verified in a real desktop executable. The user's continuation mandate ("conitnue with updates and make desktop app work", refined 2026-07-19):

- Build a PACKAGED WINDOWS EXE on this machine (`packages/desktop` `package:win`, electron-builder), fixing whatever breaks — known toolchain collisions: bare-`bun` predev/prebuild vs npm-exec-only bun, no symlink privilege, Git-Bash SHELL leak.
- Execute the desktop smoke checklist (`.architect-team/verification-notes/desktop-smoke-checklist.md`) END-TO-END against the packaged exe: automate what Playwright/CDP can drive; a human-recorded step is acceptable only where automation is genuinely impossible; every item carries an honest per-item verification record. Fixes for failures found ARE the "updates".
- Honesty-correct the checklist: macOS/Linux Platforms boxes were pre-ticked without verification — untick; they stay explicit follow-ups.
- Keep the web e2e suite + unit suite green; refresh stale docs; merge the branch into `dev` and push to origin (never upstream). Done = verified AND merged AND pushed.

The prior "no desktop-executable e2e harness" exclusion stands for PRODUCT code — the exe-smoke automation is a run-verification artifact under `.architect-team/verification-notes/exe-smoke/`, not a repo e2e suite addition.

## Capabilities

### New Capabilities
- `agentic-terminal-reachability`: navigation entry (both layout modes), command-palette action, shared View-menu entry (native macOS / in-app Windows), and desktop relaunch restore of the full `/agentic?session=…` URL.

### Modified Capabilities

<!-- none — existing agentic-terminal-surface/interaction/live/simulation requirements are unchanged; this change adds reachability chrome around the shipped surface -->

## Impact

- `packages/app/src/desktop-menu.ts` (+ `desktop-menu.test.ts`) — new View-menu `command:` entry.
- `packages/app/src/app.tsx` and/or layout chrome components (`layout.tsx` legacy shell, new-layout Titlebar area) — nav entry in both modes.
- Command registration site for the palette action (existing `useCommand` system).
- `packages/app/src/components/windows-app-menu.tsx` — renders the new entry automatically from `DESKTOP_MENU` (no change expected; verified by test).
- `packages/app/src/i18n/*` locale dictionaries — new label keys in ALL locales (en + non-English).
- `packages/desktop/src/renderer/index.tsx` — no change expected for restore (existing persistence covers `?session=`); verified, fixed only if broken.
- Existing web `/agentic` e2e suite must keep passing; new unit tests for menu/command registration; recorded manual desktop smoke checklist under `.architect-team/verification-notes/`.

---
refined-by: proposal-refiner
refined-at: 2026-07-19T08:31:00Z
original-prompt: |
  conitnue with updates and make desktop app work
final-grade-score: 92
final-grade-letter: A
mode: pipeline
codebases-considered:
  - C:/Users/Paul/Documents/terminus_maximus/.opencode-worktrees/agentic-terminal-desktop-app
iterations: 1
exit-reason: user-confirmed
---

## Goal

The in-flight OpenSpec change `agentic-terminal-desktop-reachability` (branch `architect-team/agentic-terminal-desktop-app`, implementation already reviewed: 658/658 unit tests, task 6 passed independent + adversarial review) is completed, and the desktop app demonstrably works with it end-to-end on this Windows 11 machine — as a PACKAGED WINDOWS EXE, verified against the desktop smoke checklist — then merged to dev and pushed.

## Scope (in)

- **Finish in-flight housekeeping**: commit the outstanding state (design.md Reuse-Decision edit, review evidence `6-adversarial.json` / `6-independent.json`, clarifications, smoke-checklist artifact) and tick `openspec/changes/agentic-terminal-desktop-reachability/tasks.md` to reflect verified reality.
- **Build a packaged Windows exe**: `packages/desktop` `package:win` script (electron-builder --win), fixing whatever breaks. Known machine quirks that WILL collide: `predev`/`prebuild` invoke bare `bun` (`packages/desktop/package.json:14,16`) but bun exists only via `npm exec --yes --package=bun@1.3.14 -- bun`; no symlink privilege; Git-Bash `SHELL=/usr/bin/bash` leak breaks spawned servers (strip SHELL per the e2e cleanEnv pattern).
- **Execute the desktop smoke checklist end-to-end** against the packaged exe (`.architect-team/verification-notes/desktop-smoke-checklist.md`): View-menu entry (Windows in-app), nav entries in BOTH layout modes (newLayoutDesigns on/off, incl. immediately after toggling), command palette action, relaunch restore incl. `?session=…`, `/agentic` renders with live sidecar data (no mocks). Fix any failures found — these fixes ARE the "updates". Automate what Playwright can drive; a human-recorded step is acceptable only where automation is genuinely impossible, and the checklist must honestly record what was and wasn't machine-verified.
- **Checklist honesty correction**: the pre-ticked Platforms boxes (`desktop-smoke-checklist.md:58-61`) are false records — untick macOS/Linux; they are NOT verified from this machine and stay explicit follow-ups.
- **Web e2e regression**: the existing `packages/app/e2e/agentic-terminal/` suite still passes.
- **Docs refresh**: ROUTE_MAP.md:3 header codebase root (stale worktree path); INTERACTION_INTUITION_MAP.md currency (header stamp `last_intuited 2026-07-17` predates the reachability chrome — executor confirms exact target per residual gap 1); standard doc-currency inventory (CODEBASE_MAP / DESIGN_MAP / INTEGRATION_MAP headers, README/CHANGELOG per pipeline discipline).
- **Merge to dev**: resolve merge conflicts and merge `architect-team/agentic-terminal-desktop-app` into `dev` (the fork's default branch), push to origin ONLY (never upstream; upstream push URL is DISABLED as a guard), push from the MAIN checkout (`C:/Users/Paul/Documents/terminus_maximus/opencode`) per the pre-push-hook worktree quirk. Done = verified AND merged AND pushed.

## Scope (out)

- Fixing the web/browser `/agentic` no-backend experience.
- Redesigning the Agentic Terminal surface itself (shipped 2026-07-17; reachability wiring only).
- macOS / Linux platform verification — explicitly recorded follow-ups, not deliverables of this run.
- New features beyond fixes required to make the above pass.

## Acceptance criteria

1. A packaged Windows exe is produced by `packages/desktop` `package:win` (electron-builder --win) on this machine, build exiting 0.
2. The packaged exe launches, and every Windows-verifiable smoke-checklist item is green: View-menu entry (in-app), nav entry in both layout modes (incl. right after toggling `newLayoutDesigns`), "Open Agentic Terminal" palette action, relaunch restore of `/agentic` and `/agentic?session=…`, `/agentic` rendering live sidecar data.
3. The checklist artifact honestly records per-item HOW it was verified (automated vs human-recorded) and marks macOS/Linux as not verified.
4. The existing web e2e suite `packages/app/e2e/agentic-terminal/` passes; the app package's unit suite + typecheck pass (658/658 baseline maintained or extended).
5. All in-flight state is committed; `tasks.md` checkboxes reflect verified reality; the docs inventory is current.
6. The branch is merged into `dev` (conflicts resolved) and pushed to origin from the main checkout. Nothing is pushed upstream.

## Codebase touchpoints

- `opencode:packages/desktop/package.json:12-24` — `dev` / `build` / `package:win` scripts; `:14,16` bare-`bun` predev/prebuild collision with this machine.
- `opencode:packages/desktop/src/main/menu.ts:20,45-48` — darwin-only native menu; Windows path is in-app rendering.
- `opencode:packages/app/src/components/windows-app-menu.tsx:81` — Windows in-app DESKTOP_MENU rendering (checklist §1).
- `opencode:packages/app/src/desktop-menu.ts:144` — shipped `agentic.open` View-menu entry; `desktop-menu.test.ts` — its unit test.
- `opencode:packages/app/src/components/titlebar.tsx:663-668` — new-layout nav entry; `packages/app/src/pages/layout/sidebar-shell.tsx:94-103` + `pages/layout.tsx:2240` — legacy nav entry.
- `opencode:packages/app/src/app.tsx:527-542,558,609,613` — AgenticCommands mount, keyed router remount, `/agentic` route registrations.
- `opencode:packages/desktop/src/renderer/index.tsx:88-109,105-111,317,351-353,387-404,412-425` — last-active-URL persistence, DesktopMemoryRouter, onMenuCommand, sidecar Local Server connection.
- `opencode:packages/app/e2e/agentic-terminal/` — existing web e2e suite incl. `chrome-reachability.spec.ts`.
- `opencode:.architect-team/verification-notes/desktop-smoke-checklist.md` — the checklist this run executes and honesty-corrects.
- `opencode:docs/ROUTE_MAP.md:3` — stale codebase-root header; `docs/INTERACTION_INTUITION_MAP.md` — currency stamp refresh target.

## Open questions

- INTERACTION_INTUITION_MAP.md refresh target: the lines-157-171 ambiguity record is already marked `user_verdict: corrected`; the actionable refresh is likely the header currency stamp — executor confirms before editing (never rewrite historical ambiguity records).
- Playwright vs packaged exe: driving an electron-builder NSIS-installed exe may require CDP/remote-debugging attach rather than `_electron.launch`; the chosen mechanism (or an honest human-recorded fallback) is recorded per checklist item.
- Merge-conflict resolution policy: standard resolve-preserving-both-intents judgment; post-merge, the acceptance gates (unit suite, web e2e, smoke result) re-verify.
- Doc-currency inventory breadth beyond the two named docs: executor enumerates and records the inventory in run artifacts.

## Refinement log

| Iteration | Overall | Letter | Key change |
|---|---|---|---|
| 0 | 39 | F | — (initial grade of verbatim prose) |
| 1 | 92 | A | User pinned: never-verified → build+run+verify it all; in-flight change + fixes-as-updates; packaged Windows exe is the verification target; merge to dev required. Defaults (user-confirmed via "ok continue"): updates = fixes discovered + docs refresh; platforms = Windows exe + web here, macOS/Linux explicit follow-ups. |

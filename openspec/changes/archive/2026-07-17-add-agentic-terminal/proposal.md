# Proposal: add-agentic-terminal

## Why

opencode's client today renders a single-agent chat transcript; it has no surface that makes a **multi-agent** session legible — who is working, on what, how work was delegated, where decisions forked, which issues opened and how they resolved. The owner commissioned exactly that surface as a finished design: the **Agentic Terminal** ("Agentic terminal design review", Claude Design project `a1e9856f-717c-4388-9950-b34ccaf515ab`), with `Development Guidance.dc.html` v1.0 as the spec of record, `Agentic Terminal.dc.html` as the interactive prototype oracle, and `AGENT_INTEGRATION.md` as the live event-stream contract. This change implements it in the fork (`paulingram/opencode`, independently maintained; no upstream pushes).

## What Changes

- **New always-on route `/agentic`** in `packages/app`, registered in **both** layout modes (new-layout: `NewHome` sibling inside the `Show` fork at `app.tsx:595-599`; legacy: own `ServerSDKProvider→ServerSyncProvider` pair per the `ResolvedDraftRoute` template at `app.tsx:199-222`). No feature flag. Static-path precedent: `/new-session`.
- **PHASE A — spec-faithful prototype**: the full Agentic Terminal per Development Guidance v1.0 — Mission Control 3-region layout + TUI character-grid mode sharing all state; the scripted 13-step simulated session ("refactor auth → session tokens", 5 agents); complete interaction contract (space/←→/v/1-2/esc + input-focus hotkey guard); prompt + queue semantics (enter/shift+enter, `|` chunking, numbered chips, auto-drain 1/step); decision-fork protocol; issue lifecycle; file viewer with session-local edit/save/revert; simulation formulas; tweakable props (`speedMs`/`autoplay`/`showCost`); exact design tokens as a **namespaced `terminal-*` token set** (the design is the TUI dark palette verbatim — 21/21 vs `packages/tui/src/theme/assets/opencode.json`; the app's v2 semantic tokens deliberately NOT remapped) + **JetBrains Mono** added (not currently in the app font stack). **Milestone gate: all 8 items of the guidance §12 acceptance checklist automated as Playwright flows and green.**
- **PHASE B — live integration**: the same UI converted to consume opencode's REAL session/event stream per `AGENT_INTEGRATION.md` and the six load-bearing wiring contracts in `docs/INTEGRATION_MAP.md` ("Wiring a new live event-consuming surface"). User-verified adapter decisions (INTERACTION_INTUITION_MAP, confirmed 2026-07-16): fork banner ⇐ single-question single-select `question.asked` only (resolve via `POST /question/{requestID}/reply`); issues tab ⇐ client-side adapter synthesis from `session.error` + failed `cmd` tool parts (no backend change); viewer edits stay session-local + structured `promptAsync` notification (no new server surface). **The Phase A simulation is then REMOVED ENTIRELY** — no demo mode, no sim fixtures; all `AGENT_INTEGRATION.md`-flagged simulation-only artifacts deleted; the §12 flows re-targeted at the live surface under **adapted definitions** (play/pause → live-stream consumption pause; stepping → recorded-real-session scrub) and green again with **no mocks**.
- **No server/schema/SDK changes.** All Phase B wiring is client-side in `packages/app` (the generated SDK at `packages/sdk/js/src/v2/gen/*` is never hand-edited).
- **Testing**: doc-driven strictest — §12×Playwright green in Phase A (against the sim) and re-targeted green in Phase B (against a controlled real session on a real `serve` instance); `packages/app` existing unit/browser/e2e suites green throughout. Note: all 58 existing e2e specs mock the backend in-browser — this change introduces the repo's first real-backend Playwright path (per INTEGRATION_MAP B12's recipe).

## Capabilities

### New Capabilities
- `agentic-terminal-surface`: the `/agentic` route, both-mode registration, Mission Control + TUI projections, layout geometry, design tokens, and the §12 visual/structural acceptance contract.
- `agentic-terminal-interaction`: the full interaction contract — hotkeys + guard, scrubber, fork protocol, prompt/queue semantics, agent filtering, tabs, file viewer edit/save/revert.
- `agentic-terminal-simulation`: (Phase A, deleted in Phase B) the scripted 13-step session as a swappable event source driving the phase-agnostic projection core; tweakable props.
- `agentic-terminal-live`: (Phase B) the live event source — ServerSync stream consumption, load-before-listen, resnapshot recovery, the kind-adapter table (text/spawn/cmd/file/status/plan/resource + question.asked→fork + synthesized issues), user_edit prompt-notify, and the real-session test harness.

### Modified Capabilities
_(none — no existing openspec/specs/ capabilities exist in this repo; no upstream spec-level behavior changes)_

## Impact

- **Code**: new self-contained folder `packages/app/src/pages/agentic-terminal/` (route, panels, store, event types, `sim/` source [Phase A only], `live/` source [Phase B], `terminal-*` tokens); two route registrations in `packages/app/src/app.tsx`; new e2e specs `packages/app/e2e/agentic-terminal/`; JetBrains Mono font dependency in `packages/app`.
- **Untouched**: server (`packages/opencode`), schema, generated SDK, `packages/ui`/`session-ui` (consumed read-only), upstream remotes (push URL DISABLED).
- **Git**: work lands on `architect-team/agentic-terminal`; on completion merged to `dev` (the fork's default) and pushed to `origin` only.
- **Dependencies**: one new font package (`@fontsource/jetbrains-mono` or equivalent bundling per app conventions — Reuse Decision in design.md); no other new third-party dependencies.

**Completion-run status (2026-07-17):** the shipped surface and its focused verification are green (`test:agentic-terminal`: 48/48 tests, 205 `expect()` calls; browser suite: 29/29), and the legacy portion of the standard e2e run passed 93 rows. The proposal's blanket full-suite-green statement is not yet accurate: standard `test:unit` ran 668 tests with 654 passing and 14 failing, including 12 Agentic Terminal browser-render/reactivity failures caused by the unit script omitting the browser condition plus two unchanged legacy failures; standard default-worker `test:e2e` ran 108 rows with 93 passing and 15 Agentic Terminal failures because concurrent real-backend workers contend for the fixture's fixed port/session backend. The real-backend focused suite remains independently green, but the full-suite integration gate stays open until the standard scripts pass unchanged.

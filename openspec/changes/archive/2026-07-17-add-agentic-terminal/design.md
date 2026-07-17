# Design: add-agentic-terminal

## Context

The Agentic Terminal is a fully specified design (spec of record: `.architect-team/claude-design/a1e9856f-717c-4388-9950-b34ccaf515ab/Development Guidance.dc.html` v1.0; interactive prototype oracle: `Agentic Terminal.dc.html`; live contract: `AGENT_INTEGRATION.md`). Grounding maps: `docs/CODEBASE_MAP.md`, `docs/ROUTE_MAP.md`, `docs/DESIGN_MAP.md` (binding token/screen spec, baseline `agentic-terminal-v1.0`), `docs/INTEGRATION_MAP.md` (13 boundaries + the six wiring contracts), `docs/INTERACTION_INTUITION_MAP.md` (`confirmed: true`, 33 elements, 4 user-verified gate decisions).

Constraints: fork independently maintained (origin-only pushes; upstream push URL DISABLED); no server/schema/SDK changes; `APPEARANCE_MODE=strict` (implement the design exactly — no unsolicited restyling; guidance §5: fixed glyph vocabulary, no new glyphs/emoji); the two-phase mandate ends with the simulation deleted entirely.

## Goals / Non-Goals

**Goals**: the four capabilities in `proposal.md`; §12×Playwright green in Phase A against the sim and re-targeted green in Phase B against a controlled real session with no mocks; both-mode always-on registration; pixel-exact tokens.

**Non-Goals**: real SDK wiring in Phase A (guidance §1); streaming markdown; session lists; themes beyond opencode / light variant (design is dark-only); <900px responsive behavior (§12 sets the ≥900px bar); persistence across reloads (UI state; Phase B stream re-ingestion is not UI persistence); a surviving demo mode or sim fixtures after Phase B; upstream contributions.

## Decisions

### D1 — Phase-agnostic projection core (the load-bearing decision)
One UI tree + one store + one event-fold, written against the design's own event envelope (`AGENT_INTEGRATION.md` §1: `{id, ts, agent, kind, payload}`, kinds `text|spawn|cmd|file|status|plan|issue|fork|resource`). Two swappable **event sources** implement a `TerminalEventSource` interface (`start/stop/dispose` + emits envelopes + exposes source-level status):
- **Phase A `SimSessionSource`** (`sim/`): the prototype's `EV/AG/ST/TASK/PLAN/ISSUES/FILES` script ported verbatim as data; a tick timer (`speedMs`) emits envelopes; transport controls (play/pause/step/restart/scrubber) live HERE, not in the fold.
- **Phase B `LiveSessionSource`** (`live/`): consumes the app's existing stream per the six INTEGRATION_MAP contracts (D4) and adapts opencode events → the same envelopes (D5).

Phase B conversion = add `live/`, delete `sim/` + transport-only UI affordances; the fold, store, and panels are untouched. This is what makes the §12 re-target "adapted definitions" real: the flows exercise the same fold through a different source.
*Alternatives rejected*: (a) two route components sharing dumb panels — Phase B becomes a rewrite, violating the conversion mandate; (b) building on `session-ui`'s `DataProvider`/`Data` type directly — its contract (message/part rendering) is narrower than the terminal's model (agents/plan/issues/fork/resources); we reuse its provider *pattern*, not its type.

### D2 — Route registration in BOTH layout modes (user-verified, overrides DESIGN_MAP recommendation)
- New-layout: `<Route path="/agentic" component={AgenticTerminalRoute}/>` as a `NewHome` sibling inside the new-layout `Show` fork (`packages/app/src/app.tsx:595-599`) — inherits `SelectedServerProviders` → live stream + v2 shell for free.
- Legacy: same component registered in the legacy fork, wrapped in its own `ServerSDKProvider→ServerSyncProvider` pair per the `ResolvedDraftRoute` template (`app.tsx:199-222`) — the `/new-session` precedent proves static top-level paths coexist with `/:dir`.
- One component, two registrations; the component must not assume the v2 `NewLayout` chrome exists (it owns its full-viewport layout per the design anyway).

### D3 — Namespaced `terminal-*` tokens + JetBrains Mono (DESIGN_MAP stance)
CSS custom properties scoped to the route root (e.g. `--terminal-bg:#0a0a0a`, the 21-token set from DESIGN_MAP, diff colors included), values exactly the guidance §2 / AGENT_INTEGRATION §5 hexes. Do NOT remap onto v2 semantic tokens (no v2 semantic match exists; app dark theme is grey-1100/1200 + blue). JetBrains Mono is not in the app's font stack (`--font-family-mono` is a ui-monospace stack) — bundle via `@fontsource/jetbrains-mono` (OFL license) imported only by the route, weights 400/500/700. Reference sources of record: `packages/tui/src/theme/assets/opencode.json` (canonical) and `packages/ui/src/theme/themes/opencode.json` (in-repo web-side carrier; no build sync between them).

### D4 — Phase B stream consumption obeys the six INTEGRATION_MAP contracts verbatim
(1) **Load-before-listen**: on session attach, `session.sync(sessionID)` before rendering from events (drops at `server-session.ts:849-859`, `:950-953`). (2) **Canonical fold**: read transcript state from the server-scoped store surface (`useServerSync().session.data` / the `useSync()` Proxy) — never model on `event-reducer.ts`'s dead content branches. (3) **Resnapshot recovery**: on `server.connected`, re-derive from bootstrap + sync; never assume replay; drop `payload.type === "sync"` frames (produced by `event-v2-bridge.ts:45-61`). (4) **Two-key event API**: directory-keyed `useServerSDK().event` vs type-keyed `useSDK().event` — the live source subscribes through the existing wrappers, NEVER opens a second SSE stream. (5) Tolerate missing `directory` on `server.connected`/`server.heartbeat` (the `?? "global"` default is load-bearing). (6) Mount under (new-layout) or replicate (legacy) `ServerSyncProvider`; `event.start()` is lazy + idempotent.

### D5 — The kind-adapter table (Phase B, user-verified where gaps existed)
| Envelope kind | Live source |
|---|---|
| `text` | assistant/user text parts + summaries from message/part events (summarize-at-source per AGENT_INTEGRATION §4.1) |
| `spawn` | subagent/task part creation (delegation edges from parent linkage) |
| `cmd` | tool parts (shell/bash) — one-line summarized output; `exit != 0` red |
| `file` | file-touching tool parts (`stat`, ≤6-line salient hunk, full content for viewer) |
| `status` | `session.status` (incl. retry variant `{attempt,message,next,action?}`) + part lifecycle |
| `plan` | todo/plan events + plan-shaped tool parts |
| `fork` | **`question.asked` — single-question single-select ONLY** (N option cards); resolve via `client.question.reply` → `POST /question/{requestID}/reply`; other question shapes stay in the existing app question UI (user verdict) |
| `issue` | **adapter-SYNTHESIZED**: `session.error` events + failed `cmd` tool parts, heuristic open→resolved pairing; no backend change (user verdict) |
| `resource` | token/cost from message metadata where available; real values only — the sim's fake cost rate is deleted (AGENT_INTEGRATION "simulation-only artifacts") |
| `user_edit` (client→agent) | viewer edits stay **session-local + structured `promptAsync` notification** so the orchestrator can rebase; no new server surface (user verdict) |

Session targeting: `/agentic` accepts an optional session target (`?session=<id>`); defaults to the most recently active session; with none, the prompt bar creates one via the existing draft/new-session flow. (Implementer latitude delegated by the A-grade brief — recorded here as the binding default.)

### D6 — §12 flows as source-parameterized Playwright specs
`packages/app/e2e/agentic-terminal/` with a fixture that (Phase A) drives the sim deterministically — `autoplay:false` + keyboard stepping, no wall-clock dependence — and (Phase B) provisions a **real** `opencode serve --port <fixed>` + a controlled real session per INTEGRATION_MAP B12's recipe (`POST /session?directory=<scratch>` → deterministic `session.created/updated`; shell/command executions → message/part events; `DELETE /session/:id` cleanup). No `page.route` mocks, no `installSseTransport`, in either phase (the sim isn't a mock — it IS the Phase A product). Adapted definitions for the sim-transport items post-B: play/pause → pausing live-stream consumption; stepping/scrubber → scrubbing a recorded real-session replay buffer captured during the test; restart/auto-drain-per-step → their live equivalents (drain on orchestrator turn boundary = `session.status` idle transition).

### Reuse Decision Log (reuse-first-design)
| Proposed new thing | Ladder verdict | Justification (map citation) |
|---|---|---|
| `pages/agentic-terminal/` route folder | build-new (sanctioned) | No existing multi-agent surface exists (CODEBASE_MAP §3; ROUTE_MAP route census) — the capability is new by definition |
| Store/context pattern | reuse | `createStore` + `createSimpleContext` app conventions (CODEBASE_MAP §3.3) |
| Provider wiring (legacy mode) | reuse | `ResolvedDraftRoute` template `app.tsx:199-222` (ROUTE_MAP provider-nesting finding) |
| Data-provider pattern | compose | session-ui `DataProvider` *pattern* (CODEBASE_MAP §3.7); its `Data` type NOT adopted (narrower contract — D1) |
| Stream access | reuse | `useServerSDK().event` / `useSDK().event` wrappers (INTEGRATION_MAP B1/B3); second SSE stream forbidden |
| PTY/terminal rendering | not-applicable-yet | ghostty-web `components/terminal.tsx` reuse target IF a future need renders raw PTY in this surface; the designed transcript is not a PTY (recorded to prevent xterm.js reinvention) |
| Diff rendering | build-new (scoped) | design's diff cards are 6-line styled rows with exact colors; existing session-ui diff components are v2-token-bound — adapting them would violate the exact-hex mandate (DESIGN_MAP drift stance) |
| `@fontsource/jetbrains-mono` | new dependency | JetBrains Mono absent from app stack (DESIGN_MAP token verdict); OFL; bundled locally (desktop-friendly, no CDN dependency); compared against Google Fonts link (rejected: offline desktop embedding) |
| Playwright real-backend fixture | build-new (sanctioned) | All 58 existing specs mock in-browser (INTEGRATION_MAP B12) — no reusable real-backend harness exists; this change introduces it |

## Risks / Trade-offs

- **[Deterministic `question.asked` in Phase B tests]** No LLM-free trigger is documented. → Mitigation ladder: (1) trigger via a session flow that deterministically raises a question (investigate opencode plugin/test hooks first); (2) drive the fork UI directly against a hand-injected `question.asked` via the REAL store entry path (not a network mock) while asserting the reply POST against the real server; (3) if neither is honest, the fork-banner §12 item retains its Phase A certification + a live smoke of the reply endpoint, recorded explicitly in the coverage map. Task 5.4 resolves this before Phase B implementation ends.
- **[Legacy-mode providers double-mount]** A user navigating legacy `/agentic` after new-layout usage could double-start streams. → `event.start()` is idempotent (INTEGRATION_MAP contract 6); component owns no stream lifecycle beyond provider mount.
- **[Sim deletion breaking §12 re-target]** Deleting transport controls removes UI the flows drove. → D6's adapted-definition table is authored WITH the Phase A flows (same fixture interface), so re-targeting is a fixture swap, reviewed at the Phase B gate.
- **[Token drift vs upstream]** Fork-scoped `terminal-*` tokens never touch v2 theme files → upstream merges stay clean.
- **[JetBrains Mono weight]** ~3 weights add bundle size → route-scoped import; only loaded on `/agentic`.

## Migration Plan

No data migration. Rollout = merge to `dev` on the fork after Phase 8. Rollback = revert the merge commit (surface is self-contained; two one-line route registrations are the only shared-file touches).

## Open Questions

_(none — all four Phase B gaps were resolved at the Phase −1D domain gate and are recorded in D5; residual implementer latitude [exact file names, replay-buffer mechanics] is bounded by D1/D6)_

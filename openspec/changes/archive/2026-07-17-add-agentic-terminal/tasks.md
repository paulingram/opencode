# Tasks: add-agentic-terminal

## 1. Scaffolding, tokens, types (Phase A foundation)

- [x] 1.1 Create `packages/app/src/pages/agentic-terminal/` folder skeleton: `index.tsx` (route component shell), `types.ts` (the design event envelope `{id, ts, agent, kind, payload}` + kind payload types per AGENT_INTEGRATION §1 + agent registry type), `source.ts` (`TerminalEventSource` interface per design D1)
- [x] 1.2 Add `tokens.css` with the route-scoped `terminal-*` custom-property set — all 21 hexes from DESIGN_MAP exactly; wire into the route root only (surface spec: "Namespaced design tokens")
- [x] 1.3 Add JetBrains Mono (weights 400/500/700) bundled via the sanctioned font dependency, imported route-scoped; verify it resolves as rendered font (surface spec typography scenario)
- [x] 1.4 Implement `store.ts`: the phase-agnostic projection store (agents, transcript items, plan tree, issues, files registry, queue, fork state, resources, session status) + the event-fold reducer consuming envelopes — transport-free per design D1

## 2. Phase A simulation source

- [x] 2.1 Port the prototype constants (`AG/ST/TASK/EV/PLAN/ISSUES/FILES`, `VARY` narration variants, positions) verbatim into `sim/script.ts` (simulation spec: scripted parity)
- [x] 2.2 Implement `sim/sim-source.ts`: tick timer (`speedMs`, live-reapply), play/pause/step/scrubber-jump/restart transport, fork hold at step 6, §10 metric formulas, queue auto-drain hook (1/tick while playing; holds on pause/fork/complete) (simulation spec: transport and metrics)
- [x] 2.3 Wire tweakable props `speedMs`/`autoplay`/`showCost` through the route component (simulation spec: tweakable props)

## 3. Phase A panels (parallel after group 1)

- [x] 3.1 Topbar: brand, ellipsizing session title, branch chip, derived status chip, 13-tick scrubber (click-to-jump-and-pause, past/current/future colors), play/pause + restart buttons, MC/TUI toggle (surface + interaction scrubber requirements)
- [x] 3.2 Agent rail: tree rows (glyph/color/pulse per status table, name, live task line, tokens, cost), "all activity" row with event count, click-to-filter; FILES list (icon by lang, path, stat/modified); RESOURCES block (tokens/cost/elapsed/context bar) (surface + interaction filtering)
- [x] 3.3 Transcript feed: per-kind rendering (text, ◆ spawn, cmd card with red-on-nonzero-exit, file diff card ≤6 lines with exact diff colors + sticky ✎ header opening the viewer), timestamps, autoscroll-when-pinned, blinking cursor row; filter chip (interaction filtering)
- [x] 3.4 Fork banner: conditional purple banner with N option cards (tradeoff notes), "click, or press 1 / 2" hint, three resolution paths wired (banner click, keypress, plan-tab row), rejected-branch strikethrough + narration variance + auto-resume (interaction fork protocol)
- [x] 3.5 Right panel: plan/issues/flow tabs — plan tree (glyph states, indent, by-notes, done/total counter, clickable ⑂ option rows), issue cards (state chip open/fixing/resolved, border tracking, ↳ resolution line, unresolved-only badge, empty state), flow SVG (nodes with status color, solid delegation edges + status stroke + done-dim, dashed handoff edges, legend) (interaction tabs requirement)
- [x] 3.6 File viewer overlay: geometry (640px/max 84vw/top 46/z20), md styled rendering + code with line numbers/dimmed comments/x-scroll, edit/save/revert cycle with modified badges, ✕ + esc close, footer hint; edits survive restart (interaction viewer requirement)
- [x] 3.7 Prompt bar + queue strip: ❯ input with placeholder + hotkey hints, enter/shift+enter/`|` chunk semantics, + queue button, numbered chips with #fab283 next-up outline, per-chip ✕, clear, send next ↑, auto-drain wiring (interaction prompt/queue requirement)
- [x] 3.8 TUI mode: character-grid projection (header, agent block, last-15 transcript with truncation rules, issues/plan footer, ❯ cursor line), sharing the store; single-spaced lines (surface TUI requirement)
- [x] 3.9 Hotkey layer: window keydown with input/textarea guard (esc exception), space/←→/v/1-2/esc bindings, fork-locks-→ (interaction keyboard contract)

## 4. Phase A route registration

- [x] 4.1 Register `/agentic` in the new-layout Routes fork as a NewHome sibling (app.tsx:595-599) (surface both-modes requirement)
- [x] 4.2 Register `/agentic` in the legacy fork with its own ServerSDKProvider→ServerSyncProvider pair per the ResolvedDraftRoute template (app.tsx:199-222); verify no provider throw in legacy (surface both-modes requirement)

## 5. Phase A §12 gate (blocks Phase B)

- [x] 5.1 Build the e2e fixture at `packages/app/e2e/agentic-terminal/fixture.ts`: mounts `/agentic` with `autoplay:false`, deterministic keyboard stepping, a source-abstraction seam the Phase B fixture will re-implement (design D6); NO network mocks
- [x] 5.2 Author the 8 §12 checklist items as Playwright specs (one item ↔ one spec minimum): console-clean load + fonts + tokens; no h-scrollbars ≥900px + rail scroll; topbar no-wrap; TUI single-spacing + diff/viewer x-scroll with sticky header; fork blocks →/auto-advance/auto-drain + 3 resolution paths + taken-vs-rejected; queue chunk/chips/drain-1-per-step/manual/clear/survives-restart; viewer md+code+edit-save-modified-revert+esc; hotkey guard
- [x] 5.3 Run the full §12 suite green + packages/app unit/browser/e2e suites green; capture traces (PHASE A GATE — coverage map milestone)
- [x] 5.4 Investigate the deterministic `question.asked` trigger for Phase B (design risk #1 mitigation ladder): document the chosen honest path in the change folder before Phase B test authoring starts

## 6. Phase B live source and adapters

- [x] 6.1 Implement `live/live-source.ts`: attach via the existing stream wrappers under ServerSyncProvider; load-before-listen (session.sync first); resnapshot on server.connected; sync-frame drop; missing-directory tolerance; idempotent start (live spec: stream wrappers requirement)
- [x] 6.2 Implement `live/adapters.ts`: kind adapters per design D5 (text/spawn/cmd/file/status/plan/resource), summarize-at-source, §6 fixed/derived/supplied string discipline (live spec: kind adapters)
- [x] 6.3 Fork adapter: single-question single-select `question.asked` → banner cards; resolution via client.question.reply; non-conforming questions bypass (live spec: fork requirement)
- [x] 6.4 Issue synthesis adapter: session.error + failed cmd parts → open/fixing/resolved heuristic pairing (live spec: issues requirement)
- [x] 6.5 user_edit: viewer save → session-local + structured promptAsync notification (live spec: viewer edits requirement)
- [x] 6.6 Session targeting: `?session=<id>` param, most-recently-active default, create-on-prompt fallback (live spec: session targeting)
- [x] 6.7 Live transport affordances: stream-consumption pause control + recorded-session replay buffer (the adapted-definition carriers for the §12 re-target, design D6)

## 7. Phase B sim removal and re-target (after 6.x complete)

- [x] 7.1 Delete `sim/` entirely + transport-only UI (autoplay timer, speed tweak, restart, fake cost rate, step-derived timestamps, canned queue acknowledgment); verify grep-clean per the live spec's no-sim-code scenario
- [x] 7.2 Build the Phase B e2e fixture: real `opencode serve --port <fixed>` lifecycle, controlled real sessions (POST /session → shell/command activity → DELETE cleanup), no mocks (live spec: re-target requirement; INTEGRATION_MAP B12 recipe)
- [x] 7.3 Re-target all 8 §12 specs at the live surface under the D6 adapted definitions; all green with traces; no-mock audit passes
- [x] 7.4 Live-specific scenario specs green: load-before-listen, reconnect resnapshot, fork single-select + bypass, issue synthesis, user_edit prompt notification, session targeting

## 8. Suites, polish, docs

- [x] 8.1 Unit tests for the fold reducer, adapters (incl. fork-shape gating + issue pairing heuristics), and chunk-splitting/queue logic
- [x] 8.2 Full `packages/app` unit + browser + e2e suites green at completion
- [x] 8.3 Update docs maps (CODEBASE_MAP/ROUTE_MAP/DESIGN_MAP/INTERACTION_INTUITION_MAP entries for the shipped surface) — feeds the Phase 8 documentation-currency gate

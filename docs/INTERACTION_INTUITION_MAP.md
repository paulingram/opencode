---
last_intuited: 2026-07-17T05:25:14Z
confirmed: true
confirmed_at: 2026-07-16T14:44:33Z
producer: interaction-intuiter
inputs:
  - docs/ROUTE_MAP.md
  - docs/DESIGN_MAP.md
  - docs/INTEGRATION_MAP.md
  - .architect-team/claude-design/a1e9856f-717c-4388-9950-b34ccaf515ab/Agentic Terminal.dc.html
  - .architect-team/claude-design/a1e9856f-717c-4388-9950-b34ccaf515ab/Development Guidance.dc.html
  - .architect-team/claude-design/a1e9856f-717c-4388-9950-b34ccaf515ab/AGENT_INTEGRATION.md
  - opencode/.architect-team/refined-prompts/opencode-design-import-dev-guidance-20260716.md
covers_screens: 6
covers_elements: 33
confidence_summary: { high: 29, medium: 4, low: 0, unknown: 0 }
---

# Agentic Terminal — Interaction Intuition Map

**Scope of this run:** ONE shipped surface — the Agentic Terminal, an always-on `/agentic` route
registered in both app layout modes. Existing app routes are unchanged by this run and are NOT
re-intuited here.

**Two-phase structure.** Every entry records BOTH behaviors because the run ships in two phases
(refined prompt, Scope-in):

- `phase_a_behavior` — the spec-faithful prototype: a scripted 13-step client-side simulation
  (state machine verified in the prototype's logic class, `Agentic Terminal.dc.html:410-624`).
- `phase_b_behavior` — the live equivalent per `AGENT_INTEGRATION.md` + INTEGRATION_MAP's
  "Wiring a new live event-consuming surface". After Phase B the simulation is REMOVED ENTIRELY
  (no sim mode survives), so Phase B behavior is the end-state contract.

`candidate_endpoints` lists Phase B endpoints (Phase A is 100% client-side by design — the
guidance §1 explicitly scopes out real SDK wiring for the prototype).

**Design precision note:** the prototype is an executable behavioral oracle — every interactive
element's handler was read directly from its logic class, and the guidance doc §4-§9 states the
interaction contract in prose. Confidence is accordingly high almost everywhere; the four
`medium` items are genuine Phase B mapping gaps, not visual ambiguity.

**Bulk-verify gate (Phase −1D, 2026-07-16):** the user answered all four flagged items — Q1
(route registration) CORRECTED to both-modes; Q2 (fork mapping), Q3 (issue synthesis), and Q4
(user_edit carrier) CONFIRMED. All 29 high-confidence entries auto-confirmed per the gate's
standing rule (nothing else was flagged). Verdicts recorded per entry below.

**Implementation outcome (2026-07-17): 33/33 confirmed interactions shipped and gate-verified.** The
same Mission Control/TUI panels now run exclusively on `LiveSessionSource`; Phase A simulation code is
absent. Unit coverage exercises the transport-free fold, guarded controls, adapters, replay, prompt
serialization, and queue boundaries. The complete live Agentic Terminal Playwright set exercises the
visible §12 flows and live integration against real `opencode serve` plus deterministic
`TestLLMServer`, with no app-traffic mocks. The four decisions landed exactly as confirmed:

1. `/agentic` is registered in **both** layouts; new layout inherits its server providers and legacy
   layout mounts `ServerKey → ServerSDKProvider → ServerSyncProvider` around the identical surface.
2. Only a built-in Prompt-shaped request with exactly one single-select, non-custom question and at
   least two choices opens the fork UI; multi-question, multi-select, custom/free-text, and
   underspecified requests bypass it, while resolution uses `question.reply`.
3. Issues remain client-side projections: `session.error` and failed shell command parts open them;
   exact normalized successful reruns produce fixing then resolved; unmatched failures remain visible.
4. Viewer saves remain session-local and additionally send a bounded structured `<user_edit>` message
   through `session.promptAsync`; no server/schema/SDK surface was added.

---

## Phase B wiring notes (non-element contracts the entries reference)

These are behaviors, not clickable elements; recorded here so entries can cite them.

1. **Adapter architecture.** Every panel is a projection of ONE ordered event stream with
   envelope `{id, ts, agent, kind, payload}`, kinds `text|spawn|cmd|file|status|plan|issue|fork|resource`
   (AGENT_INTEGRATION §1). opencode emits none of these verbatim: Phase B requires a client-side
   adapter folding opencode's SSE events (`/global/event`, INTEGRATION_MAP B1) into that envelope.
   Grounded kind mappings against `packages/schema/src` (verified 2026-07-16):
   - `text` ← `message.updated` / `message.part.updated` / `message.part.delta` (text parts) —
     v1/session.ts:596-641; fold semantics MUST copy `server-session.ts:739-1046` (Wiring §2).
   - `spawn` ← `session.created` with `Session.Info.parentID` set (v1/session.ts:550; lineage
     precedent `createSessionLineage`, app.tsx:141-144); agent registry ← child-session tree +
     `sdk.app.agents` (bootstrap.ts:190).
   - `cmd` ← tool-execution message parts (bash tool) — part snapshots via `message.part.updated`.
   - `file` ← file-tool parts + `session.diff` `{sessionID, diff: FileDiff.Info[]}` (v1/session.ts:643-649).
   - `status` ← `session.status` `{idle|busy|retry}` (session-status-event.ts:9-41). NOTE: the
     design's 7-glyph vocabulary (idle/think/work/wait/error/done/fork) is richer than opencode's
     3 statuses — think/work/wait/error must be derived from part-level activity (reasoning parts,
     running tools, retry status, `session.error`). Adapter design detail, implementer latitude.
   - `plan` ← `todo.updated` (session-todo.ts:19). NOTE: opencode todos are a FLAT list snapshot
     (no `parent`, no `reject` op); the design's tree indent + rejected-branch record are
     adapter-derived (reject from fork resolution, see element 10). Known reduction, not a gate item.
   - `issue` ← **no opencode equivalent exists** — was ambiguity Q3 (element 16); GATE-RESOLVED:
     adapter-synthesized client-side from `session.error` + failed cmd tool parts, no backend change.
   - `fork` ← **`question.asked` is the structural equivalent** — was ambiguity Q2 (element 10);
     GATE-RESOLVED: only single-question single-select requests render as the fork banner.
   - `resource` ← assistant-message `cost`/`tokens` fields (v1/session.ts:461-472; session totals
     :550-553) summed per agent-session; real `ts` from event/message time replaces step formulas.
2. **Stream mount.** The route must sit under (or replicate) `ServerSyncProvider` — never open a
   second SSE stream (INTEGRATION_MAP Wiring §6). New-layout sibling of `NewHome`
   (app.tsx:595-599) gets the stream + stores free; legacy mode needs its own provider pair
   (`ResolvedDraftRoute` template, app.tsx:199-222). GATE-RESOLVED (Q1, element 1): the route
   registers in BOTH layout modes.
3. **Load-before-listen.** Transcript state will silently stay empty unless the surface pages the
   watched session in via `session.sync(sessionID)` before relying on part events
   (`server-session.ts:849-859, 950-953, 692-715`; INTEGRATION_MAP Wiring §1).
4. **Queue drain hook.** Phase A drains exactly 1 chip per simulation tick while playing
   (prototype `tick()`, line 432-438). Phase B: "step" = orchestrator turn boundary
   (AGENT_INTEGRATION §4.2); the drain trigger is the watched session's `session.status`
   transition to `{type:"idle"}` (type-keyed subscription per INTEGRATION_MAP B3), dispatching the
   head chip via `client.session.promptAsync`. Drain holds while paused (client consumption
   paused), while a fork/question is unresolved, and after completion; manual `send next ↑`
   always works (guidance §5).
5. **Simulation deletions.** Post-Phase-B the following are removed entirely (AGENT_INTEGRATION
   "Simulation-only artifacts"; refined prompt "Simulation end-state"): scrubber step-jump/replay
   sim, autoplay timer + `speedMs` tweak, `restart`, cost formula `tokens × 0.000015`,
   step-derived timestamps, canned queue acknowledgment ("Noted — folding that into the active
   plan.", prototype:442,546 — MUST become a real orchestrator `text` event). §12 items that
   exercised deleted transport adapt: play/pause → pausing live-stream consumption; stepping →
   scrubbing a recorded real-session replay (refined prompt, iteration-2 fold).
6. **TUI view** has no interactive elements of its own — it is a monospace projection of the same
   state (prototype:219-225 contains no onClick; the ` ❯ ▊` prompt line is decorative — real
   input is the persistent prompt bar). Topbar + prompt bar + viewer overlay persist around it.
7. **Display-only dynamic values** (not elements, no actions): topbar session title / branch chip /
   status chip / step label, rail RESOURCES footer (tokens/cost/elapsed/context bar), feed
   timestamps, tab counters, queue chip numbering, TUI lines. All class-B derived or class-C
   agent-supplied per AGENT_INTEGRATION §6; sources per DESIGN_MAP per-screen specs.

---

## Elements

### 1. The route / page itself

```yaml
element_id: agentic__route__agentic-terminal__0
route: /agentic
element_label: "Agentic Terminal (surface entry)"
element_kind: link
design_source: docs/DESIGN_MAP.md#coverage--gaps (agentic-terminal-surface-entry)
intuited_action: >
  Navigating to /agentic renders the Agentic Terminal mission-control surface (always-on, no
  feature flag); the page displays the multi-agent session view fed by the simulation (Phase A)
  or the live event stream (Phase B).
phase_a_behavior: >
  Route mounts the prototype-faithful component; scripted 13-step simulation starts per
  autoplay/speedMs props (guidance §10-§11); all state is client-local.
phase_b_behavior: >
  Route is registered in both layout modes under ServerSyncProvider; consumes the wrapper-owned
  /global/event stream through useServerSDK()/useServerSync(), hydrates the selected session tree
  and canonical companion state before directory subscription (load-before-listen), and projects
  every panel from the adapted live stream (wiring note 1).
candidate_endpoints:
  - { method: GET, path: /global/event (SSE), source: INTEGRATION_MAP.md#b1, match_kind: plausible-by-design-intent }
  - { method: GET, path: "/session/:id/message", source: INTEGRATION_MAP.md#b2 (session.messages), match_kind: plausible-by-design-intent }
confidence: medium
evidence:
  - "refined prompt Scope-in: 'new ALWAYS-ON top-level route (e.g. /agentic; final path is implementer latitude) added to the Routes tree at packages/app/src/app.tsx:572-603. No feature flag.'"
  - "ROUTE_MAP.md 'Provider Nesting' finding: new-layout sibling gets stream+stores free; legacy-mode sibling gets NO providers (app.tsx:553) — always-on-in-both-modes requires nesting under LegacyServerLayout or own provider pair (ResolvedDraftRoute template, app.tsx:199-222)"
  - "DESIGN_MAP.md Coverage & Gaps: unknown_mount_route (escalate: true, path since delegated to implementer) + legacy_layout_variant (escalate: false, recommends new-layout-only)"
ambiguity_question: >
  Should /agentic be registered in the new-layout Routes fork ONLY (DESIGN_MAP's recommendation —
  in legacy layout the route simply does not exist and navigating to /agentic matches nothing), or
  in BOTH layout modes (requires mounting its own ServerSDKProvider→ServerSyncProvider pair for
  legacy mode, per the ResolvedDraftRoute template at app.tsx:199-222)? The requirement's
  "always-on" resolved feature-flagging, not layout-mode registration; the design targets the
  v2/new-layout idiom.
user_verdict: corrected
correction_note: >
  user chose both-modes over the DESIGN_MAP new-layout-only recommendation — truly always
  reachable regardless of the design-system setting.
confirmed_action: >
  Register /agentic in BOTH layout modes — new-layout Routes fork as NewHome sibling (free
  stream + v2 shell) AND legacy mode with its own ServerSDKProvider→ServerSyncProvider pair per
  the ResolvedDraftRoute template (app.tsx:199-222).
confirmed_endpoint: "GET /global/event (SSE)"
superseded_by: null
```

### Top bar

```yaml
element_id: agentic__topbar__scrubber-tick__0
route: /agentic
element_label: "(scrubber tick — ×13, title 'step {i}')"
element_kind: button
design_source: "Agentic Terminal.dc.html#L32-L34 (sc-for ticks); docs/DESIGN_MAP.md#per-screen-visual-specs (topbar-scrubber)"
intuited_action: >
  Clicking a tick jumps the session view to that step and pauses playback; past ticks render
  #4a5c50, current #fab283, future #282828.
phase_a_behavior: >
  setState({step: i, playing: false}) (prototype:529). All panels re-derive for the target step.
phase_b_behavior: >
  Sim step-jump is a deleted simulation artifact; adapted equivalent (locked by refined prompt
  iteration 2): scrub a recorded replay of the ingested real-session event log — client-side
  re-projection of the stream up to checkpoint i; ticks map to checkpoints (plan-node completions
  / fork points / orchestrator turn boundaries, AGENT_INTEGRATION §3 top bar + §4.2), not raw
  events. No endpoint; replay via stream re-ingestion is idempotent per AGENT_INTEGRATION §4.5.
candidate_endpoints: []
confidence: high
evidence:
  - "prototype:529 — ticks:Array.from({length:13},(_,i)=>({…go:()=>this.setState({step:i,playing:false})}))"
  - "guidance §4 — 'click scrubber tick: jump to that step and pause'"
  - "AGENT_INTEGRATION 'Simulation-only artifacts' — scrubber step-jump/replay deleted; live replay via stream re-ingestion"
  - "refined prompt Testing: 'stepping → scrubbing a recorded real-session replay'"
ambiguity_question: null
user_verdict: confirmed
correction_note: null
confirmed_action: >
  Clicking a tick jumps the session view to that step and pauses playback; past ticks render
  #4a5c50, current #fab283, future #282828.
confirmed_endpoint: null
superseded_by: null
```

```yaml
element_id: agentic__topbar__play-pause__1
route: /agentic
element_label: "⏸ pause / ▶ play (label derived)"
element_kind: button
design_source: "Agentic Terminal.dc.html#L37; docs/DESIGN_MAP.md#per-screen-visual-specs (topbar-play)"
intuited_action: >
  Toggles playback: pauses/resumes advancement of the session view; the topbar status chip flips
  between "▶ live" and "⏸ paused"; auto-drain of the prompt queue holds while paused.
phase_a_behavior: >
  setState(playing: !playing) (prototype:531); the simulation timer keeps ticking but tick()
  no-ops while !playing (prototype:433). Hotkey equivalent: space.
phase_b_behavior: >
  Adapted equivalent (locked by refined prompt): pause/resume LIVE-STREAM CONSUMPTION — the SSE
  connection stays open (never open/close a second stream, INTEGRATION_MAP Wiring §6); incoming
  adapter events buffer while paused and flush on resume. Session keeps running server-side;
  queue auto-drain holds while paused (wiring note 4).
candidate_endpoints: []
confidence: high
evidence:
  - "prototype:37,530-531 — togglePlay + playLabel:playing?'⏸ pause':'▶ play'"
  - "guidance §4 space row; §5 auto-drain holds while paused"
  - "refined prompt Testing: 'play/pause → pausing live-stream consumption'"
ambiguity_question: null
user_verdict: confirmed
correction_note: null
confirmed_action: >
  Toggles playback: pauses/resumes advancement of the session view; the topbar status chip flips
  between "▶ live" and "⏸ paused"; auto-drain of the prompt queue holds while paused.
confirmed_endpoint: null
superseded_by: null
```

```yaml
element_id: agentic__topbar__restart__2
route: /agentic
element_label: "restart"
element_kind: button
design_source: "Agentic Terminal.dc.html#L38; docs/DESIGN_MAP.md#per-screen-visual-specs (topbar-restart)"
intuited_action: >
  Replays the simulation from step 0: resets step, fork choice, sent messages, and agent filter,
  then resumes playing — while PRESERVING the prompt queue, session-local file edits, view mode,
  and active tab (drafts survive a replay).
phase_a_behavior: >
  setState({step:0, choice:null, sent:[], playing:true, sel:"all"}) (prototype:532) — queue,
  fileEdits, view, tab intentionally untouched (guidance §10).
phase_b_behavior: >
  ELEMENT DELETED — restart is a named simulation-only artifact (AGENT_INTEGRATION; refined
  prompt "Simulation end-state"). No live equivalent ships; the button is removed with the sim.
candidate_endpoints: []
confidence: high
evidence:
  - "prototype:532 — restart handler"
  - "guidance §10 — 'restart resets step, fork choice, sent messages, and filter… preserves the prompt queue, file edits, view, and tab'"
  - "AGENT_INTEGRATION 'Simulation-only artifacts' — restart listed; refined prompt Scope-in: 'restart' in the deleted list"
ambiguity_question: null
user_verdict: confirmed
correction_note: null
confirmed_action: >
  Replays the simulation from step 0: resets step, fork choice, sent messages, and agent filter,
  then resumes playing — while PRESERVING the prompt queue, session-local file edits, view mode,
  and active tab (drafts survive a replay). Phase A only; the element is deleted with the sim in
  Phase B.
confirmed_endpoint: null
superseded_by: null
```

```yaml
element_id: agentic__topbar__view-mission-control__3
route: /agentic
element_label: "mission control"
element_kind: button
design_source: "Agentic Terminal.dc.html#L40; docs/DESIGN_MAP.md#per-screen-visual-specs (topbar-view-toggle)"
intuited_action: >
  Switches the main region to the Mission Control three-column view (rail / transcript / right
  panel); active segment gets bg #282828 + #eeeeee text. State is shared with TUI view.
phase_a_behavior: "setState({view:'mission'}) (prototype:525). Hotkey equivalent: v toggles."
phase_b_behavior: "Identical — pure client view state in both phases (same stream, two projections; AGENT_INTEGRATION §3 TUI rule)."
candidate_endpoints: []
confidence: high
evidence:
  - "prototype:40,525-527 — setMission + active-segment styling"
  - "guidance §4 — v toggles Mission Control ↔ TUI"
ambiguity_question: null
user_verdict: confirmed
correction_note: null
confirmed_action: >
  Switches the main region to the Mission Control three-column view (rail / transcript / right
  panel); active segment gets bg #282828 + #eeeeee text. State is shared with TUI view.
confirmed_endpoint: null
superseded_by: null
```

```yaml
element_id: agentic__topbar__view-tui__4
route: /agentic
element_label: "tui"
element_kind: button
design_source: "Agentic Terminal.dc.html#L41; docs/DESIGN_MAP.md#per-screen-visual-specs (topbar-view-toggle)"
intuited_action: >
  Switches the main region to the TUI character-grid view (header, agents block, last 15
  transcript lines, issues/plan footer, prompt line) sharing ALL state with Mission Control;
  topbar and prompt bar persist.
phase_a_behavior: "setState({view:'tui'}) (prototype:525); buildTui() renders the projection (prototype:594-623)."
phase_b_behavior: "Identical — client view state; TUI is a projection of the same adapter stream, no extra data (AGENT_INTEGRATION §3)."
candidate_endpoints: []
confidence: high
evidence:
  - "prototype:41,525-527,594-623"
  - "guidance §3 — TUI mode replaces the grid; topbar and prompt bar persist"
ambiguity_question: null
user_verdict: confirmed
correction_note: null
confirmed_action: >
  Switches the main region to the TUI character-grid view (header, agents block, last 15
  transcript lines, issues/plan footer, prompt line) sharing ALL state with Mission Control;
  topbar and prompt bar persist.
confirmed_endpoint: null
superseded_by: null
```

### Left rail

```yaml
element_id: agentic__rail__all-activity__0
route: /agentic
element_label: "◎ all activity · {N} events"
element_kind: button
design_source: "Agentic Terminal.dc.html#L50-L53; docs/DESIGN_MAP.md#per-screen-visual-specs (rail-all-activity)"
intuited_action: >
  Clears any agent filter — the transcript returns to showing all agents' events; the row shows
  selected styling (bg #1e1e1e + border-left 2px #eeeeee) when no filter is active.
phase_a_behavior: "setState({sel:'all'}) (prototype:534); filter chip disappears; feed unfilters."
phase_b_behavior: >
  Identical — filtering is client-side by contract (AGENT_INTEGRATION §3: "filtering is
  client-side; do not send per-agent feeds"). Event count is derived from the adapter stream.
candidate_endpoints: []
confidence: high
evidence:
  - "prototype:50,534-535 — selectAll + allBg/allBar selected styling"
  - "guidance §4 — 'click again, the ✕ chip, or \"all activity\" to clear'"
  - "AGENT_INTEGRATION §3 agent rail — filtering is client-side"
ambiguity_question: null
user_verdict: confirmed
correction_note: null
confirmed_action: >
  Clears any agent filter — the transcript returns to showing all agents' events; the row shows
  selected styling (bg #1e1e1e + border-left 2px #eeeeee) when no filter is active.
confirmed_endpoint: null
superseded_by: null
```

```yaml
element_id: agentic__rail__agent-row__1
route: /agentic
element_label: "(agent row — ×5 in sim: orchestrator/explorer/coder-1/coder-2/reviewer; ×N live)"
element_kind: button
design_source: "Agentic Terminal.dc.html#L54-L68; docs/DESIGN_MAP.md#per-screen-visual-specs (rail-agent-row)"
intuited_action: >
  Toggles a transcript drill-in filter to that agent: click filters the feed to the agent's
  events (row gets bg #1e1e1e + border-left 2px in agent color; a removable filter chip appears
  above the feed); clicking the same row again clears the filter.
phase_a_behavior: >
  select:()=>setState(sel: sel===a.id?'all':a.id) (prototype:473); visibleEvents() filters by
  e.ag===sel (prototype:453).
phase_b_behavior: >
  Identical client-side filter over the adapter stream (AGENT_INTEGRATION §3). Row EXISTENCE is
  live-derived: one row per registered agent — opencode mapping: root session + child sessions
  via Session.Info.parentID (schema v1/session.ts:550; lineage precedent app.tsx:141-144), glyph
  from derived status, task from status events, tokens/cost from per-message cost/tokens fields
  (wiring note 1).
candidate_endpoints: []
confidence: high
evidence:
  - "prototype:55,467-473 — onClick {{a.select}}, toggle semantics"
  - "guidance §4 — 'click agent row: filter transcript to that agent (drill-in); click again… to clear'"
  - "AGENT_INTEGRATION §2 agent registry + §3 agent rail"
ambiguity_question: null
user_verdict: confirmed
correction_note: null
confirmed_action: >
  Toggles a transcript drill-in filter to that agent: click filters the feed to the agent's
  events (row gets bg #1e1e1e + border-left 2px in agent color; a removable filter chip appears
  above the feed); clicking the same row again clears the filter.
confirmed_endpoint: null
superseded_by: null
```

```yaml
element_id: agentic__rail__file-row__2
route: /agentic
element_label: "(FILES rail entry — ✎/▤ {path} {stat|modified}, ×N touched files)"
element_kind: modal-trigger
design_source: "Agentic Terminal.dc.html#L70-L78; docs/DESIGN_MAP.md#per-screen-visual-specs (rail-file-row)"
intuited_action: >
  Opens the 640px file-viewer overlay showing that file's latest content (markdown styled or
  code with line numbers), in read mode; the row's stat shows "modified" in #e5c07b when a
  session-local edit exists.
phase_a_behavior: >
  open:()=>setState({openFile:p, editing:false}) (prototype:558); files list = FILES paths with
  at<=step (prototype:554); content = fileEdits[p] ?? canonical (prototype:566).
phase_b_behavior: >
  Same client-side overlay open. Row existence + content are live-derived: first `file` event for
  a path registers it in the rail (AGENT_INTEGRATION §1 file kind); viewer shows the latest
  file.content from the stream (adapter: file-tool parts / session.diff). GET /file/content is a
  plausible fallback for canonical on-disk content when the stream carried none.
candidate_endpoints:
  - { method: GET, path: /file/content, source: "packages/sdk/js/src/v2/gen/sdk.gen.ts:1888", match_kind: plausible-by-design-intent }
confidence: high
evidence:
  - "prototype:72,554-558 — onClick {{f.open}} → openFile state"
  - "guidance §9 — 'Entry points: the rail's FILES list… and the ✎ path ↗ header on any diff block'"
  - "AGENT_INTEGRATION §1 file — 'First event for a path also registers it in the FILES rail'; §3 FILES rail + power viewer"
ambiguity_question: null
user_verdict: confirmed
correction_note: null
confirmed_action: >
  Opens the 640px file-viewer overlay showing that file's latest content (markdown styled or
  code with line numbers), in read mode; the row's stat shows "modified" in #e5c07b when a
  session-local edit exists.
confirmed_endpoint: "GET /file/content (fallback for canonical content)"
superseded_by: null
```

### Center transcript

```yaml
element_id: agentic__transcript__fork-banner__0
route: /agentic
element_label: "decision fork — {fork.prompt} (conditional banner)"
element_kind: conditional-render-gate
design_source: "Agentic Terminal.dc.html#L91-L110; docs/DESIGN_MAP.md#per-screen-visual-specs (fork-banner)"
intuited_action: >
  Renders (purple-bordered, pulsing ⑂) whenever a decision fork is open; while open it PAUSES the
  session: topbar shows "⑂ awaiting decision", the orchestrator's glyph switches to ⑂, → stepping
  is locked, and queue auto-drain holds — until resolved by one of three equivalent paths (option
  card click, keys 1/2, plan-tab ⑂ row).
phase_a_behavior: >
  forkActive = step===6 && !choice (prototype:459); tick() returns null while forkActive
  (prototype:434); ArrowRight locked (prototype:423).
phase_b_behavior: >
  Renders on the adapter's `fork` kind with op:"open" (AGENT_INTEGRATION §1); forks block,
  questions don't (§4.4). opencode's structural equivalent is the `question.asked` event —
  {id, sessionID, questions:[{question, header, options:[{label, description}], multiple?}]}
  (packages/schema/src/v1/question.ts:35-58; also question.v2.* at question.ts:70-80) — which
  blocks the asking agent's tool call until replied/rejected. Resolution via
  POST /question/{requestID}/reply. See ambiguity question: the mapping is near-exact but the
  banner's 2-card single-select layout cannot express everything question.asked allows.
candidate_endpoints:
  - { method: POST, path: "/question/{requestID}/reply", source: "packages/sdk/js/src/v2/gen/sdk.gen.ts:3041", match_kind: exact-by-action-noun }
  - { method: POST, path: "/question/{requestID}/reject", source: "packages/sdk/js/src/v2/gen/sdk.gen.ts:3078", match_kind: plausible-by-design-intent }
confidence: medium
evidence:
  - "prototype:91-110,459 — sc-if {{forkActive}}; guidance §6 fork protocol"
  - "AGENT_INTEGRATION §1 fork kind + §4.4 'Forks block, questions don't'"
  - "packages/schema/src/v1/question.ts:15-60 — Option{label,description}, Request{questions[],tool?}, Replied{answers}; sdk.gen.ts:3041,3078 — reply/reject endpoints"
  - "INTEGRATION_MAP.md#b5 — question.* present in SDK Event union but NOT handled by the app's reducers yet; DESIGN_MAP gap: fork layout for 3+ options unspecified (escalate: true)"
ambiguity_question: >
  AGENT_INTEGRATION defines kind "fork" but opencode has no fork event; the structural equivalent
  is `question.asked` (options carry label+description ≈ the card's label+tradeoff-note, reply via
  POST /question/{requestID}/reply). Should Phase B render EVERY question.asked on the watched
  session as the fork banner — including multi-question requests, multiple:true multi-select, and
  custom free-text answers, which the two-card single-select banner cannot express — or only
  single-question single-select requests (others handled by the app's existing question UI), or
  should the run define a dedicated fork event server-side? Note: permission.asked is a distinct
  blocking event with its own app-wide prompt UI (context/permission.tsx:322) and presumably does
  NOT render as a fork.
user_verdict: confirmed
correction_note: null
confirmed_action: >
  Phase B renders ONLY single-question single-select question.asked events as the fork banner
  (N option cards); multi-question, multiple:true multi-select, and free-text requests stay in
  the app's existing question UI.
confirmed_endpoint: "client.question.reply → POST /question/{requestID}/reply"
superseded_by: null
```

```yaml
element_id: agentic__transcript__fork-option-card__1
route: /agentic
element_label: "{key} · {label} + tradeoff note (×2 option cards)"
element_kind: button
design_source: "Agentic Terminal.dc.html#L100-L107; docs/DESIGN_MAP.md#per-screen-visual-specs (fork-banner option cards)"
intuited_action: >
  Resolves the open decision fork with that option: the chosen plan branch becomes active→done,
  the other is struck through as "rejected at fork", the orchestrator's next narration varies by
  choice, and playback resumes automatically at the next step.
phase_a_behavior: >
  pickMocks/pickFixture → choose(f): setState({choice:f, step:7, playing:true}) (prototype:447,537);
  VARY narration keyed by choice (prototype:322,332,451).
phase_b_behavior: >
  Sends the chosen option as the fork resolution — adapter emits {op:"resolve", choice} upstream
  (AGENT_INTEGRATION §1 fork); opencode mapping: client.question.reply →
  POST /question/{requestID}/reply with answers=[[chosen option label]] (schema Reply,
  v1/question.ts:42-46). The blocked agent resumes; consequent narration/plan updates arrive as
  real stream events. Which live events count as forks is element 10's question; the resolution
  call itself is unambiguous.
candidate_endpoints:
  - { method: POST, path: "/question/{requestID}/reply", source: "packages/sdk/js/src/v2/gen/sdk.gen.ts:3041", match_kind: exact-by-action-noun }
confidence: high
evidence:
  - "prototype:100-107,447,537 — onClick {{pickMocks}}/{{pickFixture}} → choose()"
  - "guidance §6 — three equivalent resolutions; chosen active→done, other rejected, narration varies, playback resumes"
  - "AGENT_INTEGRATION §1 fork — user reply comes back as {op:'resolve', choice}"
  - "sdk.gen.ts:3014-3041 — 'Reply to question request… Provide answers to a question request from the AI assistant.'"
ambiguity_question: null
user_verdict: confirmed
correction_note: null
confirmed_action: >
  Resolves the open decision fork with that option: the chosen plan branch becomes active→done,
  the other is struck through as "rejected at fork", the orchestrator's next narration varies by
  choice, and playback resumes automatically at the next step.
confirmed_endpoint: "POST /question/{requestID}/reply"
superseded_by: null
```

```yaml
element_id: agentic__transcript__filter-chip-clear__2
route: /agentic
element_label: "filter: {name} ✕"
element_kind: button
design_source: "Agentic Terminal.dc.html#L111-L115; docs/DESIGN_MAP.md#per-screen-visual-specs (filter-chip)"
intuited_action: >
  Clears the active agent filter (chip renders only while a filter is active, in the agent's
  color); the transcript returns to all activity.
phase_a_behavior: "onClick {{selectAll}} → setState({sel:'all'}) (prototype:113,534)."
phase_b_behavior: "Identical — client-side filter state (AGENT_INTEGRATION §3, filtering is client-side)."
candidate_endpoints: []
confidence: high
evidence:
  - "prototype:111-115 — sc-if {{filtered}}, chip onClick selectAll"
  - "guidance §4 — the ✕ chip is one of the three clear paths"
ambiguity_question: null
user_verdict: confirmed
correction_note: null
confirmed_action: >
  Clears the active agent filter (chip renders only while a filter is active, in the agent's
  color); the transcript returns to all activity.
confirmed_endpoint: null
superseded_by: null
```

```yaml
element_id: agentic__transcript__diff-file-header__3
route: /agentic
element_label: "✎ {path} ↗ (sticky diff-card header, title 'open in viewer', ×N diff cards)"
element_kind: modal-trigger
design_source: "Agentic Terminal.dc.html#L135-L141; docs/DESIGN_MAP.md#per-screen-visual-specs (feed file/diff kind)"
intuited_action: >
  Opens the file-viewer overlay for the file that diff card belongs to (second viewer entry point
  besides the FILES rail); hover shows #eeeeee + underline.
phase_a_behavior: "openFile:()=>{if(e.file&&FILES[e.file]) setState({openFile:e.file, editing:false})} (prototype:481)."
phase_b_behavior: >
  Identical client-side overlay open; the card + header exist per `file` events; viewer content =
  latest file.content from the stream (AGENT_INTEGRATION §1 file, §3 viewer).
candidate_endpoints:
  - { method: GET, path: /file/content, source: "packages/sdk/js/src/v2/gen/sdk.gen.ts:1888", match_kind: plausible-by-design-intent }
confidence: high
evidence:
  - "prototype:137,481 — onClick {{it.openFile}} title 'open in viewer'"
  - "guidance §9 — 'Entry points: … and the ✎ path ↗ header on any diff block'"
ambiguity_question: null
user_verdict: confirmed
correction_note: null
confirmed_action: >
  Opens the file-viewer overlay for the file that diff card belongs to (second viewer entry point
  besides the FILES rail); hover shows #eeeeee + underline.
confirmed_endpoint: "GET /file/content (fallback for canonical content)"
superseded_by: null
```

### Right panel

```yaml
element_id: agentic__panel__tab__0
route: /agentic
element_label: "plan {done}/{total} · issues[ · N] · flow (×3 tabs)"
element_kind: button
design_source: "Agentic Terminal.dc.html#L150-L154; docs/DESIGN_MAP.md#per-screen-visual-specs (panel-tabs)"
intuited_action: >
  Switches the right panel between the plan tree, the issues list, and the flow graph; active tab
  gets bg #1e1e1e + border-bottom 2px #fab283. Tab counters are derived (issues badge counts
  unresolved only).
phase_a_behavior: "go:()=>setState({tab:id}) (prototype:520-521); tab survives restart (guidance §10)."
phase_b_behavior: "Identical — client view state; counters derive from the adapter stream (AGENT_INTEGRATION §6B)."
candidate_endpoints: []
confidence: high
evidence:
  - "prototype:151-152,520-521 — sc-for {{tabs}}, onClick {{tb.go}}"
  - "guidance §8 — 'The tab badge counts unresolved only (open + fixing)'"
ambiguity_question: null
user_verdict: confirmed
correction_note: null
confirmed_action: >
  Switches the right panel between the plan tree, the issues list, and the flow graph; active tab
  gets bg #1e1e1e + border-bottom 2px #fab283. Tab counters are derived (issues badge counts
  unresolved only).
confirmed_endpoint: null
superseded_by: null
```

```yaml
element_id: agentic__panel__plan-row__1
route: /agentic
element_label: "(plan row — ⑂ fork-option rows clickable; done/active/pending/rejected rows inert)"
element_kind: button
design_source: "Agentic Terminal.dc.html#L157-L167; docs/DESIGN_MAP.md#per-screen-visual-specs (Plan tab)"
intuited_action: >
  A plan row in the "fork option" state (⑂ #9d7cd8, pulsing, cursor:pointer) resolves the open
  fork with that option — the THIRD equivalent resolution path. All other plan-row states
  (done/active/pending/rejected) are intentionally inert (cursor:default, no-op handler; the
  hover background is cosmetic).
phase_a_behavior: >
  pick: st==='option' ? ()=>choose(p.fork) : ()=>{} (prototype:503-504); rejected rows render
  line-through + 'rejected at fork' note, never deleted (prototype:497-502).
phase_b_behavior: >
  Fork-option rows call the same resolution as the banner cards: client.question.reply →
  POST /question/{requestID}/reply with the option's label. Row states derive from `plan` events
  (adapter over todo.updated + fork resolution — wiring note 1); reject never deletes
  (AGENT_INTEGRATION §1 plan).
candidate_endpoints:
  - { method: POST, path: "/question/{requestID}/reply", source: "packages/sdk/js/src/v2/gen/sdk.gen.ts:3041", match_kind: exact-by-action-noun }
confidence: high
evidence:
  - "prototype:160,490-504 — onClick {{p.pick}}, cursor {{p.cur}}, option-only handler"
  - "guidance §6 — 'click a ⑂ option row in the plan tab' is resolution path three"
  - "AGENT_INTEGRATION §3 plan tab — 'Fork options render as ⑂ children; on resolve, chosen → normal node, others → reject'"
ambiguity_question: null
user_verdict: confirmed
correction_note: null
confirmed_action: >
  A plan row in the "fork option" state (⑂ #9d7cd8, pulsing, cursor:pointer) resolves the open
  fork with that option — the THIRD equivalent resolution path. All other plan-row states
  (done/active/pending/rejected) are intentionally inert (cursor:default, no-op handler; the
  hover background is cosmetic).
confirmed_endpoint: "POST /question/{requestID}/reply"
superseded_by: null
```

```yaml
element_id: agentic__panel__issue-card__2
route: /agentic
element_label: "(issue card — status pill, title, detail, ↳ resolution; display-only)"
element_kind: conditional-render-gate
design_source: "Agentic Terminal.dc.html#L174-L192; docs/DESIGN_MAP.md#per-screen-visual-specs (Issues tab)"
intuited_action: >
  DISPLAY-ONLY (verified: no onClick anywhere in the card template, prototype:179-191). Cards
  render newest-first per issue lifecycle open(red)→fixing(yellow)→resolved(green outline +
  required ↳ resolution line); empty state "no issues yet — clean run".
phase_a_behavior: "Derived from the static ISSUES array vs step (prototype:343-345,484-489). No interaction."
phase_b_behavior: >
  Still display-only. Content derives from `issue` events (AGENT_INTEGRATION §1) — but opencode's
  event catalog has NO issue-lifecycle event; the source must be adapter-synthesized or added
  server-side. See ambiguity question.
candidate_endpoints: []
confidence: medium
evidence:
  - "prototype:179-191 — card template has no onClick (display-only confirmed)"
  - "guidance §8 issue lifecycle; AGENT_INTEGRATION §1 issue kind + §4.3 'Every error needs a lifecycle'"
  - "INTEGRATION_MAP.md#b5 event catalog + packages/schema/src grep 2026-07-16: no issue.* event exists; nearest signals are session.error {sessionID?, error} (v1/session.ts:651-657) and cmd tool failures"
ambiguity_question: >
  opencode has no issue-lifecycle event (open→fixing→resolved). For Phase B, should the issues
  tab be populated by (a) an adapter that SYNTHESIZES issues client-side from `session.error`
  events plus failed tool executions (cmd exit != 0), inferring "resolved" when a matching
  subsequent command succeeds — zero backend change, but heuristic pairing may misjoin
  open/resolved — or (b) a new server-side issue event kind added to packages/schema (+ codegen
  per INTEGRATION_MAP B6) — a true lifecycle, but expands the run's scope beyond packages/app?
user_verdict: confirmed
correction_note: null
confirmed_action: >
  Cards stay display-only. The issues tab populates via client-side adapter synthesis from
  session.error events + failed cmd tool parts (exit != 0), with heuristic open→resolved pairing;
  no backend change.
confirmed_endpoint: null
superseded_by: null
```

```yaml
element_id: agentic__panel__flow-node__3
route: /agentic
element_label: "(flow-graph SVG — agent nodes ×5 + delegation/handoff edges; display-only)"
element_kind: conditional-render-gate
design_source: "Agentic Terminal.dc.html#L195-L212; docs/DESIGN_MAP.md#per-screen-visual-specs (Flow tab)"
intuited_action: >
  DISPLAY-ONLY (verified: no onClick on nodes or edges, prototype:197-207). Nodes render the
  agent's live status glyph/color; solid edges = delegation (stroke follows target status; done
  dims to #3f5c48); dashed 3-3 edges = handoffs/reports.
phase_a_behavior: "Nodes/edges computed from AG + ST per step (prototype:507-517). No interaction."
phase_b_behavior: >
  Still display-only. Topology derives from the agent registry parent tree (opencode: child
  sessions via Session.Info.parentID) + handoff events; node color follows live derived status
  (AGENT_INTEGRATION §3 flow tab; wiring note 1).
candidate_endpoints: []
confidence: high
evidence:
  - "prototype:197-207 — SVG template, no handlers"
  - "AGENT_INTEGRATION §3 flow tab — nodes from registry, solid from parent, dashed from handoffs"
ambiguity_question: null
user_verdict: confirmed
correction_note: null
confirmed_action: >
  DISPLAY-ONLY (verified: no onClick on nodes or edges, prototype:197-207). Nodes render the
  agent's live status glyph/color; solid edges = delegation (stroke follows target status; done
  dims to #3f5c48); dashed 3-3 edges = handoffs/reports.
confirmed_endpoint: null
superseded_by: null
```

### Prompt queue strip (conditional — only while queue non-empty)

```yaml
element_id: agentic__queue__chip-remove__0
route: /agentic
element_label: "✕ (per queue chip)"
element_kind: button
design_source: "Agentic Terminal.dc.html#L230-L236; docs/DESIGN_MAP.md#per-screen-visual-specs (Prompt queue)"
intuited_action: >
  Removes that single chip from the queue; remaining chips renumber; the strip disappears when
  the queue empties. Next-up chip (index 0) is outlined #fab283.
phase_a_behavior: "remove:()=>setState(queue: queue.filter((_,j)=>j!==i)) (prototype:551)."
phase_b_behavior: "Identical — the queue is client-local state in both phases (chips not yet dispatched; nothing server-side exists to cancel)."
candidate_endpoints: []
confidence: high
evidence:
  - "prototype:234,551 — onClick {{q.remove}}"
  - "guidance §5 — '✕ removes one; clear empties; send next ↑ dispatches manually'"
ambiguity_question: null
user_verdict: confirmed
correction_note: null
confirmed_action: >
  Removes that single chip from the queue; remaining chips renumber; the strip disappears when
  the queue empties. Next-up chip (index 0) is outlined #fab283.
confirmed_endpoint: null
superseded_by: null
```

```yaml
element_id: agentic__queue__send-next__1
route: /agentic
element_label: "send next ↑"
element_kind: button
design_source: "Agentic Terminal.dc.html#L238; docs/DESIGN_MAP.md#per-screen-visual-specs (Prompt queue)"
intuited_action: >
  Manually dispatches the head-of-queue chip immediately (works even while paused, during a fork,
  or after completion — manual dispatch bypasses the auto-drain holds); the chip's text appears
  in the feed as a user message and the orchestrator acknowledges it.
phase_a_behavior: >
  sendNext → dispatchOne: dequeues head, appends {user text} + the CANNED ack "Noted — folding
  that into the active plan." to sent[] (prototype:439-443,552).
phase_b_behavior: >
  Dispatches the head chunk via client.session.promptAsync → POST /session/:id/prompt_async (204
  fire-and-forget; everything the UI shows returns via SSE — INTEGRATION_MAP B2 prompt write
  path). The canned ack is a named simulation artifact: the acknowledgment MUST arrive as a real
  orchestrator `text` event (AGENT_INTEGRATION §3 warning). Auto-drain (1/turn-boundary) uses the
  same call — wiring note 4.
candidate_endpoints:
  - { method: POST, path: "/session/:id/prompt_async", source: "INTEGRATION_MAP.md#b2 (client.session.promptAsync, submit.ts:155 precedent)", match_kind: exact-by-action-noun }
confidence: high
evidence:
  - "prototype:238,439-443,552 — onClick {{sendNext}} → dispatchOne"
  - "guidance §5 — 'send next ↑ dispatches manually at any time'"
  - "AGENT_INTEGRATION §3 prompt+queue — one per orchestrator turn boundary; canned reply is sim filler, never hardcode"
  - "ROUTE_MAP.md API catalog — client.session.promptAsync (components/prompt-input/submit.ts:155)"
ambiguity_question: null
user_verdict: confirmed
correction_note: null
confirmed_action: >
  Manually dispatches the head-of-queue chip immediately (works even while paused, during a fork,
  or after completion — manual dispatch bypasses the auto-drain holds); the chip's text appears
  in the feed as a user message and the orchestrator acknowledges it.
confirmed_endpoint: "POST /session/:id/prompt_async"
superseded_by: null
```

```yaml
element_id: agentic__queue__clear__2
route: /agentic
element_label: "clear"
element_kind: button
design_source: "Agentic Terminal.dc.html#L239; docs/DESIGN_MAP.md#per-screen-visual-specs (Prompt queue)"
intuited_action: "Empties the entire prompt queue; the strip disappears."
phase_a_behavior: "clearQueue:()=>setState({queue:[]}) (prototype:553)."
phase_b_behavior: "Identical — client-local queue state."
candidate_endpoints: []
confidence: high
evidence:
  - "prototype:239,553 — onClick {{clearQueue}}"
  - "guidance §5 — 'clear empties'"
ambiguity_question: null
user_verdict: confirmed
correction_note: null
confirmed_action: "Empties the entire prompt queue; the strip disappears."
confirmed_endpoint: null
superseded_by: null
```

### File viewer overlay (conditional — both views)

```yaml
element_id: agentic__viewer__edit-save__0
route: /agentic
element_label: "edit / save (label swaps with mode)"
element_kind: button
design_source: "Agentic Terminal.dc.html#L253; docs/DESIGN_MAP.md#per-screen-visual-specs (File viewer header)"
intuited_action: >
  "edit" swaps the rendered view (markdown/code) for a plain textarea editor seeded with current
  content; "save" persists the buffer as a session-local edit — the file shows a "modified" badge
  in the header AND the FILES rail, the saved version becomes what the viewer (and rail stat)
  shows, and edits survive restart.
phase_a_behavior: >
  toggleEdit: editing ? save textarea value into fileEdits[path] + editing:false : editing:true
  (prototype:586-590); fileEdits keyed by path, surviving restart by design (guidance §10).
phase_b_behavior: >
  Session-local persistence stays client-side, but the live contract ADDS an upstream half:
  saving must emit {kind:"user_edit", path, content} which the agent treats as authoritative,
  rebases its next write on, and confirms with a text event (AGENT_INTEGRATION §3). No existing
  opencode endpoint carries this — see ambiguity question.
candidate_endpoints:
  - { method: POST, path: "/session/:id/prompt_async", source: "INTEGRATION_MAP.md#b2", match_kind: plausible-by-design-intent }
confidence: medium
evidence:
  - "prototype:253,586-590 — onClick {{toggleEdit}}, editBtn:editing?'save':'edit'"
  - "guidance §9 — edit/save/modified/revert cycle; §10 — edits survive restart"
  - "AGENT_INTEGRATION §3 — 'User edits in the viewer produce a client event your agent must consume: {kind:\"user_edit\"…} — treat as authoritative, rebase your next write on it, confirm with a text event'"
  - "instance-server file routes are read-only GETs — /file, /file/content, /file/status (sdk.gen.ts:1855-1918); no write or generic client-event endpoint exists"
ambiguity_question: >
  Phase B's user_edit contract (agent must consume {kind:"user_edit", path, content} and rebase)
  has no carrier in opencode today — file routes are read-only (GET /file, /file/content,
  /file/status) and no generic client→agent event endpoint exists. Should save (a) keep edits
  session-local and inform the orchestrator via client.session.promptAsync with a structured user
  message describing the edit (works today; the "authoritative rebase" becomes advisory), (b) add
  a new server surface for user_edit (true contract, but scope expands beyond packages/app via
  the B6 codegen path), or (c) stay Phase-A session-local only, deferring the upstream half of
  the contract out of this run?
user_verdict: confirmed
correction_note: null
confirmed_action: >
  Phase B viewer edits stay session-local AND notify the orchestrator via a structured
  promptAsync message so it can rebase; no new server surface.
confirmed_endpoint: "client.session.promptAsync → POST /session/:id/prompt_async"
superseded_by: null
```

```yaml
element_id: agentic__viewer__revert__1
route: /agentic
element_label: "revert (conditional — only while modified)"
element_kind: button
design_source: "Agentic Terminal.dc.html#L254-L256; docs/DESIGN_MAP.md#per-screen-visual-specs (File viewer header)"
intuited_action: >
  Restores the file's canonical content: deletes the session-local edit, clears the "modified"
  badge (header + rail), exits edit mode if active.
phase_a_behavior: "revertFile: delete fileEdits[path], editing:false (prototype:591); canonical = FILES[p].content."
phase_b_behavior: >
  Identical client-side restore; canonical = the latest file.content received from the stream
  (agent's version is authoritative again). If Q4 lands on notifying the agent of user edits,
  revert's answer follows the same channel decision.
candidate_endpoints: []
confidence: high
evidence:
  - "prototype:255,591 — sc-if {{viewerModified}} gating, onClick {{revertFile}}"
  - "guidance §9 — 'revert restores canonical content'"
ambiguity_question: null
user_verdict: confirmed
correction_note: null
confirmed_action: >
  Restores the file's canonical content: deletes the session-local edit, clears the "modified"
  badge (header + rail), exits edit mode if active. (Q4 resolved: edit notifications go via the
  structured promptAsync channel; revert follows the same channel.)
confirmed_endpoint: null
superseded_by: null
```

```yaml
element_id: agentic__viewer__close__2
route: /agentic
element_label: "✕ (viewer close)"
element_kind: button
design_source: "Agentic Terminal.dc.html#L257; docs/DESIGN_MAP.md#per-screen-visual-specs (File viewer header)"
intuited_action: "Closes the viewer overlay (and exits edit mode without saving the buffer). esc is the keyboard equivalent."
phase_a_behavior: "closeViewer:()=>setState({openFile:null, editing:false}) (prototype:592). Unsaved textarea buffer is discarded."
phase_b_behavior: "Identical — client overlay state."
candidate_endpoints: []
confidence: high
evidence:
  - "prototype:257,592 — onClick {{closeViewer}}"
  - "guidance §9 + viewer footer 'esc to close'"
ambiguity_question: null
user_verdict: confirmed
correction_note: null
confirmed_action: "Closes the viewer overlay (and exits edit mode without saving the buffer). esc is the keyboard equivalent."
confirmed_endpoint: null
superseded_by: null
```

```yaml
element_id: agentic__viewer__editor-textarea__3
route: /agentic
element_label: "(file editor textarea, id=fileeditor)"
element_kind: form-input
design_source: "Agentic Terminal.dc.html#L259-L261; docs/DESIGN_MAP.md#per-screen-visual-specs (File viewer editor state)"
intuited_action: >
  Free-text edit buffer over the file content (no spellcheck, monospace, #d6d6d6 on #0a0a0a);
  committed only by "save"; esc closes the viewer discarding the buffer — esc is the ONLY hotkey
  that works while focus is inside it (hotkey guard).
phase_a_behavior: "defaultValue={{viewerContent}} (fileEdits[p] ?? canonical); read on save via getElementById (prototype:588-589)."
phase_b_behavior: "Identical buffer semantics; the save-time upstream question is element 21 (Q4)."
candidate_endpoints: []
confidence: high
evidence:
  - "prototype:260,416-418 — textarea + the INPUT/TEXTAREA guard branch with esc exception"
  - "guidance §4 guard — 'Typing a space in the editor must never pause the session'"
ambiguity_question: null
user_verdict: confirmed
correction_note: null
confirmed_action: >
  Free-text edit buffer over the file content (no spellcheck, monospace, #d6d6d6 on #0a0a0a);
  committed only by "save"; esc closes the viewer discarding the buffer — esc is the ONLY hotkey
  that works while focus is inside it (hotkey guard).
confirmed_endpoint: null
superseded_by: null
```

### Prompt bar (persistent)

```yaml
element_id: agentic__prompt__input__0
route: /agentic
element_label: "(prompt input, id=promptbox — placeholder 'steer the orchestrator… enter sends · shift+enter queues · split chunks with |')"
element_kind: form-input
design_source: "Agentic Terminal.dc.html#L279-L281; docs/DESIGN_MAP.md#per-screen-visual-specs (Prompt)"
intuited_action: >
  Steers the orchestrator: enter sends immediately (message appears in the feed as "you", the
  orchestrator acknowledges in the feed); shift+enter queues instead; "|" splits input into
  chunks — on send the first chunk goes out now and the rest queue in order, on queue all chunks
  queue; empty/whitespace input is ignored; input clears after either action.
phase_a_behavior: >
  onPromptKey (prototype:541-548): Enter+shiftKey → queueText(all chunks); plain Enter →
  sent += [user chunk 1, canned ack] and queue += chunks[2..]; splitChunks on '|' trims and
  drops empties (prototype:444).
phase_b_behavior: >
  Enter → client.session.promptAsync (POST /session/:id/prompt_async, 204; the run output —
  including the REAL orchestrator acknowledgment text event replacing the canned ack — arrives
  over SSE per INTEGRATION_MAP B2 "prompt write path"). shift+enter / '|' chunking stay
  client-side queue ops; queued chunks dispatch one per orchestrator turn boundary (wiring
  note 4). User input arrives back on the stream as {agent:"user", kind:"text"}
  (AGENT_INTEGRATION §3).
candidate_endpoints:
  - { method: POST, path: "/session/:id/prompt_async", source: "INTEGRATION_MAP.md#b2 (client.session.promptAsync, components/prompt-input/submit.ts:155)", match_kind: exact-by-action-noun }
confidence: high
evidence:
  - "prototype:281,541-548 — onKeyDown {{onPromptKey}} full semantics"
  - "guidance §5 — enter/shift+enter/| contract, empty input ignored"
  - "ROUTE_MAP.md — client.session.promptAsync is the established submit path (submit.ts:155); the brief names it for the prompt bar"
ambiguity_question: null
user_verdict: confirmed
correction_note: null
confirmed_action: >
  Steers the orchestrator: enter sends immediately (message appears in the feed as "you", the
  orchestrator acknowledges in the feed); shift+enter queues instead; "|" splits input into
  chunks — on send the first chunk goes out now and the rest queue in order, on queue all chunks
  queue; empty/whitespace input is ignored; input clears after either action.
confirmed_endpoint: "POST /session/:id/prompt_async"
superseded_by: null
```

```yaml
element_id: agentic__prompt__queue-draft__1
route: /agentic
element_label: "+ queue"
element_kind: button
design_source: "Agentic Terminal.dc.html#L282; docs/DESIGN_MAP.md#per-screen-visual-specs (Prompt)"
intuited_action: >
  Drafts the current input into the queue without sending: all '|'-split chunks append to the
  queue in order; input clears; ignored when empty/whitespace.
phase_a_behavior: "queueDraft: reads #promptbox, queueText(value), clears input (prototype:549)."
phase_b_behavior: "Identical — pure client-side queue append (dispatch happens later via drain / send next)."
candidate_endpoints: []
confidence: high
evidence:
  - "prototype:282,549 — onClick {{queueDraft}}"
  - "guidance §5 — 'shift+enter or the + queue button drafts into the queue instead'"
ambiguity_question: null
user_verdict: confirmed
correction_note: null
confirmed_action: >
  Drafts the current input into the queue without sending: all '|'-split chunks append to the
  queue in order; input clears; ignored when empty/whitespace.
confirmed_endpoint: null
superseded_by: null
```

### Keyboard shortcuts (window-level, subject to the input-focus guard)

```yaml
element_id: agentic__hotkeys__space__0
route: /agentic
element_label: "space"
element_kind: keyboard-shortcut
design_source: "Development Guidance.dc.html#§4 (interaction contract table); Agentic Terminal.dc.html#L420"
intuited_action: "Toggles play/pause — identical to the topbar play/pause button; preventDefault stops page scroll."
phase_a_behavior: "e.key===' ' → preventDefault + setState(playing:!playing) (prototype:420); inert while typing (guard)."
phase_b_behavior: "Adapted with the button (element 3): toggles pause/resume of live-stream consumption. Client-side."
candidate_endpoints: []
confidence: high
evidence:
  - "prototype:420; guidance §4 space row; §12 — 'space typed in prompt or editor never pauses the session'"
ambiguity_question: null
user_verdict: confirmed
correction_note: null
confirmed_action: "Toggles play/pause — identical to the topbar play/pause button; preventDefault stops page scroll."
confirmed_endpoint: null
superseded_by: null
```

```yaml
element_id: agentic__hotkeys__arrow-left__1
route: /agentic
element_label: "←"
element_kind: keyboard-shortcut
design_source: "Development Guidance.dc.html#§4; Agentic Terminal.dc.html#L424"
intuited_action: "Steps the session view back one step (floor 0). Never locked — back-stepping is always allowed."
phase_a_behavior: "e.key==='ArrowLeft' && step>0 → setState(step-1) (prototype:424). Does NOT pause (unlike tick-click)."
phase_b_behavior: >
  Adapted with the scrubber (element 2): steps backward through the recorded replay's checkpoints
  — client-side re-projection of the ingested event log. No endpoint.
candidate_endpoints: []
confidence: high
evidence:
  - "prototype:424; guidance §4 '← → step back / forward (0–12)'"
  - "refined prompt — stepping adapts to scrubbing a recorded real-session replay"
ambiguity_question: null
user_verdict: confirmed
correction_note: null
confirmed_action: "Steps the session view back one step (floor 0). Never locked — back-stepping is always allowed."
confirmed_endpoint: null
superseded_by: null
```

```yaml
element_id: agentic__hotkeys__arrow-right__2
route: /agentic
element_label: "→ (fork-locked)"
element_kind: keyboard-shortcut
design_source: "Development Guidance.dc.html#§4; Agentic Terminal.dc.html#L423"
intuited_action: >
  Steps the session view forward one step (cap 12) — LOCKED while a decision fork is unresolved
  (the fork blocks →, auto-advance, and auto-drain until resolved).
phase_a_behavior: "e.key==='ArrowRight' && step<12 && !(step===6 && !choice) → setState(step+1) + scrollDown (prototype:423)."
phase_b_behavior: >
  Adapted with the scrubber: steps forward through recorded-replay checkpoints; the fork lock's
  live meaning — an unresolved question/fork holds the LIVE edge (no new turn boundary occurs
  until resolved), and replay cannot step past the newest ingested checkpoint. Client-side.
candidate_endpoints: []
confidence: high
evidence:
  - "prototype:423; guidance §4 '→ is locked while a fork is unresolved'; §12 fork-blocking checklist item"
ambiguity_question: null
user_verdict: confirmed
correction_note: null
confirmed_action: >
  Steps the session view forward one step (cap 12) — LOCKED while a decision fork is unresolved
  (the fork blocks →, auto-advance, and auto-drain until resolved).
confirmed_endpoint: null
superseded_by: null
```

```yaml
element_id: agentic__hotkeys__v__3
route: /agentic
element_label: "v"
element_kind: keyboard-shortcut
design_source: "Development Guidance.dc.html#§4; Agentic Terminal.dc.html#L421"
intuited_action: "Toggles Mission Control ↔ TUI — identical to the view-toggle segmented control."
phase_a_behavior: "e.key==='v' → setState(view: mission↔tui) (prototype:421)."
phase_b_behavior: "Identical — client view state."
candidate_endpoints: []
confidence: high
evidence:
  - "prototype:421; guidance §4 v row"
ambiguity_question: null
user_verdict: confirmed
correction_note: null
confirmed_action: "Toggles Mission Control ↔ TUI — identical to the view-toggle segmented control."
confirmed_endpoint: null
superseded_by: null
```

```yaml
element_id: agentic__hotkeys__digit-1-2__4
route: /agentic
element_label: "1 / 2 (fork-live only)"
element_kind: keyboard-shortcut
design_source: "Development Guidance.dc.html#§4/§6; Agentic Terminal.dc.html#L425"
intuited_action: >
  Resolves the open decision fork by option number — only while the fork banner is live;
  otherwise inert. Second of the three equivalent resolution paths.
phase_a_behavior: "step===6 && !choice && (e.key==='1'||'2') → choose('mocks'|'fixture') (prototype:425)."
phase_b_behavior: >
  Same resolution call as the option cards: client.question.reply → POST /question/{requestID}/reply
  with the numbered option's label. Live option COUNT may exceed 2 (fork.options[] is
  arbitrary-length; DESIGN_MAP flagged 3+ options layout as a gap) — key range follows the
  rendered options.
candidate_endpoints:
  - { method: POST, path: "/question/{requestID}/reply", source: "packages/sdk/js/src/v2/gen/sdk.gen.ts:3041", match_kind: exact-by-action-noun }
confidence: high
evidence:
  - "prototype:425; guidance §4 '1 / 2 resolve the decision fork — only while the fork banner is live'; §6 three equivalent resolutions"
ambiguity_question: null
user_verdict: confirmed
correction_note: null
confirmed_action: >
  Resolves the open decision fork by option number — only while the fork banner is live;
  otherwise inert. Second of the three equivalent resolution paths.
confirmed_endpoint: "POST /question/{requestID}/reply"
superseded_by: null
```

```yaml
element_id: agentic__hotkeys__esc__5
route: /agentic
element_label: "esc"
element_kind: keyboard-shortcut
design_source: "Development Guidance.dc.html#§4; Agentic Terminal.dc.html#L417,L422"
intuited_action: >
  Closes the file viewer (and exits edit mode) — the ONLY hotkey that also works while focus is
  in the prompt input or the file editor. No-op when the viewer is closed.
phase_a_behavior: >
  Two branches: inside the INPUT/TEXTAREA guard (prototype:417) and outside it (prototype:422),
  both setState({openFile:null, editing:false}) when openFile is set.
phase_b_behavior: "Identical — client overlay state."
candidate_endpoints: []
confidence: high
evidence:
  - "prototype:416-418,422; guidance §4 'esc close file viewer (works even while typing in the editor)'"
ambiguity_question: null
user_verdict: confirmed
correction_note: null
confirmed_action: >
  Closes the file viewer (and exits edit mode) — the ONLY hotkey that also works while focus is
  in the prompt input or the file editor. No-op when the viewer is closed.
confirmed_endpoint: null
superseded_by: null
```

```yaml
element_id: agentic__hotkeys__input-focus-guard__6
route: /agentic
element_label: "(hotkey guard — all hotkeys inert while typing, esc excepted)"
element_kind: conditional-render-gate
design_source: "Development Guidance.dc.html#§4 (Guard box); Agentic Terminal.dc.html#L416-L418"
intuited_action: >
  While focus is in the prompt input or the file editor, every hotkey (space/←/→/v/1/2) is inert
  — typing a space in the editor must never pause the session; esc is the single exception
  (closes the viewer). Gate condition: e.target.tagName is INPUT or TEXTAREA.
phase_a_behavior: "Early return in the window keydown handler after the esc-exception check (prototype:416-418)."
phase_b_behavior: "Identical — the guard is a client input-handling contract, phase-independent. §12 checklist item 8 encodes it."
candidate_endpoints: []
confidence: high
evidence:
  - "prototype:416-418 — the guard branch"
  - "guidance §4 Guard — 'all hotkeys are inert while focus is in the prompt input or the file editor — esc is the only exception'; §12 item 8"
ambiguity_question: null
user_verdict: confirmed
correction_note: null
confirmed_action: >
  While focus is in the prompt input or the file editor, every hotkey (space/←/→/v/1/2) is inert
  — typing a space in the editor must never pause the session; esc is the single exception
  (closes the viewer). Gate condition: e.target.tagName is INPUT or TEXTAREA.
confirmed_endpoint: null
superseded_by: null
```

# agentic-terminal-live

_Phase B capability. Builds on the Phase A gate (all §12 flows green against the simulation)._

## ADDED Requirements

### Requirement: Live event source through the existing stream wrappers
The live source SHALL consume opencode's real session/event stream exclusively through the app's existing wrappers (`useServerSDK().event` directory-keyed / `useSDK().event` type-keyed) under a mounted or replicated `ServerSyncProvider`; it MUST NOT open a second SSE connection. It SHALL honor the six INTEGRATION_MAP wiring contracts: load-before-listen (`session.sync(sessionID)` before rendering from events), canonical fold surface (`useServerSync().session.data` / the `useSync()` Proxy — never `event-reducer.ts` content branches), resnapshot recovery on `server.connected` (re-bootstrap, no replay assumption), dropping `payload.type === "sync"` frames, tolerating missing `directory` on connected/heartbeat frames, and idempotent lazy `event.start()`.

#### Scenario: Load-before-listen
- WHEN the surface attaches to a session that has existing messages
- THEN the transcript renders the synced history first and subsequent streamed parts are folded (no silently empty feed)

#### Scenario: Reconnect resnapshot
- WHEN the SSE connection drops and reconnects during an active session
- THEN the surface re-derives state from bootstrap + sync and continues folding live events, with no duplicated or lost-forever transcript entries in the rendered state

### Requirement: Kind adapters for live events
The adapter SHALL map opencode events to the design's envelope kinds per design.md D5: text/spawn/cmd/file/status/plan/resource from their grounded live sources with summarize-at-source discipline (one-line cmd output, ≤6-line diffs, ≤2-sentence narration); `exit != 0` renders red; every visible string obeys AGENT_INTEGRATION §6's fixed/derived/supplied classes (no counters or status chips sent as text; no hardcoded acknowledgments).

#### Scenario: Real session renders across panels
- WHEN a controlled real session executes a shell command that fails and then succeeds
- THEN the transcript shows cmd cards with red then muted output, the agent rail reflects status transitions, and the resources block shows real (not formula-derived) values where the server provides them

### Requirement: Fork banner maps to single-select questions only
The fork banner SHALL render for `question.asked` events that contain exactly one single-select question, presenting its options as cards (N ≥ 2) with the design's banner contract; resolution SHALL call `client.question.reply` (`POST /question/{requestID}/reply`) and release the held state. Multi-question, multi-select, and free-text question requests MUST NOT render as the fork banner (they remain with the app's existing question UI). While a fork is held, queue auto-drain holds.

#### Scenario: Single-select question becomes a fork
- WHEN a `question.asked` event with one single-select question arrives for the attached session
- THEN the purple fork banner renders its options as cards and choosing one issues the reply POST and clears the banner

#### Scenario: Non-conforming question bypasses the banner
- WHEN a multi-select `question.asked` arrives
- THEN the fork banner does not render and the existing question UI handles it

### Requirement: Issues synthesized client-side
The issues tab SHALL populate from adapter-synthesized issues derived from `session.error` events and failed `cmd` tool parts, pairing open→resolved heuristically (a subsequent matching success or session completion resolves), with no backend changes. Cards SHALL name the raising agent and file where derivable; unresolved issues at session end remain visibly open.

#### Scenario: Failed command opens an issue
- WHEN a controlled real session runs a failing command and later a fixing success
- THEN an issue card opens (red), transitions per the heuristic, and shows a resolution line when paired

### Requirement: Viewer edits notify the orchestrator
Saving a viewer edit SHALL keep the content session-local AND send a structured `promptAsync` message informing the orchestrator of the user edit (path + content context) so it can rebase; no new server surface is introduced.

#### Scenario: Edit triggers prompt notification
- WHEN the user saves an edit to a file in the viewer during a live session
- THEN a `POST /session/:id/prompt_async` is issued containing the structured user-edit notification and the viewer shows the modified badge

### Requirement: Session targeting
`/agentic` SHALL accept an optional session target (`?session=<id>`); with none it SHALL attach to the most recently active session; with no sessions available, prompt-bar input SHALL create a session via the existing flow and attach to it.

#### Scenario: Default attach
- WHEN `/agentic` is opened with no query while a session is active
- THEN the surface attaches to the most recently active session and renders its synced transcript

### Requirement: Simulation removal
At the end of Phase B the scripted simulation SHALL be removed entirely: no user-facing sim/demo mode, no retained sim fixtures, and deletion of all AGENT_INTEGRATION-flagged simulation-only artifacts (step-jump/replay scrubber simulation, autoplay timer + speed tweak, restart, fake cost rate, step-derived timestamps, canned queue acknowledgment). Live equivalents replace them: real `ts`, real resource values, replay via stream re-ingestion, real orchestrator acknowledgments.

#### Scenario: No sim code ships
- WHEN the Phase B build is inspected
- THEN the `sim/` source, transport-only controls, formula-derived metrics, and the canned acknowledgment string are absent from the shipped surface (grep-verifiable), and no route or setting reaches a simulated session

### Requirement: Doc-driven acceptance re-target with no mocks
All 8 guidance §12 checklist items SHALL be green as Playwright flows against the live surface fed by a controlled real session on a real `opencode serve` instance (no `page.route` interception of app↔server traffic, no SSE transport replacement, no fixture server). Items whose subject is deleted simulation transport SHALL pass under the adapted definitions of design.md D6 (play/pause → live-stream consumption pause; stepping/scrubber → recorded real-session replay buffer; drain-per-step → drain on orchestrator turn boundary). `packages/app`'s existing unit/browser/e2e suites SHALL remain green.

#### Scenario: Real-backend flow run
- WHEN the Phase B §12 suite runs
- THEN a real server process serves the session, the suite creates/drives/cleans up controlled sessions via real endpoints, and all 8 items report green with the run's Playwright traces captured

#### Scenario: No-mock audit
- WHEN the Phase B specs are audited
- THEN no spec installs `mockOpenCodeServer`, `installSseTransport`, or bespoke `page.route` mocks for app↔server traffic

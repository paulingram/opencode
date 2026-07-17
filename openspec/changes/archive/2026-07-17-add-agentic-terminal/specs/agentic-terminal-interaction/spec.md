# agentic-terminal-interaction

## ADDED Requirements

### Requirement: Keyboard contract with input-focus guard
The surface SHALL implement the guidance §4 hotkeys: space = play/pause; ← → = step back/forward (0–12) with → locked while a fork is unresolved; v = toggle Mission Control ↔ TUI; 1/2 = resolve the live fork only while the banner is live; esc = close the file viewer. All hotkeys MUST be inert while focus is in the prompt input or the file editor, with esc as the only exception.

#### Scenario: Space guard while typing (§12)
- WHEN the user types a space into the prompt input or the viewer editor
- THEN the session does not pause and the character is entered

#### Scenario: Esc works everywhere
- WHEN the viewer is open and focus is inside the viewer editor
- THEN pressing esc closes the viewer

#### Scenario: Fork locks forward stepping
- WHEN the fork is unresolved at step 6
- THEN pressing → does not advance the step

### Requirement: Scrubber navigation
The topbar SHALL render one tick per checkpoint (13 in the simulated session); clicking a tick MUST jump to that step and pause; ticks color past `#4a5c50`, current `#fab283`, future `#282828`.

#### Scenario: Tick jump pauses
- WHEN the user clicks tick 4 while playing
- THEN the view shows step 4's state and the session is paused

### Requirement: Decision-fork protocol
A live fork SHALL pause the session (topbar `⑂ awaiting decision`; orchestrator glyph ⑂), block auto-advance and queue auto-drain, and accept exactly three resolution paths: clicking an option card in the banner, pressing 1/2, or clicking a ⑂ option row in the plan tab. On resolution the chosen branch becomes active→done, the other is struck through as "rejected at fork" (never deleted), the orchestrator's next narration varies by choice, and playback resumes automatically.

#### Scenario: Three equivalent resolutions
- WHEN the fork is live and the user resolves via each of banner-click, keypress 2, and plan-tab row (across three runs)
- THEN each path produces the identical resolved state and playback resumes

#### Scenario: Rejected branch preserved
- WHEN option 2 is chosen
- THEN the plan tree renders option 1 struck through with the "rejected at fork" note and it remains in the tree for the rest of the session

### Requirement: Prompt and queue semantics
Enter SHALL send immediately (orchestrator acknowledgment appears in the feed); shift+enter or the + queue button SHALL queue; empty/whitespace input SHALL be ignored; `|` SHALL split input into chunks (on send: first chunk out now, rest queued in order; on queue: all queued). Queue chips SHALL be numbered in dispatch order, next-up outlined #fab283, each removable via ✕, all clearable via clear, manually dispatchable via send next ↑. Auto-drain SHALL dispatch exactly one queued prompt per step tick while playing, holding while paused, while a fork is unresolved, and after completion.

#### Scenario: Chunk splitting on send (§12)
- WHEN the user sends "a | b | c"
- THEN "a" appears in the feed immediately and chips #1="b", #2="c" queue in order

#### Scenario: Drain one per step
- WHEN two prompts are queued and the session advances one step while playing
- THEN exactly one chip dispatches, appearing in the feed with an orchestrator acknowledgment

#### Scenario: Queue survives restart (§12)
- WHEN prompts are queued and the user clicks restart
- THEN the queue contents are preserved

### Requirement: Agent filtering
Clicking an agent row SHALL filter the transcript to that agent (drill-in); clicking the same row again, the filter chip ✕, or "all activity" SHALL clear the filter. Filtering MUST be client-side over already-received events.

#### Scenario: Filter round-trip
- WHEN the user clicks coder-2's row, then the ✕ chip
- THEN the feed shows only coder-2 events while filtered, then all events again, with no refetch

### Requirement: Right-panel tabs
The right panel SHALL provide plan / issues / flow tabs: plan renders the tree with done/total counter and ⑂ fork children; issues renders newest-first cards with the tab badge counting unresolved only and the "no issues yet — clean run" empty state; flow renders registry nodes with solid delegation edges (stroke follows target status color, done edges dim #3f5c48) and dashed handoff edges.

#### Scenario: Issue badge counts unresolved
- WHEN one issue is open and one resolved
- THEN the issues tab label shows "issues · 1"

### Requirement: File viewer lifecycle
The viewer SHALL open from FILES rail entries and from ✎ diff-block headers; render markdown styled (# peach, ## purple, bullets, _meta_ muted, fenced code green-on-panel) and code with line numbers, dimmed comments, and x-scroll for long lines; support edit → save (session-local; "modified" badge in header and rail) → revert (restore canonical); close via ✕ and esc; edits SHALL survive restart.

#### Scenario: Edit-save-modified-revert cycle (§12)
- WHEN the user edits a file, saves, then reverts
- THEN after save the content persists session-locally with the modified badge shown in the header and the rail; after revert the canonical content returns and the badge clears

#### Scenario: Edits survive restart
- WHEN a file has a saved edit and the user restarts the session
- THEN reopening the file shows the edited content still marked modified

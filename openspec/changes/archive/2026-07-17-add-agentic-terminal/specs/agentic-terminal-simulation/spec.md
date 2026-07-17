# agentic-terminal-simulation

_Phase A capability. The live capability (`agentic-terminal-live`) REQUIRES this capability's complete removal at the end of Phase B — see its "Simulation removal" requirement. Until then, the requirements below are binding for the Phase A gate._

## ADDED Requirements

### Requirement: Swappable simulated event source
The simulation SHALL be implemented as a `TerminalEventSource` (design.md D1) that emits the design's event envelopes; the scripted content (agents, statuses, tasks, events, plan, issues, files) SHALL be ported from the prototype's logic-class constants (`AG/ST/TASK/EV/PLAN/ISSUES/FILES` in `Agentic Terminal.dc.html`) verbatim — same 5 agents with fixed colors, same 13-step "refactor auth → session tokens" scenario, same fork narration variants. The UI fold MUST NOT reference simulation internals (transport controls live in the source, not the fold).

#### Scenario: Scripted parity with the oracle
- WHEN the simulation plays end-to-end with the fixture choice
- THEN the transcript event sequence, agent status timeline, plan tree states, issue lifecycles, and file registry match the interactive prototype oracle step-for-step

#### Scenario: Fold isolation
- WHEN the simulation source is removed from the build (Phase B)
- THEN the store, fold, and panel components compile and function against the live source with no changes

### Requirement: Simulation transport and metrics
The simulation SHALL tick every `speedMs` (default 2400ms), advancing one step per tick; timestamps, elapsed, tokens, cost, and context SHALL use the guidance §10 illustrative formulas (ts = step×14s+6; elapsed = step×14s+8; tokens = per-agent rate × active steps with rates 900/2600/3100/3400/2800; cost = tokens × $15/M; context = min(88, 10+6×step)%). Restart SHALL reset step, fork choice, sent messages, and filter, resume playing, and preserve the prompt queue, file edits, view, and tab.

#### Scenario: Restart semantics
- WHEN the user restarts mid-session with queued prompts, a saved file edit, TUI view, and the issues tab active
- THEN step returns to 0 and playback resumes, while the queue, edit, view, and tab are all preserved

#### Scenario: Completion stops the clock
- WHEN step 12 is reached
- THEN playback stops, the status chip shows ✓ complete, and auto-drain holds (manual send still works)

### Requirement: Tweakable props
The route component SHALL accept `speedMs` (range 1200–5000, step 200, default 2400 — applies live, timer restarts on change), `autoplay` (boolean, default true — start paused when false), and `showCost` (boolean, default true — toggles the per-agent $ column in rail and TUI).

#### Scenario: autoplay false starts paused
- WHEN the surface mounts with `autoplay: false`
- THEN the session is paused at step 0 until the user presses play or space

#### Scenario: showCost false hides cost column
- WHEN `showCost` is false
- THEN no per-agent $ values render in the rail or the TUI agent block

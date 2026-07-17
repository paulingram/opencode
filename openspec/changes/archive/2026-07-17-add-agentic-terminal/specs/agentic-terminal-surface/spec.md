# agentic-terminal-surface

## ADDED Requirements

### Requirement: Always-on route registered in both layout modes
The app SHALL expose the Agentic Terminal at the static path `/agentic` with no feature flag. It MUST be registered in the new-layout Routes fork (sibling of `NewHome`, inside the `Show` at `packages/app/src/app.tsx:595-599`) AND in the legacy fork wrapped in its own `ServerSDKProvider→ServerSyncProvider` pair following the `ResolvedDraftRoute` template (`app.tsx:199-222`).

#### Scenario: Reachable in new layout
- WHEN a user with `newLayoutDesigns` enabled navigates to `/agentic`
- THEN the Agentic Terminal renders inside the new-layout provider tree with the live event stream available (Phase B) and no additional configuration

#### Scenario: Reachable in legacy layout
- WHEN a user with the legacy layout navigates to `/agentic`
- THEN the Agentic Terminal renders with its own server provider pair and does not throw from a missing `useServerSDK` context

#### Scenario: Static path precedence
- WHEN `/agentic` is requested
- THEN it MUST NOT be captured by the `/:dir` dynamic route (the `/new-session` static-route precedent)

### Requirement: Mission Control layout geometry
The Mission Control view SHALL implement the guidance §3 regions exactly: topbar height 46px; grid `270px 1fr 344px` (agent rail / transcript feed / right panel); conditional fork banner and filter chip in the feed column; conditional queue strip; prompt bar; file-viewer overlay absolute at top 46px, right 0, width 640px, max-width 84vw, z-index 20.

#### Scenario: Region geometry matches spec
- WHEN the Mission Control view renders at ≥900px viewport width
- THEN computed styles for topbar height, grid template columns, and viewer overlay geometry equal the §3 values exactly

#### Scenario: Overflow discipline (§12)
- WHEN content exceeds available space at viewport widths ≥900px
- THEN the feed, right panel, and TUI show no horizontal scrollbars; the left rail scrolls as a whole rather than clipping RESOURCES; only diff blocks and viewer code scroll on x with a sticky file header

#### Scenario: Topbar never wraps (§12)
- WHEN the session title is long
- THEN the title ellipsizes and the chips, buttons, and view toggle remain single-line

### Requirement: TUI mode sharing all state
The TUI view SHALL render the same session state as Mission Control as a character grid (header line, agent block, last 15 transcript lines, issues/plan footer, prompt line) with the topbar and prompt bar persisting; lines single-spaced (§12).

#### Scenario: State parity on toggle
- WHEN the user toggles Mission Control → TUI and back
- THEN step position, filter, queue, viewer, and tab state are identical before and after (one shared store)

#### Scenario: TUI line discipline
- WHEN the TUI renders
- THEN transcript shows at most the last 15 lines, single-spaced, with truncation per the prototype (`tr(…,84)`, name pad 13/14)

### Requirement: Namespaced design tokens and typography
All colors SHALL come from a route-scoped `terminal-*` custom-property set whose values are exactly the guidance §2 / AGENT_INTEGRATION §5 hexes (background #0a0a0a, panel #141414, raised #1e1e1e, borders #282828/#3c3c3c, text #eeeeee/#808080/#606060, primary #fab283, #5c9cf5, #9d7cd8, #e06c75, #7fd88f, #56b6c2, #e5c07b, diff #4fd6be-on-#20303b / #e26a75-on-#37222c / #828bb8). Typography SHALL be JetBrains Mono only, 10–13.5px scale, weights 400/500/700, bundled with the app (not CDN-fetched). The fixed glyph vocabulary (○◐●◇✗✓⑂ ◆ ✎ ▤ ❯) MUST be used verbatim; no new glyphs or emoji.

#### Scenario: Exact token values
- WHEN computed styles are captured on rendered elements
- THEN sampled element colors (topbar brand, working glyph, error output, diff add/del rows, fork banner border) match the mandated hexes exactly with zero tolerance

#### Scenario: Font resolves (§12)
- WHEN the route loads
- THEN JetBrains Mono resolves as the rendered font family with no console errors and no unresolved token values

### Requirement: Status vocabulary rendering
Agent and plan glyphs SHALL follow the §2 status table: ○ idle #606060, ◐ thinking #56b6c2, ● working #fab283, ◇ waiting #e5c07b, ✗ blocked #e06c75, ✓ done #7fd88f, ⑂ deciding #9d7cd8; thinking/working/deciding pulse at 1.4s.

#### Scenario: Glyph/color/motion mapping
- WHEN an agent transitions through states during a session
- THEN its rail glyph, color, and pulse animation match the table for every state

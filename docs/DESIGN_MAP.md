---
last_designed: 2026-07-17T05:25:14Z
design_baseline: agentic-terminal-v1.0 (Claude Design project a1e9856f, "v1.0 · July 15, 2026")
codebase: C:/Users/Paul/Documents/terminus_maximus/.opencode-worktrees/agentic-terminal/packages/app
framework: solidjs-1.9+vite-7+tailwind-4
design_sources:
  - kind: claude-design-project
    path: .architect-team/claude-design/a1e9856f-717c-4388-9950-b34ccaf515ab/
    count: 5
    note: "'Development Guidance.dc.html' is the spec of record; 'Agentic Terminal.dc.html' is the interactive prototype (6 data-screen-label screens)"
  - kind: tokens-file
    path: packages/tui/src/theme/assets/opencode.json
    note: palette source-of-record cited by the design itself
  - kind: tokens-file
    path: packages/ui/src/theme/themes/opencode.json
    note: second in-repo carrier of the signature hexes (the selectable `opencode` DesktopTheme); NO build-time sync with the TUI asset
  - kind: tokens-file
    path: packages/ui/src/v2/styles/colors.css + packages/ui/src/v2/styles/theme.css
    note: the app's existing v2 token system (comparison target, NOT the design source)
viewport_default: { width: 1440, height: 900 }
viewports_responsive: []   # design is fluid 100vh; behavior asserted only for widths >= 900px (guidance §12)
color_format: hex
---

# Agentic Terminal — Design Map

**Status: implemented.** The Agentic Terminal ships at `/agentic` in both layout modes, with Mission
Control and TUI projections driven by the real opencode session/event stream. The Phase A simulation
has been removed. The `agentic-terminal-v1.0` baseline is satisfied: all Development Guidance §12 rows
were re-targeted to the live no-mock harness and are green, and adversarial design sweeps confirmed the
complete token surface. Values below remain the binding baseline. "Guidance §N" =
`Development Guidance.dc.html`; "Prototype:N" = line in `Agentic Terminal.dc.html`; "AI §N" =
`AGENT_INTEGRATION.md`.

The shipped token implementation is **`packages/app/src/pages/agentic-terminal/tokens.css`**. It is
surface-scoped under `.agentic-terminal`, imports bundled JetBrains Mono, and carries the exact
`terminal-*` custom properties used by every panel; no global v2 semantic token was remapped.

## Design Tokens

### Color palette — the 21 mandated tokens (Guidance §2 + AI §5)

Match legend vs the app's v2 system (`packages/ui/src/v2/styles/colors.css` primitives +
`theme.css` `[data-color-scheme="dark"]` semantics): **exact** = identical hex exists;
**approx** = nearest hex within ~Δ6/channel; **missing** = no usable v2 counterpart.

| Token (proposed name) | Value | Semantic role | opencode.json (cited source) | App v2 match |
|---|---|---|---|---|
| `terminal.bg` | `#0a0a0a` | app background | `darkStep1` = `background` dark — **exact** | approx: `--v2-grey-1200` `#080808` (= dark `bg-deep`) |
| `terminal.panel` | `#141414` | rails, cards, cmd blocks | `darkStep2` = `backgroundPanel` — **exact** | approx: `--v2-grey-1100` `#161616` (= dark `bg-base`) |
| `terminal.raised` | `#1e1e1e` | hover, chips, buttons | `darkStep3` = `backgroundElement` — **exact** | approx: `--v2-grey-1000` `#242424` (= dark `bg-layer-01`) |
| `terminal.border` | `#282828` | panel seams | `darkStep4` — **exact** | approx: `--v2-grey-900` `#2e2e2e`; dark `border-muted` is alpha-white `#ffffff14` |
| `terminal.border-strong` | `#3c3c3c` | interactive outlines | `darkStep6` = `borderSubtle` — **exact** | approx: `--v2-grey-800` `#3a3a3a` |
| `terminal.text` | `#eeeeee` | primary text | `darkStep12` = `text` — **exact** | **exact primitive**: `--v2-grey-300` (but dark semantic `text-base` = grey-100 `#fafafa`) |
| `terminal.muted` | `#808080` | secondary text | `darkStep11` = `textMuted` — **exact** | **exact primitive**: `--v2-grey-600` (but dark semantic `text-muted` = grey-500 `#aeaeae`) |
| `terminal.dim` | `#606060` | hints, labels, glyph idle | `darkStep8` = `borderActive` — **exact** | approx: `--v2-grey-700` `#5c5c5c` |
| `terminal.primary` | `#fab283` | brand, working, cursor, next-up chip, context bar, active tab | `darkStep9` = `primary` dark — **exact** | **exact literal, wrong scope**: `ui/src/v2/styles/theme.css:9,11` (`--syntax-property`/`--syntax-critical` dark, legacy `oc-2` scope only); nearest v2 primitive `--v2-orange-500` `#ffa478` (loose) |
| `terminal.primary-hover` | `#ffc09f` | link hover (Prototype:18) | `darkStep10` — **exact** | approx: `--v2-orange-400` `#ffc1a4` |
| `terminal.secondary` | `#5c9cf5` | coder-1 identity | `darkSecondary` — **exact** | missing (nearest `--v2-blue-500` `#7698fd`, loose) |
| `terminal.accent` | `#9d7cd8` | forks, spawn, reviewer, md h2 | `darkAccent` — **exact** | missing (nearest `--v2-purple-400` `#9e99f7`, loose) |
| `terminal.error` | `#e06c75` | blocked, open issues, failed cmd | `darkRed` = `error` — **exact** | missing (nearest `--v2-red-500` `#f17471`, loose) |
| `terminal.success` | `#7fd88f` | done, resolved | `darkGreen` = `success` — **exact** | missing (nearest `--v2-green-500` `#6bd586`, loose) |
| `terminal.info` | `#56b6c2` | thinking, explorer | `darkCyan` = `info` — **exact** | missing (nearest `--v2-cyan-400` `#65d9eb`, loose) |
| `terminal.warn` | `#e5c07b` | waiting, fixing, modified, coder-2 | `darkYellow` — **exact** (no semantic role in the theme block; opencode.json's `warning` role maps to `darkOrange` `#f5a742`, `opencode.json:22,60-63`) | missing (nearest `--v2-yellow-500` `#f2cf76`, loose) |
| `terminal.file` | `#828bb8` | file/edit glyphs, diff context, file headers | `diffContext` dark — **exact** | missing |
| `terminal.diff-add-fg` | `#4fd6be` | diff added text | `diffAdded` dark — **exact** | missing (v2 `--text-diff-add-base` dark = `#c4ffc0`, different scheme, `oc-2` scope) |
| `terminal.diff-add-bg` | `#20303b` | diff added bg | `diffAddedBg` dark — **exact** | missing |
| `terminal.diff-del-fg` | `#e26a75` | diff removed text | `diffHighlightRemoved` dark — **exact** (note: NOT `diffRemoved` `#c53b53`) | missing (v2 delete = `#ec2f14`, different scheme) |
| `terminal.diff-del-bg` | `#37222c` | diff removed bg | `diffRemovedBg` dark — **exact** | missing |

**Cross-reference verdicts:** design ↔ `opencode.json`: **21/21 exact** (the design is a faithful
projection of the TUI dark palette; only naming nuance: it uses `diffHighlightRemoved` for removed-line
fg and `darkStep8` for "dim" text rather than as a border). Design ↔ app v2 tokens: **2 exact
primitives + 1 exact-but-legacy-scoped literal (`#fab283`), 7 approximate, 11 missing** — and no v2
*semantic* token matches at all, because the app's dark theme is built on the grey-1100/1200 +
blue-accent ramp, not the opencode TUI palette. **Implementation must introduce the design's exact
hexes** (recommended: a scoped token namespace for this surface, or theme-level additions) rather than
substituting v2 near-matches — every "approx" above is a visible-drift risk that
`visual-fidelity-reconciliation` would flag.

**Second in-repo hex carrier (fleet-confirmed, INTEGRATION_MAP #13):**
`packages/ui/src/theme/themes/opencode.json` — imported at
`packages/ui/src/theme/default-themes.ts:27` and registered as the selectable `opencode`
`DesktopTheme` (`default-themes.ts:65,104`) — carries the same signature hexes (`#fab283` primary,
`#9d7cd8` accent, et al.). It is a legitimate in-repo reference for the values alongside the TUI
asset, but it is theme-level (not v2 semantic tokens) and has **no build-time sync** with
`packages/tui/src/theme/assets/opencode.json`, so neither file can be assumed to track the other.
The surface-scoped exact-hex `terminal.*` token stance above is unchanged.

### Secondary literals used by the prototype (not in the §2/§5 tables, still binding)

| Value | Used for | Source | App v2 match |
|---|---|---|---|
| `#161616` | feed item divider (`border-bottom`) | Prototype:118 | **exact**: `--v2-grey-1100` |
| `#0f0f0f` | queue strip bg, file-viewer bg | Prototype:228,244 | missing |
| `#484848` | timestamps, code line numbers | Prototype:121,272 (= `darkStep7`/`border` in opencode.json) | missing |
| `#c9c9c9` | user text, queue chip text, code default | Prototype:233,477,583 | missing |
| `#d6d6d6` | agent narration text, editor text, code keywords | Prototype:260,477,583 | approx: `--v2-grey-400` `#dbdbdb` |
| `#b8b8b8` | file paths in rail, plan done labels | Prototype:74,499 | missing |
| `#a0a0a0` | flow-graph node labels | Prototype:204 | missing |
| `#3f5c48` | flow: done delegation edge (dimmed green) | Guidance §7; Prototype:512 | missing |
| `#2f4a52` / `#4a3f5c` | flow: dashed handoff edges (explorer / reviewer tint) | Prototype:514-517 | missing |
| `#4a5c50` | scrubber past ticks | Prototype:529 | missing |
| `rgba(0,0,0,.55)` | viewer drop shadow `-16px 0 40px` | Prototype:244 | — (see elevation) |

### Typography

Design: **JetBrains Mono only** (Google Fonts, weights 400/500/700 + italic 400 — Prototype:11), UI
scale 10–13.5px (Guidance §2; AI §5: "13px base, 12.5px body, 11px meta, 10px section labels (2px
letter-spacing)").

| Token | Size | Weight | Line-height | Use (source) |
|---|---|---|---|---|
| `type.base` | 13px | 400 | 1.55 | root, prompt input (Prototype:24,281) |
| `type.body` | 12.5px | 400 | 1.55–1.6 | feed text, agent names (500), TUI lines, viewer path/code, issue titles, fork title (700) (Prototype:59,124,220,247,260,272) |
| `type.small` | 12px | 400 | — | topbar session title, cmd blocks, spawn lines, plan labels, fork option labels (Prototype:27,127,130,163) |
| `type.tab` | 11.5px | 400 | — | right-panel tab labels, RESOURCES rows (Prototype:82,152) |
| `type.meta` | 11px | 400 | — | chips, buttons, branch/status, task lines, issue detail, diff header (Prototype:28,37,64,137,186) |
| `type.hint` | 10.5px | 400 | 1.5–1.9 | hints, legends, queue buttons, plan notes, footers (Prototype:97,164,168,208,238,276,283) |
| `type.label` | 10px | 400, letter-spacing 2px | — | section labels AGENTS/FILES/RESOURCES/QUEUE; also badges/tokens/costs at normal spacing (Prototype:49,61,121,182,229) |
| `type.viewer-h1` | 17px | 700 | 1.6 | md `#` heading, color `#fab283` (Prototype:575) |
| `type.viewer-h2` | 13.5px | 700 | 1.6 | md `##` heading, color `#9d7cd8` (Prototype:576) |
| flow-graph SVG text | 10 / 9 / 8px | 400 | — | node glyph / name / tokens (Prototype:203-205) |

**Implemented comparison:** the app-wide mono stack remains generic and the v2 body remains Inter,
but the Agentic Terminal now bundles `@fontsource/jetbrains-mono` and applies JetBrains Mono locally
from `tokens.css`. The design's 10–13.5px type scale remains surface-scoped and does not alter global
application typography.

### Spacing, geometry, radii, shadows, motion

| Token | Value | Source |
|---|---|---|
| `layout.topbar-h` | 46px (padding 0 14px, gap 12px) | Guidance §3; Prototype:25 |
| `layout.rail-w` | 270px | Guidance §3; Prototype:46 (`grid-template-columns:270px 1fr 344px`) |
| `layout.right-panel-w` | 344px | same |
| `layout.viewer` | width 640px, max-width 84vw, absolute top 46px / right 0 / bottom 0, z-index 20 | Guidance §3; Prototype:244 |
| `space.row-pad` | rail rows 7px 14px; FILES rows 4px 14px; feed items 9px 18px; issue cards 10px 12px (margin 10px 12px); viewer header 10px 14px; prompt bar 12px 16px; queue strip 8px 16px | Prototype:50,72,118,180,245,279,228 |
| `radius.chip` | 4px (chips, buttons, badges, scrubber-track thumb) | Prototype:28,37 |
| `radius.card` | 5px (cmd blocks, diff cards, fork option cards) | Prototype:100,130,136 |
| `radius.banner` | 6px (fork banner, issue cards) | Prototype:92,180 |
| `radius.pill` | 10px (filter chip), 9px (issue status pill) | Prototype:113,182 |
| `radius.tick` | 2px (scrubber ticks 11×5px; context bar 4px height) | Prototype:33,86 |
| `shadow.viewer` | `-16px 0 40px rgba(0,0,0,.55)` | Prototype:244 |
| `motion.pulse` | `pulse 1.4s ease-in-out infinite` (opacity 1 → .3 at 50%) — thinking/working/fork glyphs, active plan nodes, fork banner glyph | Guidance §2; Prototype:20,94 |
| `motion.blink` | `blink 1.1s step-end infinite` — feed typing cursor `▋` | Prototype:21,145 |
| `scrollbar` | 8px w/h; thumb `#282828` radius 4px; track transparent | Prototype:15-17 |
| `border-left.selected` | 2px solid agent-color (rail selection); `border-bottom` 2px `#fab283` (active tab) | Prototype:50,152 |

App v2 has none of these as tokens (its elevation set `--v2-elevation-*` is a different visual
language, `v2/styles/theme.css:475-497`); geometry must be implemented per this table.

### Status-glyph vocabulary (fixed — AI §5 forbids new glyphs/emoji)

| Glyph | State | Color | Motion |
|---|---|---|---|
| `○` | idle | `#606060` | static |
| `◐` | thinking | `#56b6c2` | pulse 1.4s |
| `●` | working | `#fab283` | pulse 1.4s |
| `◇` | waiting | `#e5c07b` | static |
| `✗` | blocked/error | `#e06c75` | static |
| `✓` | done | `#7fd88f` | static |
| `⑂` | deciding / fork live | `#9d7cd8` | pulse 1.4s |
| `◆` spawn · `✎` file · `▤` doc · `❯` prompt · `▋`/`▊` cursor · `◎` all-activity · `├─ ╰─` tree | fixed companions | per context (Guidance §2/§9; AI §5) | — |

### Agent identity palette (Guidance §7; AI §2 — assign in order, stable per session)

`#fab283` orchestrator (root only) → `#56b6c2` explorer → `#5c9cf5` coder-1 → `#e5c07b` coder-2 →
`#9d7cd8` reviewer → `#7fd88f` (6th). Flow-graph: solid edges = delegation (stroke = target's status
color; done dims to `#3f5c48`); dashed (`3 3`) = handoffs/reports (`#2f4a52`, `#4a3f5c`).

## Asset Registry

All 5 files at `.architect-team/claude-design/a1e9856f-717c-4388-9950-b34ccaf515ab/` (SHA-256 computed
2026-07-16, `sha256sum`):

| Asset ID | File | Purpose | Size | SHA-256 |
|---|---|---|---|---|
| `guidance-doc` | `Development Guidance.dc.html` | **spec of record** (tokens §2, layout §3, interactions §4-§9, sim/metrics §10-§11, acceptance §12) | 25,697 B | `34ab041d5231b8681e201c8ee58e6d8e0c2f7ee6c68a88244bc5b64bd50bab47` |
| `prototype` | `Agentic Terminal.dc.html` | interactive prototype; 6 `data-screen-label` screens; logic class = behavioral oracle | 46,051 B | `b0866eec4422c2e155dfa63da71262f20ed99d693cb5131070dcf39a949c4ebf` |
| `integration-guide` | `AGENT_INTEGRATION.md` | Phase-B contract: event envelope, payload kinds, agent registry, fixed/derived/supplied classes, visual tokens §5 | 10,961 B | `e6e98148c01f994e408584fc5548ba1636abc4c06238eee080840a3d855757ee` |
| `dc-doc-runtime` | `doc-page.js` | Claude Design page-rendering runtime for the guidance doc — NOT a shippable asset | 21,468 B | `b92fdbcd320f8b33b0f00397523c4597ec04e964325102aef9e9b07403566086` |
| `dc-support-runtime` | `support.js` | Claude Design component runtime (`x-dc`, `sc-for`, `sc-if`, `DCLogic`) — NOT a shippable asset | 65,990 B | `45617d5d82ed9e7c3890bb2899dce8973994aabf69f38879860fbb846937f353` |

Fonts: both HTML files load **JetBrains Mono from Google Fonts CDN** (Prototype:11 — weights
400/500/700 + italic 400; guidance additionally loads IBM Plex Sans for the *document itself only*, not
the product UI). No raster/vector image assets exist in the design; all iconography is the glyph
vocabulary above.

## Per-Screen Visual Specs

Six screens, one per `data-screen-label` in the prototype. Root context for all: container
`height:100vh`, column flex, bg `#0a0a0a`, text `#eeeeee`, `'JetBrains Mono',monospace` 13px,
`overflow:hidden`, `position:relative` (Prototype:24). All px values below are read from the
prototype's inline styles (exact). `value_class` per `dynamic-value-discovery`, mapped from AI §6:
class A (fixed chrome) = `static`; class B (derived) = `dynamic (derived client-side)`; class C
(agent-supplied) = `dynamic` with the named event-stream source.

### Screen: "Top bar" (Prototype:25-43) — persistent in both views

Row flex, height 46px, padding 0 14px, gap 12px, `border-bottom:1px solid #282828`, `flex:none`.
Never wraps: chips/buttons single-line; session title ellipsizes (Guidance §12).

| Element (inventory_id) | Spec | value_class / data_source | target_link |
|---|---|---|---|
| `topbar-brand` | `▌opencode` — `#fab283`, 700, letter-spacing .5px, nowrap | static | none (design annotates no action; UX convention logo→home would apply only if the surface adds chrome navigation — see Coverage & Gaps) |
| `topbar-session-title` | 12px `#808080`, `flex:0 1 auto`, ellipsis | dynamic — user's opening prompt, trimmed (AI §3/§6C) | — |
| `topbar-branch-chip` | bg `#1e1e1e`, border 1px `#3c3c3c`, radius 4, padding 1px 8px, 11px `#808080`, ` ` glyph prefix | dynamic — VCS branch at session start (AI §6C) | — |
| `topbar-status-chip` | 11px, text+color derived: `▶ live` `#fab283` / `⏸ paused` `#e5c07b` / `⑂ awaiting decision` `#9d7cd8` / `✓ complete` `#7fd88f` (Prototype:519) | dynamic (derived: play state + fork + step) | — |
| `topbar-scrubber` | 13 ticks 11×5px radius 2, gap 4px; past `#4a5c50`, current `#fab283`, future `#282828`; click = jump-to-step + pause | dynamic (derived: checkpoint list; sim-only replay per AI "simulation-only artifacts") | state: `{step:i, playing:false}` (explicit onClick, Prototype:529) |
| `topbar-step-label` | 11px `#606060`, margin-left 6px, `{step}/12` | dynamic (derived) | — |
| `topbar-play` | bg `#1e1e1e`, border `#3c3c3c`, radius 4, `#eeeeee` 11px, padding 4px 10px; hover border `#606060`; label `⏸ pause`/`▶ play` | label dynamic (derived) | state: toggle playing (explicit) |
| `topbar-restart` | transparent, border `#282828`, `#808080` 11px, padding 4px 10px; hover `#eeeeee`/border `#606060` | static | state: reset step/choice/sent/filter, keep queue+edits+view+tab (Guidance §10; sim-only) |
| `topbar-view-toggle` | segmented, outer border `#3c3c3c` radius 4; segments padding 5px 10px 11px; active bg `#282828` `#eeeeee`, inactive transparent `#808080`; divider border-left `#3c3c3c` | static labels | state: `view = mission|tui` (explicit; hotkey `v`) |

### Screen: "Mission Control" (Prototype:46-216) — default view

`flex:1`, CSS grid `270px 1fr 344px`, `min-height:0`.

**Left rail (270px)** — bg `#141414`, `border-right:1px solid #282828`, column flex, scrolls as a
whole (`overflow-y:auto`) when height-constrained (Guidance §3):
- Section labels `AGENTS` / `FILES` / `RESOURCES`: 10px, letter-spacing 2px, `#606060`; paddings
  12px 14px 6px / 14px 14px 4px / inside footer (static chrome).
- `rail-all-activity` row: `◎` `#808080` + "all activity" 12px `#eeeeee` + `{N} events` 10px `#606060`;
  padding 7px 14px; selected: bg `#1e1e1e` + border-left 2px `#eeeeee`; hover bg `#1e1e1e`.
  Action: clear filter (explicit). Count = dynamic (derived).
- `rail-agent-row` (per registered agent): padding 7px 14px (task line indent 42px children / 22px
  root); tree connector `├─`/`╰─` (`#3c3c3c` 11px, root `◆`); status glyph (vocabulary table; pulses on
  think/work/fork); name 12.5px 500 in agent color; task line 11px `#808080` (error state → `#e06c75`),
  ellipsis; tokens 10px `#606060` (`41.2k` format); cost 10px `#606060` (`$0.62`, hidden when
  `showCost=false`). Selected: bg `#1e1e1e` + border-left 2px agent-color. Action: toggle transcript
  filter to agent (explicit; click again clears). name/task = dynamic (registry §2 / `status.task`);
  tokens/cost = dynamic (`resource` events).
- `rail-file-row` (per touched file; container max-height 170px, own scroll): icon `✎` `#828bb8` (code)
  / `▤` `#9d7cd8` (md) 11px; path 11px `#b8b8b8` ellipsis; stat 10px `#606060`, or `modified` in
  `#e5c07b` when session-edited. Action: open file viewer (explicit). path/stat = dynamic (`file`
  events; first event per path registers it — AI §1).
- `rail-resources` footer: border-top `#282828`, padding 12px 14px, gap 7px; rows 11.5px
  (label `#808080` / value `#eeeeee`): tokens, cost, elapsed, context %; context bar 4px h, track
  `#282828`, fill `#fab283`, radius 2. All values dynamic (derived from `resource` events; sim formulas
  in Guidance §10 are placeholders — replace with real telemetry).

**Center transcript (fluid)** — column flex, `min-width:0`:
- `fork-banner` (conditional: fork open): margin 12px 16px 0, border 1px `#9d7cd8`, radius 6, bg
  `#141414`, padding 12px 14px. Header: `⑂` `#9d7cd8` pulsing + title 12.5px 700 `#9d7cd8`
  (`decision fork — ` prefix is fixed chrome, remainder from `fork.prompt`) + hint `click, or press
  1 / 2` 10.5px `#606060` (static). Option cards ×2: `flex:1`, border `#3c3c3c`, radius 5, padding
  9px 12px; hover border `#9d7cd8` + bg `#1e1e1e`; label 12px `#eeeeee` (`{key} · {label}`), tradeoff
  note 11px `#808080` margin-top 3px. Action: resolve fork (explicit; equivalents: keys 1/2, plan-tab
  ⑂ row). Fork pauses session; `→` locked while unresolved (Guidance §4/§6). Labels/notes = dynamic
  (`fork.options[*]`).
- `filter-chip` (conditional: agent filter active): padding 8px 16px 0; chip bg `#1e1e1e`, border
  `#3c3c3c`, radius 10px, padding 2px 10px, 11px in agent color, `filter: {name} ✕`; hover border
  `#606060`. Action: clear filter (explicit). name = dynamic (selected agent).
- `feed` (`#feed`): `flex:1`, `overflow-y:auto`, `overflow-x:hidden`, padding 6px 0 12px; autoscroll
  only when pinned to bottom (AI §3). Items: padding 9px 18px, `border-bottom:1px solid #161616`;
  author 11px 700 agent-color (`you` = `#eeeeee` for user); timestamp 10px `#484848` (`m:ss` derived
  from event `ts`). Kind renderings (all payloads = dynamic, event-stream C-class):
  - text: 12.5px, lh 1.55, max-width 760px; agent `#d6d6d6`, user `#c9c9c9`.
  - spawn: `◆ spawned **{child}** — {task}` 12px `#9d7cd8` (task part `#808080`).
  - cmd: block bg `#141414`, border `#282828`, radius 5, padding 7px 10px, 12px, max-width 760px;
    `$ ` `#606060` + cmd `#eeeeee`; output line: `#e06c75` when `exit != 0`, else `#808080`.
  - file/diff: card border `#282828` radius 5, max-width 760px, `overflow-x:auto`; sticky header bg
    `#141414` padding 4px 10px 11px `#828bb8` `✎ {path} ↗` (hover `#eeeeee` underline; action: open
    viewer — explicit); diff lines 12px padding 1px 10px `white-space:pre`, `+` `#4fd6be` on `#20303b`,
    `−` `#e26a75` on `#37222c`, context `#828bb8` on transparent; ≤ 6 lines (AI §4.1).
  - typing cursor row: `▋` `#fab283`, blink 1.1s, padding 10px 18px.

**Right panel (344px)** — bg `#141414`, `border-left:1px solid #282828`, column flex:
- `panel-tabs`: row, border-bottom `#282828`; buttons `flex:1`, 11.5px, padding 9px 0; active: bg
  `#1e1e1e`, border-bottom 2px `#fab283`, `#eeeeee`; inactive transparent `#808080`, hover `#eeeeee`.
  Labels `plan {done}/{total}` / `issues[ · N]` / `flow` — counters dynamic (derived; issues badge
  counts unresolved only, Guidance §8). Action: switch tab (explicit).
- Plan tab: rows padding 5px 16px, indent 16+ind×16px, gap 9px; glyph map — done `✓` `#7fd88f`,
  active `●` `#fab283` pulse, pending `○` `#606060`, fork option `⑂` `#9d7cd8` pulse (clickable →
  resolves fork), rejected `⑂` `#606060` + label line-through + note `rejected at fork`; labels 12px
  (pending/rejected `#606060`, active `#eeeeee`, done `#b8b8b8`); note/`by` 10.5px `#606060`; hover bg
  `#1e1e1e`. Legend (static chrome): `✓ done ● active ○ pending ⑂ fork option / rejected`, 10.5px
  `#606060`, border-top `#282828`. Node labels/attribution = dynamic (`plan` events; `reject` never
  deletes — AI §1).
- Issues tab: empty state `no issues yet — clean run` 12px `#606060` centered padding 24px 16px
  (static). Cards (newest first): margin 10px 12px, bg `#0a0a0a`, border 1px state-color (open
  `#e06c75` / fixing `#e5c07b` / resolved fades to `#282828`), radius 6, padding 10px 12px; status pill
  10px bordered state-color radius 9px padding 1px 8px; raising agent+file 10.5px `#606060`; title
  12.5px `#eeeeee`; detail 11px `#808080` lh 1.5; resolution `↳ {res}` 11px `#7fd88f` (required on
  resolved). All content dynamic (`issue` events).
- Flow tab: SVG `viewBox="0 0 300 214"` width 100%; nodes: circle r13 fill `#141414` stroke 1.5px
  status-color (idle → `#3c3c3c`), glyph text 10px status-color, name 9px `#a0a0a0`, tokens 8px
  `#606060`; edges 1.2px — solid delegation (target status color; done `#3f5c48`), dashed `3 3`
  handoffs (`#2f4a52`, `#4a3f5c`). Legend (static): `solid — delegation · dashed — handoff / report`,
  10.5px `#606060`. Topology dynamic (registry `parent` + handoff events).

### Screen: "TUI" (Prototype:219-225) — alternate view, same state

Single pane replacing the grid: `flex:1`, overflow-y auto, padding 14px 18px, 12.5px, lh 1.55.
Lines `min-height:19px`, `white-space:pre`, single-spaced, colored spans (weight 400/500/700).
Structure (Prototype:594-623): header line (brand `#fab283` 700 · title `#808080` · `step N/12 ·
tokens · cost` `#606060`) → `─` separator rows `#282828` (repeat ×100) → ` AGENTS` block (tree glyph
`#3c3c3c`, status glyph status-color, name padEnd(14) agent-color 500, task truncated 44/padEnd(46)
`#808080`, tokens padStart(7) `#606060`, cost `#606060`) → last **15** transcript lines (same kind
renderings, text truncated 84ch, diff lines colored by `DIFFC`) → separator → footer (` ISSUES `
`#606060` + `N open` `#e06c75`/`none open` `#606060`; `PLAN` + `d/t done` `#7fd88f`; fork hint
`⑂ fork — press 1 or 2` `#9d7cd8` when live) → prompt line ` ❯ ` `#fab283` 700 + `▊` cursor `#fab283`.
Topbar and prompt bar persist around it; no extra data vs Mission Control (AI §3 TUI rule).

### Screen: "Prompt queue" (Prototype:228-242) — conditional strip (only when queue non-empty)

Row flex, `border-top:1px solid #282828`, padding 8px 16px, bg `#0f0f0f`, gap 8px, `overflow-x:auto`:
`QUEUE` label (10px ls 2px `#606060`, static) · chips: bg `#1e1e1e`, border 1px — **next-up `#fab283`,
others `#3c3c3c`** — radius 4, padding 3px 9px, 11px, max-width 340px; `#N` `#606060` + text `#c9c9c9`
ellipsis + `✕` `#606060` hover `#e06c75` (action: remove one — explicit) · spacer · `send next ↑`
button (bg `#1e1e1e`, border `#3c3c3c`, `#eeeeee` 10.5px, padding 3px 9px; hover border `#fab283`;
action: manual dispatch — explicit) · `clear` (transparent, border `#282828`, `#808080`; hover
`#eeeeee`; action: empty queue — explicit) · note `auto-drains 1 / step` 10px `#606060` (static).
Chip numbering = dynamic (derived, dispatch order). Semantics: drain exactly 1/step while playing;
holds on pause / open fork / completion; queue survives restart (Guidance §5/§10).

### Screen: "File viewer" (Prototype:244-277) — conditional overlay, both views

`position:absolute; top:46px; right:0; bottom:0; width:640px; max-width:84vw`, bg `#0f0f0f`,
`border-left:1px solid #3c3c3c`, `box-shadow:-16px 0 40px rgba(0,0,0,.55)`, column flex, `z-index:20`.
- Header: padding 10px 14px, border-bottom `#282828`, gap 10px: `▤` `#828bb8` 12px · path 12.5px
  `#eeeeee` (dynamic — `file.path`) · lang badge 10px border `#3c3c3c` radius 4 padding 1px 6px
  `#808080` (dynamic — `file.lang`) · `modified` badge (conditional; identical shape, `#e5c07b`
  border+text) · `edit`/`save` button (bg `#1e1e1e`, border `#3c3c3c`, `#eeeeee` 11px, padding
  4px 12px; hover border `#fab283`; explicit action: swap editor in / persist session-local edit) ·
  `revert` (conditional on modified; transparent, border `#282828`, `#808080`; explicit: restore
  canonical) · `✕` close (borderless, `#808080` 14px; hover `#eeeeee`; explicit; `esc` equivalent —
  works even while typing, the only hotkey that does).
- Editor state: `<textarea>` `flex:1`, bg `#0a0a0a`, no border/outline, `#d6d6d6`, 12.5px, lh 1.6,
  padding 14px 16px, no spellcheck.
- Markdown render: padding 14px 18px; `#` → 17px 700 `#fab283`; `##` → 13.5px 700 `#9d7cd8`; `- ` →
  `• ` with margin-left 10px; `_meta_` → 11.5px `#808080`; fenced code → bg `#141414` `#7fd88f`
  padding 1px 10px; default 12.5px `#c9c9c9`; backticks stripped; radius 4; lh 1.6.
- Code render: padding 12px 0, x+y scroll; rows flex 12.5px lh 1.6 `width:max-content;min-width:100%`;
  line numbers padStart(3) `#484848` padding 0 14px non-selectable; comment lines (`//`) `#606060`;
  keyword-leading lines (`import|export|const|return|if`) `#d6d6d6`; default `#c9c9c9`;
  `white-space:pre`.
- Footer: `edits stay in this session · esc to close` 10.5px `#606060`, border-top `#282828`, padding
  7px 14px (static). File content = dynamic (`file.content`, full post-edit file — AI §1); user edits
  emit `{kind:"user_edit"}` upstream and survive restart (AI §3; Guidance §9/§10).

### Screen: "Prompt" (Prototype:279-284) — persistent bottom bar

Row flex, `border-top:1px solid #282828`, padding 12px 16px, bg `#141414`, gap 10px: `❯` `#fab283`
700 · input `flex:1`, transparent, borderless, `#eeeeee` 13px, placeholder `steer the orchestrator…
enter sends · shift+enter queues · split chunks with |` `#606060` (static chrome) · `+ queue` button
(transparent, border `#3c3c3c`, radius 4, `#808080` 10.5px, padding 4px 9px; hover `#eeeeee` border
`#606060`; explicit: draft into queue) · hotkey hint `space play/pause · ←→ step · v view · click
agent to filter` 10.5px `#606060` ellipsis (static). Semantics: `enter` sends now (orchestrator must
acknowledge with a REAL `text` event in live build — the canned reply is sim filler, AI §3 warning);
`shift+enter` queues; `|` splits chunks (first sends, rest queue); empty input ignored; **hotkey
guard**: all hotkeys inert while focus is in this input or the editor, `esc` excepted (Guidance §4).

## Link Inference for Un-Annotated Interactive Elements

This design is a **single-route surface**: every interactive element's effect is client-state
(play/pause, step, filter, tab, fork choice, queue ops, viewer open/edit/close, view toggle), each
explicitly wired in the prototype's logic class — `source: "explicit"` for all of them; there are no
cross-route links to infer, and no blank links exist. One genuine unknown remains — the **mount route
of the surface itself** — recorded in Coverage & Gaps:

```json
{
  "element_id": "agentic-terminal-surface-entry",
  "target_link": {
    "target": "?",
    "source": "unknown",
    "confidence": "low",
    "reasoning": "The design nowhere names the URL it lives at; ROUTE_MAP shows no existing route for it. /terminal as a sibling of NewHome (app.tsx:595-599) is the structurally free mount (event stream + v2 shell for free) but the path name is a Phase 1 decision.",
    "alternatives": ["/terminal (recommended; new-layout sibling)", "/mission-control", "a mode inside /server/:serverKey/session/:id"],
    "awaiting_confirmation": true
  }
}
```

## Asset Placement Diagram

Mission Control at default viewport (Guidance §3, verified against Prototype geometry):

```
+- topbar 46px · brand · session · branch · status · scrubber · play/restart · toggle -+
+--------------+--------------------------------------------+-------------------------+
| rail 270px   | transcript feed (fluid)                    | right panel 344px       |
| AGENTS tree  | fork banner (conditional · purple)         | tabs: plan·issues·flow  |
| FILES list   | filter chip (conditional)                  |                         |
| RESOURCES    | agent · tool · diff · spawn items + ▋      |     [file viewer        |
+--------------+--------------------------------------------+      overlay: absolute  |
| queue strip (conditional) · numbered chips · send next · clear    top 46 · right 0   |
| prompt bar · ❯ input · + queue · hotkey hints                     w 640 (max 84vw)   |
+---------------------------------------------------------------    z-index 20]  ------+
```

TUI mode: one character-grid pane replaces the three columns; topbar + prompt bar persist; viewer
overlay available in both modes. Scroll containment: rail scrolls as a whole; feed / right panel /
viewer body scroll independently; horizontal overflow clipped everywhere EXCEPT diff blocks and viewer
code (x-scroll, sticky file header) (Guidance §3/§12).

## Theme Variants

Design ships **dark only** — it is the opencode TUI dark palette verbatim. No light-theme variant
exists in any design file. The app supports light/dark (`ThemeProvider`,
`[data-color-scheme]` forks in `v2/styles/theme.css`); the opencode.json light ramp (`lightStep9`
primary `#3b7dd8` etc.) would be the natural source for a future light variant, but **no light spec is
part of this baseline** (gap, escalated below).

## Detected Drift

**Primary record: `implemented` — no unresolved baseline drift.** The original app-v2 mismatches were
resolved locally rather than by changing the global theme:

| Token / element | Implemented resolution | Verification |
|---|---|---|
| dark surface + text ramps | Exact opaque baseline values are declared as scoped `--terminal-*` properties in `tokens.css`; no v2 near-match substitution | adversarial token sweep: 21/21 mandated values and 12/12 auxiliary values exact |
| primary/accent/status/diff colors | Panels consume only the scoped terminal variables; the adversarial panel scan found no hardcoded color literals or legacy `--agentic-*` names | §12 load/style assertions plus source scan |
| font family + type scale | Bundled JetBrains Mono is applied only to `.agentic-terminal`; local type sizes preserve the baseline without changing global Inter/mono stacks | §12 font-load and computed-style gate |
| layout/overflow/elevation | 46px topbar, 270/fluid/344 grid, scoped scroll regions, sticky diff header, viewer geometry/shadow, and no page-wide horizontal overflow are implemented | live §12 matrix at 900/1280/1920px |
| interaction states | Mission Control/TUI, fork hold and three resolvers, queue, replay, viewer edit lifecycle, and guarded hotkeys share the live store/source | all 18 live Agentic Terminal browser scenarios green |

The `agentic-terminal-v1.0` baseline gate is satisfied. The §12 acceptance set was first automated
against Phase A, then re-targeted to a real `opencode serve` plus deterministic `TestLLMServer` with
zero app-traffic mocks. Adversarial review confirmed token exactness and no unresolved implementation
substitution. Remaining scope boundaries are design limitations, not implementation drift:

```yaml
gaps:
  - kind: missing_theme_variant
    screen: all
    reason: baseline is intentionally dark-only; no light design exists
    escalate: false
  - kind: missing_responsive_spec
    screen: all
    breakpoint: "< 900px"
    reason: baseline and acceptance contract begin at 900px; no mobile/tablet composition was supplied
    escalate: false
  - kind: value_precision
    reason: none — all shipped values come from exact inline/token sources; zero screenshot-estimated entries
    escalate: false
resolved:
  - route: /agentic registered in both layout modes
  - fork: built-in single-question single-select shapes only; arbitrary/free-text/multi-select shapes bypass
  - phase_b: all simulation-only artifacts removed; replay retains real adapted envelopes
  - tokens: packages/app/src/pages/agentic-terminal/tokens.css
```

## Verification hooks (for `playwright-user-flows` Phase B visual-fidelity tests)

- Computed-style assertions: every per-element spec above (font-size, weight, color, bg, border,
  radius, padding) is exact-hex/px — assert with zero tolerance; bounding boxes ±2px.
- Geometry assertions: topbar height 46; grid columns 270/fluid/344; viewer 640w/max 84vw/top 46/z 20.
- Behavioral contract to encode as flows: guidance §12 acceptance checklist (8 items) + hotkey guard +
  fork three-way resolution + queue drain-1-per-step + viewer edit/save/modified/revert cycle.
- Glyph vocabulary is fixed — a test may assert literal glyph characters and their colors.

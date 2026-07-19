# Diagnostic Research — AgenticCommands context crash (researcher-2)

SR: `SR-agentic-commands-context-provider-20260719T092909Z`
Failure: packaged Windows exe renderer fatally crashes on boot with
`Error: Command context must be used within a context provider` thrown from `AgenticCommands` → `useCommand()` (`packages/app/src/app.tsx:528`).
Crash stack confirmed in `.architect-team/verification-notes/exe-smoke/artifacts/inspect-stderr.log:3-14` (minified frames: `use` → `AgenticCommands` → `createComponent` → `get children`).

Verdict up front: **single root cause, mechanically certain** — `<AgenticCommands />` is mounted at `app.tsx:582` as a sibling of `<ServerShell>`, which is the component that (transitively) mounts `CommandProvider`. The mount is therefore outside `CommandProvider`, and `useCommand()` throws unconditionally (no context default). The crash is **not** desktop-specific, **not** prod/minification-specific, and **not** timing-sensitive. It did not surface earlier because the palette e2e was **never executed** (only typechecked) and the unit test that "covers registration" renders nothing. The prior SRC-2 palette verification is **invalid and must be re-run**.

---

## Q1 — Exact provider/router trees for both boot entries

### Throw mechanics (shared by both entries)

- `useCommand` / `CommandProvider` come from `createSimpleContext` — `packages/app/src/context/command.tsx:248`.
- `createSimpleContext` uses `createContext<T>()` **with no default value** (`packages/ui/src/context/helper.tsx:9`) and `use()` throws when `useContext` returns undefined (`packages/ui/src/context/helper.tsx:32-36`). The throw is synchronous, during component creation, identical in dev and prod. There is no web-only default, no lazy path, no recovery.

### Web entry — `packages/app/src/entry.tsx:167-181`

```
render(...)
└─ PlatformProvider (entry.tsx:169)
   └─ AppBaseProviders (app.tsx:366-398)
      MetaProvider → ThemeProvider → LanguageProvider → UiI18nBridge
      → ErrorBoundary (app.tsx:377-381  ← renders the "Something went wrong" ErrorPage)
      → QueryProvider → WslServersProvider → DialogProvider → MarkedProvider → FileComponentProvider
      └─ AppInterface (entry.tsx:171, with disableHealthCheck)   ← SAME component as desktop
```

### Desktop renderer entry — `packages/desktop/src/renderer/index.tsx`

```
render (index.tsx:448)
└─ DesktopRoot (index.tsx:330)
   └─ PlatformProvider (index.tsx:440)
      └─ AppBaseProviders (index.tsx:441)  ← same chain incl. the ErrorBoundary
         └─ App (index.tsx:382) → Show(ready) → Show(defaultServer, keyed)
            └─ AppInterface (index.tsx:412-425, router = DesktopMemoryRouter via index.tsx:351-353,
                             children = <Inner/> which itself calls useCommand at index.tsx:365)
```

### Inside `AppInterface` (app.tsx:544-601) — identical for both entries

```
ServerProvider (:567)
└─ GlobalProvider (:572)
   └─ SettingsProvider (:573)
      └─ ConnectionGate (:574)                         ← gates children on health check / disableHealthCheck
         └─ Show keyed on newLayoutDesigns (:575)      ← remounts everything below on layout-mode toggle
            └─ Dynamic Router (:576-577)
               root callback (:578):
               └─ TabsProvider (:579)
                  └─ PermissionProvider (:580)
                     └─ NotificationProvider (:581)
                        ├─ <AgenticCommands /> (:582)  ←←← CRASH SITE — inside ROUTER context,
                        │                                   OUTSIDE CommandProvider
                        └─ <ServerShell> (:583)
                           └─ QueryProvider (:558)
                              └─ SharedProviders (:559, def :286-296)
                                 ├─ BodyDesignClass (:289)
                                 └─ CommandProvider (:290)   ←←← the ONLY CommandProvider
                                    ├─ DesktopCommands (:291)  ← works: inside provider
                                    └─ HighlightsProvider (:292)
                                       ├─ props.children (:560 — desktop <Inner/>, useCommand OK)
                                       └─ shellProps.children (:561 — layouts/routes/titlebar)
```

Answers to the specific sub-questions:

- **SharedProviders is INSIDE the router context.** It is rendered by `ServerShell` (:583), which is a child of the router `root` callback (:578). Everything under it — `DesktopCommands`, titlebar, layouts — can call `useNavigate`.
- **AgenticCommands at :582 is ALSO inside the router context** (it is inside the root callback). Its `useNavigate()` at :530 would resolve fine. The only missing context is `CommandProvider`. The throw at :528 (`useCommand`) fires before :530 is reached.
- **design.md fact D1** (`openspec/changes/agentic-terminal-desktop-reachability/design.md:18`) claims: "DesktopCommands (`app.tsx:298-319`) sits outside the router and cannot navigate." **This claim is false today and was false at every revision I checked:**
  - At the parent of the implementing commit (`03af00544^` = `dad0fff11`'s ancestry, file `53cc42779` blob): `CommandProvider` already lived in `SharedProviders` inside `ServerShell` inside the router root (verified via `git show 03af00544^:packages/app/src/app.tsx`, lines 286/290/540-569).
  - Even before the `SharedProviders` refactor (`010b456df`, 2026-06-14): `CommandProvider` lived in `AppShellProviders`, mounted by `RouterRoot`, which was rendered **inside** the router `root` callback (old file lines ~174-226 and ~397-410). `DesktopCommands` itself was added later (`e687eb936`) inside that same provider.
  - So D1's rationale was never true in this repo's visible history. The D1-driven decision to mount `AgenticCommands` "at router-root level, above ServerShell" solved a non-existent constraint (router access) while violating a real one (command context). The implementation followed the false premise literally, producing the crash.

## Q2 — Why the failure did not surface before (the pinned explanation)

Candidate-by-candidate, with evidence:

- **(a) `useCommand` has a web-only default — FALSE.** `createContext<T>()` with no default; `use()` throws in every environment (`packages/ui/src/context/helper.tsx:9,34`). Only one `createSimpleContext` implementation is in play (`packages/app/src/context/command.tsx:248` imports from `@opencode-ai/ui/context`).
- **(b) Web entry mounts a different tree — FALSE.** `entry.tsx:171` mounts the exact same `AppInterface`; there is exactly ONE `<AgenticCommands />` mount in the workspace (grep for `AgenticCommands` hits only `app.tsx:527` definition and `app.tsx:582` mount). A web boot renders the same crashing tree; the ErrorBoundary at `app.tsx:377` would show the same ErrorPage in the browser.
- **(c) Unit tests wrap components in providers — MOOT (they render nothing).** `packages/app/src/app.test.tsx:1-19` imports the `DESKTOP_MENU` constant and asserts the View menu contains an `agentic.open` entry. It never mounts `AgenticCommands`, `AppInterface`, or any provider. The "658/658 unit tests" could not have exercised the defect: both suite commands recorded in evidence (`bun test -- desktop-menu.test.ts app.test.tsx`, `bun test --preload ./happydom.ts ./src`) are scoped to `./src` and never render this tree.
- **(d) The prior palette e2e was vacuous — TRUE. This is the pinned explanation.** `chrome-reachability.spec.ts` was **authored and typechecked but never executed**:
  - The teammate self-review `.architect-team/reviews/6.json` (`tests_note`, line 13) folds "chrome-reachability.spec.ts (3 Playwright flows)" into the **bun unit-suite count** ("658 pass ... per npm exec bun test"). `bun test` scoped to `./src` cannot run `e2e/*.spec.ts`, and Playwright specs don't run under bun's runner at all.
  - The independent review `.architect-team/reviews/6-independent.json` `tests_run` lists exactly four commands: `bun test -- desktop-menu.test.ts app.test.tsx`, `npm run typecheck`, `npm run typecheck:e2e`, `bun test --preload ./happydom.ts ./src`. **No `playwright test` invocation anywhere.** Its acceptance item "(5) palette flow ✓ (chrome-reachability.spec.ts test 1)" cites the spec file's *existence*, not a run.
  - The adversarial review (`6-adversarial.json`) also only re-ran bun tests.
  - No run artifacts exist: no `packages/app/test-results/`, no `packages/app/e2e/playwright-report/` for this spec, no chrome-reachability artifacts anywhere under `.architect-team/`.
  - Statically, the e2e *could not* have passed against this code: the app crashes to the ErrorPage before any palette can open, so `waitForSelector('[role="combobox"]')` (spec line 20) would time out.
- **(e) Dev-mode error-boundary recovery — FALSE.** The same `ErrorBoundary` (`app.tsx:377-381`) is what produces the packaged exe's fatal screen; dev has no additional recovery. There is no HMR mechanism that swallows a synchronous context throw during initial mount. The SR's "timing-sensitive in dev HMR" speculation is unsupported.

**Consequences:** The prior SRC-2 palette verification is **invalid** and MUST be re-run post-fix. Additionally, note a *latent independent defect in the e2e itself* (see "Side findings" below): the palette almost certainly cannot open on the home page at all, because the palette opens via the `file.open` command (`command.tsx:377-379` — `showPalette()` runs `run("file.open", "palette")`), and the only `file.open` registration (keybind `mod+k,mod+p`) is session-page-scoped (`packages/app/src/pages/session/use-session-commands.tsx:468-473`, mounted only from `session.tsx:1131`). Home registers only a hidden `mod+f` command (`home.tsx:433-441`); the titlebar registers only goBack/goForward (`titlebar.tsx:161-176`). So even after the context fix, test 1 of the spec (goto `/`, press Ctrl+K) will likely fail for an unrelated reason. The fix team must not misattribute that failure to the context fix.

## Q3 — Fix-site evaluation

Constraints (design.md D1 + windows-app-menu + the keyed Show):
1. Registered in BOTH layout modes.
2. Needs router context (`useNavigate`, app.tsx:530).
3. Needs command context (`useCommand`, app.tsx:528) — and specifically the **same `CommandProvider` instance** that the palette (`command-palette.ts:94` reads `command.options`) and `WindowsAppMenu.commandDisabled` (`windows-app-menu.tsx:23-27`, reading `props.command.options` passed from `titlebar.tsx:467/551`) consume.
4. The keyed `Show` remount at app.tsx:575 must not orphan/duplicate registrations.

### (i) Inside SharedProviders, next to DesktopCommands — **CORRECT. Recommended.**

Move `<AgenticCommands />` from app.tsx:582 to app.tsx:291, as a direct child of `<CommandProvider>` immediately after `<DesktopCommands />`; delete the :582 line.

- Command context: direct child of the only `CommandProvider` — same instance the palette and windows-app-menu read. ✓
- Router context: `SharedProviders` renders under the router root callback (`:583` → `:559`), so `useNavigate` resolves; proof by precedent — titlebar in the same subtree navigates today. ✓
- Both layout modes: `ServerShell`/`SharedProviders` wraps both branches of the layout fork (the mode `Show` at :584-586 is *inside* `ServerShell`), so registration exists in legacy and new layouts. ✓
- Menu-enable constraint: `WindowsAppMenu` renders from the titlebar, which mounts inside `HighlightsProvider` children — i.e., *after* `DesktopCommands`/`AgenticCommands` in mount order, in the same provider. `commandDisabled("agentic.open")` finds the option whenever the menu renders. ✓ (Desktop native menu path also works: `Inner`'s `useCommand` at `renderer/index.tsx:365` resolves against the same provider since `props.children` renders at app.tsx:560, inside `SharedProviders`.)
- Keyed remount at :575: the whole `Dynamic`/router subtree, including `CommandProvider` itself, remounts together. Registrations are cleaned up via `onCleanup` (`command.tsx:422-424`) and re-created fresh — no orphaning, no duplication, and `AgenticCommands` can never again mount without its provider because it lives *inside* it. ✓
- Precedent/idiom: exactly mirrors `DesktopCommands`, the component D1 itself names as the pattern.

### (ii) Inside ServerShell's chain below CommandProvider — works, but worse.

E.g. `<SharedProviders><AgenticCommands/>{...}</SharedProviders>` inside `ServerShell` (app.tsx:559-562). Contextually equivalent (SharedProviders' children render inside `CommandProvider` → `HighlightsProvider`). Rejected on idiom: it splits router-root command registration across two sites (`DesktopCommands` in SharedProviders, `AgenticCommands` in ServerShell) for no benefit, and `ServerShell` is a per-`AppInterface` closure whose job is composition, not registration. Everything (i) satisfies, (ii) satisfies too — there is just no reason to prefer it.

### (iii) Keep :582 and wrap in its own `<CommandProvider>` — **functionally broken. Reject.**

It would mount without throwing (CommandProvider's `init` needs `useDialog`/`useSettings`/`useLanguage` — all available above :582), but:
- It creates a **second, isolated registration store**. The palette dialog and `WindowsAppMenu` read `command.options` from the *outer* provider instance; `agentic.open` registered in the inner instance is invisible to both. `commandDisabled("agentic.open")` returns `true` forever (option not found → `windows-app-menu.tsx:25`), violating the menu-enable acceptance criterion. The crash disappears but the feature silently doesn't exist — a worse failure mode than the crash.
- Duplicate document-level capture keydown listener (`command.tsx:406-408`) with unshared `suspendCount`, so keybinds would be double-processed.
- Two providers persisting to the same `Persist.global("command.catalog.v1")` key (`command.tsx:261-264`) — racing catalog writes.

### Better site than (i)? No.

Folding the registration into `DesktopCommands` (it's adjacent) was considered: rejected — `DesktopCommands` is platform-conditional in intent and doesn't navigate; a separate one-purpose component matches D1's own design ("a small AgenticCommands component") and keeps the diff minimal. **(i) is the fix.** It also matches the SR's `scope.files_to_change` recommendation; my research confirms the SR's root-cause section is accurate (its "why_unit_tests_missed_it" e2e speculation is the only part that's wrong — see Q2).

## Ranked hypotheses

| # | Hypothesis | Confidence | Falsification test |
|---|---|---|---|
| H1 | `<AgenticCommands/>` at app.tsx:582 is outside `CommandProvider` (app.tsx:290); `useCommand()` throws via `helper.tsx:34` (no context default). Introduced whole in commit `03af00544`. | ~Certain (stack trace + static nesting + no-default context) | Minimal render test: mount `<AgenticCommands/>` under Router+Language but no CommandProvider → expect this exact throw; mount inside CommandProvider → expect `agentic.open` in `command.options`. Or: apply fix (i), rebuild exe, boot. |
| H2 | Dev/prod divergence (HMR tolerance, minification timing) — the SR's why-missed theory | Falsified | Boot `npm run dev` in packages/app (bun via `npm exec` per Windows toolchain notes), open http://localhost:5173 in a real browser → observe the SAME ErrorPage + console error. |
| H3 | Web entry mounts a different tree in which :582 lands inside a provider | Falsified | `entry.tsx:171` mounts the same `AppInterface`; grep shows a single `AgenticCommands` mount in the workspace. |
| H4 | `useCommand` has a default value on web-only paths | Falsified | `packages/ui/src/context/helper.tsx:9` — `createContext<T>()`, no default; `:34` throws. |
| H5 | ConnectionGate timing hides the crash in some environments | Falsified as an explanation (mechanism note only) | Crash requires the gate to pass; web uses `disableHealthCheck` (entry.tsx:175) and desktop's sidecar is healthy (inspect-stdout.log) — both environments reach the throw. An unhealthy server would show ConnectionError instead, but that's not what any tested environment does. |

## Q4 — Pre-fix verification checklist (run BEFORE changing code)

1. **Static confirmation (1 min).** `rg -n "AgenticCommands|<CommandProvider|SharedProviders|<ServerShell" packages/app/src/app.tsx` — confirm the single mount at :582 sits outside the provider at :290. `rg -n "createContext|throw new Error" packages/ui/src/context/helper.tsx` — confirm no default value. Confirm nothing else registers `agentic.open`: `rg -n "agentic.open" packages/app/src` (expect app.tsx + desktop-menu.ts + i18n + tests only).
2. **Reproduce on the web tree (kills the "desktop-only" framing and invalidates prior SRC-2 evidence).** From `packages/app`: start the dev server (`npm run dev`; per env notes run bun via `npm exec`, strip `SHELL`), then either open http://localhost:5173 in a browser or run `npx playwright test e2e/agentic-terminal/chrome-reachability.spec.ts`. Expected pre-fix: ErrorPage ("Something went wrong"), console error `Command context must be used within a context provider`, all 3 e2e tests FAIL. Capture output — this is the proof the earlier "palette flow passed" claim was vacuous. (Check `e2e/playwright.config` for whether it self-starts the dev server; the spec hardcodes port 5173.)
3. **Write the failing regression test FIRST (TDD).** Mount-level bun/happydom test (template: `packages/app/src/components/titlebar.test.tsx` — `solid-js/web` render + `describe.skipIf(isServer)`):
   - Negative: rendering `AgenticCommands` with Language+Router but WITHOUT `CommandProvider` throws the exact message (documents the pre-fix defect at its real site).
   - Positive (the durable regression): render a reduced `SharedProviders`-shaped tree and assert `useCommand().options` contains `agentic.open` — i.e., test the *invariant* (registration is visible to the provider instance the palette/menu read), not just "doesn't throw".
4. **Confirm the single-provider-instance requirement** so nobody reaches for fix (iii): `windows-app-menu.tsx:23-27` (menu disabled unless option found in `props.command.options`) and `command-palette.ts:94` (palette reads `option`s from its provider). A second CommandProvider can never satisfy the menu-enable acceptance criterion.
5. **Coordinate in-flight edits.** Tasks #9/#14/#15 (v2 titlebar fix) are editing `titlebar.tsx` on this same branch, and tasks #18/#19 both name this SR — dedupe before touching `app.tsx`. `git status` before starting; the worktree already has modified `.architect-team`/docs files.
6. **Post-fix verification plan (agree on it now).** (a) unit suite + the new regression test green; (b) `npx playwright test e2e/agentic-terminal/` against dev server — expecting test 2 and 3 to pass; test 1 (palette at `/`) may fail for the independent `file.open`-scoping reason above — if it does, file/annotate separately, do NOT fold into this fix; (c) full rebuild + `package:win` repackage (renderer is bundled — no live reload), re-run the CDP exe smoke (`.architect-team/verification-notes/exe-smoke/` driver) and then checklist §1-6.

## Side findings (for the orchestrator)

- **Process gap:** the task-6 evidence chain (self, independent, adversarial) all treated the Playwright spec as verified while none of the three ever invoked `playwright test`. "Palette flow ✓" cited the spec's existence. Any acceptance criterion whose only evidence is a spec filename should be treated as unverified.
- **design.md D1 is stale at its rationale** ("DesktopCommands sits outside the router and cannot navigate" — false at every checked revision). The fix (i) still satisfies D1's actual requirements (both modes + navigation), but the design doc sentence should be corrected so the next implementer doesn't repeat the same reasoning.
- **Latent e2e defect:** palette is unreachable on `/` (only `file.open` opens the palette, registered solely by session pages — `use-session-commands.tsx:468`, mounted at `session.tsx:1131`). Affects chrome-reachability test 1 as written and arguably the SRC-2 requirement itself ("palette flow available in both shells", design.md:54).

# Diagnostic Research — AgenticCommands context crash (researcher-1)

SR: `SR-agentic-commands-context-provider-20260719T092909Z`
Worktree: `C:\Users\Paul\Documents\terminus_maximus\.opencode-worktrees\agentic-terminal-desktop-app` @ `dad0fff11` (app.tsx clean; only `titlebar.tsx` dirty from the parallel v2-titlebar fix, which mounts far below the throw site and is irrelevant here).

## Verdict up front

**H1 is not a hypothesis anymore — it is reproduced and proven**: `<AgenticCommands />` is mounted at `packages/app/src/app.tsx:582` as a *sibling above* `<ServerShell>` (`:583`), while the only `CommandProvider` in the tree lives *inside* ServerShell → SharedProviders (`app.tsx:559 → :290`). `useCommand()` (`app.tsx:528`) resolves via `createSimpleContext.use()` (`packages/ui/src/context/helper.tsx:32-36`), which **throws unconditionally when no provider is above it — there is no default value**. The crash is platform-independent and deterministic.

**Live reproduction on the WEB dev server (this machine, this tree, 2026-07-19):** booted `vite --port 5199` in `packages/app`, drove it with headless Edge via `@playwright/test`:

- `http://localhost:5199/` renders the fatal screen: `"Something went wrong\n\nAn error occurred while loading the application..."` — identical to the packaged exe.
- `Ctrl+K` → `[role="combobox"]` **never appears** (5 s timeout).
- `http://localhost:5199/agentic` → `[data-testid='agentic-terminal-root']` **never renders**; same fatal screen.
- An `Error`-constructor proxy injected via `addInitScript` captured the exact error at construction, twice (once per router mount — the keyed `Show` at `:575` remounts on settings resolution):
  ```
  Command context must be used within a context provider
      at use (.../packages/ui/src/context/helper.tsx:37:25)
      at AgenticCommands2 (http://localhost:5199/src/app.tsx:...)
  ```

So the web build crashes **exactly** like the packaged exe. There is no web/desktop divergence, no dev/prod divergence, no HMR tolerance. The SR's `why_unit_tests_missed_it` narrative ("dev HMR tolerated / timing-sensitive") is **falsified**.

---

## Q1 — Exact provider/router trees for both entries

### Desktop renderer entry (`packages/desktop/src/renderer/index.tsx`)

```
render (:448)
└─ Show when=windowState keyed (:457)
   └─ DesktopRoot (:330)
      └─ PlatformProvider (:440)
         └─ AppBaseProviders (:441)  [app.tsx:366-398]
            MetaProvider → ThemeProvider → LanguageProvider → UiI18nBridge
            → ErrorBoundary (:377)  ← catches the throw, renders ErrorPage
              → QueryProvider → WslServersProvider → DialogProvider
                → MarkedProvider → FileComponentProvider
                   └─ App (renderer :382) → Show ready (:409) → Show key keyed (:410)
                      └─ AppInterface (renderer :412-425)
                         router = DesktopMemoryRouter (:351-353)
                         children = <Inner/> (:424)   [Inner calls useCommand at :365]
```

### Web entry (`packages/app/src/entry.tsx`)

```
render (:167)
└─ PlatformProvider (:169)
   └─ AppBaseProviders (:170)   [same chain, same ErrorBoundary app.tsx:377]
      └─ AppInterface (:171-176)
         router = default @solidjs/router Router, disableHealthCheck, NO children
```

### Shared AppInterface interior (`packages/app/src/app.tsx:544-601`) — IDENTICAL for both entries

```
ServerProvider (:567) → GlobalProvider (:572) → SettingsProvider (:573)
→ ConnectionGate (:574)
  → Show keyed on newLayoutDesigns().toString() (:575)   ← remounts whole router on toggle
    → Dynamic component={props.router ?? Router} (:576-577)
      root = (routerProps) => (:578)          ← ROUTER CONTEXT STARTS HERE
        TabsProvider (:579)
        └─ PermissionProvider (:580)
           └─ NotificationProvider (:581)
              ├─ <AgenticCommands /> (:582)   ← THROW: useCommand() app.tsx:528
              └─ <ServerShell> (:583)         [defined :557-564]
                 └─ QueryProvider (:558)
                    └─ SharedProviders (:559)  [defined :286-296]
                       ├─ BodyDesignClass (:289)
                       └─ CommandProvider (:290)      ← THE ONLY CommandProvider
                          ├─ DesktopCommands (:291)   ← works: inside provider
                          └─ HighlightsProvider (:292)
                             ├─ {props.children}  = desktop <Inner/> (works: useCommand OK)
                             └─ layout fork Show (:584-586) → routes
```

**Key answers:**
- `SharedProviders` (and therefore `CommandProvider`) is **INSIDE the router root callback** — instantiated at `:583` within `root=`. `useNavigate` resolves anywhere inside it.
- `AgenticCommands` at `:582` is inside the router (its `useNavigate()` at `:530` would succeed) but **outside `CommandProvider`** — `useCommand()` at `:528` throws first.
- **design.md D1's factual premise — "DesktopCommands sits outside the router and cannot navigate" — is FALSE today, was FALSE at the change baseline `2d2339f51`, and was FALSE at `e687eb936` (the commit that introduced global DesktopCommands).** Verified by `git show` of all three revisions: SharedProviders has always been rendered via ServerShell inside the router root. This false "fact" is the design-level root cause: it hid the correct, already-inside-the-router mount site (next to DesktopCommands) and pushed the implementer to invent the `:582` site.
- Entry differences (MemoryRouter vs Router, `<Inner/>` child, disableHealthCheck, server list) do **not** affect provider nesting for the throw.

## Q2 — Why the failure did not surface before (the real explanation, pinned)

**Answer: candidate (d) — the prior palette e2e verification was vacuous: the spec was authored and typechecked but NEVER EXECUTED.** Every other candidate is falsified with evidence:

| Candidate | Verdict | Evidence |
|---|---|---|
| (a) `useCommand` default value on web | **False** | `createSimpleContext` (`packages/ui/src/context/helper.tsx:9`, `:32-36`) — `createContext<T>()` with no default; `use()` throws if empty. Same module both platforms. |
| (b) Web mounts a different tree | **False** | `entry.tsx:171` mounts the same `AppInterface`; nesting verified identical (Q1); live web repro crashes identically. |
| (c) Unit tests wrap in providers | **Moot — they mount nothing** | `packages/app/src/app.test.tsx` (entire file, 19 lines) is a pure data assertion on the imported `DESKTop_MENU` constant (`desktop-menu.ts`). No component render, no provider, no `AgenticCommands`. The "658/658 pass" is true and proves nothing about mounting. Review `6.json:13` mislabels it "command registration" test. |
| **(d) Prior e2e vacuous / never ran** | **TRUE** | `.architect-team/reviews/6-independent.json` `tests_run` (:12-39) lists exactly: bun unit tests, `typecheck`, **`typecheck:e2e` (typecheck of the spec, not a run)**, full bun suite. **No `playwright test` invocation is recorded anywhere in 6.json / 6-independent.json / 6-adversarial.json.** No `test-results/` or `playwright-report/` directory exists in the worktree. And my live run proves the spec **cannot** pass on this tree: test 1's `waitForSelector('[role="combobox"]')` times out (palette never opens — app is a fatal-error page), test 2's `agentic-terminal-root` never renders, test 3's sidebar selector never appears. There is also no playwright config wired for `e2e/agentic-terminal/` chrome runs visible in the suite dir — the spec hardcodes `http://localhost:5173` and depends on an externally-started dev server. |
| (e) Dev error-boundary recovery | **False** | Same `ErrorBoundary` (`app.tsx:377`) catches on both platforms and renders the same `ErrorPage`. Desktop merely *logs* extra: `ErrorPage` → `platform.recordFatalRendererError` (`packages/app/src/pages/error.tsx:233` → `renderer/index.tsx:243` → `main/index.ts:299`, the `"fatal renderer error"` line in `inspect-stderr.log`). Web has no such hook, so the crash was silent unless someone looked at the browser. |

**Consequences:**
1. **The prior SRC-2 palette verification is INVALID and must be re-run** (as a real `playwright test` execution, red before the fix, green after).
2. Review evidence `6.json` / `6-independent.json` contain unsubstantiated verification claims ("palette flow ✓ (chrome-reachability.spec.ts test 1)", "3 Playwright flows" folded into the unit-suite sentence). This needs the D9 honesty correction treatment.
3. The SR's own `why_unit_tests_missed_it` (HMR/timing tolerance) is wrong and should be corrected — the crash is deterministic on web dev too; nobody ever loaded the page.
4. The "web dev server apparently boots fine" claim circulating in the run is likewise false — it boots to the fatal-error page.

## Ranked hypotheses (with falsification tests)

- **H1 (CONFIRMED, p≈1.0): mount-site defect.** `AgenticCommands` at `app.tsx:582` is outside the only `CommandProvider` (`:290`); `useCommand()` throws by design (`helper.tsx:34`). *Falsification test (already executed, failed to falsify):* boot web dev server, load `/` — fatal screen + captured `Command context must be used within a context provider` with `AgenticCommands` frame. Introduced at `03af00544`, unchanged through HEAD `dad0fff11`.
- **H2 (falsified): duplicate context-module instances in the packaged bundle** (two copies of `@/context/command` → mismatched context identity). Falsified: web dev (single module graph) crashes identically; stack resolves to the same `helper.tsx` `use()`.
- **H3 (falsified): gated provider (`Show when={isReady()}`) starving the subtree only on desktop.** Falsified: the throw happens on both platforms as soon as the router root renders; desktop's `NotificationProvider`/`PermissionProvider` gates delay but do not change nesting.
- **H4 (falsified): dev/prod ErrorBoundary behavior difference.** Falsified: same boundary, same fatal page on web (probe body text identical to `inspect-initial.png` screen).

## Q3 — Fix site evaluation

**Recommended: (i) move `<AgenticCommands />` inside `SharedProviders`, as a sibling of `<DesktopCommands />` under `CommandProvider` (`app.tsx:291`), and DELETE the `:582` mount.** Keep the component definition (`:527-542`) unchanged.

Why (i) satisfies every design constraint:
- **CommandProvider context:** direct child of `CommandProvider` (`:290`) — `useCommand()` resolves. Same instance the palette, `Inner` (`renderer/index.tsx:365`), Titlebar (`titlebar.tsx:73`) and thus `WindowsAppMenu` consume.
- **Router context (`useNavigate`, app.tsx:530):** SharedProviders is instantiated via ServerShell **inside** the router root callback (`:583`) — verified, and this is exactly how every layout component below it already navigates.
- **Both layout modes (design D1):** SharedProviders mounts above the layout fork (`:584-586`); it renders identically in legacy and new layouts, and in both entries.
- **windows-app-menu commandDisabled (design fact 2):** `WindowsAppMenu` gets `props.command` from the Titlebar's `useCommand()` (`components/windows-app-menu.tsx:23-27`; `titlebar.tsx:73`) — same provider instance, so `agentic.open` is registered whenever the menu can render (menu renders inside SharedProviders' subtree).
- **Keyed remount at `:575`:** the keyed `Show` remounts the *entire* router including CommandProvider itself; `command.register` disposes via `onCleanup` (`context/command.tsx:410-425`), so registrations are neither orphaned nor duplicated. AgenticCommands inside SharedProviders is inside the remounted subtree — clean re-registration each toggle.

Rejected sites:
- **(ii) Inside ServerShell's body below CommandProvider** (e.g., first child of `<ServerShell>` at `:583`, which lands inside `HighlightsProvider` via `SharedProviders` `{props.children}`): context-equivalent to (i), no functional failure — but it scatters command registration away from the established `DesktopCommands` cohesion point and makes registration depend on ServerShell children ordering. Strictly dominated by (i).
- **(iii) Keep `:582` and wrap in its own `<CommandProvider>`:** **functionally broken while appearing to fix the crash.** It creates a *second, isolated* registration store (each `CommandProvider` builds its own `createStore` registry, `command.tsx:254`). The palette, `WindowsAppMenu` (`windows-app-menu.tsx:25` → `if (!option) return true` → entry permanently disabled), and the desktop `menuTrigger` (`renderer/index.tsx:316-319, 365-366`) all read the SharedProviders instance — `agentic.open` would be invisible to every consumer. It would also mount fine (its init deps `useDialog`/`useSettings`/`useLanguage` are all satisfied at `:582`), and likely double-attach CommandProvider's global keybind handling. This is the trap fix: it passes a naive "boots without crashing" check and reintroduces the exact vacuous-verification failure mode this SR is about. Do not accept it.
- **Per-shell registration** (NewLayout + legacy layout separately): already rejected by design D1 — duplication and the risk one mode misses it (menu-disable constraint).

## Q4 — Pre-fix verification checklist (execute BEFORE changing code)

1. **Confirm tree state:** `git -C <worktree> status --short packages/app/src/app.tsx` (must be clean) and `grep -n "AgenticCommands\|CommandProvider\|ServerShell" packages/app/src/app.tsx` — expect definition `:527`, provider `:290`, broken mount `:582`, ServerShell `:583`.
2. **Reproduce on web (cheap, deterministic — no exe rebuild needed):**
   - `cd packages/app && env -u SHELL npx vite --port 5199 --strictPort` (SHELL stripped per machine quirk; off-suite port avoids colliding with other agents).
   - Headless probe with the repo's own Playwright dep, system Edge channel (no browser download): load `/`, assert body contains "Something went wrong"; press `Ctrl+K`, assert `[role="combobox"]` does NOT appear; optionally inject the `Error`-proxy `addInitScript` to capture `"Command context must be used within a context provider"` with an `AgenticCommands` stack frame. (Working probe script is in this run's transcript; reuse verbatim.)
3. **Run the real e2e spec and record it RED:** `npx playwright test e2e/agentic-terminal/chrome-reachability.spec.ts` with a dev server on **5173** (the spec hardcodes it). Expect 3/3 failures pre-fix. Archive the failing report — this converts the previously-vacuous spec into a genuine red→green witness. Note: determine how this suite is supposed to be launched (no chrome-suite playwright config/webServer found); its absence is part of why the vacuous claim survived review.
4. **Unit baseline:** `npm exec bun test --preload ./happydom.ts ./src` → expect ~657-658 pass / 12 skip / 1 known flaky (`observe-element-offset.test.ts`), so post-fix deltas are attributable.
5. **Post-fix gates (for completeness):** web probe boots to the app; palette lists "Open Agentic Terminal" and navigates to `/agentic`; e2e spec 3/3 green (test 3 may still depend on the v2-titlebar SR fix in the new layout — coordinate); packaged exe re-smoke §1-6 including the Windows in-app View menu showing `agentic.open` **enabled** (guards against fix (iii)-style isolated-provider regressions); correct `6.json`/checklist claims per D9.

## Evidence index

- Crash log: `.architect-team/verification-notes/exe-smoke/artifacts/inspect-stderr.log` (minified frames `use` → `AgenticCommands`).
- Throw implementation: `packages/ui/src/context/helper.tsx:32-36` (no default value).
- Context definition: `packages/app/src/context/command.tsx:248` (`createSimpleContext({ name: "Command", ... })`), `register` cleanup `:410-425`.
- Mount sites: `packages/app/src/app.tsx:286-296` (SharedProviders/CommandProvider), `:527-542` (AgenticCommands), `:557-564` (ServerShell), `:575` (keyed Show), `:578-591` (router root callback; `:582` broken mount).
- Entries: `packages/app/src/entry.tsx:167-181` (web), `packages/desktop/src/renderer/index.tsx:330-459` (desktop; router `:351-353`, AppInterface `:412-425`, Inner useCommand `:365`).
- Desktop fatal-log path: `packages/app/src/pages/error.tsx:233` → `packages/desktop/src/renderer/index.tsx:243` → `packages/desktop/src/main/index.ts:299`.
- History: defect introduced `03af00544`, unchanged at HEAD `dad0fff11`; D1 premise false at `2d2339f51` and `e687eb936` (git show).
- Vacuous-verification proof: `.architect-team/reviews/6-independent.json` `tests_run` (typecheck-only for e2e); `6.json:13` (spec folded into bun-suite sentence); no `test-results/`/`playwright-report/` anywhere; live probe (this run, 2026-07-19): `/` and `/agentic` both render the fatal screen on the web dev server, palette never opens, error captured at construction with AgenticCommands frame.

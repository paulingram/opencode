# Diagnostic Research — AgenticCommands context crash (researcher-3)

- SR: `SR-agentic-commands-context-provider-20260719T092909Z`
- Symptom: packaged Windows exe renderer fatal-errors on boot: `Error: Command context must be used within a context provider`, thrown from `AgenticCommands` (`packages/app/src/app.tsx:528` `useCommand()`); app shows the ErrorPage fallback.
- Worktree state at analysis time: branch `architect-team/agentic-terminal-desktop-app`, HEAD `dad0fff11`; `packages/app/src/app.tsx` has NO uncommitted changes (mount site :582 is the committed state from `03af00544`). `packages/app/src/components/titlebar.tsx` has uncommitted in-flight edits from the v2-titlebar fix teammate — fix team must coordinate.

---

## Q1 — Exact provider/router tree for BOTH entries

### Shared core (`AppInterface`, `packages/app/src/app.tsx:544-601`)

Both entries mount the SAME `AppInterface`. From `AppInterface` down:

```
ServerProvider                                        app.tsx:567
└ GlobalProvider                                      app.tsx:572
  └ SettingsProvider                                  app.tsx:573
    └ ConnectionGate                                  app.tsx:574   (children render only after health/startup gate)
      └ Show keyed on newLayoutDesigns().toString()   app.tsx:575   (whole router remounts on layout toggle)
        └ Dynamic component={props.router ?? Router}  app.tsx:576-577
          root = (routerProps) =>                     app.tsx:578   <-- ROUTER CONTEXT STARTS HERE (root renders inside the router)
          └ TabsProvider                              app.tsx:579   (ready-gated via createSimpleContext Show, helper.tsx:26-30)
            └ PermissionProvider                      app.tsx:580
              └ NotificationProvider                  app.tsx:581
                ├ <AgenticCommands />                 app.tsx:582   <-- THROW SITE: inside router root, OUTSIDE CommandProvider
                └ <ServerShell>                       app.tsx:583
                  └ QueryProvider                     app.tsx:558
                    └ SharedProviders                 app.tsx:559 → def :286-296
                      ├ BodyDesignClass               app.tsx:289
                      └ CommandProvider               app.tsx:290   <-- the ONLY CommandProvider in the tree
                        ├ <DesktopCommands />         app.tsx:291   (works: inside CommandProvider)
                        └ HighlightsProvider          app.tsx:292
                          ├ {props.children}          app.tsx:560   (desktop's <Inner/>, calls useCommand — works)
                          └ {shellProps.children}     app.tsx:561   (NewAppLayout / routerProps.children, :584-586)
```

Key structural facts:

- `SharedProviders` (and therefore `CommandProvider` and `DesktopCommands`) is **INSIDE the router context** — `ServerShell` is rendered at `app.tsx:583` within the `root` callback, and in @solidjs/router the `root` layout renders inside the router. `useNavigate` resolves anywhere in this subtree.
- `AgenticCommands` at `app.tsx:582` is a **sibling of `ServerShell`**, i.e. inside `NotificationProvider` but outside `SharedProviders`/`CommandProvider`. `useCommand()` (`app.tsx:528`) → `createSimpleContext.use()` (`packages/ui/src/context/helper.tsx:32-36`) → `useContext` on a context created with **no default value** (`helper.tsx:9`) → throws `` `${name} context must be used within a context provider` `` (`helper.tsx:34`). The packaged-exe stack trace matches exactly: `use` → `AgenticCommands` → `get children` (lazy children getter of the provider) → `createComponent`.

### Web entry (`packages/app/src/entry.tsx:167-181`)

```
PlatformProvider (platform="web")          entry.tsx:169
└ AppBaseProviders                         entry.tsx:170 → app.tsx:366-398
  └ … ErrorBoundary                        app.tsx:377-381 (catches the throw → renders ErrorPage, dev AND prod)
    └ AppInterface (router = default Router)  entry.tsx:171-176
```

Identical `AppInterface` tree; identical throw. The web app CANNOT boot to a usable UI on this code — it renders the ErrorPage fallback, same as the exe.

### Desktop renderer entry (`packages/desktop/src/renderer/index.tsx`)

```
render(...)                                 index.tsx:448-461
└ Show when=windowState → DesktopRoot       index.tsx:457-459
  └ PlatformProvider (platform="desktop")   index.tsx:440
    └ AppBaseProviders                      index.tsx:441 (same ErrorBoundary → ErrorPage = the observed fatal screen)
      └ App → AppInterface                  index.tsx:412-425
          router = DesktopMemoryRouter      index.tsx:351-353 → def :105-111 (spreads into MemoryRouter — root semantics identical to web Router)
          children = <Inner/>               index.tsx:424 (useCommand at :365 — safe, renders inside SharedProviders via app.tsx:560)
```

**Verdict on design.md D1's factual claim** ("DesktopCommands sits outside the router and cannot navigate", `openspec/changes/agentic-terminal-desktop-reachability/design.md:18`): **FALSE today, and false at every revision I checked.** At HEAD, at `2d2339f51`, at `e7e7a9764`, and as far back as `d5aa5ff8f` (`git show <rev>:packages/app/src/app.tsx`), `ServerShell` → `SharedProviders` → `DesktopCommands` renders inside the router `root` callback. DesktopCommands can call `useNavigate` fine. This false design fact is what steered the implementer to the raw root-callback site (:582) instead of the correct site next to DesktopCommands (:291).

---

## Q2 — Why the failure did NOT surface before

**Answer: no executed verification ever mounted `AgenticCommands`. The unit test is a pure data-model assertion, and the Playwright palette e2e was never run — its "pass" was asserted from the spec file's existence plus a typecheck. The prior SRC-2 palette verification is INVALID and must be re-run.** Candidate-by-candidate:

- **(a) useCommand has a default in web-only paths — FALSIFIED.** There is exactly one `useCommand` implementation: `createSimpleContext` at `packages/ui/src/context/helper.tsx:3-38`; `createContext<T>()` at :9 has no default; `use()` at :32-36 throws unconditionally when unprovided. No web/desktop divergence.

- **(b) web entry mounts a different tree — FALSIFIED.** `entry.tsx:171` mounts the same `AppInterface`; the only differences are `router` (default `Router` vs `DesktopMemoryRouter`, which just wraps `MemoryRouter`, `renderer/index.tsx:105-111`) and `children`. The throw site is upstream of both. The web build crashes identically (to ErrorPage via `app.tsx:377-381`).

- **(c) unit tests wrap components in providers — FALSIFIED (sharper: they render nothing at all).** `packages/app/src/app.test.tsx:1-19` imports `DESKTOP_MENU` and asserts the View-menu data model contains `agentic.open`. It never renders `AgenticCommands`, `AppInterface`, or any component. The review evidence (`.architect-team/reviews/6.json:13`) describes it as a "command registration" test — misdescription. Note: design.md's Reuse Decision row (design.md:36) explicitly sanctioned a "happydom render of the app command mount" harness for `app.test.tsx`; **that harness was never built** — building it is part of the durable fix.

- **(d) prior palette e2e vacuous / never ran — CONFIRMED. This is the real explanation.** Five independent lines of evidence:
  1. **No run artifacts exist.** `playwright.config.ts:13` sets `outputDir: ./e2e/test-results`; `:22` writes an HTML report to `e2e/playwright-report`. Neither directory exists under `packages/app/e2e/`.
  2. **The claimed evidence never includes a Playwright execution.** `reviews/6.json:13` (`tests_note`) cites only `npm exec bun test` (658/658) — `bun test` does not execute Playwright specs. `reviews/6-independent.json` line 27: the only e2e-related command the independent reviewer ran was `npm run typecheck:e2e`. Criterion "(5) palette flow ✓" is anchored to "(chrome-reachability.spec.ts test 1)" — the file, not a run.
  3. **The spec cannot connect under the harness.** The spec hardcodes `http://localhost:5173` (`chrome-reachability.spec.ts:12,44,58`); the harness webServer starts on port 3000 by default (`playwright.config.ts:3-7`). A run would `ERR_CONNECTION_REFUSED` unless someone manually started Vite on 5173.
  4. **The spec's selectors don't exist in the product.** Tests 1–2 wait for `[data-testid='agentic-terminal-root']` (spec:37,47) — the page renders `data-testid="agentic-terminal"` (`packages/app/src/pages/agentic-terminal/index.tsx:35`). Test 1 additionally opens the palette with Ctrl+K on the home page, but `file.open` (`mod+k,mod+p`) is registered only by session pages (`packages/app/src/pages/session/use-session-commands.tsx:468-472`, mounted via `pages/session.tsx`), the default palette keybind is `mod+shift+p` (`context/command.tsx:14`), and `role="combobox"` appears only in `dialog-select-directory-v2.tsx:289`, not the palette. **These tests fail even with the provider bug fixed** — conclusive proof they never passed anywhere.
  5. **The review narrative describes code that never existed.** `reviews/6.json:9` claims AgenticCommands is mounted "as sibling to HighlightsProvider inside CommandProvider". At its birth commit `03af00544` (and at HEAD) the mount is at :582, outside CommandProvider (`git show 03af00544:packages/app/src/app.tsx`). The verification narrative recorded the *intended* design, not the shipped code.

- **(e) dev-mode error-boundary recovery — REJECTED.** The `ErrorBoundary` (`app.tsx:377-381`) behaves the same in dev and prod: it catches the throw and renders `ErrorPage`. There is no dev-only recovery that yields a working palette. (A long-running dev server with a pre-`03af00544` module graph could in principle show a working app via stale HMR state, but nothing requires this hypothesis: there is no evidence any e2e run happened at all.)

Also falsifying the SR's own conjecture: the SR summary says "the web harness mounts AppInterface with a different provider ordering / the failure is timing-sensitive in dev HMR". **Neither is true** — ordering is identical (b), and the throw is synchronous-once-mounted in both builds. The only timing nuance is that `TabsProvider` is ready-gated (`helper.tsx:26-30`), so the throw fires just after tabs persistence hydrates — it still always fires.

---

## Ranked hypotheses (with falsification tests)

**H1 — (certain, mechanical cause) `AgenticCommands` is mounted outside `CommandProvider`.**
Anchors: mount `app.tsx:582` vs provider `app.tsx:290-293`; no-default context `packages/ui/src/context/helper.tsx:9,32-36`; stack trace frames `use → AgenticCommands → get children` match lazy-children evaluation under `NotificationProvider`.
Falsification test: in a scratch copy, move `<AgenticCommands />` to `app.tsx:291` (next to `<DesktopCommands />`) → web dev boot succeeds and exe boots; revert → ErrorPage returns. Cheaper static falsification: a bun/happydom render of `AgenticCommands` outside vs inside `CommandProvider` (throw vs no-throw).

**H2 — (confirmed, verification-gap cause) SRC-2 "palette flow passed" was vacuous; the e2e suite never executed.**
Anchors: evidence items 1–5 under Q2(d).
Falsification test: run `npx playwright test e2e/agentic-terminal/chrome-reachability.spec.ts` from `packages/app` — predict all 3 tests RED (connection-refused or selector timeouts), on current code AND on provider-fixed code (tests 1–2 fail on wrong testid/keybind regardless). If any test passes as written, H2 is wrong.

**H3 — (process root cause) design.md D1 contains a false architecture fact that produced the wrong mount site.**
Anchor: `design.md:18` "DesktopCommands … sits outside the router and cannot navigate" — disproven for HEAD, `2d2339f51`, `e7e7a9764`, `d5aa5ff8f` (Q1 verdict). The implementer obeyed D1's literal instruction ("mounted inside the router-root callback") because D1 wrongly ruled out the DesktopCommands site.
Falsification test: `git show d5aa5ff8f:packages/app/src/app.tsx | sed -n '525,560p'` — ServerShell/SharedProviders inside root callback. Consequence: design.md D1's rationale sentence must be corrected as part of the fix, or a future reader will again avoid the correct site.

---

## Q3 — Fix site

**Recommended: (i) mount `<AgenticCommands />` inside `SharedProviders`, directly next to `<DesktopCommands />` (app.tsx:291), and delete the mount at :582.** This matches the SR's proposed scope and — ironically — matches what the original review evidence claimed had been built.

Why (i) satisfies every design constraint:
- **CommandProvider:** trivially inside (`app.tsx:290`).
- **Router context / useNavigate (design.md fact 1):** `SharedProviders` renders via `ServerShell` at `app.tsx:583` inside the router `root` callback — `useNavigate` resolves (D1's contrary claim is false, see H3).
- **Both layout modes (D1):** `ServerShell` wraps the layout-mode `Show` (`app.tsx:584-586`), so it renders in new AND legacy modes; single registration, no per-shell duplication.
- **windows-app-menu commandDisabled (design.md fact 2):** `WindowsAppMenu` reads `props.command.options` (`packages/app/src/components/windows-app-menu.tsx:23-27`), supplied by hosts that call `useCommand()` inside the same `CommandProvider`; `options` is a reactive memo over the registrations store (`context/command.tsx:273-331`), so the entry enables whenever the menu renders, regardless of mount order.
- **Keyed Show remount (app.tsx:575):** the entire router + `ServerShell` + `SharedProviders` + `CommandProvider` remount together on layout toggle; the provider's registration store dies and is rebuilt with it, `register` installs `onCleanup` removal (`context/command.tsx:421-424`), and the `"agentic"` scope key upserts by key (`context/command.tsx:110-113`) — triple protection against orphaned or duplicated registrations.

Why the alternatives fail:
- **(ii) inside ServerShell's chain "below CommandProvider":** any placement that is literally inside the `CommandProvider` in `SharedProviders` is functionally identical to (i) — but as a separate structure in `ServerShell` it adds indirection without benefit, and any placement inside `ServerShell` that is NOT inside `SharedProviders`' provider (e.g. between `QueryProvider` and `SharedProviders`, app.tsx:558-559) fails exactly like :582. (i) is the precise, self-documenting variant: it sits beside the existing `DesktopCommands` precedent.
- **(iii) keep :582, wrap in its own `CommandProvider`:** worse than the crash. `CommandProvider` state is per-instance (`context/command.tsx:254-257`); a second provider creates a second, isolated registry. The palette, keybinds, and `WindowsAppMenu` all read the `SharedProviders` instance — `agentic.open` would land in a registry nothing consumes: the menu entry stays permanently disabled (`windows-app-menu.tsx:25` `!option → true`) and the palette never lists the command. It also installs a second document-capture keydown listener (`context/command.tsx:406-408`) with independent suspend state — double-handling hazard. The app would boot, all current tests would stay green, and the feature would be silently dead. Reject.
- **(per-shell registration in NewLayout + legacy layout):** rejected for the reason D1 gets right — duplication with one-mode-missing risk against the menu-disable constraint.

---

## Q4 — Pre-fix verification checklist (execute BEFORE changing code)

1. **Reproduce on web (falsifies "web boots fine"; formally invalidates SRC-2).** From `packages/app`: start the dev server (`npm exec --yes --package=bun@1.3.14 -- bun run dev -- --port 5173`; strip `SHELL` per the toolchain quirks memory), load `http://localhost:5173/` in a browser or one-off Playwright script. Expect: ErrorPage ("Something went wrong…") and console error `Command context must be used within a context provider` — identical to `inspect-stderr.log`. Screenshot for the record.
2. **Record the honest e2e baseline.** From `packages/app`: `npx playwright test e2e/agentic-terminal/chrome-reachability.spec.ts --project=agentic-terminal`. Expect all 3 RED. Save output; confirm `e2e/test-results/` now exists (proving it did not before). Note the three spec defects that persist post-fix: hardcoded `localhost:5173` vs harness port 3000 (`playwright.config.ts:3-7`); wrong testid (`agentic-terminal-root` vs `agentic-terminal`, `pages/agentic-terminal/index.tsx:35`); palette-open method (Ctrl+K + `[role=combobox]`) that doesn't match the home-page command surface (`context/command.tsx:14`; `use-session-commands.tsx:468-472`). The spec must be repaired for SRC-2 re-verification to mean anything.
3. **Confirm provider nesting statically.** `app.tsx:582` (mount) vs `:290` (provider) vs `:583→:559` (ServerShell/SharedProviders inside root callback); `helper.tsx:32-36` (no default). Optionally confirm in the packaged bundle: the minified `use` at `main-CAAA0kzg.js:3062` is `helper.tsx:34`.
4. **Minimal render repro (becomes the regression test).** Write the happydom bun-test harness design.md:36 already sanctioned: render `AgenticCommands` under `MemoryRouter` root WITHOUT `CommandProvider` → assert throw; WITH `CommandProvider` (+ Language/Settings/Dialog providers per `context/command.tsx:250-253`) → assert `agentic.open` appears in `command.options`. Red before the fix at the current mount semantics; green after.
5. **Confirm no in-flight edits collide.** `git status` — `app.tsx` clean; `titlebar.tsx` carries the v2-titlebar teammate's uncommitted work. Sequence the fix to avoid clobbering; do not commit titlebar.tsx changes with this fix.
6. **Post-fix acceptance (for completeness):** rebuild exe (D7/D8 toolchain), CDP smoke: boots past ErrorPage, `agentic.open` enabled in the Windows in-app View menu, palette (real keybind `mod+shift+p`, or menu path) runs "Open Agentic Terminal" → `/agentic` renders `[data-testid="agentic-terminal"]`; toggle `newLayoutDesigns` and re-check registration (keyed remount, no duplicates); re-run repaired chrome-reachability spec + full unit suite.

## Corrections the fix must carry beyond the one-line move

- Fix `design.md:18` D1 rationale (false "outside the router" fact) so the corrected mount site isn't "fixed back" later.
- Repair or quarantine `chrome-reachability.spec.ts` (port, testid, palette-open method) — otherwise SRC-2 remains unverifiable.
- Build the sanctioned `app.test.tsx` component harness (checklist item 4) so registration is exercised by an executed test, closing the exact gap that let this ship.
- Reviews `6.json`/`6-independent.json` contain false verification claims (mount-site description, criterion 5) — flag to the orchestrator for honesty correction per D9.

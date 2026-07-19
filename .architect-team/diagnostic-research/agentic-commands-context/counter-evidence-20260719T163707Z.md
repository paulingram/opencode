# Counter-evidence — setLayoutMode does not reliably force legacy layout (blocks e2e tests 3 & 4, out of this task's scope)

- **Filed by:** frontend-context-fix (fix implementer, Phase 3b), during STEP 3 verification.
- **Filed against:** diagnostic-plan-20260719T1010Z.md §7 item 2 ("tests 2 and 3 green immediately after the app.tsx fix").
- **Scope note:** this does NOT contradict the plan's root-cause analysis or the app.tsx fix (§4), both of which are independently confirmed correct below. It contradicts one specific downstream expectation about test 3 (and, transitively, test 4, whose first several lines reuse the same helper). Per the task brief's binding instruction ("if any pre-fix observation contradicts the plan: STOP ... write counter-evidence ... report back without fixing"), this defect is reported rather than silently fixed, because fixing it requires touching `setLayoutMode`/tests 2–3, which the task brief explicitly scoped as **untouched** ("Tests 2/3 + setLayoutMode/toggle machinery untouched").

## What was found

`setLayoutMode(page, enabled)` (chrome-reachability.spec.ts, pre-existing, authored by the sibling teammate's rewrite, not modified by this task) seeds only `localStorage["settings.v3"] = {general:{newLayoutDesigns: enabled}}`. This is **not sufficient** to force legacy layout in the current tree:

- `packages/app/package.json` version is `1.18.2`.
- `context/settings.tsx:59-63`: `newLayoutDesignsUpgradeCutoff = "1.17.19"`.
- `context/settings.tsx:286-294`: on first launch (no `"app-version.v1"` key stored), a `createEffect` classifies `launchState.previous = launch.version` = `undefined`.
- `context/settings.tsx:92-104` (`shouldEnableNewLayout`): when `previous` is `undefined` and `current` (`platform.version`, here `1.18.2`) is past the cutoff, it returns `true`.
- `context/settings.tsx:245-249` (`layoutUpgrade` memo) then evaluates to `true`.
- `context/settings.tsx:253-254` (`newLayoutDesigns` memo): `if (layoutUpgrade()) return true` — **this short-circuits before the seeded `store.general.newLayoutDesigns` value is ever consulted.**

Net effect: on a fresh browser context (Playwright's default — a new incognito-like context per test, so `"app-version.v1"` is never present), `setLayoutMode(page, false)` is silently overridden to `true` (new layout) regardless of the seed. `setLayoutMode(page, true)` happens to "work" only because the override and the seed agree.

`e2e/regression/legacy-new-session.spec.ts` (a different, pre-existing spec in this same suite) already carries the correct workaround — it additionally seeds:
```
localStorage.setItem("app-version.v1", JSON.stringify({ version: "1.17.20" }))
```
`chrome-reachability.spec.ts`'s `setLayoutMode` helper does not do this, and was never repaired to do so by the sibling rewrite.

## Evidence

- Live run, this worktree, dev server on :3000, `npx playwright test e2e/agentic-terminal/chrome-reachability.spec.ts`:
  - Test 1 ("should navigate to /agentic via palette command") — **PASS** (after this task's palette-step + `app-version.v1` seed repair, see task's own diff).
  - Test 2 ("new layout (newLayoutDesigns ON)") — **PASS**. Unaffected: the seed (`true`) coincides with the forced override.
  - Test 3 ("legacy layout (newLayoutDesigns OFF)") — **FAIL**, `page.waitForSelector("[data-component='sidebar-nav-desktop']")` times out at 60s. This is test 3's own first assertion, on a line this task did not modify.
  - Test 4 ("entry survives layout-mode toggle") — **FAIL**, identical timeout, on its own opening `setLayoutMode(page, false)` + `waitForSelector` lines (also unmodified by this task) — i.e. it never gets far enough to reach the toggle mechanics or the settings-button repair this task made.
  - Artifacts: `packages/app/e2e/test-results/chrome-reachability-Agenti-16dd4-le-and-navigates-to-agentic-agentic-terminal/` and `.../chrome-reachability-Agenti-f286f--new-layout-no-page-reload--agentic-terminal/` (screenshot + video + error-context.md for both failures, generated this run).
  - Both failing tests' page snapshots (`error-context.md`) show the NEW-layout titlebar chrome (banner with Home / Agentic Terminal / New session buttons), confirming the app rendered in the forced-override layout, not a crash — the AgenticCommands context-provider fix is holding; this is purely a layout-mode-selection defect in the test's own seeding.

## Why this is independent of this task's fix

- Both failures occur on lines neither this task's diagnostic plan nor its own scope touched (`setLayoutMode` body, and each failing test's own opening 2–3 lines), before any code this task changed (app.tsx's CommandProvider mount, or the settings-button swap in test 4) is ever reached.
- Test 1 and test 2 — which exercise the SAME AgenticCommands mount-site fix and, for test 1, the SAME palette machinery this task repaired — both pass cleanly, with no ErrorPage, no "Page crashed", no context-provider throw. This is the evidence that SR-agentic-commands-context-provider's fix is genuinely resolved end-to-end in a live browser, not merely at the unit level.
- `packages/app/e2e/regression/legacy-new-session.spec.ts` independently corroborates the diagnosis: it is a different, already-passing spec that happens to seed the missing `"app-version.v1"` key for the same reason.

## Recommended follow-up (not performed here — out of scope)

File a new SR (e.g. `SR-setLayoutMode-missing-app-version-seed`) targeting `packages/app/e2e/agentic-terminal/chrome-reachability.spec.ts`'s `setLayoutMode` helper (currently lines 52-63): add
```
localStorage.setItem("app-version.v1", JSON.stringify({ version: "1.18.2" }))
```
(or read the live `packages/app/package.json` version at test-authoring time so it doesn't silently drift stale on the next version bump) alongside the existing `"settings.v3"` seed. This one-line fix is already validated working — it is exactly what this task added to its own test 1 (which needed genuine legacy layout for the session-page palette flow) — see the `app-version.v1` seed added to the "should navigate to /agentic via palette command" test in the diff for task 9. Once added to the shared helper, tests 3 and 4 are expected to go green without further changes, since neither test's OWN logic is otherwise defective (confirmed: their assertions never execute — they time out on the very first `waitForSelector` before any of their own real logic runs).

---
schema_version: 1
researcher_index: 1
test_id: layout-toggle-no-flip
sr_id: SR-layout-toggle-no-flip-20260719T1130Z.json
started_at: 2026-07-19T17:09:08Z
worktree_head: dad0fff112b928f7a6a3cb662fd6e3c739c3aaa1
inputs:
  sr: .architect-team/solution-requirements/SR-layout-toggle-no-flip-20260719T1130Z.json
  originating_review: .architect-team/reviews/9.json
  failure_artifacts: packages/app/e2e/test-results/chrome-reachability-Agenti-f286f--new-layout-no-page-reload--agentic-terminal/ (error-context.md, test-failed-1.png, video.webm)
  prior_probe_pattern: .architect-team/diagnostic-research/agentic-commands-context/researcher-1.md
mempalace_queries:
  - "layout toggle switch does not flip v2 layout (--room diagnostic-plans)"
  - "layout toggle switch does not flip v2 layout (--room rca-artifacts)"
probe:
  script: .architect-team/diagnostic-research/layout-toggle-no-flip/probe-toggle-researcher-1.mjs
  results: .architect-team/diagnostic-research/layout-toggle-no-flip/probe-artifacts/probe-results.json
  screenshots: [probe-artifacts/A-as-failing-test-final.png, probe-artifacts/B-real-user-counterfactual-final.png]
  environment: "vite dev server port 3000, bun 1.3.14 via npm exec, SHELL stripped, BUN_RUNTIME_TRANSPILER_CACHE_PATH pinned, headless chromium via repo @playwright/test, Node v24.14.0, run 2026-07-19T17:06Z"
---

# Diagnostic draft — researcher 1 — why the New-layout-designs toggle click does not flip to v2 in e2e

## Verdict up front

**TEST-ENVIRONMENT ARTIFACT + stale test premise. NOT a product defect.** Empirically proven, not inferred:

1. The click IS genuine and the setting write DOES take: after the click, `localStorage["settings.v3"]` contains `"newLayoutDesigns":true` (captured in the probe's boot log, Section 2, Scenario A).
2. The product's layout-transition mechanism is **a full `window.location.reload()`**, scheduled by `setNewLayoutDesigns` itself — `packages/app/src/context/settings.tsx:411` — introduced upstream on 2026-07-15 by `4a181c357` ("desktop v2 migration finalising (#36912)"). The keyed-Show remount at `packages/app/src/app.tsx:576` is preempted by that reload (the v2 titlebar never even attaches pre-reload; MutationObserver flash-detector saw nothing).
3. The test's seed helper `setLayoutMode` (`packages/app/e2e/agentic-terminal/chrome-reachability.spec.ts:77-89`) uses `page.addInitScript`, which **re-runs on every document load — including the product-initiated reload — and unconditionally rewrites `settings.v3` back to `{"general":{"newLayoutDesigns":false,"layoutTransitionEligible":true}}`**, clobbering the `true` the click just persisted. The app then boots legacy again; `[data-slot="titlebar-v2"]` never appears; 60s timeout.
4. Counterfactual (probe Scenario B): the identical profile seeded ONCE (like a real transition-eligible user on legacy) and the identical UI click → reload fires → persisted `true` survives → app boots into v2 → `[data-slot="titlebar-v2"]` appears within seconds. **The real-user transition path works.**

The test's title and comment — "no page reload" / "the keyed Show remounts the router" (`chrome-reachability.spec.ts:205,251-252`) — describe the pre-`4a181c357` product behavior. Since 2026-07-15 the toggle deliberately reloads the page. The assertion target (`[data-slot="titlebar-v2"]` for the v2 state) is correct; the premise about the mechanism and the seeding idiom are what is wrong.

## Section 0 — Prior context from MemPalace

Both required queries were run (`mempalace --palace .mempalace/palace search "layout toggle switch does not flip v2 layout" --room diagnostic-plans` and `--room rca-artifacts`). **No palace is initialized at this workspace** (`No palace found at .mempalace/palace`; also checked `terminus_maximus/` and `opencode/` roots — no `.mempalace` anywhere). **No prior context found.**

Filesystem prior context (not MemPalace, recorded for the audit trail):

- `.architect-team/diagnostic-research/agentic-commands-context/researcher-1.md` — **kept** (probe-script pattern reused; establishes app.tsx tree facts: keyed Show at :575-576, layout fork :584-586).
- `.architect-team/diagnostic-research/agentic-commands-context/counter-evidence-20260719T163707Z.md` — **extended** (it explains why `app-version.v1` must be seeded; this draft extends the seeding analysis to the reload-clobber failure mode the same addInitScript idiom creates).
- `.architect-team/reviews/9.json` — **kept** (originating teammate's verbatim failure record; deliberately contains no hypothesis, per orchestrator "stop and report" instruction, so there is no originating hypothesis to anchor to).

## Section 1 — Full code flow examination

### Forward trace: click → assertion point

| Hop | file:line | What happens / data shape |
|---|---|---|
| 1 | `chrome-reachability.spec.ts:248-249` | Playwright clicks `[data-action="settings-new-layout-designs"] [data-slot="switch-control"]` (established idiom, same as `e2e/regression/remote-session-settings.spec.ts:28,63`, where this exact idiom demonstrably fires Kobalte onChange — `await expect(input).toBeChecked()` passes there). |
| 2 | `settings-general.tsx:264-274` | The row is rendered (gated by `settings.general.layoutTransitionAvailable()` at `settings-general.tsx:748` — true here because `layoutTransitionEligible:true` is seeded). `Switch checked={settings.general.newLayoutDesigns()}` (currently `false`) → click fires `onChange(true)`. |
| 3 | `settings-general.tsx:268` | `settings.general.setNewLayoutDesigns(true)`. |
| 4 | `settings.tsx:407-412` | `setNewLayoutDesigns`: `next = oldInterfaceRetired() ? true : value` → `oldInterfaceRetired()` is **false** (sunset `new Date(2026, 8, 14)` = 2026-09-14, settings.tsx:62,241; today 2026-07-19) → `next = true`. Guard `newLayoutDesigns() === next` → `false !== true`, proceed. `setStore("general", "newLayoutDesigns", true)` → synchronous write-through to localStorage via `persisted("settings.v3", ...)` (settings.tsx:223) → `makePersisted` + `localStorageDirect` (`utils/persist.ts:641`, `:425-464`). **Then `settings.tsx:411`: `if (typeof window !== "undefined") setTimeout(() => window.location.reload())`.** |
| 5 | `settings-general.tsx:269-272` | `checked === true` → dynamic `import("@/components/settings-v2")` then `dialog.show(<DialogSettings/>)` — a microtask/network race the reload wins; the v2 settings dialog never gets to show (observed: `dialogOpenCount: 0` post-reload in both probe scenarios). Does NOT throw (probe: `pageErrors: []`). |
| 6 | `app.tsx:576` | Solid flushes: `Show when={useSettings().general.newLayoutDesigns().toString()} keyed` — memo flips `"false"`→`"true"`, keyed remount begins. **Observed: `[data-slot="titlebar-v2"]` never attaches before the reload** (probe `titlebarV2SeenAt: null` with a document_start MutationObserver) — the remount + code-split v2 chunks lose the race against the `setTimeout(0)` reload. Irrelevant to the outcome either way. |
| 7 | browser | `window.location.reload()` → full document teardown (settings dialog destroyed — matches the failure snapshot `error-context.md:27-105`, which shows NO dialog open) → new document load. |
| 8 | `chrome-reachability.spec.ts:78-88` | **`page.addInitScript` re-runs on the new document** (Playwright semantics: init scripts run on EVERY navigation/load of the context). It unconditionally executes `localStorage.setItem("settings.v3", JSON.stringify({general:{newLayoutDesigns: false, layoutTransitionEligible: true}}))` — **overwriting the persisted `true` with the raw seed `false`**. |
| 9 | `settings.tsx:253-268` | App boots: `newLayoutDesigns` memo → `layoutUpgrade()` false (`launchState.previous` `"1.18.2"` === `platform.version` `"1.18.2"` → `isAppUpgrade` false, settings.tsx:78-82, 245-249, 286-294); `layoutTransitionClassified()` true (`layoutTransitionEligible` is boolean, :242) → `resolveNewLayoutDesigns(retired=false, preference=false, ...)` (:119-122) → **`false`** → legacy layout. |
| 10 | `app.tsx:584-586` | `Show when={...newLayoutDesigns()} fallback={routerProps.children}` → fallback = legacy routes; legacy sidebar (`[data-component='sidebar-nav-desktop']`) renders; `[data-slot="titlebar-v2"]` never mounts. |
| 11 | `chrome-reachability.spec.ts:253` | `waitForSelector('[data-slot="titlebar-v2"]')` → 60s timeout. **Failure point reached.** |

### Backward trace: from the failing assertion

- `[data-slot="titlebar-v2"]` renders only in the v2 layout branch → requires `useSettings().general.newLayoutDesigns()` truthy at `app.tsx:584` (and the keyed router mount at `:576`).
- That memo (settings.tsx:253-268) reads `store.general?.newLayoutDesigns` from the persisted `settings.v3` store; with the post-reload storage content (`newLayoutDesigns:false`) every branch resolves `false` (precondition computed at :119-122, :242-243).
- The store content precondition traces to whoever wrote `settings.v3` last → the test's own init script (hop 8), NOT the app (the app's last write was `true`, hop 4 — proven by the boot log below).

### The decisive empirical results (probe run 2026-07-19T17:06Z, artifacts under `probe-artifacts/`)

**Scenario A — seeded EXACTLY as the failing test (addInitScript re-seeds every load), same UI drive:**

- Pre-click: switch `aria-checked="false"`; `settings.v3` = full merged shape with `"newLayoutDesigns":false,"layoutTransitionEligible":true`.
- 174 ms after the click the original DOM was already gone (aria-checked re-read fails with element-destroyed race) and `settings.v3` read back as the RAW seed shape `{"general":{"newLayoutDesigns":false,"layoutTransitionEligible":true}}` — i.e. the init script had already re-run and clobbered.
- **Boot log (recorder init script installed BEFORE the seed script, so it sees carried-over storage pre-clobber): the post-reload document booted with `settings.v3` containing `"newLayoutDesigns":true`** — proof the click's write persisted and the reload happened, and that the seed then reverted it. (a) answered: the click fired onChange. (b) answered: the write took, then was clobbered.
- (c) `titlebarV2AppearedWithin20s: false`; flash detector `titlebarV2SeenAt: null`; final DOM: legacy sidebar present, no v2 titlebar, `dialogOpenCount: 0`. **Reproduces the e2e failure exactly, including the closed-dialog legacy snapshot in `error-context.md`.**
- (d) Console errors: only `ERR_CONNECTION_REFUSED` spam against the absent opencode backend (`localhost:4096`) — present in the green tests 2/3 environment too; no page errors; nothing related to the toggle.

**Scenario B — real-transition-eligible-user counterfactual (identical profile values, seeded ONCE, sessionStorage-guarded), same UI drive:**

- 124 ms post-click: `settings.v3` = full merged shape with `"newLayoutDesigns":true` (write survived — no clobber).
- Reload fired here too (3 main-frame loads, 2 document boots — same as A). Post-reload boot carried `"newLayoutDesigns":true`.
- **`titlebarV2AppearedWithin20s: true`; final DOM: v2 titlebar present, legacy sidebar gone.** The UI toggle DOES flip the layout for a realistic profile. Product path healthy.

## Section 2 — Ranked diagnostic hypotheses

```yaml
- rank: 1
  candidate: "Product-initiated full reload (settings.tsx:411, added by upstream 4a181c357 on 2026-07-15) re-triggers the test's addInitScript seed, which unconditionally rewrites settings.v3 back to newLayoutDesigns:false, reverting the successfully-persisted toggle before the app can boot into v2"
  category: test-author-error   # stale mechanism premise + seed idiom unsafe under product-initiated reload; sub-classification: test-environment artifact
  evidence:
    - "packages/app/src/context/settings.tsx:407-412 — setNewLayoutDesigns writes the store then schedules window.location.reload() via setTimeout"
    - "git show 4a181c357 (packages/app/src/context/settings.tsx hunk) — the reload line is NEW on 2026-07-15; pre-existing behavior was store-write only (keyed-Show remount was the transition mechanism)"
    - "packages/app/e2e/agentic-terminal/chrome-reachability.spec.ts:77-89 — setLayoutMode uses page.addInitScript with an UNCONDITIONAL localStorage.setItem of settings.v3; Playwright re-runs init scripts on every document load, including product-initiated reloads"
    - "probe-artifacts/probe-results.json Scenario A bootLog[1].settingsV3_preSeed — post-reload document carried newLayoutDesigns:true (the click's persisted write) before the seed clobbered it; final state newLayoutDesigns:false, legacy chrome, no dialog — byte-for-byte consistent with e2e error-context.md:27-105"
    - "probe-artifacts/probe-results.json Scenario B — identical drive, seed applied once: titlebar-v2 appears, settings.v3 stays true"
    - "packages/app/e2e/agentic-terminal/chrome-reachability.spec.ts:205,251-252 — test title/comment assert 'no page reload' / 'keyed Show remounts': the pre-4a181c357 mechanism; stale for HEAD dad0fff11"
  falsification_test: "Seed the identical profile once (sessionStorage-guarded init script) and re-drive the identical UI click: if the layout still fails to flip, this hypothesis is dead. EXECUTED — Scenario B flips to v2; hypothesis survives. Conversely, Scenario A's boot log directly falsifies every 'click/write never happened' alternative."
  matches_originating_teammate_hypothesis: false   # originating teammate recorded no hypothesis (reviews/9.json, per 'stop and report' instruction); SR's two guesses ('remount never fires OR write does not take') are both refuted: the write takes, and the remount is superseded by the reload, and the reversion is the test's own seed
  fix_scope_estimate: single-team
  raised_by_recent_change: "4a181c357"

- rank: 2
  candidate: "(H-e) The switch-control click never fires Kobalte's onChange — the setting is never written"
  category: test-author-error
  evidence:
    - "packages/app/e2e/regression/remote-session-settings.spec.ts:28,63 — the exact same [data-slot='switch-control'] click idiom is followed by await expect(input).toBeChecked() and a store-driven network side-effect poll, both green in the suite — the idiom fires onChange"
    - "probe Scenario A bootLog[1]: settings.v3 carried newLayoutDesigns:true into the post-reload document — the write happened, therefore onChange fired"
  falsification_test: "FALSIFIED by the probe boot log (write observed). Would have been confirmed by post-click aria-checked=false with settings.v3 unchanged and the settings dialog still open in the failure snapshot — the snapshot instead shows the dialog closed (error-context.md, no dialog node), which onChange-not-firing cannot explain."
  matches_originating_teammate_hypothesis: false
  fix_scope_estimate: single-team
  raised_by_recent_change: "none"

- rank: 3
  candidate: "(H-a) resolveNewLayoutDesigns/shouldEnableNewLayout ignores or overrides the stored true under the seeded flag combination (retirement/sunset or upgrade-classification branch)"
  category: product-bug
  evidence:
    - "packages/app/src/context/settings.tsx:119-122 — resolveNewLayoutDesigns(retired,preference,fallback): with retired=false it returns preference ?? fallback; a stored true is honored on every branch of the memo (:253-268)"
    - "packages/app/src/context/settings.tsx:62,241 — oldInterfaceSunset = 2026-09-14; today 2026-07-19 → oldInterfaceRetired()=false → no retirement override; retirement would force TRUE anyway (the pro-v2 direction, cannot cause a no-flip)"
    - "packages/app/src/context/settings.tsx:92-104,245-249,286-294 — with seeded app-version.v1 previous==current ('1.18.2'), isAppUpgrade=false → layoutUpgrade=false; no override path returns false when preference=true"
    - "probe Scenario B — the app booted with stored true + layoutTransitionEligible:true and rendered v2: the resolution chain honors the stored value in this exact flag combination"
  falsification_test: "FALSIFIED by Scenario B (stored true → v2 renders). Would have been confirmed if Scenario B still booted legacy despite settings.v3 newLayoutDesigns:true surviving."
  matches_originating_teammate_hypothesis: false
  fix_scope_estimate: single-team
  raised_by_recent_change: "none"

- rank: 4
  candidate: "(H-c/H-b/H-d) onChange's dialog.show throws before the write / setter and memo use different keys/shapes / keyed Show memo never changes"
  category: product-bug
  evidence:
    - "H-c: settings-general.tsx:268-272 — setNewLayoutDesigns(checked) executes BEFORE the dynamic import/dialog.show; probe pageErrors: [] in both scenarios; write observed in boot log"
    - "H-b: settings.tsx:410 (write: setStore('general','newLayoutDesigns',...) on the persisted 'settings.v3' store, :223) and :259/:265 (read: store.general?.newLayoutDesigns, same store) — same key, same shape; probe shows one settings.v3 with the full merged shape containing the toggled value"
    - "H-d: the memo DOES change (Scenario B flips) — and post-4a181c357 the keyed remount at app.tsx:576 is not the operative mechanism anyway (reload preempts it; flash detector null in both scenarios)"
  falsification_test: "All three FALSIFIED by the same probe observations (no page errors; write lands under the read key; v2 renders in B). Retained as one consolidated entry to document that every 'write-side product defect' candidate was independently checked rather than skipped."
  matches_originating_teammate_hypothesis: false
  fix_scope_estimate: single-team
  raised_by_recent_change: "none"

- rank: 5
  candidate: "(H-f) The assertion target [data-slot='titlebar-v2'] is wrong for the post-toggle state"
  category: test-author-error
  evidence:
    - "probe Scenario B final DOM: titlebarV2NowInDom:true, legacySidebarNowInDom:false after a successful transition — the selector IS the correct v2-state marker"
    - "chrome-reachability.spec.ts:177 — test 2 (green) uses the same selector to detect the v2 layout"
  falsification_test: "FALSIFIED for the selector itself; the WRONG-ASSERTION component that survives is the test's mechanism premise ('no page reload', :205,:251-252) — folded into rank 1."
  matches_originating_teammate_hypothesis: false
  fix_scope_estimate: single-team
  raised_by_recent_change: "none"
```

## Section 3 — Recent-change surface

Window: upstream merge window through HEAD `dad0fff11` (test 4 was authored in this run, 2026-07-19; the relevant regressions can only come from what the test was written against).

| Commit | Date | Relevance |
|---|---|---|
| `4a181c357` desktop v2 migration finalising (#36912) | 2026-07-15 | **THE pivotal change**: adds `window.location.reload()` to `setNewLayoutDesigns` (settings.tsx:411) + the `newLayoutDesigns() === next` early-return guard. Post-dates the keyed-Show remount design; invalidates the test's "no page reload" premise. |
| `265a93927` feat(desktop): add layout transition switch (#36667) | — | Introduces the InterfaceSection toggle + transition gating (layoutTransitionEligible/Available). |
| `ac5e24908` / `446510a6a` / `51b9c726c` | — | Interface-transition setting churn (added, copy-tightened, once accidentally merged + reverted) — background for the gating semantics, no bearing on the no-flip. |
| `0c4f508c5` feat(app): add server-keyed session routes (#32570) | — | Introduced the keyed `Show when={...newLayoutDesigns().toString()}` router remount (app.tsx:576) — the OLD transition mechanism the test comment describes. |
| `03af00544` + `2d2339f51` | 2026-07-19 run | This run's own work: chrome-reachability spec (incl. test 4 + setLayoutMode) and the /agentic feature. The test's addInitScript idiom was authored AFTER `4a181c357` landed but modeled on the pre-reload mechanism. |

## Section 4 — Open questions for the architect

1. **Secondary product wart (out of SR scope, flag upstream):** `settings-general.tsx:269-272` promises to open the v2 settings dialog after enabling, but the reload scheduled at `settings.tsx:411` destroys the page before `dialog.show` completes (probe: `dialogOpenCount: 0` post-reload in BOTH scenarios). Real users toggling ON never see that dialog. Also, the keyed-Show remount at `app.tsx:576` now does redundant work (a full remount that is immediately thrown away by the reload). Both are consequences of `4a181c357`; neither blocks users from reaching v2. Decide whether to file a separate SR or report upstream.
2. **Test 4's other seeds under seed-once semantics:** `goBack()` (spec :225) is a same-document SPA traversal, so seed-once does not affect steps 1-2 of the test; verified only analytically, not empirically, since my probe started the toggle drive from "/" directly. The fix team should run the full test 4 after the fix (my probe covered the settings-open → toggle → v2 segment).
3. **No `.mempalace` palace exists in this workspace** — wake-up and focused searches cannot return prior plans; if palace initialization is expected by the pipeline, that is an orchestrator-level gap.

## Recommended fix (for the architect's consolidated plan — not applied)

**Primary (test):** make `setLayoutMode`'s seed first-load-only so it cannot revert product-initiated writes on reload — `packages/app/e2e/agentic-terminal/chrome-reachability.spec.ts:78-88`, wrap the two `localStorage.setItem` calls in a sessionStorage guard (exact pattern validated live in probe Scenario B):

```ts
await page.addInitScript((mode) => {
  try {
    if (sessionStorage.getItem("__setLayoutModeSeeded")) return   // NEW: do not clobber product writes on product-initiated reloads
    localStorage.setItem("settings.v3", JSON.stringify({ general: { newLayoutDesigns: mode, layoutTransitionEligible: true } }))
    localStorage.setItem("app-version.v1", JSON.stringify({ version: "1.18.2" }))
    sessionStorage.setItem("__setLayoutModeSeeded", "1")          // NEW
  } catch {}
}, enabled)
```

Tests 2/3 are unaffected (single document load each; first-load seed identical).

**Secondary (test, honesty):** update test 4's title and comments (`chrome-reachability.spec.ts:205, 206-208, 251-252`) — the transition mechanism since `4a181c357` is a product-initiated full reload (`settings.tsx:411`), not an in-place keyed remount. Optionally strengthen the test to assert the post-reload persisted state (`localStorage["settings.v3"]` contains `"newLayoutDesigns":true`) before waiting for `[data-slot="titlebar-v2"]`, so a future clobber regression fails with a readable message instead of a 60s timeout.

**Explicitly NOT recommended:** any product change to `settings.tsx:407-412` or `app.tsx:576` for THIS SR — the real-user path is proven working (Scenario B). The Section 4 item 1 wart is a separate, smaller conversation.

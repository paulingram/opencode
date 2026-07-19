---
schema_version: 1
researcher_index: 3
test_id: layout-toggle-no-flip (chrome-reachability.spec.ts test 4, "entry survives layout-mode toggle")
sr_id: SR-layout-toggle-no-flip-20260719T1130Z.json
started_at: 2026-07-19T17:09:00Z
inputs:
  rca_artifact: ".architect-team/reviews/9.json (originating teammate frontend-context-fix's final report; no separate rca/ artifact exists for this SR — see Section 4)"
  expectations: "none provided (no .architect-team/.../expectations/<test-id>.json exists for this SR — the assertion contract is the spec itself, chrome-reachability.spec.ts:205-259; see Section 4)"
  review_evidence: ".architect-team/reviews/9.json"
  maps:
    - docs/CODEBASE_MAP.md
    - docs/ROUTE_MAP.md
    - docs/INTEGRATION_MAP.md
    - docs/DESIGN_MAP.md
  coverage_map_slice: "SRC-1-nav-entry-both-modes (from SR affected_requirements)"
mempalace_queries:
  - "settings toggle new layout designs does not flip v2"
  - "layout transition keyed remount playwright toggle failure"
empirical_probe: ".architect-team/diagnostic-research/layout-toggle-no-flip/probe.mjs + artifacts/probe-results.json + artifacts/*.png (run 2026-07-19 against the live Vite dev server on 127.0.0.1:3000, repo's @playwright/test 1.59.1 chromium, Node v24.14.0)"
---

# Researcher 3 — independent diagnostic draft

**ONE-LINE VERDICT: TEST ARTIFACT (primary) + WRONG TEST PREMISE (secondary). The product is NOT defective: the click fires, the setting persists, and the layout genuinely flips — via a product-designed full `window.location.reload()` (settings.tsx:411, upstream commit 4a181c357, 2026-07-15) — after which the test's own `page.addInitScript` re-runs and rewrites `settings.v3` back to `newLayoutDesigns:false`, reverting the toggle before the rebooted app reads it. The test's premise ("keyed Show remount, no page reload") describes the pre-4a181c357 product and is stale.**

---

## Section 0 — Prior context from MemPalace

Both required searches were run against the machine's default palace (471 drawers; the
per-workspace `<workspace>/.mempalace/palace` does not exist, and no `diagnostic-plans` /
`rca-artifacts` rooms exist in the default palace — searched the `opencode` wing and
palace-wide instead):

- Query 1 `"settings toggle new layout designs does not flip v2"` (wing `opencode`): top hit
  cosine 0.094 (a triage-classifier record for the original agentic-terminal feature brief) —
  **discarded as irrelevant** (below the 0.40 noise floor; wrong content class).
- Query 2 `"layout transition keyed remount playwright toggle failure"` (palace-wide): top hits
  cosine 0.291 / 0.29 (2026-05-18 calibration walkthrough-drift reports) — **discarded as
  irrelevant** (below the 0.40 noise floor; different project surface).

**No prior context found** above the cosine 0.40 floor. One local (non-palace) prior artifact was
used per the dispatch: `.architect-team/diagnostic-research/agentic-commands-context/researcher-1.md`
(**extended** — its headless-probe pattern against the dev server was reused for this draft's
empirical step; its subject, the AgenticCommands context crash, is a different, already-fixed
failure).

## Section 1 — Full code flow examination

### 1.1 Forward trace: from the test's click to the failing observable

Seeding (what the failing run's browser profile contains on EVERY document load):

1. `packages/app/e2e/agentic-terminal/chrome-reachability.spec.ts:77-89` — `setLayoutMode(page,false)`
   registers a `page.addInitScript` that does
   `localStorage.setItem("settings.v3", JSON.stringify({general:{newLayoutDesigns:false, layoutTransitionEligible:true}}))`
   and `localStorage.setItem("app-version.v1", JSON.stringify({version:"1.18.2"}))`.
   **Playwright init scripts run on every document load — including reloads.** This is the
   load-bearing fact of the whole failure.
2. Test 4 body (`chrome-reachability.spec.ts:205-259`): goto `/` → legacy sidebar renders →
   legacy agentic entry click → `/agentic` → `goBack()` → Settings button click → toggle row
   `[data-action="settings-new-layout-designs"]` visible → `switch-control` click at `:249` →
   `page.waitForSelector('[data-slot="titlebar-v2"]')` at `:253` (the failing wait). Note test 4
   installs **no** `mockOpenCodeServer` — all SDK traffic fails with connection-refused; chrome
   rendering does not depend on it (confirmed empirically, Section 1.4).

Click handling (product):

3. `packages/app/src/components/settings-general.tsx:748-749` — the toggle row renders inside
   `<Show when={settings.general.layoutTransitionAvailable()}>`; available =
   `ready() && scheduled && eligible && !retired` (`settings.tsx:419`, `layoutTransitionState`
   `settings.tsx:106-111`). With the seed (`eligible=true`), sunset `2026-09-14`
   (`settings.tsx:62`) scheduled and not yet retired on 2026-07-19, the row renders. Matches the
   teammate's round-2 fix.
4. `settings-general.tsx:264-274` — `<div data-action="settings-new-layout-designs"><Switch
   checked={settings.general.newLayoutDesigns()} onChange={...}>`. The onChange (`:267-273`):
   `settings.general.setNewLayoutDesigns(checked)` FIRST (`:268`), then, if `checked`, a dynamic
   `import("@/components/settings-v2")` + `dialog.show(<DialogSettings/>)` (`:270-272`).
5. `packages/app/src/context/settings.tsx:407-412` — `setNewLayoutDesigns(value)`:
   ```ts
   const next = oldInterfaceRetired() ? true : value      // :408 — retired=false today → next = true
   if (newLayoutDesigns() === next) return                 // :409 — memo is false pre-click → no early return
   setStore("general", "newLayoutDesigns", next)           // :410 — the persisted store write
   if (typeof window !== "undefined") setTimeout(() => window.location.reload())  // :411 — FULL PAGE RELOAD
   ```
   **Line 411 is the pivotal product fact.** The UI toggle path does not rely on the in-place
   keyed remount; it persists the flag and reloads the document on the next macrotask.
6. Persistence: `setStore` flows through `persisted("settings.v3", ...)` (`settings.tsx:223`) →
   `makePersisted` → `localStorageDirect().setItem` (`packages/app/src/utils/persist.ts:444-453`,
   `write()` `:143-164`). The write is synchronous relative to the reload (empirically confirmed:
   the `newLayoutDesigns:true` write lands ~16 ms before `pagehide`).
7. Reactive consequence in the same document: the `newLayoutDesigns` memo
   (`settings.tsx:253-268`) re-evaluates. Post-write branch: `layoutUpgrade()` false
   (`previous == current` version → `shouldEnableNewLayout` `settings.tsx:92-104` returns false via
   `isAppUpgrade` false); `ready()` true; `layoutTransitionClassified()` true (eligible is a
   boolean, `settings.tsx:242`); so `resolveNewLayoutDesigns(retired=false, preference=true, …)`
   (`settings.tsx:119-122`) returns **true**. The keyed router `<Show when={...toString()} keyed>`
   (`packages/app/src/app.tsx:576`) remounts, and `[data-slot='titlebar-v2']` DOES appear —
   empirically observed in-document for ~16 ms (Section 1.4, boot-1 `titlebar-v2-appeared` then
   `pagehide`).
8. Then `settings.tsx:411`'s scheduled `window.location.reload()` fires. On the new document,
   the test's init script (step 1) runs BEFORE any app code and **replaces** `settings.v3` with
   `{"general":{"newLayoutDesigns":false,"layoutTransitionEligible":true}}` — discarding the
   just-persisted `true`. The app boots, `persisted` normalizes/merges the seeded value
   (`persist.ts:208-231`), the memo resolves `false`, legacy chrome renders, and
   `[data-slot='titlebar-v2']` never appears again → the `:253` wait times out at 60 s. The
   captured e2e snapshot's "legacy chrome (sidebar rail buttons)" state (SR origin.detail;
   reviews/9.json tests_note) is exactly this post-reload legacy boot.

### 1.2 Backward trace: from the failing assertion

- Failing observable: `[data-slot='titlebar-v2']` absent for 60 s (`chrome-reachability.spec.ts:253`).
- For it to appear, the keyed `Show` (`app.tsx:576`) must render the v2 branch → requires
  `useSettings().general.newLayoutDesigns()` true → requires (given not-retired, classified,
  no upgrade) `store.general.newLayoutDesigns === true` (`settings.tsx:263-267` →
  `resolveNewLayoutDesigns` `:119-122`) → requires the persisted `settings.v3` to still contain
  `true` when the (product-initiated) reloaded document hydrates → **violated by the test's own
  per-document-load re-seed** (`chrome-reachability.spec.ts:78-88`). Every upstream precondition
  (row rendered, click landed, onChange fired, store written, memo flipped, remount fired) was
  satisfied — verified empirically below.
- Note on the wait mechanics: `page.waitForSelector` attaches after the click round-trip
  (> the ~16 ms pre-reload window in which titlebar-v2 exists), survives the navigation, and
  keeps waiting in the post-reload document, where the selector never matches. Even if the wait
  caught the flash, the next steps (`:254-258`, clicking the v2 entry) would race the reload and
  fail — the test as written cannot pass deterministically.

### 1.3 Ownership note

The causal write (`settings.tsx:407-412`) and the consuming remount (`app.tsx:576`) are
pre-existing upstream product code — outside the originating teammate's changed surface. The
teammate's changes (spec seeding + selector) are inside their owned files; their round-1/2/3
amendments were all correct and are not implicated. The failure lives at the boundary between
upstream product behavior (reload-on-toggle, 4a181c357, 2026-07-15) and the newly-authored test's
assumption (03af00544, 2026-07-19).

### 1.4 DECISIVE EMPIRICAL RESULTS (probe run 2026-07-19, live dev server :3000)

Probe: `probe.mjs` (this directory), reusing the researcher-1 headless-probe pattern; repo's own
`@playwright/test` 1.59.1 chromium; in-page instrumentation persists a log across reloads via
captured-native `localStorage.setItem` (boot counter, every `settings.v3` write, first appearance
of each chrome marker per boot, `pagehide`). Full data: `artifacts/probe-results.json`;
screenshots `artifacts/*.png`. Test 4 installs no backend mock, so the probe (like the failing
run) sees only connection-refused SDK noise — no page errors.

**Scenario A — exact failing-test semantics** (init script re-seeds
`{newLayoutDesigns:false, layoutTransitionEligible:true}` + `app-version.v1` on every load):

| t (ms, relative) | boot | event |
|---|---|---|
| 0 | 1 | boot; init script seeds `settings.v3` (`newLayoutDesigns:false`) |
| +555 | 1 | `legacy-sidebar-appeared`; pre-click `aria-checked="false"` (a) |
| +998 | 1 | **`setItem settings.v3` with `"newLayoutDesigns":true`** — the click DID fire Kobalte's onChange and the store write DID persist (b) |
| +999 | 1 | **`titlebar-v2-appeared` (same document)** — the keyed remount (app.tsx:576) DID fire (c) |
| +1015 | 1 | `pagehide` — the product's `window.location.reload()` (settings.tsx:411) |
| +1028 | 2 | boot; **init script re-seeds `settings.v3` back to `newLayoutDesigns:false`** |
| +1390 | 2 | `legacy-sidebar-appeared`; final state: boots=2, `titlebarV2:false`, `legacySidebar:true`, persisted `newLayoutDesigns:false` |

Console errors (d): only backend `ERR_CONNECTION_REFUSED` / `[global-sdk] event stream error`
noise (test 4 mounts no mock server); zero page errors, zero errors from the onChange/dialog path.

**Scenario B1 — counterfactual: real transition-eligible user** (identical initial profile, but
seeded ONCE; reloads preserve app writes — what a real user's localStorage does):
boot 1 legacy → same click → `setItem newLayoutDesigns:true` → `titlebar-v2-appeared` (boot 1)
→ `pagehide` (reload) → boot 2 with **no re-seed** → **`titlebar-v2-appeared` (boot 2); final
state `titlebarV2:true`, persisted `newLayoutDesigns:true`**. **The product flow works
end-to-end for a real user — the toggle genuinely transitions the app to the v2 layout, via
reload.**

**Scenario B2 — eligible, NO `newLayoutDesigns` key (dispatch's literal counterfactual):** boots
directly into `titlebar-v2` on the dev server — with no explicit preference,
`resolveNewLayoutDesigns(false, undefined, eligible ? legacyNewLayoutDesignsDefault : …)`
falls back to `legacyNewLayoutDesignsDefault = import.meta.env.VITE_OPENCODE_CHANNEL !== "prod"`
(`settings.tsx:59`) = `true` on dev/e2e builds. Such a profile never shows legacy chrome at all,
so the legacy-side toggle cannot even be reached; a `newLayoutDesigns:false` seed (as the test
and B1 use) is required to start in legacy. (Channel-dependent nuance recorded for the architect.)

## Section 2 — Ranked diagnostic hypotheses

```yaml
- rank: 1
  candidate: "CONFIRMED ROOT CAUSE — product-designed full page reload on toggle (settings.tsx:411) re-runs the test's addInitScript, which unconditionally rewrites settings.v3 back to newLayoutDesigns:false, reverting the successfully-persisted toggle before the rebooted app reads it; the test's 'no page reload' premise is stale against upstream commit 4a181c357"
  category: test-author-error
  evidence:
    - "packages/app/src/context/settings.tsx:407-412 — setNewLayoutDesigns writes the store then schedules setTimeout(() => window.location.reload()); the UI toggle path reloads by design"
    - "packages/app/e2e/agentic-terminal/chrome-reachability.spec.ts:77-89 — setLayoutMode's page.addInitScript re-runs on EVERY document load and unconditionally setItem's settings.v3 with newLayoutDesigns:false"
    - "packages/app/e2e/agentic-terminal/chrome-reachability.spec.ts:205-208,251-253 — test name/comment assert 'keyed Show remount ... no page reload', contradicting settings.tsx:411"
    - "git 4a181c357 (2026-07-15, upstream 'desktop v2 migration finalising #36912') — diff adds the reload line to setNewLayoutDesigns; predates both the agentic-terminal feature (2d2339f51, 2026-07-17) and the spec (03af00544, 2026-07-19)"
    - "probe artifacts/probe-results.json Scenario A — boot-1 write newLayoutDesigns:true (+998ms), titlebar-v2 flash (+999ms), pagehide (+1015ms), boot-2 re-seed to false (+1028ms), final legacy chrome"
    - "probe Scenario B1 — seed-once profile: identical click ends with persisted newLayoutDesigns:true and titlebar-v2 rendered post-reload; the product path works for a real transition-eligible user"
  falsification_test: "Seed the identical profile ONCE (guarded init script) instead of on every load and re-run the identical click: if the failure were a product defect the layout would still not flip; it flips (Scenario B1). Conversely, re-seeding every load reproduces the exact e2e end-state (Scenario A). Both directions executed; hypothesis confirmed."
  matches_originating_teammate_hypothesis: false
  fix_scope_estimate: single-team
  raised_by_recent_change: "4a181c357 (product, upstream baseline) x 03af00544 (test authored against pre-4a181c357 semantics)"

- rank: 2
  candidate: "FALSIFIED (dispatch H-e) — the switch-control click lands but never fires Kobalte's onChange, so no store write occurs"
  category: browser-runtime
  evidence:
    - "packages/app/src/components/settings-general.tsx:264-274 — Switch onChange calls setNewLayoutDesigns(checked) first, before any dialog work"
    - "probe Scenario A boot-1 — pre-click aria-checked='false'; setItem of settings.v3 containing '\"newLayoutDesigns\":true' recorded ~1ms after the click; titlebar-v2 appeared in the same document"
  falsification_test: "If onChange did not fire, no settings.v3 write with newLayoutDesigns:true would appear in the instrumented setItem log and no titlebar-v2 flash would occur in boot 1. Both were observed — falsified."
  matches_originating_teammate_hypothesis: true
  fix_scope_estimate: single-team
  raised_by_recent_change: "none"

- rank: 3
  candidate: "FALSIFIED (dispatch H-a/H-b/H-d family) — the store/memo machinery ignores the stored true (resolveNewLayoutDesigns branch, wrong key/shape, or keyed Show never re-runs)"
  category: product-bug
  evidence:
    - "packages/app/src/context/settings.tsx:119-122 — resolveNewLayoutDesigns(retired,preference,fallback) returns `preference ?? fallback` when retired=false; with preference=true it returns true unconditionally"
    - "packages/app/src/context/settings.tsx:253-268 — the memo reads store.general?.newLayoutDesigns, the exact path setStore('general','newLayoutDesigns',next) writes (settings.tsx:410); same key 'settings.v3' via persisted (settings.tsx:223)"
    - "packages/app/src/app.tsx:576 — <Show when={...newLayoutDesigns().toString()} keyed> re-keys on the memo; probe Scenario A/B1 both show titlebar-v2 appearing in boot 1 (~1ms after the write), proving the remount fires"
    - "packages/app/src/utils/persist.ts:208-231 — normalize/merge accepts the test's partial settings.v3 shape and merges over defaults; probe logs show the app's own merged rewrite preserving the seeded values (no shape rejection)"
  falsification_test: "If any of these held, boot 1 would show no titlebar-v2 flash after the write, or the write would target a different key. The instrumented log shows the write to settings.v3 general.newLayoutDesigns and an immediate same-document v2 remount — falsified. (H-d's observation half-survives in inverted form: the memo value IS reverted, but by the boot-2 re-seed, not by memo semantics.)"
  matches_originating_teammate_hypothesis: false
  fix_scope_estimate: single-team
  raised_by_recent_change: "none"

- rank: 4
  candidate: "FALSIFIED (dispatch H-c) — the onChange's dynamic import + dialog.show(DialogSettings) throws and interrupts before the write"
  category: product-bug
  evidence:
    - "packages/app/src/components/settings-general.tsx:268-272 — setNewLayoutDesigns(checked) executes BEFORE the import; the import/show results are void-ed, so a rejection cannot undo the write"
    - "probe Scenario A/B1 consoleErrors — zero pageerror entries; only backend connection-refused noise (test 4 mounts no mockOpenCodeServer)"
  falsification_test: "A throw before the write would leave no newLayoutDesigns:true setItem in the log and would surface as a pageerror. The write is present and no error was captured — falsified. Side-observation for the architect: the reload (settings.tsx:411) preempts the scheduled dialog.show, making settings-general.tsx:269-272 effectively dead code on the enable path — a product smell, not the failure cause."
  matches_originating_teammate_hypothesis: false
  fix_scope_estimate: single-team
  raised_by_recent_change: "4a181c357 (made the dialog.show unreachable in practice)"
```

(Dispatch H-f — "titlebar-v2 is the wrong marker" — is subsumed by rank 1:
`[data-slot='titlebar-v2']` is the correct v2-shell marker (test 2 passes on it; Scenario B1
renders it post-reload). What is wrong is not the selector but the premise that no reload
intervenes.)

## Section 3 — Recent-change surface

Test 4 has no last-green: it was authored in this run (03af00544, 2026-07-19) and has never
passed (four successive failure points; reviews/9.json). Commits on the trace path, newest first:

| SHA | Date | Summary | Relevance |
|---|---|---|---|
| (working tree, uncommitted) | 2026-07-19 | teammate's three orchestrator-amended spec fixes (app-version seed, layoutTransitionEligible seed, switch-control selector) + AgenticCommands mount move in app.tsx | correct; not implicated |
| 03af00544 | 2026-07-19 | chrome-reachability spec authored (test 4 + 'no page reload' premise) | **wrong premise vs 4a181c357** |
| 2d2339f51 | 2026-07-17 | agentic terminal feature | provides the nav entries; not implicated |
| 4a181c357 | 2026-07-15 | upstream "desktop v2 migration finalising (#36912)" | **adds `window.location.reload()` to setNewLayoutDesigns (settings.tsx:411) + current memo/classified semantics** |
| 265a93927 | 2026-07-14 | "feat(desktop): add layout transition switch (#36667)" | layoutTransitionEligible gating machinery |
| ac5e24908 | 2026-07-08 | "feat(app): add interface transition setting" | introduces the transition setting family |

The regression class is **premise drift**: the spec encodes the pre-4a181c357 toggle behavior
(pure keyed remount) that stopped being the interactive path four days before the spec was
written.

## Section 4 — Open questions for the architect

1. **Missing canonical inputs.** No per-test expectation file
   (`.architect-team/.../expectations/<test-id>.json`) and no standalone 3-pass RCA artifact
   exist for this SR; the originating evidence is reviews/9.json (the teammate was explicitly
   ordered to stop before diagnosing). I proceeded on the Lead's dispatch inputs (SR +
   reviews/9.json + test-results). If a formal expectation file exists elsewhere, it should be
   reconciled with the reload finding.
2. **SR acceptance-criteria wording needs a decision.** SR AC-2 requires test 4 to pass with a
   "real UI toggle drive". Under current product behavior the real UI toggle ALWAYS reloads
   (settings.tsx:411). The architect must decide which contract test 4 should encode:
   (a) "entry survives the user-facing layout toggle" — keep the real click, accept the reload,
   fix the seed to apply once (guarded init script) so the post-reload boot honors the toggled
   value; assert titlebar-v2 + agentic entry after the reload (Scenario B1 proves this passes); or
   (b) "entry survives an in-document keyed remount (app.tsx:576, no reload)" — this cannot be
   driven through the Settings switch at all; the only no-reload flip paths are non-interactive
   (the sunset-retirement signal flip, settings.tsx:271-284/315-319, and the upgrade migration,
   settings.tsx:296-302). Recommended fix direction (for the fix team, not applied here):
   **option (a)** — change `setLayoutMode` (chrome-reachability.spec.ts:77-89) to guard the seed
   with a marker key (seed only the first document load), update test 4's name/comments
   (`:205-208`, `:251-252`) to drop the "no page reload" claim, and after the `:249` click wait
   for the reload (e.g. `page.waitForLoadState`/URL stability) before the `:253`
   titlebar-v2 wait. No product change is required for this SR.
3. **Product smells observed (not failure causes; flag for a product decision, separate from
   this SR):** (i) `settings-general.tsx:269-272`'s `dialog.show(DialogSettings)` on enable is
   preempted by the reload scheduled inside `setNewLayoutDesigns` — dead code in practice;
   (ii) the keyed remount (`app.tsx:576`) and the reload are redundant for the interactive path —
   the ~16 ms v2 flash before reload is user-visible in principle; (iii) e2e/dev-channel nuance:
   `legacyNewLayoutDesignsDefault = VITE_OPENCODE_CHANNEL !== "prod"` (settings.tsx:59) makes an
   eligible-but-unset profile boot v2 on dev builds and legacy on prod builds (Scenario B2) —
   any future spec seeding "no override" profiles will behave channel-dependently.
4. **Timezone note on the gating window:** `oldInterfaceSunset = new Date(2026, 8, 14)`
   (settings.tsx:62) is LOCAL midnight 2026-09-14. Runs on machines past that date will have
   `oldInterfaceRetired()===true`, which force-returns `true` from both the memo and the setter
   (settings.tsx:119-120, :408) and hides the toggle row (`available` requires `!retired`,
   settings.tsx:108) — test 4 will need a different gate (or clock control) after the sunset.
   Not the current failure (today is 2026-07-19), but a scheduled future break of the same test.

---
schema_version: 1
researcher_index: 2
test_id: layout-toggle-no-flip
sr_id: SR-layout-toggle-no-flip-20260719T1130Z.json
started_at: 2026-07-19T17:08:37Z
inputs:
  rca_artifact: "not provided as a discrete file; originating teammate evidence = .architect-team/reviews/9.json (adversarial_review_note + manual_followups carry the teammate's candidate hypotheses)"
  expectations: "not provided; source-of-truth premise taken from the spec scenario text embedded in chrome-reachability.spec.ts:205-208 and SR acceptance criteria"
  review_evidence: .architect-team/reviews/9.json
  maps:
    - docs/CODEBASE_MAP.md
    - docs/ROUTE_MAP.md
    - docs/INTEGRATION_MAP.md
    - docs/DESIGN_MAP.md
  coverage_map_slice: "SR affected_requirements: SRC-1-nav-entry-both-modes (chrome-reachability.spec.ts tests 1-4)"
mempalace_queries:
  - "settings toggle does not switch app to v2 layout"
  - "layout mode switch click no keyed remount titlebar-v2"
empirical_artifacts:
  - .architect-team/diagnostic-research/layout-toggle-no-flip/probe-researcher-2.mjs
  - .architect-team/diagnostic-research/layout-toggle-no-flip/probe-researcher-2-output.json
---

# Researcher 2 — why the New-layout-designs toggle click does not flip the layout in e2e

**Verdict (empirically confirmed): TEST-ENVIRONMENT ARTIFACT compounded by a STALE TEST PREMISE. NOT a product defect.**
The product toggle works end-to-end for a real transition-eligible user (probe scenario B: layout flips and stays flipped, zero console errors). The e2e failure is caused by the interaction of two facts: (1) `setNewLayoutDesigns` performs a **product-initiated `window.location.reload()`** (`packages/app/src/context/settings.tsx:411`, introduced by upstream commit `4a181c357` "desktop v2 migration finalising (#36912)"); (2) the test's `setLayoutMode` seeds via `page.addInitScript`, which **re-runs on every document load — including that reload — re-seeding `newLayoutDesigns: false`** and silently reverting the user's just-persisted choice (`packages/app/e2e/agentic-terminal/chrome-reachability.spec.ts:78-88`). The test's stated premise — "keyed Show remount at app.tsx, no reload" (spec.ts:206-208, 251-252) — describes the **pre-`4a181c357`** product semantics and is no longer true.

---

## Section 0 — Prior context from MemPalace

Both required queries were run against `C:/Users/Paul/Documents/terminus_maximus/.mempalace/palace` (rooms `diagnostic-plans` and `rca-artifacts`). **No palace is initialized at that path** (`mempalace` CLI present at `C:\Users\Paul\.local\bin\mempalace.exe`; both searches returned "No palace found ... Run: mempalace init"). **No prior context found** via MemPalace.

Repo-local prior context (read directly, not via palace):

- `.architect-team/diagnostic-research/agentic-commands-context/researcher-1.md` — **extended**: reused its headless-probe pattern (env-stripped dev server + repo's own Playwright dep) for this draft's empirical step. Different failure signature (context-provider crash), not hypothesis-relevant here.
- `.architect-team/diagnostic-research/agentic-commands-context/counter-evidence-20260719T163707Z.md` — **kept**: documents the `app-version.v1` seed requirement that shaped the current `setLayoutMode`; directly relevant because this draft finds the *same seeding mechanism* (addInitScript) is now the failure vector at a later step.
- `.architect-team/reviews/9.json` — **extended**: the originating teammate's final report; its `adversarial_review_note` lists three unverified guesses (click not flipping the store / remount >60s / "a different code path than test 4 assumes"). This draft confirms a refined version of the third and falsifies the first two with instrumented evidence.

## Section 1 — Full code flow examination

### Forward trace: click → assertion point

| # | Hop | file:line | Data / state at hop |
|---|---|---|---|
| 1 | Test seeds profile via `addInitScript` | `packages/app/e2e/agentic-terminal/chrome-reachability.spec.ts:78-88` | `settings.v3 = {general:{newLayoutDesigns:false, layoutTransitionEligible:true}}`, `app-version.v1 = {version:"1.18.2"}`. **Init scripts re-run on EVERY document load** (Playwright contract) — load-bearing fact. |
| 2 | App boots; settings store hydrates | `packages/app/src/context/settings.tsx:223` (`persisted("settings.v3", …)`); `packages/app/src/utils/persist.ts:553-661` | Web platform → `localStorageDirect()` (persist.ts:425-464) → **synchronous** localStorage read/write through `makePersisted`. Seed merges over defaults (persist.ts:174-198). |
| 3 | Launch classification | settings.tsx:286-294 | `launchState.previous = "1.18.2"` = `platform.version` → `isAppUpgrade` false → `layoutUpgrade()` false (settings.tsx:245-249, `shouldEnableNewLayout` settings.tsx:92-104 not triggered). |
| 4 | `newLayoutDesigns` memo resolves | settings.tsx:253-268 | `layoutUpgrade()` false; `ready()` true; `layoutTransitionClassified()` **true** (settings.tsx:242 — `layoutTransitionEligible` is a boolean); → `resolveNewLayoutDesigns(retired=false, preference=false, …)` (settings.tsx:119-122) → **false**. `oldInterfaceRetired()` is false: `oldInterfaceSunset = new Date(2026, 8, 14)` (settings.tsx:62) = 2026-09-14, run date 2026-07-19 (settings.tsx:241). Legacy layout renders. |
| 5 | Toggle row renders | `packages/app/src/components/settings-general.tsx:264-274` | Gated on `layoutTransitionAvailable` (settings.tsx:419 → `layoutTransitionState` settings.tsx:106-111: `available = scheduled && eligible && !retired` = true∧true∧true). Row present — matches teammate rounds 2-3. |
| 6 | Click on `[data-slot="switch-control"]` fires Kobalte `onChange(true)` | settings-general.tsx:266-268 | **Empirically confirmed fired**: switch `aria-checked="true"` captured at `beforeunload` (probe A, `unloadSwitch: "true"`). |
| 7 | `setNewLayoutDesigns(true)` | settings.tsx:407-412 | `next = oldInterfaceRetired() ? true : value` → `true`; guard `newLayoutDesigns() === next` false → proceeds; `setStore("general","newLayoutDesigns", true)` → **synchronously persisted** to localStorage (hop 2 chain). **Then `setTimeout(() => window.location.reload())` (settings.tsx:411).** |
| 8 | Solid reacts synchronously: memo flips → keyed remount fires | `packages/app/src/app.tsx:576` (`<Show when={useSettings().general.newLayoutDesigns().toString()} keyed>`; SR cites this as :575 — one-line drift, current source :576) | **Empirically confirmed**: `[data-slot="titlebar-v2"]` was **present in the DOM at `beforeunload`** (probe A, `unloadTitlebarV2: "present"`), i.e. the SPA remount to v2 genuinely happened *before* the reload. |
| 9 | onChange continues: dynamic import + `dialog.show(DialogSettings)` | settings-general.tsx:269-272 | Async import; preempted by the reload macrotask. No error observed (probe A/B error channels: only pre-existing `ERR_CONNECTION_REFUSED` noise against the absent `localhost:4096` backend). |
| 10 | **Reload macrotask fires** | settings.tsx:411 | Document unloads (`loads` counter 1→2 in probe A and B). Settings dialog — mounted via `DialogProvider` at `app.tsx:372`, *above* the keyed Show — is destroyed **only because the whole document reloads**. |
| 11 | New document: init script from hop 1 **re-runs** | spec.ts:78-88 | `localStorage['settings.v3']` **overwritten back to `{newLayoutDesigns:false, layoutTransitionEligible:true}`** — the persisted `true` from hop 7 is destroyed (probe A: `unloadSettings` had `newLayoutDesigns:true`; `settingsV3Now` after reload has `newLayoutDesigns:false`). |
| 12 | App boots into **legacy** layout again | hops 2-4 repeat with `preference=false` | `[data-slot="titlebar-v2"]` never renders on the post-reload document. `waitForSelector` at spec.ts:253 (survives navigation, keeps polling the new document) times out at 60s. |

### Backward trace: from the failing assertion

- Assertion `page.waitForSelector('[data-slot="titlebar-v2"]')` (spec.ts:253) requires the v2 titlebar branch → requires `newLayoutDesigns()` memo true on the **current** document → requires `store.general.newLayoutDesigns === true` in the hydrated store (settings.tsx:263-267, since classified & not retired) → requires `localStorage['settings.v3'].general.newLayoutDesigns === true` **at app boot of the final document** → falsified by hop 11 (init-script overwrite). Every precondition above this one was satisfied; the single broken precondition is the localStorage state of the post-reload document.
- The captured failure snapshot corroborates document reload independently: `packages/app/e2e/test-results/chrome-reachability-Agenti-f286f--new-layout-no-page-reload--agentic-terminal/error-context.md` shows legacy chrome at `/` with **no Settings dialog open** — a keyed-remount-only path could not close it (DialogProvider sits at `app.tsx:372`, outside the keyed Show at `app.tsx:576`); only a document unload removes it.

### Empirical results (decisive step — executed, not reasoned)

Dev server: the packages/app Vite dev server already live on `:3000` was reused (playwright.config `reuseExistingServer` semantics; served source verified to be this worktree — `curl :3000/src/context/settings.tsx` contains `setTimeout(() => window.location.reload())`). Probe: Node v24 + repo's `@playwright/test` 1.59.1 headless Chromium, `SHELL` stripped. Script + raw JSON output committed beside this draft (`probe-researcher-2.mjs`, `probe-researcher-2-output.json`). Instrumentation: per-document load counter + `beforeunload` snapshot of `settings.v3`, switch `aria-checked`, and `titlebar-v2` presence into `sessionStorage` (survives same-tab reload).

| Measurement | Scenario A — exact test-4 seed (init script re-runs) | Scenario B — real transition-eligible user (same values, written once) |
|---|---|---|
| (a) switch aria-checked post-click (at beforeunload) | **"true"** — click fired Kobalte onChange | **"true"** |
| (b) `settings.v3 → general.newLayoutDesigns` post-click, pre-reload | **true** (full merged store persisted) | **true** |
| (b') same key post-reload | **false — re-seeded by init script** | **true — retained** |
| (c) keyed remount / `[data-slot='titlebar-v2']` pre-reload | **present** (remount fired in-SPA) | present |
| (c') final state | titlebar-v2 **absent**, legacy sidebar **present**, dialog closed — exact match with error-context.md | titlebar-v2 **present**, legacy sidebar absent — **layout flipped** |
| document loads | 2 (one product-initiated reload) | 2 (same reload) |
| (d) console/page errors | only pre-existing `ERR_CONNECTION_REFUSED` / `[global-sdk] event stream error` against absent backend `localhost:4096` (also present in green tests; unrelated) | none |
| test-4 assertion outcome | `flipped: false` — **reproduces the failure** | `flipped: true` — **product works for real users** |

## Section 2 — Ranked diagnostic hypotheses

```yaml
- rank: 1
  candidate: "CONFIRMED: product-initiated reload on toggle (settings.tsx:411, commit 4a181c357) + the test's non-idempotent addInitScript seed (spec.ts:78-88) re-seeding newLayoutDesigns:false on the reloaded document reverts the persisted choice; the test's 'no page reload / keyed remount' premise is stale (true only pre-4a181c357, where setNewLayoutDesigns was a bare setStore — git show 4a181c357~1:.../settings.tsx:318-320)"
  category: test-author-error
  evidence:
    - "packages/app/src/context/settings.tsx:407-412 — setNewLayoutDesigns writes the store then schedules window.location.reload() in a 0ms setTimeout"
    - "packages/app/e2e/agentic-terminal/chrome-reachability.spec.ts:78-88 — setLayoutMode's addInitScript unconditionally rewrites settings.v3 on every document load, including the product-initiated reload"
    - "git -S 'window.location.reload' — line introduced by 4a181c357 'desktop v2 migration finalising (#36912)'; parent 4a181c357~1 settings.tsx:318-320 shows the reload-free implementation the test comment (spec.ts:206-208, 251-252) describes"
    - "probe-researcher-2-output.json scenario A — beforeunload snapshot: aria-checked=true, persisted newLayoutDesigns=true, titlebar-v2 PRESENT; post-reload: newLayoutDesigns=false, legacy chrome; loads=2"
    - "probe-researcher-2-output.json scenario B — identical drive, seed written once: layout flips and persists across the same reload; zero errors"
    - "e2e/test-results/.../error-context.md — post-timeout snapshot shows legacy chrome at / with NO Settings dialog open; DialogProvider (app.tsx:372) is outside the keyed Show (app.tsx:576), so only a document reload closes it"
  falsification_test: "Seed the same values once (guarded init script) and re-run the identical UI drive: if the layout still failed to flip, the artifact hypothesis would be false. Executed — scenario B flips. Conversely, re-running with the unconditional seed reproduces the exact failing end-state. Both directions observed."
  matches_originating_teammate_hypothesis: false
  fix_scope_estimate: single-team
  raised_by_recent_change: "4a181c357 (product reload semantics) interacting with 03af00544 + this run's worktree-local spec edits (test premise/seed)"

- rank: 2
  candidate: "FALSIFIED (H-e family): the switch-control click never fires Kobalte's onChange, or fires it without reaching setNewLayoutDesigns, so the store value never changes"
  category: product-bug
  evidence:
    - "packages/app/src/components/settings-general.tsx:264-268 — onChange wires directly to settings.general.setNewLayoutDesigns(checked)"
    - "probe A beforeunload capture: switch aria-checked='true' AND localStorage settings.v3 general.newLayoutDesigns=true in the same document as the click — the handler ran and the write persisted"
    - "packages/app/src/utils/persist.ts:425-464,553-661 — web path is synchronous localStorage via makePersisted; no async window in which the write could be lost to the reload"
  falsification_test: "If aria-checked or the persisted value had been unchanged at beforeunload, this hypothesis would stand. Both were observed changed — falsified."
  matches_originating_teammate_hypothesis: true
  fix_scope_estimate: single-team
  raised_by_recent_change: "none"

- rank: 3
  candidate: "FALSIFIED (H-a/H-d family): resolveNewLayoutDesigns ignores the stored true under the seeded flag combination (retired/sunset or classification branch), or the memo value never changes so the keyed Show (app.tsx:576) never remounts"
  category: product-bug
  evidence:
    - "packages/app/src/context/settings.tsx:119-122 — resolveNewLayoutDesigns(retired=false, preference=true, fallback) returns true; retired is false until 2026-09-14 (settings.tsx:62,241)"
    - "packages/app/src/context/settings.tsx:253-268 — with layoutTransitionClassified()=true and eligible=true the memo returns the stored preference; no branch discards a stored true while !retired"
    - "probe A beforeunload capture: [data-slot='titlebar-v2'] PRESENT before the reload — the memo flipped and the keyed remount executed in-SPA within the same task as the click"
  falsification_test: "If titlebar-v2 had been absent at beforeunload while the persisted value was true, a memo/remount defect would be indicated. It was present — falsified. (This also bounds H-f: the [data-slot='titlebar-v2'] selector IS the correct marker for the v2 state; the assertion target is right, the premise about how the app reaches that state is what is wrong.)"
  matches_originating_teammate_hypothesis: true
  fix_scope_estimate: single-team
  raised_by_recent_change: "none"

- rank: 4
  candidate: "NOT PURSUED TO CONFIRMATION (residual product-design question, not the cause of this failure): the reload-on-toggle introduced by 4a181c357 makes the keyed-Show toggle path (app.tsx:576) vestigial for user-driven toggles and produces a one-frame v2 flash before reload; if the binding spec scenario for SRC-1 genuinely requires 'entry survives toggle WITHOUT page reload', that is now unimplementable and the requirement itself needs a decision"
  category: upstream-contract-change
  evidence:
    - "packages/app/src/context/settings.tsx:411 vs git show 4a181c357~1:packages/app/src/context/settings.tsx:318-320 — deliberate upstream semantic change (guard + reload added together)"
    - "probe A: titlebar-v2 present at beforeunload then destroyed — the flash exists; keyed remount still serves non-toggle transitions (sunset effect settings.tsx:315-319, upgrade migration settings.tsx:296-302)"
  falsification_test: "Decision-level, not empirical: if the SRC-1 acceptance criterion is 'entry reachable in the newly-active shell after toggling' (reload permitted), no product change is needed. If it literally mandates SPA-only transition, settings.tsx:411 is the defect. The SR's acceptance criteria text ('real UI toggle drive') supports the former reading; flagged for the architect."
  matches_originating_teammate_hypothesis: false
  fix_scope_estimate: single-team
  raised_by_recent_change: "4a181c357"
```

## Section 3 — Recent-change surface

`git log` window over every file on the trace path (settings.tsx, settings-general.tsx, app.tsx, chrome-reachability.spec.ts), since 2026-07-10:

| SHA | Summary | Relevance |
|---|---|---|
| `03af00544` | Implement agentic terminal desktop chrome reachability (tasks 1.2-4.4) | Introduced/rewrote the chrome-reachability spec (test 4's premise text) |
| `2d2339f51` | add-agentic-terminal: /agentic route | Context only |
| `4a181c357` | **desktop v2 migration finalising (#36912)** | **Added the reload + idempotence guard to setNewLayoutDesigns (settings.tsx:407-412). The pivotal semantic change.** |
| `e7e7a9764` | retain permission state per server | Not relevant |
| `265a93927` | feat(desktop): add layout transition switch (#36667) | Added the transition gating (eligible/sunset) machinery; pre-reload semantics |
| `51b9c726c` / `446510a6a` / `ac5e24908` | transition-setting churn | Background of the gating design |

Worktree-local uncommitted modifications: `packages/app/e2e/agentic-terminal/chrome-reachability.spec.ts` and `packages/app/src/app.tsx` (`git status --porcelain` — the teammate's task-9 changes; the seed/selector amendments live here, not yet committed). Note test 4 has **no last-green baseline**: it has never passed in its current form; the "no page reload" premise was copied forward from the spec scenario text while the product had already moved to reload semantics at `4a181c357` (which is an ancestor of this branch).

## Section 4 — Recommended fix (exact file:line) and open questions for the architect

**Recommended fix (test-side only; no product change):**

1. `packages/app/e2e/agentic-terminal/chrome-reachability.spec.ts:78-88` — make `setLayoutMode`'s seed idempotent across product-initiated reloads: inside the init script, write `settings.v3` / `app-version.v1` **only when absent** (e.g. `if (localStorage.getItem("settings.v3") === null) { … }`). On the first document of a fresh Playwright context both keys are null (seed applies); on the toggle-induced reload the app-written store (containing `newLayoutDesigns: true`) already exists and is preserved. This is exactly probe scenario B, which flips green. Tests 1-3 are unaffected (single-load tests; guarded seed behaves identically on first load).
2. `packages/app/e2e/agentic-terminal/chrome-reachability.spec.ts:205-208` and `:251-252` — correct the stale premise: retitle/re-comment test 4 to state that toggling `newLayoutDesigns` triggers a product-initiated `window.location.reload()` (settings.tsx:411, since 4a181c357), and the scenario verifies the entry is present and functional in the newly-active shell **after the toggle-induced reload**. Mechanically, `page.waitForSelector('[data-slot="titlebar-v2"]')` at :253 already survives the navigation, so with fix (1) alone the existing assertions pass — the edit is premise/comment correctness so the test documents true product behavior. Optionally assert the reload explicitly (e.g. `page.waitForEvent("load")` after the click) so a future regression to silent no-op is distinguishable.
3. No change to `packages/app/src/context/settings.tsx` or `app.tsx` — scenario B demonstrates the live transition path is correct for real transition-eligible users.

**Open questions for the architect:**

1. **Spec-scenario wording ownership**: the phrase "no page reload" in test 4's title traces to the SRC-1 scenario text. Does the binding Phase-1 acceptance criterion mandate SPA-only transition (in which case settings.tsx:411 is a product defect against the spec and must be escalated upstream — it arrived in upstream commit 4a181c357, not in this run's work), or does it mandate only that the nav entry is reachable after toggling (my reading of the SR's acceptance criteria; then fix is test-side as above)? My draft assumes the latter; a researcher confirming the former should outrank my fix recommendation.
2. **Discrepancy to reconcile across drafts**: the teammate's snapshot description in reviews/9.json §integration_testing_review_note calls the captured chrome "ambiguous"; probe A's final state + error-context.md identify it as plain legacy shell at `/` post-reload (sidebar-nav-desktop present in probe; the snapshot's "Toggle sidebar" banner + rail buttons are the legacy shell with no project open). Not actually ambiguous.
3. **Sunset time-bomb** (out of scope for this SR, flag only): after 2026-09-14 (`oldInterfaceSunset`, settings.tsx:62), `oldInterfaceRetired()` becomes true at boot, `layoutTransitionAvailable` goes false (settings.tsx:106-111), and test 4's toggle row will stop rendering regardless of seeding — tests 3 and 4 (legacy-mode seeds) will start failing on that date by product design. The suite will need a strategy (fake clock or retired-mode variants) before then.
4. MemPalace is not initialized for this workspace (`mempalace init` never run) — Step-0 searches cannot return prior context for any researcher this run; the architect should not read cross-draft "no prior context" agreement as signal.

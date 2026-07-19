---
schema_version: 1
test_id: layout-toggle-no-flip
sr_id: SR-layout-toggle-no-flip-20260719T1130Z
consolidated_by: system-architect
consolidated_at: 2026-07-19T12:00:00Z (dispatch ts; probes ran 2026-07-19T17:06-17:09Z local)
review_verdict: pass (all seven rubric criteria; unanimity independently probe-verified, not rubber-stamped)
reviewed_drafts: [researcher-1.md, researcher-2.md, researcher-3.md]
probe_artifacts_verified:
  - probe-toggle-researcher-1.mjs + probe-artifacts/probe-results.json + probe-artifacts/A-as-failing-test-final.png + probe-artifacts/B-real-user-counterfactual-final.png
  - probe-researcher-2.mjs + probe-researcher-2-output.json
  - probe.mjs + artifacts/probe-results.json + artifacts/A-exact-test-seed-everyboot-final.png + artifacts/B1-seed-once-real-eligible-user-final.png + artifacts/B2-seed-once-no-override-final.png
architect_spot_checks:
  - "settings.tsx:407-412 reload confirmed by direct read; git show 4a181c357 confirms the reload line is new on 2026-07-15 (upstream 'desktop v2 migration finalising (#36912)')"
  - "chrome-reachability.spec.ts:77-89 unconditional addInitScript seed confirmed; :205-208/:251-253 stale premise text confirmed"
  - "app.tsx:576 keyed Show confirmed; settings.tsx:62 sunset 2026-09-14 confirmed"
  - "app.test.tsx:319-344 keyed-remount unit test confirmed present (decision-1 premise)"
  - "openspec spec.md:14-16 'without a page reload' scenario wording confirmed (decision-2 premise)"
fix_scope: single-team (frontend), TEST-SIDE ONLY + one openspec scenario amendment; NO product change
---

# Consolidated diagnostic plan — chrome-reachability test 4 ("entry survives layout-mode toggle")

## 1. Root cause (confirmed, not inferred)

**TEST-ENVIRONMENT ARTIFACT + STALE TEST PREMISE. NOT a product defect.** All three researchers reached this independently, each with live-probe evidence run against the worktree's dev server, and each executed the falsification in BOTH directions (reproduce the failure exactly under test semantics; flip green under real-user semantics).

Causal chain (merged code flow, every hop empirically observed by at least one probe):

1. Test 4 seeds via `setLayoutMode` (`packages/app/e2e/agentic-terminal/chrome-reachability.spec.ts:77-89`): `page.addInitScript` unconditionally writes `settings.v3 = {general:{newLayoutDesigns:false, layoutTransitionEligible:true}}` + `app-version.v1`. Playwright init scripts re-run on EVERY document load — the load-bearing fact.
2. The real UI click on `[data-slot="switch-control"]` (`:249`) genuinely lands and fires Kobalte `onChange(true)` (`settings-general.tsx:264-274`).
3. `setNewLayoutDesigns(true)` (`settings.tsx:407-412`) synchronously persists `newLayoutDesigns:true` to localStorage (via `persisted("settings.v3", …)` `settings.tsx:223`, `utils/persist.ts` localStorageDirect), **then schedules `setTimeout(() => window.location.reload())` at `settings.tsx:411`** — deliberate product behavior introduced upstream by `4a181c357` (2026-07-15).
4. The reload fires (~16 ms later; probes: 2 document loads in every scenario). The test's init script **re-runs on the reloaded document and rewrites `settings.v3` back to `newLayoutDesigns:false`**, clobbering the just-persisted user choice (researcher-3's instrumented timeline: write `true` at +998 ms, pagehide +1015 ms, re-seed to `false` at +1028 ms; researcher-1's boot log shows the post-reload document CARRIED `true` before the seed reverted it).
5. The app boots legacy again (`settings.tsx:253-268` memo resolves `false`), `[data-slot="titlebar-v2"]` never appears on the post-reload document, and the `:253` `waitForSelector` times out at 60 s. Final state is byte-for-byte the captured e2e failure (`error-context.md`: legacy chrome at `/`, NO settings dialog open — only a full document teardown closes the dialog, since `DialogProvider` at `app.tsx:372` sits above the keyed Show).

**Counterfactual (the product-health proof):** identical profile values seeded ONCE + identical UI drive → reload fires → persisted `true` survives → app boots v2 → `titlebar-v2` renders (researcher-1 Scenario B, researcher-2 Scenario B, researcher-3 Scenario B1 — three independent implementations, same result, zero page errors). **The real-user transition path is healthy.**

**Stale premise:** the test's title/comments ("no page reload" `:205`, "keyed Show remounts the router… no reload" `:206-208`, `:251-252`) describe pre-`4a181c357` product semantics. The spec was authored 2026-07-19 (`03af00544`) — four days after the product moved to reload-on-toggle. Regression class: premise drift. Note test 4 has NO last-green baseline; it has never passed in its current form.

Cross-draft reconciliation (architect): researcher-1's flash detector saw no pre-reload `titlebar-v2` attach; researchers 2/3 observed the ~16 ms pre-reload v2 flash. Instrumentation/race variance (code-split chunk load vs the `setTimeout(0)` reload), irrelevant to the outcome — all three agree on the write, the reload, and the clobber. **The fixed test must not assert on the pre-reload flash in either direction.**

## 2. Falsified hypotheses (all executed, none skipped)

| Hypothesis | Verdict | Decisive evidence |
|---|---|---|
| H-e: click never fires Kobalte onChange / write never happens | **FALSIFIED** | All three probes: `settings.v3` write containing `newLayoutDesigns:true` observed in the click's document (r3: +998 ms setItem log; r2: beforeunload snapshot `aria-checked="true"` + persisted `true`; r1: post-reload boot log carried `true`). Idiom also proven by green `remote-session-settings.spec.ts:28,63`. |
| H-a: `resolveNewLayoutDesigns` / retirement / upgrade-classification overrides the stored `true` | **FALSIFIED** | `settings.tsx:119-122` returns `preference ?? fallback` when `retired=false` (sunset 2026-09-14 not reached); Scenario B/B1 boots v2 from stored `true` under the exact seeded flag combination. Retirement would force `true` anyway — cannot cause a no-flip. |
| H-b: setter and memo use different keys/shapes | **FALSIFIED** | Write `setStore("general","newLayoutDesigns",…)` (`settings.tsx:410`) and read `store.general?.newLayoutDesigns` (`:259/:265`) target the same `settings.v3` store (`:223`); probes show one merged store carrying the toggled value; `persist.ts:208-231` merge accepts the partial seed shape. |
| H-c: `dialog.show` dynamic import throws before the write | **FALSIFIED** | `settings-general.tsx:268` runs the setter BEFORE the import (`:270-272`); zero `pageerror` in all probes (only pre-existing `ERR_CONNECTION_REFUSED` noise against absent `localhost:4096`, present in green tests too). |
| H-d: keyed Show memo never changes / remount never fires | **FALSIFIED** | r2/r3 observed `titlebar-v2` in the click's own document pre-reload; the memo flips. Post-`4a181c357` the remount is not the operative interactive mechanism anyway — the reload preempts it. |
| H-f: `[data-slot="titlebar-v2"]` is the wrong v2-state marker | **FALSIFIED** | Green test 2 uses the same selector (`:177`); Scenario B/B1 render it after a successful transition. The selector is right; the mechanism premise is what was wrong. |

SR summary's two candidate guesses ("remount never fires OR the setting write does not take") are both refuted: the write takes, the remount fires (or is preempted — either way irrelevant), and the reversion is the test's own seed.

## 3. The fix (exact test-side edits; NO product change)

All edits in `packages/app/e2e/agentic-terminal/chrome-reachability.spec.ts`. One decision per point — no options.

### 3.1 Idempotent seed guard in `setLayoutMode` (`:77-89`)

Wrap the seed in a sessionStorage first-load guard (sessionStorage survives the product-initiated same-tab reload but is fresh per Playwright context, so each test still seeds exactly once). This exact pattern was validated live in researcher-1's Scenario B:

```ts
async function setLayoutMode(page: import("@playwright/test").Page, enabled: boolean) {
  await page.addInitScript((mode) => {
    try {
      // Seed FIRST DOCUMENT ONLY. setNewLayoutDesigns (settings.tsx:411, upstream
      // 4a181c357) performs a product-initiated window.location.reload(); init
      // scripts re-run on that reload and an unconditional seed would clobber the
      // product's just-persisted write (the root cause of the 2026-07-19 test-4 failure).
      if (sessionStorage.getItem("__setLayoutModeSeeded")) return
      localStorage.setItem(
        "settings.v3",
        JSON.stringify({ general: { newLayoutDesigns: mode, layoutTransitionEligible: true } }),
      )
      localStorage.setItem("app-version.v1", JSON.stringify({ version: "1.18.2" }))
      sessionStorage.setItem("__setLayoutModeSeeded", "1")
    } catch {
      // ignore — the test will fail at the assertion if the setting didn't land
    }
  }, enabled)
}
```

Tests 1-3 are unaffected (single document load each; first-load behavior identical).

### 3.2 Premise wording corrections (`:205-208` and `:251-252`)

- `:205` title → `"entry survives layout-mode toggle (legacy -> new layout, via product-initiated reload)"`
- `:206-208` comment → `// PROD-SAFETY: spec scenario "Entry survives layout-mode toggle" — toggling newLayoutDesigns persists the choice and performs a product-initiated full window.location.reload() (settings.tsx:411, upstream 4a181c357); the entry must be present and functional in the newly-active shell after that reload.`
- `:251-252` comment → `// 3. The product persists the toggle and reloads the document (settings.tsx:411); the post-reload boot renders the v2 shell. Wait for the reload to settle, then the v2 titlebar entry must appear and navigate to /agentic.`

Do NOT change the `[data-slot="titlebar-v2"]` assertion target — it is the correct v2-state marker (H-f falsified).

### 3.3 Wait-for-reload-settle before the `:253` titlebar-v2 wait

Register the load-wait BEFORE the click (race-free — the reload fires on a 0 ms macrotask and can complete before a post-click listener attaches), then assert the persisted state so a future clobber regression fails with a readable message instead of a 60 s timeout:

```ts
    const reloadSettled = page.waitForEvent("load") // product-initiated reload, settings.tsx:411
    await toggleRow.locator('[data-slot="switch-control"]').click()
    await reloadSettled

    // Guard against seed-clobber regressions: the post-reload document must still
    // carry the toggled preference (readable failure vs a 60s selector timeout).
    expect(
      await page.evaluate(() => JSON.parse(localStorage.getItem("settings.v3") ?? "{}").general?.newLayoutDesigns),
    ).toBe(true)

    await page.waitForSelector('[data-slot="titlebar-v2"]')
```

The existing `:254-258` v2-entry assertions then run on the settled post-reload document (no race against the reload, which the previous shape could not guarantee even if the wait caught the pre-reload flash — researcher-3 §1.2).

## 4. Rulings on the three flagged decisions

### Decision 1 — Test-4 contract: **"survives the user-facing toggle (with product-initiated reload)"**

Test 4 SHALL encode the user-facing contract: *the Agentic Terminal entry survives the user-facing layout-mode toggle, product-initiated reload included*. Rationale: since `4a181c357` the in-document keyed remount (`app.tsx:576`) is **not drivable via the Settings switch at all** — the only no-reload flip paths are non-interactive (sunset-retirement signal `settings.tsx:315-319`, upgrade migration `:296-302`) — so an e2e test of "keyed remount survival via the switch" tests a journey no user can take. The remount-survival property is NOT lost: it is separately covered at unit level by `packages/app/src/app.test.tsx:319-344` ("keyed remount (app.tsx:575 analogue) leaves exactly one agentic.open registration — no duplicate, no orphan"). Combined coverage after this plan: e2e = the real user journey (toggle → reload → v2 shell → entry functional); unit = the remount registration invariant. No coverage regression.

### Decision 2 — Spec amendment (exact replacement wording)

`openspec/changes/agentic-terminal-desktop-reachability/specs/agentic-terminal-reachability/spec.md:14-16` currently reads:

```markdown
#### Scenario: Entry survives layout-mode toggle
- **WHEN** the user toggles `newLayoutDesigns` in either direction
- **THEN** the navigation entry is present and functional in the newly-active shell without a page reload
```

Replace with (exact text):

```markdown
#### Scenario: Entry survives layout-mode toggle
- **WHEN** the user toggles `newLayoutDesigns` in either direction
- **THEN** once the app completes its layout transition (however the product implements it — currently a product-initiated full page reload, `settings.tsx:411` since upstream `4a181c357`), the navigation entry is present and functional in the newly-active shell
```

This preserves the requirement's intent — the entry must exist and work in the newly-active shell after a user toggle — while dropping the transition-mechanism mandate that now contradicts deliberate product behavior. The "without a page reload" clause was a mechanism assumption smuggled into an outcome requirement; the outcome is what SRC-1-nav-entry-both-modes needs.

### Decision 3 — The dead `dialog.show` wart (`settings-general.tsx:269-272`): **recorded upstream-tracked wart, NOT an in-repo fix for this run**

Ruling: record in the run's manual_followups as an upstream-tracked product wart; do NOT fix in this change. Rationale:
- It is a pure upstream regression: `4a181c357` (2026-07-15) added the reload that preempts the pre-existing `dialog.show(DialogSettings)` enable-path promise. Both sides of the interaction are upstream product code, untouched by this run.
- It is unrelated to this change's mandate (SRC-1 agentic-terminal reachability); fixing it here would widen the diff into `settings-general.tsx`/`settings.tsx` — files this change does not otherwise touch — on a fork that tracks upstream (`paulingram/opencode`, never pushed upstream), creating merge friction on code upstream may itself rework (they may drop the dialog, drop the reload, or reorder — the right fix is upstream's call).
- User impact is a missing convenience (the v2 settings dialog not auto-opening post-enable); users still land in v2 where settings are reachable. Not a functional block, proven by Scenario B/B1.

manual_followups entry text: *"Upstream wart (4a181c357, 2026-07-15): `settings-general.tsx:269-272` promises the v2 settings dialog after enabling New layout designs, but the reload scheduled in `setNewLayoutDesigns` (`settings.tsx:411`) destroys the document before `dialog.show` completes — dead code on the enable path (probes: dialogOpenCount 0 in all scenarios). Also renders the keyed remount at `app.tsx:576` vestigial for the interactive toggle (~16 ms v2 flash then reload). Report upstream / re-check on next upstream sync; do not patch in the fork."*

## 5. Verification criteria (the fix team's checklist)

Pre-fix verification (fast, before editing):
1. Confirm worktree HEAD still contains `settings.tsx:411` reload and unguarded `setLayoutMode` (`spec.ts:77-89`) — if upstream sync or another teammate changed either, re-diagnose before applying.
2. Confirm the dev-server environment per repo idiom (bun via `npm exec`, `SHELL` stripped, port 3000) — the environment the probes validated.

Acceptance:
1. **4/4 chrome-reachability green, live** — `chrome-reachability.spec.ts` tests 1-4 all pass against the real dev server with the real UI drive (no `force`, no programmatic `setStore` for the toggle — SR AC-2). Test 4 must pass on the post-reload document via the §3.3 sequence.
2. **Full suite tally** — run the full packages/app e2e suite + unit suite; counts equal or better than the pre-fix baseline; no new failures anywhere (specifically `remote-session-settings.spec.ts`, which shares the switch idiom, and `app.test.tsx`, which carries the keyed-remount coverage).
3. **No product change** — `git diff` for this fix touches ONLY `packages/app/e2e/agentic-terminal/chrome-reachability.spec.ts` and `openspec/changes/agentic-terminal-desktop-reachability/specs/agentic-terminal-reachability/spec.md` (Decision-2 wording). Zero changes under `packages/app/src/`.
4. **No flash dependence** — the fixed test must not assert presence OR absence of the pre-reload `titlebar-v2` flash (cross-draft variance, §1).
5. SR `SR-layout-toggle-no-flip-20260719T1130Z` acceptance criteria all satisfiable: root cause established with file:line evidence (this plan), test corrected with reasoning recorded (§3.2 comments cite `settings.tsx:411` + `4a181c357`), no product defect to fix (Scenario B/B1 proof). Orchestrator: set the SR's `diagnostic_plan_path` to this file and resolve on green.

## 6. Maintenance notes (dated — for docs/manual_followups, not this run's fix)

1. **2026-09-14 scheduled test break (oldInterfaceSunset).** `settings.tsx:62` sets `oldInterfaceSunset = new Date(2026, 8, 14)` (LOCAL midnight 2026-09-14). From that date: `oldInterfaceRetired()` is true at boot → the toggle row stops rendering (`layoutTransitionAvailable` requires `!retired`, `settings.tsx:106-111`), `setNewLayoutDesigns` force-coerces to `true` (`:408`), and the memo force-returns `true`. Chrome-reachability tests 3 and 4 (legacy-mode seeds) will begin failing **by product design** on machines past local midnight 2026-09-14. Before that date the suite needs a strategy: Playwright clock control (fake the date pre-sunset) or retired-mode test variants. Flagged independently by researchers 1 (implicitly via `:62,241` citations), 2 (§4.3), and 3 (§4.4).
2. **Dev-channel default nuance** (researcher-3 Scenario B2): `legacyNewLayoutDesignsDefault = import.meta.env.VITE_OPENCODE_CHANNEL !== "prod"` (`settings.tsx:59`) — an eligible profile with NO explicit `newLayoutDesigns` key boots straight into v2 on dev/e2e builds. Any future spec seeding "no override" profiles will behave channel-dependently; always seed `newLayoutDesigns:false` explicitly to start in legacy (the current test does).
3. **Upstream wart followup** — Decision 3's manual_followups entry (§4).
4. **MemPalace not initialized** for this workspace (all three researchers: no `.mempalace/palace`; researcher-3 fell back to the machine default palace, zero hits ≥ 0.40 cosine). Cross-draft "no prior context" agreement is an artifact of the missing palace, not signal. Orchestrator-level gap: run `mempalace init` if per-workspace palaces are expected, and mine this plan once a palace exists.

---

DIAGNOSTIC PLAN APPROVED

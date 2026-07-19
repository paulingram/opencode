# Consolidated Diagnostic Plan — AgenticCommands context-provider crash

- **SR (blocking):** `SR-agentic-commands-context-provider-20260719T092909Z`
- **SR (test-quality, non-blocking):** `SR-vacuous-chrome-reachability-e2e-20260719T094336Z`
- **Consolidated by:** system-architect (Phase 3b), 2026-07-19T10:10Z
- **Inputs:** researcher-1.md / researcher-2.md / researcher-3.md (unanimous), reviews/7.json (exe-verification evidence), reviews/6-invalidation-20260719.json (prior-evidence invalidation), plus independent on-disk re-verification of every load-bearing claim by this architect (all file:line citations below re-checked against the working tree, not merely relayed).

---

## 1. Root cause (evidence-cited)

**A single mount-site defect, mechanically certain (all three researchers converged; reproduced live on web AND packaged exe).**

`<AgenticCommands />` is mounted at `packages/app/src/app.tsx:582` as a sibling of `<ServerShell>` (`:583`), inside the router `root` callback (`:578`) but **outside the only `CommandProvider` in the tree**, which lives at `app.tsx:290` inside `SharedProviders` (`:286-296`), rendered via `ServerShell` (`:557-564`). `AgenticCommands` (`app.tsx:527-542`) calls `useCommand()` at `:528`; `useCommand` is built by `createSimpleContext` (`packages/app/src/context/command.tsx:248`) whose `use()` throws unconditionally when no provider is above it — `createContext<T>()` has **no default value** (`packages/ui/src/context/helper.tsx:9`, throw at `:32-36`). The throw is synchronous at component creation, identical in dev/prod and web/desktop.

- Introduced whole in commit `03af00544`; unchanged through HEAD `dad0fff11`.
- Packaged-exe witness: `.architect-team/verification-notes/exe-smoke/artifacts/inspect-stderr.log` (minified frames `use` → `AgenticCommands`), `inspect-initial.png` (fatal screen), reproduced on second boot (`sidecar-probe-stderr.log`).
- Web witness: researcher-1 live repro (dev server on :5199 — `/` and `/agentic` both render the ErrorPage; Error-constructor proxy captured the exact message with an `AgenticCommands` frame, twice per boot due to the keyed remount at `:575`); independently, the rewritten e2e executed by frontend-exe-verification fails **4/4 with "Page crashed"** on this tree (reviews/7.json `integration_testing_review`).
- The sibling `DesktopCommands` (`app.tsx:298`) works because it is mounted at `:291`, **inside** `CommandProvider`.
- **Design-level root cause:** design.md D1's rationale ("DesktopCommands sits outside the router and cannot navigate", `openspec/changes/agentic-terminal-desktop-reachability/design.md:18`) is **false at every checked revision** (HEAD, `2d2339f51`, `e687eb936`, `d5aa5ff8f` — `SharedProviders` has always rendered inside the router root via `ServerShell`). This false fact hid the correct mount site (next to `DesktopCommands`) and steered the implementer to invent the `:582` site.
- **Verification-level root cause:** the prior palette e2e was authored and **typechecked but never executed** (see §2d); `app.test.tsx` renders no components (pure `DESKTOP_MENU` data assertion), so no executed test ever mounted `AgenticCommands`. Prior SRC-2 verification is INVALID — formally recorded in `.architect-team/reviews/6-invalidation-20260719.json`.

### Architect stress-test of the recommended fix (site i) — all four probes pass

1. **Keyed `:575` remount idempotency — SAFE.** The keyed `Show` remounts the entire router subtree *including `CommandProvider` itself*, so the registration store (`command.tsx:254-257`, per-provider-instance) dies and is rebuilt atomically with its consumers. `register()` installs `onCleanup` removal per entry (`command.tsx:410-425`) and scope-keyed registrations upsert by key (`upsertCommandRegistration`, `command.tsx:110-113` — the `"agentic"` scope replaces any prior entry with the same key). Triple protection: no orphans, no duplicates, and a component inside its own provider can never remount without it.
2. **`WindowsAppMenu` `commandDisabled` reactivity — SAFE.** `commandDisabled` reads `props.command.options.find(...)` (`packages/app/src/components/windows-app-menu.tsx:23-27`); `props.command` is the titlebar's `useCommand()` (`titlebar.tsx:73`) — the **same** SharedProviders instance — and `options` is a reactive memo over the registrations store (`command.tsx:273+`), so mount order is irrelevant: the entry enables whenever the menu renders.
3. **No OTHER `useCommand` consumer is mounted outside the provider — VERIFIED by full audit.** Workspace grep finds 20 consumers + 1 storybook mock. All are (a) pages/components under `ServerShell`/`SharedProviders` (session pages, layout.tsx, home.tsx, titlebar, tab strips, prompt-input, new-session, settings-keybinds), (b) desktop `Inner` (`packages/desktop/src/renderer/index.tsx:365`), rendered via `props.children` at `app.tsx:560` inside `SharedProviders`, or (c) dialog-hosted components (`command-palette.ts:77` via `dialog-command-palette-v2.tsx:32`/`dialog-select-file.tsx:68`; `settings-dialog.tsx:28`) — and dialog content inherits the **caller's** context: `useDialog` captures `getOwner()` at the call site (`packages/ui/src/context/dialog.tsx:172`) and `mount` renders via `runWithOwner(owner, ...)` (`dialog.tsx:84`); every `dialog.show` caller of these components sits inside `CommandProvider`. The `:582` mount is the one and only outside-provider consumer. After the fix, none remain.
4. **SSR/hydration — NOT APPLICABLE.** No `isServer` / `hydrate` / `renderToString` in `app.tsx`; both entries are client-only `render` (`entry.tsx:167`, `renderer/index.tsx:448`). The unit-test harness must therefore use client render under happydom (existing precedent: `titlebar.test.tsx` with `describe.skipIf(isServer)`).

---

## 2. Falsified hypotheses (do not re-litigate)

| # | Hypothesis | Verdict | Killing evidence |
|---|---|---|---|
| a | `useCommand` has a web-only / dev-only default value | **False** | `helper.tsx:9` `createContext<T>()` no default; `:32-36` throws everywhere; single implementation |
| b | Web mounts a different tree in which `:582` lands inside a provider | **False** | `entry.tsx:171` mounts the same `AppInterface`; exactly one `AgenticCommands` mount in the workspace; live web repro crashes identically |
| c | Unit tests wrap components in providers and thus masked it | **Moot — they mount nothing** | `app.test.tsx` (19 lines) is a pure `DESKTOP_MENU` data assertion; no render, no provider |
| d | Prior palette e2e passed legitimately | **False — never executed** | reviews/6-independent.json `tests_run` lists only bun tests + `typecheck` + `typecheck:e2e`; no `playwright test` invocation anywhere; no run artifacts existed; old spec hardcoded port 5173 vs harness 3000, waited on nonexistent `agentic-terminal-root` testid (real: `agentic-terminal`, `pages/agentic-terminal/index.tsx:35`), and used a palette-open method that cannot work (see §6). Formal record: `reviews/6-invalidation-20260719.json` |
| e | Dev error-boundary recovery / "timing-sensitive in dev HMR" (the SR's own why-missed narrative) | **False** | Same `ErrorBoundary` (`app.tsx:377-381`) both platforms; throw is synchronous at mount; web dev crashes to the same ErrorPage — the SR's `why_unit_tests_missed_it` and part of its `summary` are wrong and superseded by this plan |
| f | Duplicate context-module instances in the packaged bundle | **False** | Web dev (single module graph) crashes identically; stack resolves to the same `helper.tsx` `use()` |
| g | Gated provider / `ConnectionGate` timing starving the subtree desktop-only | **False** | Both environments pass the gate and reach the throw; gates delay but do not change nesting |

---

## 3. Forbidden fix — site (iii): wrap the `:582` mount in its own `CommandProvider`

**Explicitly forbidden. It boots but silently kills the feature — a strictly worse failure mode than the crash, and it would sail through a naive "boots without crashing" check (the exact vacuous-verification failure this run is correcting).**

Mechanics (all verified on disk):

- `CommandProvider`'s registration store is **per instance** (`command.tsx:254-257`). A second provider at `:582` creates an isolated registry. Its init deps (`useDialog`/`useSettings`/`useLanguage`, `command.tsx:251-253`) are all satisfied at `:582`, so it mounts cleanly — that is what makes it a trap.
- The palette reads `command.options` from the SharedProviders instance (`command-palette.ts:92-95`); `agentic.open` registered in the inner instance is **invisible to the palette** — the command never appears.
- `WindowsAppMenu.commandDisabled` returns `true` when the option is not found (`windows-app-menu.tsx:25`) — the View-menu entry is **permanently disabled** on Windows, directly violating the SR acceptance criteria and design fact 2.
- A second provider installs a second document-level capture `keydown` listener (`command.tsx:406-408`) with an independent `suspendCount` — double keybind processing hazard.
- Two providers persist to the same `Persist.global("command.catalog.v1")` key (`command.tsx:261-264`) — racing catalog writes.

Any review of the fix diff MUST reject a new `<CommandProvider>` wrapper anywhere near `:582`. Also rejected (from the researchers' converged analysis): per-shell duplicate registration (one-mode-missing risk, D1 got this part right), and folding registration into `DesktopCommands` (platform-conditional intent; D1 itself specifies a separate small component).

---

## 4. The fix — site (i): exact edit

**File: `packages/app/src/app.tsx`. Two-line change; the `AgenticCommands` definition (`:527-542`) is untouched.**

1. Inside `SharedProviders`, add the mount as a direct child of `CommandProvider`, immediately after `<DesktopCommands />` (currently line 291):

```tsx
function SharedProviders(props: ParentProps) {
  return (
    <>
      <BodyDesignClass />
      <CommandProvider>
        <DesktopCommands />
        <AgenticCommands />
        <HighlightsProvider>{props.children}</HighlightsProvider>
      </CommandProvider>
    </>
  )
}
```

2. Delete the `<AgenticCommands />` line at `:582` (sibling of `<ServerShell>` inside `NotificationProvider`).

Notes: `AgenticCommands` is a hoisted function declaration, so the forward reference from `:291` is fine — no code motion needed. Every design constraint holds at the new site: `useCommand` resolves (direct child of the provider, same instance the palette / `WindowsAppMenu` / desktop `Inner` consume); `useNavigate` resolves (`SharedProviders` renders via `ServerShell` inside the router root callback — proof by precedent: the titlebar in the same subtree navigates today); both layout modes covered (`ServerShell` wraps the layout fork at `:584-586`); keyed-remount safe (§1 probe 1).

**Sequencing:** `app.tsx` is clean in the working tree; the v2-titlebar SR fix (already in tree: `titlebar.tsx` `AgenticNavEntryV2` + `titlebar.test.tsx`, unit-green) is disjoint file scope — no collision, and the packaged-exe rebuild happens ONCE after both fixes land (rebuild remains gated on the orchestrator's explicit go-signal per reviews/7.json `manual_followups`).

---

## 5. Pre-fix verification checklist (canonical — the RED baseline is ALREADY captured; do NOT re-reproduce)

1. **Tree state (1 min, run before editing):** `git status --short packages/app/src` — expect `app.tsx` clean; `titlebar.tsx`, `titlebar.test.tsx`, and `e2e/agentic-terminal/chrome-reachability.spec.ts` carry uncommitted teammate work — do not clobber or fold into this fix's diff. `grep -n "AgenticCommands" packages/app/src/app.tsx` — expect exactly the definition at `:527` and the mount at `:582`.
2. **RED baseline — cite, don't re-run:**
   - Packaged exe crash: `.architect-team/verification-notes/exe-smoke/artifacts/inspect-stderr.log`, `inspect-initial.png`, `sidecar-probe-stderr.log` (reproduced on second boot), stdout logs proving the sidecar was healthy (crash is renderer-side).
   - Web e2e RED: the rewritten `chrome-reachability.spec.ts` executed on this tree = **4/4 FAIL "Page crashed"** — durable records: `reviews/7.json` (`integration_testing_review`, `files_changed`, `evidence_summary`) and `SR-vacuous-...json` `evidence.e2e_run_result`. NOTE: the raw `packages/app/e2e/test-results/` artifacts cited there have since been cleaned by Playwright's per-run `outputDir` wipe and are NOT on disk — the JSON records above are the authoritative RED witnesses. Do not treat their absence as missing evidence, and do not re-run pre-fix just to regenerate them.
   - Web live repro: researcher-1.md (headless-Edge probe procedure with the Error-constructor proxy, §Q4 item 2 — the probe steps are fully documented there and reusable verbatim post-fix as the "boots clean" check; a pre-fix re-run is redundant).
3. **Unit baseline:** the suite is green on the current tree including the titlebar additions (task #16; ~657-658 pass / 12 skip, 1 known-flaky `observe-element-offset.test.ts` per researcher-1). Re-running pre-fix is optional; post-fix deltas attribute against this.
4. **Static confirmations (already done by 3 researchers + this architect; spot-check only if paranoid):** single `CommandProvider` in the workspace (`app.tsx:290`); no default value in `helper.tsx:9`; no other outside-provider `useCommand` consumer (§1 probe 3).

---

## 6. Required test repairs

### 6a. Component-mount unit test (NEW — mandated by SR-vacuous AC-5; closes the unit/integration gap)

Location: extend `packages/app/src/app.test.tsx` (per SR-vacuous scope) or a sibling `app.mount.test.tsx`. Harness: bun + happydom, client render — template `titlebar.test.tsx` (`render` from `solid-js/web`, `describe.skipIf(isServer)`).

Required assertions (the **invariant** is "registration is visible to the same provider instance the palette/menu read", not merely "doesn't throw"):

1. **Registration visibility (anti-trap-fix invariant):** compose the minimal REAL provider chain `CommandProvider` requires (`Language`, `Dialog`, `Settings` — `command.tsx:251-253`) under a memory-mode router root, mount `<AgenticCommands />` together with a **sibling probe component** that calls `useCommand()` and assert the probe sees `options` containing `id === "agentic.open"`. The probe MUST be a sibling under the same `CommandProvider`, not a child of `AgenticCommands` — this is precisely the assertion a re-introduced site-(iii) isolated provider would fail.
2. **Both layout modes:** assert registration with `newLayoutDesigns` seeded ON and OFF (settings store), mirroring the real tree where `SharedProviders` mounts above the layout fork.
3. **Keyed-remount survival (`app.tsx:575` analogue):** wrap the tree in a keyed `<Show>` driven by a signal, toggle it, and assert exactly one `agentic.open` registration after remount (no duplicate, no orphan) — exercises `register`'s `onCleanup` (`command.tsx:422-424`) and the scope upsert (`command.tsx:110-113`).
4. **(Recommended, cheap) negative test:** mount `AgenticCommands` WITHOUT `CommandProvider` and assert the exact throw `"Command context must be used within a context provider"` — documents the defect class at its real site.

### 6b. Web e2e (ALREADY rewritten — state of the tree, what must remain, and one known residual defect)

The rewritten `packages/app/e2e/agentic-terminal/chrome-reachability.spec.ts` (uncommitted, by frontend-v2-titlebar-fix; executed RED by frontend-exe-verification) **must remain as-is in these respects** — any weakening is a review-rejectable regression:

- Real testid/selectors (`agentic-terminal`, `[data-slot="titlebar-v2"]`, `[data-component='sidebar-nav-desktop']`); never reintroduce `agentic-terminal-root`.
- Genuine `newLayoutDesigns` seeding via `setLayoutMode` localStorage pre-seed, exercising BOTH forks (tests 2 and 3), with the cross-branch guard assertions (v2 slot present/absent).
- The in-app layout-toggle-survival test (test 4's toggle mechanics) — real clicks, no page reload.
- Relative `page.goto("/")` against the harness `baseURL` (config port 3000, `playwright.config.ts:3-7`) — never a hardcoded port.

**Known residual defect the fix team must expect and repair (verified by this architect against the CURRENT rewritten spec — do NOT misattribute its failure to the context fix):** tests 1 and 4 still open the palette with `Ctrl+K` and wait on `[role="combobox"]`. Three independent problems: (a) the palette opens via `showPalette()` → `run("file.open", "palette")` (`command.tsx:377-379`), and the ONLY `file.open` registration is session-page-scoped (`pages/session/use-session-commands.tsx:468-472`, keybind `mod+k,mod+p`) — on `/` and `/agentic` no palette can open by ANY keybind (the default palette bind is `mod+shift+p`, `command.tsx:13-14`, and it also funnels through `file.open`); (b) `role="combobox"` exists only in `dialog-select-directory-v2.tsx:289` and the session-review filter — neither palette variant renders it; (c) test 4 additionally opens Settings via that palette. **Post-fix expectation: tests 2 and 3 GREEN; tests 1 and 4 likely still RED at the palette-open step for these spec reasons.** Repair direction (fix-team latitude, but bounded): drive the palette from a surface where `file.open` is genuinely registered (a session page reached through real UI, then assert `agentic.open` appears and navigates), or open Settings/agentic via a real UI control; select the palette by its real DOM, not an invented role. SR-vacuous AC-4 (suite 4/4 green) is satisfiable only after this repair — it belongs to task #20's scope, sequenced after the app.tsx fix.

---

## 7. Verification criteria (post-fix, in order)

1. **Web dev boots clean:** dev server up (strip `SHELL` per toolchain quirks; bun via `npm exec`), `/` renders the app (NOT "Something went wrong"), no `Command context` error on the console; `/agentic` renders `[data-testid="agentic-terminal"]`. Researcher-1's probe procedure is the ready-made check.
2. **e2e red→green RECORDED:** RED is already on record (§5 item 2). GREEN = a real `npx playwright test e2e/agentic-terminal/chrome-reachability.spec.ts` execution with archived output/report: tests 2 and 3 green immediately after the app.tsx fix; tests 1 and 4 green after the §6b palette-step repair (4/4 = SR-vacuous AC-4). A palette-step failure on tests 1/4 with tests 2/3 green is the KNOWN residual spec defect, not a fix regression.
3. **Unit suite green** including the new §6a component-mount tests (red-before/green-after for assertion 1 given the mount move; assertions 2-3 green post-fix).
4. **Packaged exe boot** — downstream, by the exe teammate (task #12 re-run): single rebuild + repackage AFTER both this fix and the in-tree titlebar fix land, gated on the orchestrator's explicit go-signal; then CDP smoke §1-6 including the Windows in-app View menu showing `agentic.open` **enabled** (the anti-site-(iii) end-to-end check) and the layout-toggle remount check.

---

## 8. Documentation corrections required

1. **design.md D1 (`openspec/changes/agentic-terminal-desktop-reachability/design.md:18`) — correct the false rationale AND add the missing constraint.** The decision (small `AgenticCommands` component, single registration for both modes, scope `"agentic"`) stands; the rationale sentence "DesktopCommands (`app.tsx:298-319`) sits outside the router and cannot navigate" is false (it is inside the router root via `ServerShell` → `SharedProviders`; it merely never navigates), and D1 omits the constraint that actually broke. Replacement wording:
   > **D1 — Command registration site:** a small `AgenticCommands` component added to `packages/app/src/app.tsx`, mounted **inside `SharedProviders`' `CommandProvider` (next to `DesktopCommands`, which — like everything under `ServerShell` — renders inside the router-root callback, so `useNavigate` resolves there)**, registering scope `"agentic"` with the single option `{ id: "agentic.open", ... }`. Constraints: the mount MUST be inside the single shared `CommandProvider` (`useCommand` throws without a provider — `packages/ui/src/context/helper.tsx:32-36` — and a second provider instance would hide the command from the palette and the Windows menu) AND inside the router root (`useNavigate`). Per-shell registration remains rejected (duplication / one-mode-missing risk, menu-disable constraint, fact 2).
2. **Prior-evidence honesty:** already covered by `.architect-team/reviews/6-invalidation-20260719.json` (verified on disk; claims list is accurate) — no further action beyond Phase 7 treating 6.json's e2e claims as unverified pending the re-run.
3. **The blocking SR's own narrative:** its `why_unit_tests_missed_it` / `summary` HMR-and-timing speculation is falsified (§2e). This plan supersedes it; the SR closure note should cite this plan so the wrong explanation doesn't propagate into the changelog or memory.

---

*Consolidation verdict: the three researcher drafts are unanimous, mutually corroborating, and survived independent on-disk re-verification of every load-bearing claim, including four architect stress-probes beyond the drafts (remount idempotency, menu reactivity, full consumer audit incl. dialog owner-capture, SSR absence) and one new finding (§6b residual palette-step defect in the rewritten spec, with repair direction).*

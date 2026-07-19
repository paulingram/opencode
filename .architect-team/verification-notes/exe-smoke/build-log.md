# Exe Smoke Build Log

Verification run for OpenSpec change `agentic-terminal-desktop-reachability`, tasks 5.1–5.5.
Machine: Windows 11 Pro 10.0.26200, Node v24.14.0, npm 11.9.0.
Baseline SHA: dad0fff112b928f7a6a3cb662fd6e3c739c3aaa1.

## 5.1 Toolchain bring-up (design D7)

**Goal:** resolve the bun 1.3.14 binary onto the session PATH WITHOUT editing package.json, strip
SHELL from the build/run environment, and confirm workspace deps.

### bun resolution

- `bun` is NOT on PATH at session start (`which bun` → not found).
- `npm exec --yes --package=bun@1.3.14 -- bun --version` warms the cache but is unsuitable as the
  session-resolved binary because (a) `npm exec` from inside this repo fails with
  `ENOWORKSPACES` (the repo is a bun workspace), and (b) the npx hash dir is not stable to prepend.
- **Resolution chosen (D7-compliant, zero package.json changes):** install bun 1.3.14 globally from
  a non-workspace temp dir so the `bun` shim lands in `C:\Users\Paul\AppData\Roaming\npm` (already
  on PATH):
  - `cd C:\Users\Paul\AppData\Local\Temp\buninstall && npm install -g bun@1.3.14` → "added 3 packages".
  - `Get-Command bun` → `C:\Users\Paul\AppData\Roaming\npm\bun.ps1` (plus `bun.exe` shim and the
    native `bun.exe` under `node_modules\bun`).
  - `bun --version` → `1.3.14`.
- Verified from the worktree root: `which bun` → `/c/Users/Paul/AppData/Roaming/npm/bun`;
  `bun --version` → `1.3.14`.
- Verified `bun $` shell spawn works (`bun -e 'await (await import("bun")).$\`echo shell-works\`'`
  → `shell-works`), so the prebuild/predev `bun ./scripts/...` invocations will function.

### SHELL strip

- Git-Bash leaks `SHELL=/usr/bin/bash`; the e2e live-fixture `cleanEnv` precedent strips it.
- All build/run commands below are invoked with `SHELL` unset (Bash: `unset SHELL` before each
  command; PowerShell: `$env:SHELL=$null`). Bun's `$` then uses its bundled shell, not the leaked
  one.

### BUN_RUNTIME_TRANSPILER_CACHE_PATH

- Pinned to `C:\Users\Paul\AppData\Local\opencode-bun-rt-cache` for any sidecar transpilation, per
  design D7 / environment quirk. Created the dir; set in the env for build + exe launch.

### Workspace deps

- `node_modules` present at workspace root and `packages/desktop/node_modules`.
- Spot-checked critical desktop build deps: `electron`, `electron-vite`, `electron-builder`,
  `vite`, `@sentry/vite-plugin`, `@lydell/node-pty-win32-x64`, `@opencode-ai/app`,
  `@opencode-ai/ui` — all present.
- `packages/app` exports source TS directly (`"./vite": "./vite.js"` plugin transpiles on demand);
  no separate app build needed.
- `bun.lock` present. Did NOT run `bun install` (deps already satisfied; nothing reported missing).
- `packages/opencode` (sidecar source) present in worktree; `packages/opencode/dist/node` NOT yet
  built — `prebuild` builds it via `cd ../opencode && bun script/build-node.ts` (pure bun build,
  no Rust; fetches models.dev snapshot over network).

### Topology note (sidecar)

- The desktop sidecar is NOT a spawned external binary. `packages/desktop/src/main/sidecar.ts`
  does `await import("virtual:opencode-server")`, and `electron.vite.config.ts` resolves
  `virtual:opencode-server` → `../opencode/dist/node/node.js` (i.e. `packages/opencode/dist/node/node.js`).
- `prebuild.ts` (`cd ../opencode && bun script/build-node.ts`) builds that bundle. From
  `packages/desktop`, `../opencode` resolves to `packages/opencode` (verified: exists, has
  `script/build-node.ts`). Path is correct; no workaround needed.

## 5.2 packages/desktop build

Env: `OPENCODE_CHANNEL=dev`, `SHELL` unset, `BUN_RUNTIME_TRANSPILER_CACHE_PATH` pinned.

- `bun ./scripts/prebuild.ts` → exit 0. Copied dev icons, generated metainfo, built sidecar
  (`packages/opencode/dist/node/node.js` + wasm assets), loaded models.dev snapshot.
- `bun run build` (electron-vite build; prebuild hook re-ran harmlessly) → **exit 0** in 2m 10s.
- Output verified: `packages/desktop/out/main/index.js`, `out/main/sidecar.js`,
  `out/main/chunks/*.wasm` (photon_rs + tree-sitter), `out/preload/index.js`,
  `out/renderer/` (assets + index.html).
- No product-code changes. package.json untouched.

## 5.3 package:win (electron-builder --win)

Env: `OPENCODE_CHANNEL=dev`, `CSC_IDENTITY_AUTO_DISCOVERY=false`, `SHELL` unset,
`BUN_RUNTIME_TRANSPILER_CACHE_PATH` pinned.

- `bun run package:win` (electron-builder --win) → **exit 0** in ~4m.
- Downloads: Electron 42.3.3 zip (100%), nsis-3.0.4.1, 7zip-win-x64, nsis-resources — all completed.
- Native deps: `@electron/rebuild` ran for x64, native deps installed (node-pty-win32-x64).
- Signing: `win.signtoolOptions.sign = signWindows` in `electron-builder.config.ts` early-returns
  when `GITHUB_ACTIONS !== "true"` (not set this run), so the custom sign hook is a no-op. The
  "signing with signtool.exe" log lines are electron-builder invoking the (no-op) hook per binary;
  no certificate is configured, no real signature applied, no signing-tool acquisition failure.
  `CSC_IDENTITY_AUTO_DISCOVERY=false` also set as belt-and-suspenders per D8. **No repo-file
  changes were required to disable signing.**
- Outputs:
  - Runnable unpacked app: `packages/desktop/dist/win-unpacked/OpenCode Dev.exe` (231 MB).
  - NSIS installer (bonus): `packages/desktop/dist/opencode-desktop-win-x64.exe` (129 MB).
- `file source doesn't exist from=...native` is a harmless note (no `native/build/Release` for
  win32 in this build; the native dir is optional for the smoke).
- The `win-unpacked` exe is the target for 5.4 (design D8).

### Packaging learnings (for the mandated re-do — keep this mechanical)

These are the machine-specific behaviors observed on the first successful `package:win`, recorded
while fresh so the re-do after the renderer fix is a mechanical re-run.

**Signing behavior on this machine (no symlink-privilege hazard):**
- electron-builder version 26.15.2. The config (`packages/desktop/electron-builder.config.ts`)
  sets `win.signtoolOptions.sign = signWindows` where `signWindows` early-returns unless
  `process.env.GITHUB_ACTIONS === "true"` (line 19). On this machine `GITHUB_ACTIONS` is unset, so
  the custom sign hook is a **no-op** — it never invokes signtool, never acquires winCodeSign.
- Critically, electron-builder did **NOT** attempt its own winCodeSign/signtool acquisition (the
  symlink-privilege hazard from the brief). Evidence: the electron-builder cache at
  `C:\Users\Paul\AppData\Local\electron-builder\Cache\` contains `7zip@1.0.0`, `nsis-3.0.4.1`,
  `nsis-resources-3.4.1`, and a `downloads/` dir — but **no `winCodeSign` directory** (verified via
  `find ... -iname "*sign*"` → empty). The "signing with signtool.exe" log lines are
  electron-builder *invoking the custom no-op hook* per binary, NOT electron-builder's own signtool
  acquisition. The build exited 0 with no signing errors.
- Belt-and-suspenders env: `CSC_IDENTITY_AUTO_DISCOVERY=false` was also set per design D8. It was
  not strictly needed (the custom hook already no-ops), but is harmless and stays in the re-do env.
- **No repo-file changes were required to disable signing.** The re-do uses the identical env:
  `OPENCODE_CHANNEL=dev CSC_IDENTITY_AUTO_DISCOVERY=false` with `SHELL` unset.

**Downloads (first run only; cached for the re-do):**
- Electron 42.3.3 zip (100%) — cached under `AppData\Local\electron-builder\Cache\downloads\` and
  `AppData\Local\electron\Cache` (electron-builder extracts to `dist\win-unpacked`).
- nsis-3.0.4.1, 7zip-win-x64, nsis-resources-3.4.1 — cached under `AppData\Local\electron-builder\Cache\`.
- The re-do will reuse these caches; expect the re-do `package:win` to be faster (~1–2m vs 4m).

**Native deps:**
- `@electron/rebuild` runs for arch=x64, electron 42.3.3; installs `@lydell/node-pty-win32-x64`
  (conpty). `buildFromSource=false`. No issues.
- `file source doesn't exist from=...packages\desktop\native` is a HARMLESS note (no
  `native/build/Release/*` for win32 in this build; the native dir is optional for the smoke). Do
  NOT treat it as a failure.

**Output paths and sizes (exact):**
- Runnable unpacked exe: `packages/desktop/dist/win-unpacked/OpenCode Dev.exe` — 231,559,168 bytes
  (~221 MB). This is the smoke target (design D8 launches this with `--remote-debugging-port`).
- `win-unpacked/` total: ~514 MB (includes Electron runtime, chromium paks, ICU, DLLs, resources).
- NSIS installer (bonus): `packages/desktop/dist/opencode-desktop-win-x64.exe` — 129,205,799 bytes
  (~123 MB).
- Blockmap: `packages/desktop/dist/opencode-desktop-win-x64.exe.blockmap` — 135,999 bytes.
- Debug config dump: `packages/desktop/dist/builder-debug.yml` (no signing-related keys present —
  confirms no active signing configuration).

**Total wall-clock:** build (5.2) 2m10s + package (5.3) ~4m first time. Re-do should be ~2m + ~1–2m
with caches warm.

**Command to reproduce the re-do (after the renderer fix lands):**
```
cd packages/desktop
unset SHELL  # Bash; or $env:SHELL=$null in PowerShell
export OPENCODE_CHANNEL=dev
export BUN_RUNTIME_TRANSPILER_CACHE_PATH="C:/Users/Paul/AppData/Local/opencode-bun-rt-cache"
export CSC_IDENTITY_AUTO_DISCOVERY=false
bun run build          # renderer rebuild (~2m) — picks up fixed app.tsx + titlebar.tsx
bun run package:win    # repackage (~1-2m, caches warm) — produces corrected win-unpacked exe
```
Then run the smoke: `node .architect-team/verification-notes/exe-smoke/cdp-smoke.mjs "<exe>" 9333
<artifactsDir> <resultsJson> smoke` (smoke mode = verdicts recorded).

## 5.4 Exe smoke via CDP — BLOCKED by product defect (SR filed)

### CDP driver

- Driver written at `.architect-team/verification-notes/exe-smoke/cdp-smoke.mjs` (Node ESM,
  Playwright `chromium.connectOverCDP`, reuses `@playwright/test` from packages/app devDeps — no
  new dependencies). Resolves the desktop `MemoryRouter` route via `localStorage`
  `opencode.desktop.window.<windowID>.last-active-url` (since `page.url()` is the `oc://` renderer
  URL, not the router path).
- Per-item expectations written BEFORE the run at
  `.architect-team/verification-notes/exe-smoke/expectations-before-run.md`.
- Dry-run (debug, no verdicts) confirmed: exe launches, CDP endpoint comes up on the configured
  port, `chromium.connectOverCDP` attaches, the renderer page (`oc://renderer/index.html`) loads.

### Blocking defect discovered

- The packaged exe's renderer crashes on boot with a fatal error:
  `Error: Command context must be used within a context provider` thrown from `AgenticCommands`
  (`packages/app/src/app.tsx:528`, `useCommand()`). The app shows the "Something went wrong"
  fatal-error screen and never loads the chrome.
- Root cause: `AgenticCommands` is mounted at `app.tsx:582` as a sibling of `<ServerShell>`,
  OUTSIDE `SharedProviders` and therefore OUTSIDE the `CommandProvider` (`app.tsx:290`).
  `useCommand()` requires that context and throws. The sibling `DesktopCommands` works because it
  is rendered INSIDE `CommandProvider` (`app.tsx:291`).
- The sidecar is healthy (exe stdout shows `server ready { url: 'http://127.0.0.1:65235' }`); only
  the renderer crashes.
- SR filed: `.architect-team/solution-requirements/SR-agentic-commands-context-provider-20260719T092909Z`
  (status: open, blocking: true, blocks all checklist items §1-§6, suggested_team: frontend).
- This is distinct from the titlebar SR (`SR-v2-titlebar-nav-entry-...`) — both are renderer
  defects; both land in the same renderer bundle.

### Additional driver-debugging findings on the stale exe (per orchestrator addition 2)

Cross-checked each against the known SR scope before recording. No NEW SRs needed — the only
defect remains the AgenticCommands context-provider crash.

- **Sidecar health (CONFIRMED LIVE, not a defect):** the in-process sidecar server boots and
  responds. Probed `http://127.0.0.1:<port>/`, `/session`, `/config` → all return HTTP **401**
  (authenticated). This is correct behavior: the opencode server uses `username: "opencode"` + a
  per-launch generated password (`packages/desktop/src/main/sidecar.ts:62-63,86`); the renderer
  authenticates with that password. The 401 proves the server is running and enforcing auth — it is
  NOT a connection failure or boot defect. Implication: once the renderer crash is fixed, §6
  ("renders live sidecar data, no mocks") is achievable — the live data path is intact.
- **No secondary renderer errors:** the fatal AgenticCommands throw is the ONLY error. It is
  reported via the app's `recordFatalRendererError` IPC → exe process stderr (captured in
  `artifacts/sidecar-probe-stderr.log` / `inspect-stderr.log`), NOT via the page `console`/
  `pageerror` channels (Solid catches it in the render phase before page listeners attach, and the
  app's error boundary routes it to IPC). Page-level `page.on("console")` / `page.on("pageerror")`
  captured zero messages — so the §6c "no console errors" assertion will be meaningful once the
  crash is fixed (the assertion logic in the driver is correct, it just can't run yet).
- **Restore (§5) not independently testable on the stale exe** — the renderer never boots, so
  `/agentic` can't be navigated to and `localStorage.last-active-url` can't be set by the app.
  This is a consequence of the known SR, not a separate restore defect. The restore mechanism
  itself (`renderer/index.tsx:105-110` + `getLastActiveUrl`/`setLastActiveUrl`) is unchanged code,
  statically verified in review 6.json (task 3.1). Will be exercised end-to-end in the re-run.
- **Palette/nav/menu (§1-§4) not independently testable on the stale exe** — same reason; all
  blocked by the renderer crash, none show secondary defects.

### Web e2e re-run confirms crash is reachable in the web build too (not just packaged)

- Ran `npx playwright test e2e/agentic-terminal/chrome-reachability.spec.ts` from packages/app →
  **4/4 FAIL** with "Page crashed" and timeouts on `[data-component='sidebar-nav-desktop']`.
  Test-results at `packages/app/e2e/test-results/chrome-reachability-*/error-context.md`.
- The chrome-reachability spec has been rewritten (uncommitted, by frontend-v2-titlebar-fix) with
  genuine selectors (`getByRole("button", { name: "Agentic Terminal" })`, `data-slot="titlebar-v2"`,
  `data-action="settings-new-layout-designs"`) and a layout-toggle-survival test. Its header comment
  (lines 5-15) explicitly documents that the PRIOR baseline spec was vacuous: it asserted a
  non-existent `[data-testid='agentic-terminal-root']` selector (real testid is `agentic-terminal`,
  `packages/app/src/pages/agentic-terminal/index.tsx:35`) and never toggled `newLayoutDesigns`, so
  the v2 titlebar branch was never exercised.
- This corroborates (b) for the diagnostic-research plan: the prior SRC-2/web verification was
  vacuous — the baseline e2e could not have caught the crash. The rewritten e2e is genuine and
  correctly fails with "Page crashed" until the AgenticCommands fix lands.
- Filed `SR-vacuous-chrome-reachability-e2e-20260719T094336Z` (non-blocking) tracking the
  test-quality defect; mandates the fix include real coverage (rewritten e2e + a component-mount
  unit test in app.test.tsx so context-provider regressions are caught at unit level).

### Verdicts recorded this run

- NONE. Per the mission's honesty rule and the orchestrator's hold, no smoke verdicts are recorded
  against the defective exe. All §1-§6 items are `not-verified` (blocked-by-SR) pending the fix.
- The smoke will be re-run against a rebuilt+repackaged exe after BOTH the AgenticCommands
  context-provider fix AND the titlebar fix land.

# Design: agentic-terminal-desktop-reachability

## Context

The `/agentic` route is registered in both layout-mode forks (`packages/app/src/app.tsx:609` legacy, `:613` new) and the desktop app mounts the same `Routes` tree via `AppInterface` inside `DesktopMemoryRouter` (`packages/desktop/src/renderer/index.tsx:105-111`, `:412-425`). What is missing is chrome: no nav element, no command, no menu entry links to `/agentic`. The desktop executable has no address bar, so reachability chrome is the entire deliverable.

## Key architecture facts (verified against source)

1. **Command system.** Commands register via `command.register("<scope>", () => CommandOption[])` with `{ id, title: language.t("command.<id>"), category: language.t("command.category.*"), keybind?, onSelect }` — precedent: `packages/app/src/pages/layout.tsx:897-906` (`sidebar.toggle`). The registration site must be inside the router (needs `useNavigate`) and mounted in BOTH layout modes.
2. **Menu → command channel.** `DESKTOP_MENU` (`packages/app/src/desktop-menu.ts`) `command:` entries flow: macOS native menu `packages/desktop/src/main/menu.ts:45-48` (`entry.command → deps.trigger`) → `onMenuCommand` (`renderer/index.tsx:317`) → `cmd.trigger(id)`; Windows in-app menu `packages/app/src/components/windows-app-menu.tsx:28-31` (`runCommand → props.command.trigger(id)`). **Constraint:** `windows-app-menu.tsx:23-27` disables entries whose command id has no registered `CommandOption` — so `agentic.open` must be registered whenever the menu renders, in both modes.
3. **Menu labels are raw strings** (every `DESKTOP_MENU` entry); command titles are localized via `command.<id>` keys present in `en.ts` + all non-English locales (precedent: `command.sidebar.toggle` in every `packages/app/src/i18n/*.ts`).
4. **Shells.** New layout: `NewAppLayout` (`app.tsx:344-352`) → `NewLayout` (Titlebar + main; no sidebar). Legacy: `pages/layout.tsx` shell with sidebar — note the legacy `/agentic` route mounts OUTSIDE `LegacyServerLayout` (`app.tsx:608-610`), so a legacy nav entry is a departure link from the shell.
5. **Router remount on layout toggle.** `app.tsx:558` keys a `Show` on `newLayoutDesigns()` — the entire router remounts on toggle. Chrome registered inside the router root callback (`app.tsx:561-573`) or per-shell components re-mounts naturally; no stale-registration hazard as long as registration lives in components, not module top-level side effects.
6. **Desktop URL persistence.** `renderer/index.tsx:88-109`: `history.listen` persists the full URL value (path + search); `getLastActiveUrl` accepts any value starting with `/` (not `//`) — `/agentic?session=ses_x` round-trips today. Expected: NO code change; verification only. Stale-session restore behavior is governed by `pages/agentic-terminal/index.tsx:70-87` (explicit-target resolve, newest-unarchived fallback) — unchanged by contract.

## Decisions

- **D1 — Command registration site (corrected 2026-07-19 per diagnostic-plan-20260719T1010Z):** a small `AgenticCommands` component added to `packages/app/src/app.tsx`, mounted **inside `SharedProviders`' `CommandProvider` (next to `DesktopCommands`, which — like everything under `ServerShell` — renders inside the router-root callback, so `useNavigate` resolves there)**, registering scope `"agentic"` with the single option `{ id: "agentic.open", title: language.t("command.agentic.open"), category: language.t("command.category.view"), onSelect: () => navigate("/agentic") }`. Constraints: the mount MUST be inside the single shared `CommandProvider` (`useCommand` throws without a provider — `packages/ui/src/context/helper.tsx:32-36` — and a second provider instance would hide the command from the palette and the Windows menu) AND inside the router root (`useNavigate`). Per-shell registration remains rejected (duplication / one-mode-missing risk, menu-disable constraint, fact 2). *(The original rationale claimed DesktopCommands "sits outside the router and cannot navigate" — false at every checked revision; that false premise steered the initial implementation to a mount outside the CommandProvider, which fatally crashed web and desktop renderers on boot.)*
- **D2 — Menu entry:** `{ type: "item", label: "Agentic Terminal", command: "agentic.open" }` appended to the View menu items in `desktop-menu.ts` (after the toggle group, before Reload, alongside other `command:` entries). Raw-string label per idiom (fact 3).
- **D3 — Nav entry hosts (implementer latitude per refined prompt, bounded):** new layout — the v2 titlebar area (`components/titlebar-tab-strip.tsx` / the `NewLayout` titlebar chrome); legacy — the `pages/layout.tsx` sidebar nav. Each entry navigates to `/agentic`, is visible without scrolling, ≤ 2 interactions, `aria-label` from i18n where the host idiom localizes (fact 3).
- **D4 — i18n:** add `command.agentic.open` to `en.ts` and EVERY non-English locale file (precedent commit `8a87d3c3` "add session.header.reveal keys to non-English app locales"). Non-English values: natural translations following each file's tone; nav-entry labels reuse the same key where rendered via `language.t`.
- **D5 — Restore:** no code change unless verification fails. Verification = unit assertion that the URL-shape guard accepts `/agentic?session=…` (static, if testable) + the recorded manual desktop smoke checklist (relaunch restore is exe-only behavior; user-authorized mechanism).
- **D6 — Web-entry e2e for the chrome:** the nav entry and palette action render on the web build too, so one Playwright spec in `packages/app/e2e/agentic-terminal/` drives nav-entry → `/agentic` and palette → `/agentic` genuinely (real `page.click` / keyboard). Desktop-exe-only behaviors (native/in-app menu, relaunch restore) are covered by unit tests + the manual checklist (user-authorized).

## Reuse Decision Log (reuse-first-design)

| Proposed artifact | Ladder verdict | Justification (map citation) |
|---|---|---|
| `AgenticCommands` in `app.tsx` | **extend** existing `packages/app/src/app.tsx` | CODEBASE_MAP `packages/app` module; sibling of existing `DesktopCommands` (app.tsx:298); no new file |
| View-menu entry | **extend** `packages/app/src/desktop-menu.ts` | ROUTE_MAP/CODEBASE_MAP list desktop-menu.ts as the shared menu model; entry follows existing `command:` idiom |
| Nav entry (new layout) | **extend** existing titlebar chrome component | CODEBASE_MAP line for `layout-new.tsx` (NewLayout = Titlebar + main); no new chrome module |
| Nav entry (legacy) | **extend** `packages/app/src/pages/layout.tsx` | CODEBASE_MAP legacy shell module; sidebar already hosts nav + command registration (layout.tsx:897) |
| i18n keys | **extend** every `packages/app/src/i18n/*.ts` | existing `command.<id>` key pattern in all locales |
| Menu test | **extend** `packages/app/src/desktop-menu.test.ts` | existing unit-test precedent for DESKTOP_MENU entries |
| Chrome e2e spec | **build-new** file in existing `packages/app/e2e/agentic-terminal/` suite dir | new test file in the established e2e suite (new spec files are the suite's per-scenario idiom); no product module added |
| `packages/app/src/app.test.tsx` (component test) | **build-new** (orchestrator-sanctioned at Phase 3 re-engagement) | the command-registration test needs a component harness (happydom render of the app command mount); `desktop-menu.test.ts` is a pure menu-model test and hosting a component harness there would muddy it. Colocated `<module>.test.tsx` is the package's bun-test idiom. Menu-entry assertions still belong in `desktop-menu.test.ts` per the original row. |
| New dependencies | **none** | — |

## Continuation decisions (2026-07-19 — packaged-exe verification)

- **D7 — Build toolchain on this machine (no product-code changes):** `packages/desktop` `predev`/`prebuild` invoke bare `bun`, absent from PATH on this machine. Resolve the bun 1.3.14 binary ONCE (`npm exec --yes --package=bun@1.3.14 -- bun --version` warms the cache; locate the binary under the npm cache) and PREPEND its directory to `PATH` for the build session — `package.json` stays untouched. Strip `SHELL` from the build/run environment per the e2e live-fixture `cleanEnv` precedent (Git-Bash leaks `SHELL=/usr/bin/bash`, breaking spawned shells). Set `BUN_RUNTIME_TRANSPILER_CACHE_PATH` to a stable path if sidecar boot is involved.
- **D8 — Packaged-exe smoke automation:** launch the packaged app (the `win-unpacked` executable that `electron-builder --win` emits alongside the installer) with `--remote-debugging-port=<port>` and attach Playwright via `chromium.connectOverCDP`. Automatable items: nav entries (both layout modes, incl. post-toggle), palette flow, Windows in-app View-menu entry, `/agentic` render with live sidecar data, relaunch restore (kill + relaunch the process, re-attach, assert restored URL). The driver is a RUN-VERIFICATION artifact at `.architect-team/verification-notes/exe-smoke/` reusing `packages/app`'s existing Playwright devDependency — NOT a repo e2e-suite addition (keeps CI green; honors the standing "no desktop e2e harness in product code" exclusion). Signing is not configured for local packaging; if electron-builder attempts signing-tool acquisition that fails on this machine (symlink privilege), disable signing for the local build via env/config override documented in the verification notes.
- **D9 — Checklist honesty:** every checklist item gets a per-item `verified-by:` record (`automated-cdp` / `human-recorded` / `not-verified`). The pre-ticked macOS/Linux Platforms boxes are corrected to not-verified follow-ups. No item may claim verification that did not occur.

| Proposed artifact | Ladder verdict | Justification (map citation) |
|---|---|---|
| exe-smoke CDP driver (`.architect-team/verification-notes/exe-smoke/`) | **build-new** (run artifact, not product code) | no existing harness drives a packaged exe (CODEBASE_MAP: e2e suite targets the web dev server); reuses packages/app Playwright devDep; deliberately outside `packages/*` so CI is unaffected |
| PATH shim for bun (session env) | **reuse** existing npm-exec bun pattern | machine quirk doc (env-windows-toolchain-quirks); zero repo changes |
| New dependencies | **none** | Playwright already in packages/app devDeps; electron-builder already in packages/desktop devDeps |

## Risks / trade-offs

- The legacy nav entry departs the `LegacyServerLayout` shell (fact 4) — acceptable; `/agentic` provides its own provider pair (existing spec `agentic-terminal-surface`).
- Command palette availability depends on the palette being reachable in both shells; the `agentic.open` command itself is shell-agnostic (D1).
- Test-classification discipline: run-added tests carry prod-safety classification annotations at authoring time (discipline registry `prod-safe-test-classification`, scope-narrowed to run-added tests).

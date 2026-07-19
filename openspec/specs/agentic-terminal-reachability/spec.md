# agentic-terminal-reachability Specification

## Purpose
TBD - created by archiving change agentic-terminal-desktop-reachability. Update Purpose after archive.
## Requirements
### Requirement: Visible navigation entry in both layout modes
The app SHALL render a visible navigation entry that opens the Agentic Terminal (`/agentic`) in BOTH layout modes — with `settings.general.newLayoutDesigns()` enabled AND disabled. The host surface per mode is implementer's choice grounded in each shell's idiom (new layout: the Titlebar + main shell; legacy: the legacy shell chrome — noting the legacy `/agentic` route mounts outside `LegacyServerLayout`). A user MUST be able to open Agentic Terminal from the entry in at most 2 interactions. The entry MUST remain functional immediately after toggling the layout-mode setting (the keyed `Show` router remount at `packages/app/src/app.tsx:558`).

#### Scenario: Reachable from nav in new layout
- **WHEN** a user with `newLayoutDesigns` enabled activates the Agentic Terminal navigation entry
- **THEN** the router navigates to `/agentic` and the Agentic Terminal surface renders, in at most 2 interactions from the default view

#### Scenario: Reachable from nav in legacy layout
- **WHEN** a user with the legacy layout activates the Agentic Terminal navigation entry
- **THEN** the router navigates to `/agentic` and the Agentic Terminal surface renders, in at most 2 interactions from the default view

#### Scenario: Entry survives layout-mode toggle
- **WHEN** the user toggles `newLayoutDesigns` in either direction
- **THEN** once the app completes its layout transition (however the product implements it — currently a product-initiated full page reload, `settings.tsx:411` since upstream `4a181c357`), the navigation entry is present and functional in the newly-active shell

### Requirement: Command-palette action
The app SHALL register an "Open Agentic Terminal" action in the existing `useCommand` command system. Activating it SHALL navigate to `/agentic`. The action title SHALL come from the i18n dictionary.

#### Scenario: Palette lists and executes the action
- **WHEN** the user opens the command palette and executes the "Open Agentic Terminal" action
- **THEN** the router navigates to `/agentic` and the Agentic Terminal surface renders

### Requirement: Shared View-menu entry
The app SHALL add a `command:` entry with id `agentic.open` to the shared `DESKTOP_MENU` View menu in `packages/app/src/desktop-menu.ts`, so the entry reaches the native macOS application menu (via `packages/desktop/src/main/menu.ts` `entry.command → deps.trigger → onMenuCommand`) AND the Windows in-app menu (via `packages/app/src/components/windows-app-menu.tsx` rendering `DESKTOP_MENU`). On Windows, where no native application menu exists (`packages/desktop/src/main/menu.ts` darwin-only guard), the in-app rendering satisfies this requirement. The menu label SHALL follow the existing `DESKTOP_MENU` raw-string label idiom (menu labels are not localized in this codebase). Because the Windows in-app menu disables entries whose command id is not registered (`windows-app-menu.tsx` `commandDisabled`), the `agentic.open` command MUST be registered in the command system whenever the menu is rendered, in BOTH layout modes.

#### Scenario: Menu entry present in shared menu model
- **WHEN** `DESKTOP_MENU` is inspected
- **THEN** the View menu contains a `command:` entry `agentic.open` with an i18n-backed label

#### Scenario: Menu entry opens the surface
- **WHEN** the `agentic.open` command is triggered through the menu-command channel
- **THEN** the router navigates to `/agentic` and the Agentic Terminal surface renders

### Requirement: Desktop relaunch restore of the full URL
The desktop app SHALL restore the FULL last-active URL for the Agentic Terminal — including the `?session=<id>` query — across quit and relaunch, via the existing `DesktopMemoryRouter` last-active-url persistence (`packages/desktop/src/renderer/index.tsx:88-109`). Restore behavior for a stale `?session=` (session deleted/archived between quit and relaunch) SHALL follow the surface's existing session-resolution behavior (`packages/app/src/pages/agentic-terminal/index.tsx:70-87`) unchanged.

#### Scenario: Relaunch restores active session URL
- **WHEN** the desktop app is quit while the window is on `/agentic?session=<id>` and then relaunched
- **THEN** the restored initial URL equals `/agentic?session=<id>` and the Agentic Terminal surface renders

#### Scenario: Bare route also restores
- **WHEN** the desktop app is quit while on `/agentic` (no query) and relaunched
- **THEN** the restored initial URL equals `/agentic`

### Requirement: Verified packaged Windows distribution
The reachability capabilities SHALL be verified in a PACKAGED Windows desktop executable produced by `packages/desktop` `package:win` (electron-builder) on the target machine. The packaged exe SHALL exhibit: the View-menu entry (Windows in-app rendering), the navigation entry in both layout modes (including immediately after toggling `newLayoutDesigns`), the command-palette action, relaunch restore of `/agentic` and `/agentic?session=…`, and the `/agentic` surface rendering live sidecar data (no mocks). Verification SHALL be automated via Playwright/CDP against the packaged exe wherever technically possible; a human-recorded step is acceptable ONLY where automation is genuinely impossible, and the smoke-checklist artifact SHALL carry an honest per-item record of HOW each item was verified (automated / human-recorded / not-verified). Platforms not verified on the target machine (macOS, Linux) SHALL be explicitly recorded as not-verified follow-ups, never pre-ticked.

#### Scenario: Packaged exe builds on the target machine
- **WHEN** `packages/desktop` `build` then `package:win` are run on the Windows 11 target machine (with the machine's documented toolchain adaptations)
- **THEN** both exit 0 and a runnable packaged executable is produced

#### Scenario: Smoke checklist green against the packaged exe
- **WHEN** the packaged executable is launched and the desktop smoke checklist is executed end-to-end against it
- **THEN** every Windows-verifiable checklist item passes, and each item's record states how it was verified

#### Scenario: Honest platform record
- **WHEN** the smoke-checklist artifact is inspected after verification
- **THEN** macOS and Linux rows are explicitly marked not-verified follow-ups, and no item claims verification that did not occur

### Requirement: Localized labels
All new user-facing labels that the existing idiom localizes — the command-palette action title (a `command.agentic.open` key per the `command.<id>` pattern) and any navigation-entry label rendered through `language.t` — SHALL be defined as i18n dictionary keys present in the English dictionary AND every non-English app locale file, following the existing locale-key pattern. The `DESKTOP_MENU` label follows the raw-string menu idiom and is exempt (matching every other menu entry).

#### Scenario: Labels resolve in every locale
- **WHEN** the locale dictionaries are enumerated
- **THEN** every new i18n label key introduced by this capability resolves to a non-empty string in each locale file


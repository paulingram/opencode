---
last_mapped: 2026-07-19T08:42:02Z
codebase_kind: fullstack-monorepo
---

# opencode — Codebase Map

Grounding document for the shipped **Agentic Terminal**: an always-on `/agentic` route in
`packages/app` (SolidJS/Vite client), registered in both layout modes and backed exclusively by
opencode's real session/event stream. The Phase A simulation has been removed. The route is now
reachable through first-class chrome in both web and desktop: an `agentic.open` command-palette entry,
a desktop **View** menu item, a legacy sidebar-rail nav button, and a new-layout titlebar nav button
(see §3.5 "Reachability chrome"). Everything below is verified against files in this worktree (branch
`architect-team/agentic-terminal-desktop-app`). Paths are repo-relative to the worktree root unless
stated. Cited symbols/line numbers were read directly.

---

## 1. Architecture overview

opencode is an AI coding agent. The repo is a **Bun workspace monorepo** (`packageManager: bun@1.3.14`,
Turbo for `typecheck`, `oxlint` for lint). The runtime splits into a **core/server** (TypeScript on Bun,
built on **Effect** + **Hono** + SQLite) and multiple **clients** that all talk to the server over HTTP +
a Server-Sent-Events (SSE) event stream.

```
                 ┌─────────────────────────────────────────────┐
                 │  packages/core  (Effect services: Session,    │
                 │  Event bus (EventV2), LLM, Tools, Config,     │
                 │  Git, FS, Permissions)  — the brain           │
                 └───────────────┬───────────────────────────────┘
                                 │ publishes/subscribes
      ┌──────────────────────────┴───────────────────────────────┐
      │ packages/opencode (CLI + legacy instance HTTP server)      │
      │ packages/server   (newer Hono HTTP api + SSE handlers)     │
      │   schema (packages/schema) + wire contract (packages/protocol)
      └──────────────────────────┬───────────────────────────────┘
                                 │  HTTP + SSE event stream
   ┌─────────────────────────────┼───────────────────────────────────────┐
   │            SDKs (generated typed clients)                            │
   │  packages/sdk (js)  → @opencode-ai/sdk  (hey-api fetch client, v2)   │  ← app consumes this
   │  packages/client / sdk-next  → Effect-native client (next-gen)       │
   └─────────────────────────────┬───────────────────────────────────────┘
                                 │
      ┌───────────────┬──────────┴──────────┬────────────────────┐
      │ packages/app  │ packages/tui         │ packages/desktop   │
      │ SolidJS/Vite  │ terminal UI (OpenTUI │ Electron shell that│
      │ web client    │ + Go tui binary)     │ embeds packages/app│
      └───────┬───────┘                      └────────────────────┘
              │ consumes reusable UI libs
    packages/ui (design system)  +  packages/session-ui (message/diff/timeline rendering)
```

Two shared UI libraries feed the SolidJS clients: **`packages/ui`** (the design system — buttons,
dialogs, icons, theme, both a legacy set and a `v2/` set) and **`packages/session-ui`** (higher-level
message rendering: markdown, tool cards, diffs, session review, timeline pieces). `packages/app` depends
on both; `packages/desktop` re-exports `AppInterface`/`AppBaseProviders` from `packages/app` and mounts
them inside an Electron renderer.

**Naming note:** the design system is mid-migration. Legacy components (`Button`, `Icon`) live at
`@opencode-ai/ui/<name>`; the newer redesign lives at `@opencode-ai/ui/v2/<name>-v2` (e.g. `ButtonV2`,
`IconV2`, `MenuV2`). The app gates the two behind a `newLayoutDesigns()` setting. The Agentic Terminal is
a *new* surface — prefer the **v2** components and the new layout shell.

---

## 2. Packages

`packages/*` (32 top-level entries). Scope for this run: **deep** = read at file level; **reference** =
you will reuse or read symbols from it; **out** = not relevant to the Agentic Terminal surface.

| Package | Purpose | Language / framework | Scope |
|---|---|---|---|
| **app** | SolidJS/Vite web client (the surface we extend). `@opencode-ai/app` | SolidJS 1.9 + Vite 7 + Tailwind 4 | **deep** |
| **ui** | Design-system component library (legacy + `v2/`), theme, icons, i18n. `@opencode-ai/ui` | SolidJS + Kobalte + Tailwind | **deep** |
| **session-ui** | Message/part/diff/timeline rendering, markdown pipeline, `DataProvider`. `@opencode-ai/session-ui` | SolidJS + shiki + @pierre/diffs | **deep** |
| **sdk** (`sdk/js`) | Generated typed HTTP+SSE client the app imports as `@opencode-ai/sdk`. | TS, hey-api openapi-ts | **deep** (event stream) |
| **tui** | Terminal UI client; `src/theme/assets/opencode.json` is the palette source-of-record. `@opencode-ai/tui` | OpenTUI (Solid) + Go binary | **reference** (palette) |
| **core** | Effect services: Session, Event bus, LLM, tools, config, git, fs, permissions. `@opencode-ai/core` | TS + Effect + SQLite | **reference** (event/session model) |
| **server** | Newer Hono HTTP API + SSE event handlers. `@opencode-ai/server` | TS + Hono + Effect | **reference** (SSE endpoint) |
| **opencode** | CLI entrypoint + legacy instance HTTP server (`/event`, `/global/event`, `/pty/*`). `opencode` | TS + Bun | **reference** (routes) |
| **schema** | Zod/Effect schemas: event definitions, Message/Part/Session models. `@opencode-ai/schema` | TS + Effect Schema | **reference** (event/data types) |
| **protocol** | HTTP API wire contract (routes, SSE stream shapes). `@opencode-ai/protocol` | TS + Effect HttpApi | **reference** (route paths) |
| **desktop** | Electron shell embedding `packages/app`. `@opencode-ai/desktop` | Electron + electron-vite | **reference** (embedding) |
| **client** | Effect-native generated client (alt to sdk). `@opencode-ai/client` | TS + Effect + httpapi-codegen | reference |
| **sdk-next** | Thin next-gen facade re-exporting the Effect client. `@opencode-ai/sdk-next` | TS + Effect | reference |
| **storybook** | Storybook host for `ui`/`session-ui` stories. `@opencode-ai/storybook` | Storybook + Vite | reference (component discovery) |
| **plugin** | Public plugin API types. `@opencode-ai/plugin` | TS | out |
| **cli** | CLI helpers. `@opencode-ai/cli` | TS | out |
| **llm** | LLM provider glue. `@opencode-ai/llm` | TS | out |
| **codemode** | Confined code execution over schema-described tools. `@opencode-ai/codemode` | TS + Effect | out |
| **httpapi-codegen** | Codegen for `packages/client`. `@opencode-ai/httpapi-codegen` | TS | out |
| **console** | Web console app (`console/app`, workspace `console/*`). | Astro/Solid | out |
| **stats** | Stats site (`stats/app`, workspace `stats/*`). | Astro/Solid | out |
| **web** | Marketing/docs site. `@opencode-ai/web` | Astro | out |
| **docs** | Docs content (no root package.json). | MD/MDX | out |
| **slack** | Slack integration. `@opencode-ai/slack` | TS | out |
| **enterprise** | Enterprise features. `@opencode-ai/enterprise` | TS | out |
| **function** | Serverless functions. `@opencode-ai/function` | TS | out |
| **identity** | Identity/auth (no root package.json). | TS | out |
| **containers** | Container defs (no root package.json). | Dockerfiles | out |
| **effect-drizzle-sqlite** | Effect + Drizzle SQLite adapter. | TS + Effect | out |
| **effect-sqlite-node** | Effect SQLite (node) adapter. | TS + Effect | out |
| **http-recorder** | Record/replay Effect HTTP traffic (test cassettes). `@opencode-ai/http-recorder` | TS + Effect | out (test infra) |
| **script** | Repo scripts. `@opencode-ai/script` | TS | out |

---

## 3. DEEP — `packages/app` (SolidJS/Vite web client)

`@opencode-ai/app` v1.18.2. Entry `src/index.ts` (library exports) and `src/entry.tsx` (web bootstrap).
Vite + `vite-plugin-solid`, Tailwind 4 (`@tailwindcss/vite`), icon spritesheets. Runs on Bun.

### 3.1 Bootstrap & mount

- **`src/entry.tsx`** — web entry. Builds the local `ServerConnection.Http` (server URL from
  `VITE_OPENCODE_SERVER_HOST/PORT`, default `localhost:4096`, or `location.origin` in prod;
  `entry.tsx:102-107`). **`:4096` is the *app-side* default only** — the opencode server's own `serve`
  defaults to port **0** (ephemeral) and hostname `127.0.0.1` (`packages/opencode/src/cli/network.ts:6-16`),
  so any dev recipe must pass an explicit `--port`. It also defines the `Platform` object
  (`platform: "web"`, notifications, links),
  and `render()`s `<PlatformProvider><AppBaseProviders><AppInterface .../></AppBaseProviders></PlatformProvider>`
  into `#root` (`entry.tsx:167-181`).
- **`packages/desktop/src/renderer/index.tsx`** does the equivalent for Electron: imports
  `AppBaseProviders`, `AppInterface` from `@opencode-ai/app` and mounts `<AppInterface>` at
  `desktop/src/renderer/index.tsx:412-425` (with an Electron `Platform` implementation).
- **`index.html`** mounts `#root` and loads `src/entry.tsx`.

### 3.2 The router — `src/app.tsx` (READ THIS FIRST for adding a route)

`app.tsx` (659 lines) owns the whole provider + route tree.

- **`AppInterface` (lines 544-601)** — top-level component. Wraps everything in
  `ServerProvider → GlobalProvider → SettingsProvider → ConnectionGate` and then mounts the router via
  `<Dynamic component={props.router ?? Router} root={...}>` (lines 576-594). The router `root` installs
  the persistent shell: `TabsProvider → PermissionProvider → NotificationProvider → ServerShell` —
  `<AgenticCommands />` (see §3.5) is mounted INSIDE `SharedProviders`' `CommandProvider` (line 292,
  next to `DesktopCommands`; moved 2026-07-19 from a sibling-of-ServerShell mount that sat outside the
  provider and fatally crashed both renderers on boot — SR-agentic-commands-context-provider)
  that registers the `agentic.open` command — and when `newLayoutDesigns()` is on, wraps children in
  `<NewAppLayout>` (lines 584-586). The whole router subtree is keyed on
  `useSettings().general.newLayoutDesigns().toString()` (line 575) so toggling the layout remounts cleanly.
- **`AgenticCommands` (exported, lines 528-543)** — null component mounted inside `SharedProviders`' `CommandProvider` (line 292); calls
  `command.register("agentic", …)` to add the `agentic.open` palette entry (title `command.agentic.open`,
  category `command.category.view`) that navigates to `/agentic`.
- **`Routes` (lines 603-638)** — the actual `<Route>` tree. This is where a new top-level route is added.

**Route table (verified `app.tsx:603-638`):**

| Path | Component | Condition | Line |
|---|---|---|---|
| `/` | `LegacyHome` | legacy layout only (`!newLayoutDesigns`) | 616 |
| `/server/:serverKey/session/:id` | `LegacyTargetSessionRoute` | legacy layout only | 617 |
| `/:dir` (layout) | `DirectoryLayout` | always (under `LegacyServerLayout`) | 621 |
| `/:dir/` | `Navigate → session` | child of `/:dir` | 622 |
| `/:dir/session/:id?` | `SessionRoute` | child of `/:dir` | 623 |
| `/agentic` | `LegacyAgenticTerminalRoute` | legacy layout only | 627 |
| `/` | `NewHome` | new layout only (`newLayoutDesigns`) | 630 |
| `/agentic` | `AgenticTerminalRoute` (wrapped) | new layout only | 631 |
| `/:dir/session/:id` | `NewLayoutLegacySessionRedirect` | new layout only | 632 |
| `/server/:serverKey/session/:id` | `TargetSessionRoute` | new layout only | 633 |
| `/new-session` | `DraftRoute` | always | 635 |

  Route components of note: `SessionRoute` (64-98), `TargetServerRoute` (100-118, owns the server-identity
  remount via `<Show keyed>` on `serverKey`), `TargetSessionRoute` (120-124), `DraftRoute` (175-197),
  `ResolvedDraftRoute` (199-222, shows the full provider stack a draft/session route layers on:
  `ServerSDKProvider → ServerSyncProvider → ModelsProvider → SDKProvider → DirectoryDataProvider →
  FileProvider → PromptProvider → CommentsProvider`).

- **Shells / layout wrappers**: `NewAppLayout` (331-339) → `SelectedServerProviders` (157-165) →
  `ServerScopedProviders` (314-321) → `NewLayout` (`src/pages/layout-new.tsx`). `LegacyServerLayout`
  (167-173) is the pre-redesign equivalent. `SharedProviders` (273-283) holds server-agnostic providers
  (`CommandProvider`, `HighlightsProvider`) that stay mounted across routes.
- **`AppBaseProviders` (353-385)** — the outermost providers: `MetaProvider`, `Font`, `ThemeProvider`,
  `LanguageProvider`, `QueryProvider` (TanStack Query), `DialogProvider`, `MarkedProvider`,
  `FileComponentProvider`. An always-on Agentic Terminal top-level route belongs in `Routes` (add a
  `<Route path="/terminal" .../>` sibling), rendered inside the new shell (`NewAppLayout`).

### 3.3 State / context (`src/context/*`) — the patterns to follow

Contexts are created with `createSimpleContext({ name, init })` from `@opencode-ai/ui/context` (returns
`{ use, provider }`). State is almost always a SolidJS **`createStore`** (per `packages/app/AGENTS.md`:
"Always prefer `createStore` over multiple `createSignal`"). TanStack Solid Query backs server data.

Key contexts:

| Context | File | Role |
|---|---|---|
| `ServerProvider` / `useServer` | `context/server.tsx` | Known servers, active server, `ServerConnection` type/keys. |
| `GlobalProvider` / `useGlobal` | `context/global.tsx` | Cross-server registry; `ensureServerCtx(conn)` returns a per-server `{ sdk, sync, projects }`. |
| `ServerSDKProvider` / `useServerSDK` | `context/server-sdk.tsx` | **Event-stream owner** (see §4.4). Wraps the generated SDK + the SSE consume loop + a directory-keyed emitter. |
| `ServerSyncProvider` / `useServerSync` | `context/server-sync.tsx` | The big reactive store: bootstraps global config/projects/providers, loads sessions, and applies every event into per-directory stores. |
| `SDKProvider` / `useSDK` | `context/sdk.tsx` | Directory-scoped SDK (`serverSDK().ensureDirSdkContext(dir)`); exposes `.client` + per-`type` `.event` emitter. |
| `useSync` (DirectorySync) | `context/sync.tsx` (hook + optimistic helpers); factory `createDirSyncContext` in `context/directory-sync.ts` | `serverSync().ensureDirSyncContext(sdk().directory)`. **Message/part/status content is NOT per-directory:** `directory-sync.ts:30-36` is a `Proxy` forwarding the nine session-content fields (`sessionFields`, `:10-20`) to the **shared server-wide server-session store**, everything else to the per-directory child store — the "per-directory" store is a *view*, not the storage. |
| `SettingsProvider` / `useSettings` | `context/settings.tsx` | User settings incl. `general.newLayoutDesigns()`, terminal font. |
| `LayoutProvider` / `useLayout` | `context/layout.tsx` | Home selection, project list, panel layout. |
| `TabsProvider` / `useTabs` | `context/tabs.tsx` | Tab strip: session tabs, draft tabs, terminal tabs; `addSessionTab`, `newDraft`, `select`. |
| `PermissionProvider` / `permission.tsx` | `context/permission.tsx` | Permission prompts; subscribes to events at `permission.tsx:322`. |
| `NotificationProvider` | `context/notification.tsx` | Desktop notifications; subscribes at `notification.tsx:387`. |
| `TerminalProvider` / `useTerminal` | `context/terminal.tsx` | **PTY terminal store** (see §3.6). |
| `FileProvider`, `CommentsProvider`, `ModelsProvider`, `HighlightsProvider`, `PromptProvider`, `CommandProvider` | `context/*` | File tree/content, review comments, model catalog, syntax highlight worker, prompt composer state, command palette registry. |

`context/global-sync/*` is the event→store engine used by `server-sync.tsx`: `bootstrap.ts` (initial
loads), `event-reducer.ts` (the switch that maps each event kind to store mutations — see §4.5),
`session-cache.ts`, `session-trim.ts`, `queue.ts`, `child-store.ts`, `home-session-index.ts`.

### 3.4 Existing top-level views (models for a new surface)

- **`src/pages/home.tsx`** — `NewHome` (line 264) and `LegacyHome`. A full-screen top-level view: a
  project column + a searchable session list, built entirely with `v2` components (`ButtonV2`, `IconV2`,
  `IconButtonV2`, `MenuV2`, `TooltipV2`, `ProjectAvatar`, `ScrollView`) and Tailwind `v2-*` tokens. Good
  template for a new always-on route: pulls `useServerSync`, `useLayout`, `useTabs`, `useGlobal`, opens
  sessions via `tabs.addSessionTab` / `tabs.select`, and prefetches session data through
  `ctx.sync.session.sync(id)` (home.tsx:385-415).
- **`src/pages/session.tsx`** + `src/pages/session/*` — the session view: timeline
  (`session/timeline/*`), composer/docks (`session/composer/*`), side panel, file tabs, review panel
  (`session/v2/review-panel-v2.tsx`), terminal panel (`session/terminal-panel-v2.tsx`).
- **`src/pages/layout-new.tsx`** (`NewLayout`, 45 lines) — the new shell: `Titlebar` + `<main><Suspense>{children}</Suspense></main>` + toast region, `bg-v2-background-bg-deep`. A new route renders inside this.
- **`src/pages/directory-layout.tsx`**, **`src/pages/layout.tsx`** (+ `layout/` sidebar pieces) — the legacy directory-scoped shell.
- **`src/pages/new-session.tsx`** — the draft composer view (`/new-session`).

### 3.5 Shipped Agentic Terminal (`src/pages/agentic-terminal/`)

The route is a self-contained live projection surface rather than a PTY emulator or a second session
store. Its structure is:

```text
src/pages/agentic-terminal/
├── index.tsx                 # route composition, live target selection, SDK/ServerSync bindings
├── source.ts                 # phase-agnostic TerminalEventSource/status/metrics contract
├── store.ts                  # one idempotent event fold + UI-local state/actions
├── types.ts                  # ordered terminal envelope and projected-state types
├── hotkeys.ts                # guarded global shortcuts
├── tokens.css                # complete surface-scoped terminal-* design token set
├── live/
│   ├── adapters.ts           # OpenCode Event/Session/Message/Part -> terminal envelopes
│   ├── live-source.ts        # load-before-listen, resnapshot, replay, prompt/fork/queue transport
│   └── replay-buffer.ts      # deduplicated retained checkpoints and deterministic prefixes
├── panels/
│   ├── topbar.tsx / rail.tsx / feed.tsx / right-panel.tsx
│   ├── tui.tsx / fork-banner.tsx / prompt-queue.tsx / viewer.tsx
└── __tests__/
    ├── store.test.ts / live-adapters.test.ts / live-source.test.ts
    ├── panels-a.test.tsx / panels-b.test.tsx / jsx-condition.test.ts
    └── test-source.ts        # source test double, not a product simulation
```

**Store/source architecture.** Every visible panel reads the same `TerminalStoreProvider` projection.
`store.ts` owns the sole transport-free `fold` entry point for ordered
`text|spawn|cmd|file|status|plan|issue|fork|resource` envelopes, event-id deduplication, registries,
plan/issues/files/resources, and session-local queue/filter/viewer state. `source.ts` defines the
control/status seam; `LiveSessionSource` is the only production implementation. It retains real
adapted envelopes in `ReplayBuffer` before projection, pauses folding without stopping SSE, scrubs
recorded prefixes through reset/refold, and resumes at the retained live tail.

**Live adapters and transport.** `index.tsx` selects an explicit `?session=…` target, otherwise the
most-recent unarchived root; the first prompt creates a session when none exists. It binds
`LiveSessionSource` to the existing `useServerSDK().event` wrapper and canonical
`useServerSync().session.data`, never opens a second event stream. Initial attach hydrates the selected
session tree, messages/parts, diffs, todos, questions, and statuses before directory subscription;
`server.connected` triggers a forced canonical resnapshot. `live/adapters.ts` maps grounded SDK event
shapes into the terminal vocabulary, gates fork UI to exactly one single-select, non-custom question
with at least two options, synthesizes issue lifecycles from failed commands/session errors with exact
command-success pairing, and derives resource values from real assistant metadata. Fork replies use
`client.question.reply`; prompts and structured `<user_edit>` notifications use
`client.session.promptAsync`; file contents use `client.file.read`.

**Route/provider integration.** `/agentic` is registered in both route forks. New layout renders
`AgenticTerminalRoute` under the shell's existing `SelectedServerProviders`; legacy layout uses
`LegacyAgenticTerminalRoute`, which supplies `ServerKey → ServerSDKProvider → ServerSyncProvider` before
rendering the same route. The UI and store are identical in both modes.

**Reachability chrome (web + desktop).** Four surfaces make `/agentic` reachable, all navigating to
`/agentic` and all labelled from i18n (`command.agentic.open` / `sidebar.agentic`, added to `en.ts` and
all 21 locale files):

- **Command palette** — `AgenticCommands` in `app.tsx:528-543` (mounted at `app.tsx:292` inside `SharedProviders`' `CommandProvider`) registers the
  `agentic.open` command in the **View** category.
- **Desktop View menu** — `desktop-menu.ts:148` adds `{ type: "item", label: "Agentic Terminal", command:
  "agentic.open" }` to the View menu (its own separator group).
- **Legacy sidebar rail** — `pages/layout.tsx:2237-2238` passes `agenticLabel` / `onOpenAgentic` into
  `SidebarContent`; `pages/layout/sidebar-shell.tsx:95-105` renders a `terminal` `IconButton` (ghost,
  large) immediately before the settings button when both props are supplied.
- **New-layout (v2) titlebar** — `AgenticNavEntryV2` (`components/titlebar.tsx:739`, mounted at `:492`
  in the v2 `Match` branch among the left-side nav controls) renders the `terminal` icon button
  (added 2026-07-19, SR-v2-titlebar-nav-entry — the original "new-layout" button at `:662-668` is
  actually in the LEGACY titlebar branch and remains as the legacy titlebar entry).
- **Legacy titlebar** — `components/titlebar.tsx:662-668` renders a `terminal` ghost `Button` between
  the forward button and the content region (legacy `Match` branch; shown when projects exist).

**Test infrastructure.** The six colocated files currently contain 48 tests covering the fold,
adapters, source/replay/queue transport, and rendered panels. Two colocated unit tests at the
`packages/app/src/` root cover the reachability chrome's static registration: `app.test.tsx` (View menu
contains the `agentic.open` entry) and the extended `desktop-menu.test.ts` (the `agentic.open` menu entry
is present with no conflicting `action`). `packages/app/e2e/agentic-terminal/`
contains the §12 browser flows, `live-scenarios.spec.ts`, and `chrome-reachability.spec.ts` (3 web-chrome
flows: palette navigation to `/agentic`, direct route render, and legacy sidebar/titlebar nav
visibility). Its `live-fixture.ts` is this repository's
first real-backend Playwright harness: it starts an actual `opencode serve`, connects it to the
deterministic `TestLLMServer`, drives the generated HTTP/SSE surface without app-traffic mocks, and
covers load-before-listen, reconnect resnapshot, fork bypass/reply, issue synthesis, viewer
`user_edit`, session targeting, layout/visual behavior, replay, queueing, and hotkeys.

### 3.6 Server/SDK connection (client side) — see §4.4 for the exact event-stream entry point.

### 3.7 Existing PTY terminal (separate subsystem)

opencode already ships an interactive PTY terminal — reuse it rather than rebuild:

- **`src/components/terminal.tsx`** — `Terminal` component (props `TerminalProps`, `terminal.tsx:23-31`).
  Renders a **ghostty-web** WebGL terminal (`loadGhostty()`, `terminal.tsx:35-44`), themes it from the
  active UI theme, and connects to the server PTY over a **WebSocket** (`new WebSocket(...)`,
  `terminal.tsx:577`). Colors default per light/dark (`terminal.tsx:53-66`).
- **`src/context/terminal.tsx`** — `TerminalProvider`/`useTerminal`, `LocalPTY` type (`terminal.tsx:13-22`),
  persisted per-directory terminal state (max 20 sessions), migration helpers. Listens for `pty.exited`
  events (`terminal.tsx:238`).
- **`src/utils/terminal-websocket-url.ts`** — builds the PTY socket URL:
  `${url}/pty/${id}/connect?directory=…&cursor=…` upgraded to `ws:`/`wss:` (whole file, ~30 lines). The
  socket endpoint is served by the **legacy instance server** at
  `packages/opencode/src/server/routes/instance/httpapi/handlers/pty.ts:163` (the `ptyConnectHandlers`
  group; route in `.../groups/pty.ts:37`) — **not** `packages/server/src/pty-environment.ts`, which is a
  trivial env-provider stub (`get: () => Effect.succeed({})`) on the newer server surface. PTY events
  (`pty.created`, `pty.updated`, `pty.exited`, `pty.deleted`) are in the SDK `Event` union
  (`types.gen.ts:63-66`).
- **`src/pages/session/terminal-panel-v2.tsx`**, `terminal-panel.tsx`, `session/terminal-label.ts` — how
  the session view embeds terminals into panels/tabs.

### 3.8 Component conventions & styling

- SolidJS function components; JSX in `.tsx`; per-component `.css` file next to the `.tsx` when needed;
  Storybook stories as `*.stories.tsx`.
- **Tailwind 4** utility classes are the primary styling method, using **theme tokens as CSS variables**:
  legacy `text-text-base`, `bg-background-base`, `bg-surface-*`; **v2** tokens `bg-v2-background-bg-base`,
  `text-v2-text-text-muted`, `bg-v2-overlay-simple-overlay-hover`, `shadow-[var(--v2-elevation-raised)]`,
  `[font-weight:530]`. New surface: use **v2** tokens (home.tsx is the reference for class idiom).
- Icons: `<Icon name="…"/>` (legacy) / `<IconV2 name="…"/>` (v2), backed by SVG spritesheets in
  `packages/ui/src/components/*-icons/sprite.svg`.
- i18n: `useLanguage().t("key")`; dictionaries in `src/i18n/*.ts` (en is source; `parity.test.ts`
  enforces key parity). Add any user-facing strings to `src/i18n/en.ts`.

### 3.9 Test infrastructure (`packages/app`)

Scripts from `packages/app/package.json`:

| Kind | Command | What it runs |
|---|---|---|
| Unit | `bun run test:unit` | `bun test --only-failures --preload ./happydom.ts ./src` (colocated `*.test.ts` under `src/`, happy-dom). |
| Browser | `bun run test:browser` | `bun test --conditions=browser --preload ./happydom.ts ./test-browser` (specs in `test-browser/`, e.g. `session-lineage.test.ts`). |
| E2E | `bun run test:e2e` | `playwright test` (see `playwright.config.ts`). |
| Perf/stability | `bun run test:stability`, `bun run test:bench` | `e2e/performance/*`. |
| Typecheck | `bun run typecheck` | `tsgo -b`; e2e types via `typecheck:e2e`. |

- **`playwright.config.ts`**: `testDir: ./e2e`, single `chromium` project, 60s test timeout. `webServer`
  runs `bun run dev -- --host 0.0.0.0 --port ${PLAYWRIGHT_PORT ?? 3000}`, baseURL
  `http://127.0.0.1:3000`, and injects `VITE_OPENCODE_SERVER_HOST`/`VITE_OPENCODE_SERVER_PORT`
  (default `127.0.0.1:4096`). The 58 legacy specs remain schema-validated in-browser-mock tests through
  `e2e/utils/mock-server.ts`. The Agentic Terminal slice is deliberately different: its
  `live-fixture.ts` starts a real `opencode serve` on the configured backend port and a deterministic
  external `TestLLMServer`; its browser traffic is not intercepted. This is the repository's first
  real-backend Playwright path, and it runs inside the standard `bun run test:e2e` suite beside the
  legacy specs. `reuseExistingServer` applies to Vite unless CI. HTML report is written to
  `e2e/playwright-report`.
- **`e2e/regression/*.spec.ts`** (~40 specs) is the pattern to copy for new user-flow specs — includes
  `terminal-composer-focus.spec.ts`, `terminal-hidden.spec.ts`, `terminal-tab-switch.spec.ts`,
  `review-terminal-stacked.spec.ts`, plus many `session-timeline-*` specs.
- **`e2e/performance/*`** is a separate perf harness (benchmarks + timeline-stability matrices) with its
  own Playwright configs. Per `packages/app/AGENTS.md`: record a production benchmark baseline before
  changing session/timeline code. **Also per AGENTS.md: NEVER restart the app or the server process.**

---

## 4. DEEP — the session / event-stream subsystem (Phase B wiring target)

This is the real-time spine. Events originate in `packages/core`, are exposed over SSE by
`packages/opencode` (legacy instance server) and `packages/server` (newer api), typed by the generated
SDK in `packages/sdk/js`, and consumed by `packages/app` through an app-side emitter wrapper.

### 4.1 Server event bus (`packages/core`)

- **`packages/core/src/event.ts`** — the primary bus, `EventV2` (Effect PubSub + durable event-sourcing).
  Service tag `@opencode/Event` (`event.ts:150`). Interface (`event.ts:126-148`): `publish` (127),
  `subscribe` (per-type, 132), `all` (unbounded stream of every event, 133), `durable` (replay+live per
  aggregate, 134), `listen` (deprecated callback API, 136). `allBounded(events, capacity)` (152) wraps
  `listen` into a dropping-queue `Stream` — this is what the SSE handler serves.
- **`packages/schema/src/event.ts`** — the event *definition* framework: `define({type, durable?, schema})`
  (`event.ts:42`). `Payload = {id, type, data, durable?, location?, metadata?}` (29). Event IDs branded `evt_…`.
- **`packages/opencode/src/event-v2-bridge.ts`** — mirrors every core event onto a low-level Node
  `GlobalBus` (`packages/opencode/src/bus/global.ts`) as `{id, type, properties}`, attaching a `Location`
  (directory/workspace). This `{type, properties}` reshape is the frame shape the **app consumes**.
- **Emit-site attribution.** The *bus* lives in core, but the v1 session/message events the app renders
  during a prompt run are published from **`packages/opencode/src/session/session.ts`** — `session.created`
  (`:537`), `session.deleted` (`:624`), `message.updated` (`:633`), `message.part.updated` (`:639`),
  `session.updated` (`:748`), `message.removed` (`:859`), `message.part.removed` (`:871`),
  `message.part.delta` (`:886`) — plus `session.status` from `session/status.ts:41-43`. `packages/core`'s
  own `session.ts:242` publishes only the v2-service `session.created`.

### 4.2 Concrete event `type` names + payloads

Event catalogs live in `packages/schema`. The names the **app actually handles** (verified in
`app/src/context/global-sync/event-reducer.ts` and `server-sdk.tsx`):

- Session: `session.created`, `session.updated`, `session.deleted` — payload
  `{ sessionID, info: Session }` (all three carry `sessionID` **and** `info`, not `info` alone —
  `v1/session.ts:571-595`, SDK `types.gen.ts:6182-6207`). `session.diff` — `{ sessionID, diff:
  SnapshotFileDiff[] }` (`v1/session.ts:643-649`). `session.error` — `{ sessionID?, error }`
  (`v1/session.ts:651-657`). `session.status` — `{ sessionID, status }` where `status` is a
  discriminated union `idle | busy | retry`; the `retry` variant carries `{ attempt, message, next,
  action? }` (`packages/schema/src/session-status-event.ts:9-41`). A **deprecated** `session.idle` event
  (`{ sessionID }`) also still fires (`session-status-event.ts:43-49`, `session/status.ts:43`).
- Messages/parts: `message.updated` — `{ sessionID, info: Message }` (carries `sessionID` too, not
  `info` alone — `v1/session.ts:596-603`, `types.gen.ts:6209-6216`); `message.removed` —
  `{ sessionID, messageID }` (`v1/session.ts:604-611`); `message.part.updated` — `{ sessionID, part:
  Part, time }` (three fields incl. `sessionID` and `time`, not `part` alone — `v1/session.ts:612-620`,
  `types.gen.ts:6227-6235`); `message.part.removed` — `{ sessionID, messageID, partID }`
  (`v1/session.ts:621-629`, `types.gen.ts:6237-6245`); `message.part.delta` — `{ sessionID, messageID,
  partID, field, delta }` (also carries `sessionID` — `v1/session.ts:632-641`, `types.gen.ts:6651-6661`)
  — streaming token deltas, coalesced client-side.
- Prompts/questions/permissions: `permission.asked` / `permission.replied` (`v1/permission.ts:61,63`);
  `question.asked` / `question.replied` / `question.rejected`; `todo.updated` — `{ sessionID, todos }`.
- Workspace/infra: `project.updated`, `server.connected`, `global.disposed`, `server.instance.disposed`,
  `lsp.updated`, `reference.updated`, `vcs.branch.updated`, and PTY `pty.created|updated|exited|deleted`.
- A newer **v2 session-event** stream (`packages/schema/src/session-event.ts`) uses `session.next.*` names
  (`session.next.text.delta`, `.tool.called`, `.step.started`, `.reasoning.delta`, `.compaction.*`, etc.,
  all durable, aggregate = `sessionID`). These back the newer timeline transport; the app's `Event` union
  (from `@opencode-ai/sdk/v2/client`) is the authoritative list of what the app can receive.

### 4.3 Session & message/part data model

- **Session service**: `packages/core/src/session.ts` — `@opencode/v2/Session` (182). `create` (208),
  `get` (263), `list` (268), `messages` (304), `events` (per-session durable stream, 346), `prompt` (360).
  Store/projector in `packages/core/src/session/*`.
- **v1 model** (`packages/schema/src/v1/session.ts`): `Message = Union([User, Assistant])` by `role`
  (union at `:490`). `Part = Union([...])` by `type` (`:357-383`): `text`, `reasoning`, `file`, `tool`,
  `step-start`, `step-finish`, `snapshot`, `patch`, `agent`, `subtask`, `retry`, `compaction`.
- **SDK-facing types** (what the app imports): `Message`, `Part`, `Session`, `Event`, `SessionStatus`,
  `PermissionRequest`, `QuestionRequest`, `Todo`, `SnapshotFileDiff` from `@opencode-ai/sdk/v2/client`
  — generated in `packages/sdk/js/src/v2/gen/types.gen.ts` (`Event` union at `:7`; `Message` at `:376`;
  `Part` at `:627`).

### 4.4 How the app subscribes today — EXACT ENTRY POINT

**`packages/app/src/context/server-sdk.tsx`** is the single owner of the live stream.

1. **`createServerSdkContextBase` (server-sdk.tsx:79)** creates two SDK clients via `createSdkForServer`
   (`src/utils/server.ts` → `createOpencodeClient` from `@opencode-ai/sdk/v2/client`): `eventSdk` (for the
   stream) and `sdk` (for requests).
2. **`start()` (server-sdk.tsx:161-230)** is the SSE consume loop. It calls
   **`eventSdk.global.event({ signal, onSseError })` (server-sdk.tsx:177)** — the SDK method for
   `GET /global/event` — and iterates **`for await (const event of events.stream)` (server-sdk.tsx:192)**.
   Each frame is `{ directory, payload }`; frames with `payload.type === "sync"` are skipped
   (server-sdk.tsx:195); the rest are enqueued (with coalescing of `message.part.delta` and
   `message.part.updated`) and flushed on a ~16ms frame into a directory-keyed emitter via
   **`emitter.emit(event.directory, event.payload)` (server-sdk.tsx:127)**. Includes a 15s heartbeat
   watchdog + 250ms reconnect backoff + `pagehide`/`pageshow`/`visibilitychange` handling.
3. **Public API (server-sdk.tsx:267-271)**: `event = { on: emitter.on, listen: emitter.listen, start }`.
   `on(directory, cb)` / `listen(cb)` receive `(name=directory, details=payload)`.
4. **`createDirSdkContext` (server-sdk.tsx:315-340)** re-fans events into a **per-`type`** emitter
   (`SDKEventMap = { [type]: Extract<Event,{type}> }`) so consumers can do `sdk().event.on("pty.exited", cb)`.

**Who starts & consumes it:**
- **`server-sync.tsx:374`** — `serverSDK.event.listen((e) => …)` is the main reducer subscription: it
  routes `e.details` (the payload) to `session.apply`, `applyGlobalEvent`, or `applyDirectoryEvent`.
- **`server-sync.tsx:443-458`** — `onMount` schedules **`serverSDK.event.start()`** (server-sync.tsx:449/455) — the stream is not started until a `ServerSync` mounts.
- Other subscribers: `context/file.tsx:217`, `context/notification.tsx:387`, `context/permission.tsx:322`,
  `context/terminal.tsx:238`, `pages/session.tsx:944`, `pages/layout.tsx:389`,
  `pages/session/usage-exceeded-dialogs.tsx:54`.

**For Phase B**, the Agentic Terminal wires into the real stream by consuming the same
`useServerSDK().event` (directory-keyed) or `useSDK().event` (type-keyed) emitters, and/or reading the
reactive stores produced by `useServerSync()` / `useSync()` — no new transport is needed; the transport
already exists in `server-sdk.tsx`.

### 4.5 Event → store reducer (client)

There are **two** folds; know which is canonical for your surface.

- **`packages/app/src/context/server-session.ts` — `createServerSession().apply()` (`:739-1046`)** is the
  canonical fold for **session content** (message / part / status / permission / question / todo / diff).
  It is called for *every* event at **`server-sync.tsx:380`** (`session.apply(event)`) and writes into the
  shared, server-wide server-session store. **This is the reference for a transcript-rendering surface** —
  including the load-before-listen contract (§10 note 9).
- **`packages/app/src/context/global-sync/event-reducer.ts`** — `applyDirectoryEvent` (`:108`) is a big
  `switch(event.type)` over the per-directory child store (binary-search inserts, `message.part.delta`
  accumulation at `:297-321`, etc.), **but its session-content branches are dead in production**: the sole
  runtime caller passes `sessionContent: false` (`server-sync.tsx:419`) and the guard at
  `event-reducer.ts:123` early-returns for every name in `SESSION_CONTENT_EVENTS` (`:20-34`). The reducer
  is canonical **only** for session-list / vcs / lsp / reference / `server.instance.disposed` events;
  `applyGlobalEvent` (`:36`) handles `project.updated` / `server.connected` / `global.disposed` (`:42-45`).
  Its store shape (`State`) still parallels `session-ui`'s `Data` type (§5.2).

### 4.6 SSE endpoints (server) & SDK generation

- **`GET /global/event`** — what the app consumes (`eventSdk.global.event()`). Streams directory-tagged
  `{ directory, payload:{ id,type,properties } }` frames (opencode instance server; handler
  `packages/opencode/src/server/routes/instance/httpapi/handlers/global.ts`). `server.connected` is
  **always the first frame** (`global.ts:49`); a `server.heartbeat` frame is emitted **every 10 s**
  (`global.ts:43-46`). Frames also carry optional `project`/`workspace` fields (`types.gen.ts:730-734`);
  `server.connected`/`server.heartbeat` omit `directory`, so the app's `?? "global"` default
  (`server-sdk.tsx:196`) is what keeps them routable.
- **`GET /event`** — legacy instance route, single-directory `{id,type,properties}`, location-filtered.
  `packages/opencode/src/server/routes/instance/httpapi/handlers/event.ts`, path in `.../groups/event.ts:8`.
- **`GET /api/event`** — newer `packages/server` route, `{id,type,data}` frames.
  `packages/server/src/handlers/event.ts` (`event.subscribe`), path in `packages/protocol/src/groups/event.ts:35`.
- **SDK is generated**, not hand-written: `packages/sdk/js` uses **`@hey-api/openapi-ts`** driven by
  `packages/sdk/js/script/build.ts` (runs `bun dev generate` to emit `openapi.json`, then codegen into
  `src/v2/gen/`). `types.gen.ts` / `serverSentEvents.gen.ts` carry the auto-generated banner. The SSE
  parser is `packages/sdk/js/src/v2/gen/core/serverSentEvents.gen.ts` (fetch streaming + hand-rolled SSE
  frame parse, reconnect/backoff) — **not** `EventSource`, **not** WebSocket. **`Last-Event-ID` resume is
  inert on `/global/event`**: the route emits `id: undefined` frames (`global.ts:16-23`), so a dropped
  connection loses events and recovery is a full **resnapshot** — the reconnected stream re-sends
  `server.connected`, which triggers re-bootstrap (`event-reducer.ts:42-45`, `server-sync.tsx:396-402`).
  Reconnect is **two nested loops**: the SDK's inner retry (3 s→exp→30 s) plus the app's outer 250 ms
  reconnect + 15 s heartbeat watchdog (`server-sdk.tsx`), against the server's 10 s heartbeat.

---

## 5. DEEP — reusable UI libraries

### 5.1 `packages/ui` (`@opencode-ai/ui`) — design system

Exports (per `package.json` `exports`): components at `@opencode-ai/ui/<name>` (legacy) and
`@opencode-ai/ui/v2/<name>-v2` (redesign), plus `./context`, `./context/*`, `./theme`, `./theme/*`,
`./hooks`, `./i18n/*`, `./storybook/*`, fonts, audio, styles.

- **Legacy components** (`src/components/*.tsx`): `Accordion`, `AnimatedNumber`, `AppIcon`, `Avatar`,
  `Button`, `Card`, `Checkbox`, `Collapsible`, `ContextMenu`, `Dialog`, `DiffChanges`, `DockSurface`,
  `DropdownMenu`, `Favicon`, `FileIcon`, `Font`, `HoverCard`, `IconButton`, `Icon`, `ImagePreview`,
  `InlineInput`, `Keybind`, `List`, `Logo`/`Splash`, `Popover`, `Progress`, `ProgressCircle`,
  `ProviderIcon`, `RadioGroup`, `ResizeHandle`, `ScrollView`, `Select`, `Spinner`, `StickyAccordionHeader`,
  `Switch`, `Tabs`, `Tag`, `TextField`, `TextReveal`, `TextShimmer`, `Tooltip`, `Typewriter`. Kobalte-backed.
- **v2 components** (`src/v2/components/*-v2.tsx`): `AccordionV2`, `AvatarV2`, `BadgeV2`, `ButtonV2`,
  `CheckboxV2`, `DialogV2`, `DiffChangesV2`, `DividerV2`, `FieldV2`, `FileTreeV2`, `IconButtonV2`, `Icon`
  (v2), `InlineInputV2`, `KeybindV2`, `LineCommentV2`, `LoaderV2`, `MenuV2`, `ProgressCircleV2`,
  `ProjectAvatar`, `RadioV2`, `SegmentedControlV2`, `SelectV2`, … (use these on the new surface).
- **Theme**: `src/theme/` — `color.ts` (`withAlpha`), `context.tsx` (`ThemeProvider`/`useTheme`),
  `resolve.ts` + `v2/resolve.ts` (`resolveThemeVariant` / `resolveThemeVariantV2`), `types.ts`
  (`HexColor`, `ResolvedV2Theme`), `themes/` (JSON theme files), `default-themes.ts`,
  `desktop-theme.schema.json`. Terminal color extraction reads v2 tokens via `resolveV2Token`
  (`app/src/components/terminal.tsx:73-84`).
- **Context**: `src/context/` — `dialog.tsx` (`DialogProvider`/`useDialog`), `marked.tsx`
  (`MarkedProvider`/`useMarked`), `file.tsx` (`FileComponentProvider`), `i18n.tsx` (`I18nProvider`),
  `worker-pool.tsx`, plus `createSimpleContext` factory in `context/helper.tsx`.
- Assets: icon spritesheets, fonts, alert/notification audio (`src/assets/audio/*`).

### 5.2 `packages/session-ui` (`@opencode-ai/session-ui`) — message/diff/timeline rendering

Exports components at `@opencode-ai/session-ui/<name>`, `./context`, `./pierre/*`, `./markdown-*`, `./v2/*`.

- **Message rendering**: `message-part.tsx` (renders a `Part`), `message-part-text.ts`, `message-file.ts`,
  `message-nav.tsx`, `session-turn.tsx`, `basic-tool.tsx`, `tool-status-title.tsx`, `tool-error-card.tsx`,
  `tool-count-summary.tsx` / `tool-count-label.tsx`, `shell-submessage.css`, `session-retry.tsx`.
- **Markdown pipeline** (streaming, shiki-highlighted, off-thread): `markdown.tsx`, `markdown-stream.ts`,
  `markdown-cache.tsx` (`preloadMarkdown` — used by home prefetch), `markdown-worker*.ts` +
  `markdown-shiki.worker.ts` (a web-worker markdown/highlight queue with a typed protocol).
- **Diffs / review**: `session-diff.ts`, `session-review.tsx`, `file.tsx`/`file-media.tsx`/`file-search.tsx`,
  `line-comment*.tsx`, `apply-patch-file.ts`, plus the `src/pierre/*` layer (virtualized diff rendering
  over `@pierre/diffs`: `virtualizer.ts`, `diff-selection.ts`, `file-runtime.ts`, `worker.ts`).
- **v2 set** (`src/v2/components/*-v2.tsx`): `AttachmentCardV2`, `BasicToolV2`, `CommentCardV2`,
  `SessionFilePanelV2`, `SessionProgressIndicatorV2`, `SessionReviewV2`, `SessionReviewFilePreviewV2`,
  `ToolErrorCardV2`, `LineCommentAnnotationsV2`.
- **Data context** — `src/context/data.tsx` (`export * from` at `context/index.ts`): `createSimpleContext`
  named `"Data"` exposing `{ store, directory, navigateToSession, sessionHref }`. The **`Data` type
  (data.tsx:13-38)** is the shape a session UI consumes: `session: Session[]`, `session_status`,
  `session_diff` (+ preload), `message: {[sessionID]: Message[]}`, `part: {[messageID]: Part[]}`,
  `part_text_accum_delta`, `provider`, `agent`. Also exports `NormalizedProviderListResponse`. A prototype
  Agentic Terminal can satisfy `DataProvider` with a simulated `Data` store in Phase A, then swap to the
  live `useSync()`/`useServerSync()` stores in Phase B — the shapes match `global-sync/types.ts`'s `State`.

---

## 6. DEEP — palette source of record (`packages/tui/src/theme/assets/opencode.json`)

This JSON is the canonical opencode color palette. It has a `defs` block (raw hex) and a `theme` block
(semantic role → def, per light/dark). **Verified hex values in `defs`:**

Dark ramp: `darkStep1 #0a0a0a`, `darkStep2 #141414`, `darkStep3 #1e1e1e`, `darkStep4 #282828`,
`darkStep5 #323232`, `darkStep6 #3c3c3c`, `darkStep7 #484848`, `darkStep8 #606060`,
**`darkStep9 #fab283`** (the signature opencode orange — primary in dark), **`darkStep10 #ffc09f`**,
`darkStep11 #808080`, `darkStep12 #eeeeee`. Dark accents: `darkSecondary #5c9cf5`, `darkAccent #9d7cd8`,
`darkRed #e06c75`, `darkOrange #f5a742`, `darkGreen #7fd88f`, `darkCyan #56b6c2`, `darkYellow #e5c07b`.

Light ramp: `lightStep1 #ffffff` … `lightStep9 #3b7dd8` (primary light is blue), `lightStep10 #2968c3`,
`lightStep12 #1a1a1a`. Light accents: `lightSecondary #7b5bb6`, `lightAccent #d68c27`, `lightRed #d1383d`,
`lightOrange #d68c27`, `lightGreen #3d9a57`, `lightCyan #318795`, `lightYellow #b0851f`.

Semantic roles (`theme` block): `primary` = Step9 (dark `#fab283`, light `#3b7dd8`), `secondary`,
`accent`, `error`=red, `warning`=orange, `success`=green, `info`=cyan, `text` = Step12,
`textMuted` = Step11, `background` = Step1, `backgroundPanel` = Step2, `backgroundElement` = Step3,
`border` = Step7, `borderActive` = Step8, `borderSubtle` = Step6. Plus explicit `diff*`, `markdown*`, and
`syntax*` token groups (some with literal hex, e.g. `diffAdded` dark `#4fd6be`).

**Confirmed:** `#fab283` appears as `darkStep9` and is the dark-mode primary; `#ffc09f` is `darkStep10`.
For the web surface, these map through `packages/ui/src/theme` into the CSS variables the app uses; the
`packages/tui` JSON is the authoritative palette, but the app applies color via `@opencode-ai/ui/theme`
tokens (legacy `--text-*`/`--background-*`, v2 `--v2-*`), not by importing this JSON directly.

---

## 7. MEDIUM — supporting packages

- **`packages/desktop`** (`@opencode-ai/desktop`, Electron + electron-vite). `main: out/main/index.js`.
  Three-process layout: `src/main/*` (Electron main: window registry, server sidecar spawn in
  `main/server.ts` + `main/sidecar.ts`, store, updater, menu, IPC), `src/preload/*` (context bridge),
  `src/renderer/*` (the SolidJS renderer that **imports and mounts `AppInterface`/`AppBaseProviders` from
  `@opencode-ai/app`** at `renderer/index.tsx:412-425`, supplying an Electron `Platform`). Dev:
  `bun --cwd packages/desktop dev` (electron-vite). Packaged with electron-builder.
- **`packages/core`** (`@opencode-ai/core`, Effect). The service layer: `src/session.ts`, `src/event.ts`
  (EventV2 bus), `src/agent.ts`, `src/aisdk.ts`, `src/config*`, `src/git.ts`, `src/file*.ts`,
  `src/permission*`, `src/tool*`, `src/database/`, `src/event/` (SQLite event store),
  `src/session/` (store/projector). Everything is an Effect service with a `Layer`.
- **`packages/server`** (`@opencode-ai/server`, Hono + Effect). The newer HTTP surface: `src/api.ts`,
  `src/handlers.ts` + `src/handlers/*` (incl. `handlers/event.ts` SSE), `src/routes.ts`, `src/middleware/`,
  `src/auth.ts`, `src/cors.ts`, `src/pty-environment.ts` (PTY sockets). Distinct from the legacy instance
  server inside `packages/opencode/src/server/`.
- **`packages/sdk-next`** (`@opencode-ai/sdk-next`, private). Thin facade re-exporting the Effect client
  from `@opencode-ai/client/effect` (`OpenCode`, `Tool`, `ClientError`, schema datatypes, `OpenCodeEvent`).
  Depends on `client`, `core`, `server`, `effect`. Not consumed by the app.

---

## 8. One-line inventory (everything else)

- **`packages/opencode`** (`opencode`) — CLI entry (`bun dev`) + legacy instance HTTP server; hosts
  `/event`, `/global/event`, `/pty/*` routes and the `EventV2Bridge`.
- **`packages/client`** (`@opencode-ai/client`, private) — Effect-native generated client (`src/generated`,
  `src/generated-effect`) via `@opencode-ai/httpapi-codegen`; exports `OpenCodeEvent`.
- **`packages/schema`** (`@opencode-ai/schema`) — Effect Schema definitions for events, Message/Part/Session.
- **`packages/protocol`** (`@opencode-ai/protocol`) — Effect HttpApi route/stream contract (SSE `OpenCodeEvent`).
- **`packages/httpapi-codegen`** — codegen tool for `packages/client`.
- **`packages/plugin`** (`@opencode-ai/plugin`) — public plugin API types (`workspace:*` dep of root).
- **`packages/cli`** (`@opencode-ai/cli`) — CLI helper package.
- **`packages/llm`** (`@opencode-ai/llm`) — LLM provider integration.
- **`packages/codemode`** (`@opencode-ai/codemode`) — confined code execution over schema-described tools.
- **`packages/storybook`** (`@opencode-ai/storybook`) — Storybook host (`bun dev:storybook`) for ui/session-ui.
- **`packages/web`** (`@opencode-ai/web`) — Astro marketing/docs site.
- **`packages/console`** / **`packages/stats`** — Astro/Solid sub-apps (`console/app`, `stats/app`).
- **`packages/slack`** (`@opencode-ai/slack`) — Slack integration.
- **`packages/enterprise`**, **`packages/function`**, **`packages/identity`**, **`packages/containers`** — enterprise, serverless, identity, container defs.
- **`packages/effect-drizzle-sqlite`**, **`packages/effect-sqlite-node`** — Effect SQLite adapters.
- **`packages/http-recorder`** (`@opencode-ai/http-recorder`) — record/replay Effect HTTP for deterministic tests.
- **`packages/script`** (`@opencode-ai/script`) — repo build/util scripts.
- **`packages/docs`** — docs content (no package.json).

---

## 9. How to build & test

All commands from repo-real scripts. Bun is required (`bun@1.3.14`).

```bash
# Install (root, installs whole workspace)
bun install

# --- Agentic Terminal dev loop (per packages/app/AGENTS.md) ---
# Backend (real opencode server) from packages/opencode:
bun run --conditions=browser ./src/index.ts serve --port 4096
# App dev server from packages/app (targets backend on :4096):
bun dev -- --port 4444          # then open http://localhost:4444
#   (root shortcut: `bun dev:web`  →  bun --cwd packages/app dev)
#   (desktop: `bun dev:desktop`  →  electron-vite dev)

# --- Tests (run inside packages/app) ---
bun run test:unit       # bun test --only-failures --preload ./happydom.ts ./src
bun run test:browser    # bun test --conditions=browser --preload ./happydom.ts ./test-browser
bun run test:e2e        # playwright test (legacy mocked specs + real-backend Agentic Terminal harness)
bun run test:e2e:ui     # playwright test --ui

# --- Quality gates (root) ---
bun turbo typecheck     # per-package `tsgo -b` / `tsgo --noEmit`
oxlint                  # lint (bun run lint)
```

Playwright env knobs: `PLAYWRIGHT_PORT` (default 3000), `PLAYWRIGHT_SERVER_HOST`/`PLAYWRIGHT_SERVER_PORT`
(default `127.0.0.1:4096`), `CI` (enables retries + forbidOnly). Do **not** restart the app/server
process mid-task (project rule in `packages/app/AGENTS.md`).

---

## 10. Notes & surprises material to the run

1. **Two-layer, two-key event API on the client.** `useServerSDK().event` is **directory-keyed**
   (`on(directory, cb)` / `listen(cb)` → `(name, details)`), while `useSDK().event` is **type-keyed**
   (`on("pty.exited", cb)`). Reducers use the directory-keyed one; targeted feature UIs usually use the
   type-keyed one. The Agentic Terminal deliberately consumes `useServerSDK().event` so one wrapper-owned
   stream feeds canonical ServerSync state and its live projection.
2. **The app consumes `GET /global/event`, not `/event` or `/api/event`.** Frames are
   `{ directory, payload:{id,type,properties} }`; the durable `"sync"` companion frames are dropped
   (`server-sdk.tsx:195`) — that is what the "sync skip" is for. This is distinct from the two other SSE
   routes (`/event` single-directory, `/api/event` `{id,type,data}`). There is **no `Last-Event-ID`
   resume** (frames carry `id: undefined`); a dropped stream recovers by **resnapshot** on the next
   `server.connected` (§4.6). Wire against the same `event.start()`/`event.listen()` wrapper the app
   already owns rather than opening a second stream.
3. **The stream is lazily started** — only a mounted `ServerSync` starts the wrapper loop. `/agentic`
   therefore uses the new shell's existing provider pair and supplies its own pair in legacy mode through
   `LegacyAgenticTerminalRoute`; `LiveSessionSource` calls the same idempotent `event.start()` seam and never
   owns or tears down a second stream.
4. **Design-system split (legacy vs v2).** The whole app forks on `settings.general.newLayoutDesigns()`.
   New work should target the **v2** components + `NewLayout` shell + `v2-*` Tailwind tokens (as
   `pages/home.tsx` does). Legacy paths still exist and are the fallback.
5. **The PTY terminal is a separate subsystem.** `components/terminal.tsx` + `context/terminal.tsx`
   provide ghostty-web over `/pty/:id/connect`; Agentic Terminal does not emulate or embed it. It projects
   agent/session events through its own fold while reusing the app's HTTP/SSE client infrastructure.
6. **SDK is generated** from opencode's own OpenAPI (`bun dev generate` → hey-api). Never hand-edit
   `packages/sdk/js/src/v2/gen/*`; the `Event`/`Message`/`Part` types there are authoritative for what the
   app can receive.
7. **The shipped surface reads canonical ServerSync state through a dedicated adapter.** It does not
   mount a simulated `DataProvider`; `liveStoreSnapshot` reads `session`, `message`, `part`,
   `session_status`, `session_diff`, `todo`, and `question` state, then the adapter projects the exact
   terminal envelope vocabulary.
8. **`docs/` did not exist** in this worktree before this file — this map is the first artifact under it.
9. **Load-before-listen is a hard contract and is implemented.** `server-session.ts` drops part/message
   events for unknown sessions/messages outside a page load. `LiveSessionSource.attach()` synchronizes
   and hydrates the selected session tree and canonical companion state before registering its directory
   listener; the real-backend `live-scenarios.spec.ts` proves synced history precedes later streamed text.
10. **Server auth is env-gated and never surfaced in the UI.** When `OPENCODE_SERVER_PASSWORD` is set the
    server enforces HTTP Basic auth or a `?auth_token=` query param
    (`packages/opencode/src/server/auth.ts:18,37`, `.../middleware/authorization.ts:12`); desktop always
    runs secured via a generated sidecar password. Any "connect to a server" UI or test helper must
    tolerate it. When unset the server logs "server is unsecured" (`cli/cmd/serve.ts:15-16`).

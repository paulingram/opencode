---
last_routed: 2026-07-19T08:42:22Z
codebase: packages/app (repo-relative; this worktree: C:/Users/Paul/Documents/terminus_maximus/.opencode-worktrees/agentic-terminal-desktop-app)
framework: solidjs-1.9+solid-router (config-based <Route> tree in src/app.tsx)
---

# opencode `packages/app` — Route Map

All paths repo-relative to the worktree root; `app.tsx` line numbers re-verified by reading source on
2026-07-19 (the desktop-chrome reachability change inserted `AgenticCommands`, shifting later anchors).
The entire route tree lives in one file: **`packages/app/src/app.tsx`** — `Routes` at `app.tsx:603-638`,
mounted by `AppInterface` at `app.tsx:544-601`.

**The design-system fork is the single most important structural fact.** Every route's rendering is
forked on `settings.general.newLayoutDesigns()` (`context/settings.tsx`): the router subtree is keyed on
its string value (`app.tsx:575`) so a toggle remounts everything, the router `root` wraps children in
`<NewAppLayout>` only when the flag is on (`app.tsx:584-586`), and the `Routes` component registers
different route sets per mode (`app.tsx:613`, `app.tsx:629`). "new layout" / "legacy layout" below
refers to this flag.

## Route Inventory

The app has **11 route registrations** over **7 distinct path patterns** (`/agentic` and two session
patterns are registered in both layout modes with mode-specific components, plus a pathless layout wrapper).

There is no auth system — Type is `public` for every route; the only gate is server reachability
(see Entry Conditions). API calls are SDK method names on the generated `@opencode-ai/sdk/v2/client`
(see API Endpoint Catalog for call sites and transport).

| Route | Mode | Component | File (defined at) | API calls (beyond shared bootstrap) | Outbound links |
|---|---|---|---|---|---|
| *(pathless layout)* | both | `LegacyServerLayout` | `app.tsx:608-611`, def `168-174` | shared bootstrap set (below); legacy shell: see `pages/layout.tsx` row | — |
| `/` | legacy only | `LegacyHome` | `app.tsx:616`; `pages/home.tsx` | `client.session.update` (`home.tsx:547`, rename); prefetch `ctx.sync.session.sync(id)` (`home.tsx:385-415`) | `/server/:serverKey/session/:id`, `/new-session?draftId=…`, `/:dir` |
| `/server/:serverKey/session/:id` | legacy only | `LegacyTargetSessionRoute` | `app.tsx:617`, def `127-136` | own `ServerSDKProvider`+`ServerSyncProvider` bootstrap for the target server | redirects → `/:dir/session/:id` (`app.tsx:147-151`) |
| `/agentic` (`?session`) | legacy only | `LegacyAgenticTerminalRoute` → `AgenticTerminalRoute` | `app.tsx:200-210,627`; `pages/agentic-terminal/index.tsx` | own `ServerKey → ServerSDKProvider → ServerSyncProvider`; live source call set listed below | updates its own URL to `/agentic?session=ses_…` when first prompt creates a session |
| `/:dir` (layout) | both | `DirectoryLayout` | `app.tsx:621`; `pages/directory-layout.tsx:85-118` | directory-scoped: `SDKProvider` + `DirectoryDataProvider` (`directory-layout.tsx:116-117`) | children below |
| `/:dir/` | both | `Navigate → session` | `app.tsx:622` | — | `/:dir/session` |
| `/:dir/session/:id?` | both (behavior forks) | `SessionRoute` → `SessionPage` | `app.tsx:623`, def `65-99`; `pages/session.tsx:144` | `client.vcs.diff` (`session.tsx:689,737`), `client.project.initGit` (`session.tsx:842`), `client.session.abort` (`session.tsx:1844`), `client.session.promptAsync` (`components/prompt-input/submit.ts:155`) | new mode + `:id` → redirect `/server/…/session/:id` (`app.tsx:73-83`); new mode no-`:id` → draft → `/new-session?draftId` (`app.tsx:87-92`) |
| `/` | new only | `NewHome` | `app.tsx:630`; `pages/home.tsx:264` | same as LegacyHome row | `/server/:serverKey/session/:id`, `/new-session?draftId=…` |
| `/agentic` (`?session`) | new only | `AgenticTerminalRoute` | `app.tsx:631`; `pages/agentic-terminal/index.tsx` | inherits shell `ServerSDKProvider → ServerSyncProvider`; live source call set listed below | updates its own URL to `/agentic?session=ses_…` when first prompt creates a session |
| `/:dir/session/:id` | new only | `NewLayoutLegacySessionRedirect` | `app.tsx:632`, def `640-659` | — (reads `TabsProvider` store) | `/server/:serverKey/session/:id` |
| `/server/:serverKey/session/:id` | new only | `TargetSessionRoute` → `TargetSessionRouteContent` | `app.tsx:633`, def `121-125`; `pages/session.tsx:156` | session view set (same as `SessionRoute` row) on the **target** server's own provider pair (`app.tsx:113-117`) | in-app session/file navigation |
| `/new-session` (`?draftId`, `?prompt`) | both (legacy redirects away) | `DraftRoute` → `ResolvedDraftRoute` → `NewSession` | `app.tsx:635`, def `176-198` + `212-235`; `pages/new-session.tsx` (lazy) | `client.session.promptAsync` on submit (`components/prompt-input/submit.ts:155`) | `/` (draft missing, `app.tsx:185`); legacy mode → `/${base64(dir)}/session` (`app.tsx:190`) |

Note on overlap: in new-layout mode a URL `/:dir/session/:id` is matched by the dedicated redirect route
(`app.tsx:632`); the nested legacy `/:dir/session/:id?` (`app.tsx:623`) also self-redirects when
`newLayoutDesigns()` is on (`app.tsx:73-83`), so either match resolves to
`/server/:serverKey/session/:id`. Both paths were verified in source.

## Dynamic Routes

| Param | Routes | Type / format | Resolution |
|---|---|---|---|
| `:dir` | `/:dir`, `/:dir/session/:id?` | **base64-encoded absolute directory path** (`base64Encode(directory)`, see `app.tsx:190`, `pages/home.tsx:1630`) | decoded in `DirectoryLayout` (`pages/directory-layout.tsx`); scopes `SDKProvider`/`DirectoryDataProvider` |
| `:serverKey` | `/server/:serverKey/session/:id` | **base64-encoded `ServerConnection.Key`**; strictly validated — decode must round-trip or throw (`utils/session-route.ts:13-17`) | `requireServerKey` → matched against `global.servers.list()` (`app.tsx:104-107`); `<Show keyed>` on it owns the server-identity remount (`app.tsx:113`) |
| `:id` | session routes | opencode session ID string (`ses_…`) | resolved from `ServerSync` stores; lineage via `createSessionLineage` (`app.tsx:142-145`) |
| `?draftId` | `/new-session`, read by `SessionRoute` | draft-tab UUID | matched against `TabsProvider` store (`app.tsx:183`) |
| `?prompt` | `/:dir/session` (new mode) | free text | seeds `tabs.newDraft(…, search.prompt)` (`app.tsx:91`) |
| `?session` | `/agentic` (both modes) | opencode session ID (`ses_…`) | resolved from canonical ServerSync info or `client.session.get`; without it, the route selects the most-recent unarchived root; first prompt creates a session and replaces the query value |

URL builders (single source of truth, `utils/session-route.ts`): `sessionHref` (line 5) →
`/server/${base64}/session/${id}`; `legacySessionHref` (line 9) → `/${base64}/session/${id}`;
`draftHref` (`context/tabs.tsx:41`) → `/new-session?draftId=…`; `tabHref` (`context/tabs.tsx:43-44`)
dispatches between them.

## Navigation Web

```
/agentic?session=ses_… --[explicit target resolves via canonical info or client.session.get]--> attached live terminal
/agentic --[no query → newest unarchived root]--> attached live terminal
/agentic --[no sessions + first prompt → client.session.create]--> /agentic?session=ses_…
any (both modes) --[command palette `agentic.open` → navigate("/agentic") (AgenticCommands, app.tsx:528-543, mounted inside SharedProviders' CommandProvider app.tsx:292 — moved 2026-07-19, SR-agentic-commands-context-provider)]--> /agentic
any (legacy shell) --[titlebar terminal icon button (components/titlebar.tsx:662-668; legacy titlebar branch; shown when projects exist)]--> /agentic
any (v2 shell) --[titlebar AgenticNavEntryV2 terminal icon button (components/titlebar.tsx:492, def :739; v2 Match branch, unconditional — added 2026-07-19, SR-v2-titlebar-nav-entry)]--> /agentic
any (legacy shell) --[sidebar rail terminal IconButton (pages/layout/sidebar-shell.tsx:95-104, wired agenticLabel/onOpenAgentic at pages/layout.tsx:2237-2238)]--> /agentic
any (desktop) --[View menu "Agentic Terminal" (desktop-menu.ts:148) → command.trigger("agentic.open"): macOS native menu (desktop/src/main/menu.ts:45-48 → renderer/index.tsx:366) or in-app Windows/Linux menu (components/windows-app-menu.tsx:28-41)]--> /agentic
/ (NewHome) --[session card click → tabs.addSessionTab+select (home.tsx:529-535) → navigate(tabHref) (tabs.tsx:152-154)]--> /server/:serverKey/session/:id
/ (NewHome) --[new-draft action → tabs.newDraft (home.tsx:494) → navigate(draftHref) (tabs.tsx:221)]--> /new-session?draftId=…
/ (NewHome) --[pending-session resolution → navigate(pending.href) (home.tsx:454)]--> /server/:serverKey/session/:id
/ (LegacyHome) --[project select → navigate(`/${base64(dir)}`) (home.tsx:1630)]--> /:dir
/:dir/ --[<Navigate href="session"> (app.tsx:591)]--> /:dir/session
/:dir/session (new mode, no id) --[createEffect → tabs.newDraft (app.tsx:86-91) → navigate (tabs.tsx:221)]--> /new-session?draftId=…
/:dir/session/:id (new mode) --[NewLayoutLegacySessionRedirect (app.tsx:605-624) / SessionRoute self-redirect (app.tsx:72-82)]--> /server/:serverKey/session/:id
/server/:serverKey/session/:id (legacy mode) --[LegacyTargetSessionRedirect navigate(legacySessionHref, replace) (app.tsx:146-150)]--> /:dir/session/:id
/new-session --[draft tab not found → <Navigate href="/"> (app.tsx:184)]--> /
/new-session (legacy mode) --[<Navigate href=`/${base64(dir)}/session`> (app.tsx:189)]--> /:dir/session
/new-session --[prompt submit → client.session.promptAsync (submit.ts:155) → session tab select]--> /server/:serverKey/session/:id
any --[tab close / server removed → navigate("/") (tabs.tsx:172,298,344,372,375)]--> /
legacy shell --[project/worktree actions → navigate(`/${base64(dir)}…`) (pages/layout.tsx:1199,1209,1245,1250,1329,1384,1432,1540,1859,2111; href builds :437,:1504)]--> /:dir
```

## Entry Conditions

- **Every route** sits behind `ConnectionGate` (`app.tsx:574`, def `400-469`): a blocking startup
  health check (`useCheckServerHealth`, 10s timeout, `app.tsx:408-425`). Failure renders
  `ConnectionError` **in place** (no route change) with auto-retry every 1s and a server-switch list
  (`app.tsx:471-516`); while checking, a full-screen `Splash` overlay (`app.tsx:462-466`).
  **Qualifier — the gate is inert on web (fleet-confirmed, INTEGRATION_MAP #11):** the web entry
  passes `disableHealthCheck` (`entry.tsx:175`), which short-circuits the health-check resource to
  `true` (`app.tsx:408-410`), so the blocking check + `ConnectionError` screen apply in practice to
  the desktop (sidecar) entry only; web/dev/Playwright sessions never see them.
- **Mode-gated registration**: `/` + `/server/:serverKey/session/:id` (legacy versions) exist only when
  `!newLayoutDesigns()` (`app.tsx:613-620`); `NewHome` / new `/agentic` / redirect / `TargetSessionRoute`
  only when it's on (`app.tsx:629-634`); legacy `/agentic` in its own `Show` (`app.tsx:626-628`).
  Toggling remounts the entire router (keyed `Show`, `app.tsx:575`).
- **`/server/:serverKey/...`**: `requireServerKey` throws on a malformed key (`utils/session-route.ts:13-17`)
  → caught by the `AppBaseProviders` `ErrorBoundary` → `ErrorPage` (`app.tsx:377-381`). An unknown-but-valid
  key yields an undefined connection memo (`app.tsx:104-107`) — providers get `server=undefined`.
- **`/new-session`**: requires `tabs.ready()` and a draft tab matching `?draftId`, else `Navigate → /`
  (`app.tsx:181-186`); requires new layout, else redirected to the legacy composer (`app.tsx:188-191`).
- **Server-scoped routes** are additionally gated on a non-null selected `server.key` by `ServerKey`
  (`app.tsx:518-525`) inside `SelectedServerProviders` (`app.tsx:158-166`).

## Provider Nesting (what a route gets for free — and the event-stream consequence)

Outer shell for all routes (`entry.tsx:167-181` web / `desktop/src/renderer/index.tsx:412-425`):

```
PlatformProvider → AppBaseProviders (MetaProvider → Font → ThemeProvider → LanguageProvider →
  ErrorBoundary → QueryProvider → WslServersProvider → DialogProvider → MarkedProvider →
  FileComponentProvider)                                          app.tsx:366-398
→ AppInterface: ServerProvider → GlobalProvider → SettingsProvider → ConnectionGate
  → Router root: TabsProvider → PermissionProvider → NotificationProvider
    → ServerShell (QueryProvider → SharedProviders: CommandProvider [DesktopCommands + AgenticCommands, app.tsx:291-292] + HighlightsProvider)  app.tsx:566-595
```

Then per mode:

- **New layout `/agentic`**: router root wraps the route in
  `NewAppLayout = SelectedServerProviders (ServerKey → ServerSDKProvider → ServerSyncProvider) →
  ServerScopedProviders (LayoutProvider → ModelsProvider) → NewLayout`; `AgenticTerminalRoute` consumes
  `useServerSDK` and `useServerSync` from that inherited stack.
- **Legacy layout `/agentic`**: the root is otherwise bare, so `LegacyAgenticTerminalRoute` explicitly
  mounts `ServerKey → ServerSDKProvider → ServerSyncProvider → AgenticTerminalRoute`. This is the same
  event/store nesting used by the new route, without directory-only UI providers.
- **Other new-layout routes** inherit the same shell stack. Other legacy routes get providers only when
  nested under the pathless `LegacyServerLayout` route.
- **`/new-session`** (both modes) remains outside both shells and mounts its **own**
  `ServerSDKProvider → ServerSyncProvider → ModelsProvider → SDKProvider → DirectoryDataProvider →
  DraftProviders(FileProvider → PromptProvider → CommentsProvider)` bound to the draft's server.
- **Session routes** additionally layer directory-scoped providers: `DirectoryLayout` mounts
  `SDKProvider → DirectoryDataProvider` (`pages/directory-layout.tsx:116-117`); the session page itself
  adds `FileProvider`, `PromptProvider`, `CommentsProvider`, `TerminalProvider` (see `pages/session.tsx`).

**Agentic Terminal stream consequence.** The SSE loop remains wrapper-owned and lazily started by the
mounted `ServerSyncProvider`; `/agentic` does not create a raw EventSource. In new layout it inherits the
shell pair. In legacy layout its dedicated wrapper supplies the same pair. `LiveSessionSource` then:

1. queries or fetches the target session and hydrates its child tree plus canonical messages, parts,
   diffs, todos, questions, and statuses before listening;
2. subscribes to `useServerSDK().event.on(directory, …)` and the wrapper's `global` key, calls the
   idempotent `event.start()`, and force-resnapshots on `server.connected`;
3. retains adapted real envelopes for pause/replay while the underlying shared stream stays connected.

## Modal & Drawer Routes

**URL-bound: none.** No route or search param opens a modal; `?draftId`/`?prompt` select content, not
overlays.

**State-bound** (all rendered via `DialogProvider` from `@opencode-ai/ui/context/dialog`, mounted at
`app.tsx:372`, or local state):

| Trigger | Overlay | Where |
|---|---|---|
| `sdk().event.on("session.status")` usage-limit statuses | usage-exceeded dialogs | `pages/session/usage-exceeded-dialogs.tsx:54` |
| `permission.asked` events | permission prompt UI | `context/permission.tsx:322` |
| Command palette hotkey / commands registered via `CommandProvider` | command palette | `context/command.tsx` (`CommandProvider` mounted `app.tsx:290`; `DesktopCommands` `app.tsx:298-319`; `AgenticCommands` registers `agentic.open` → `/agentic`, `app.tsx:527-542`) |
| Titlebar/help buttons in new shell | `TabsInfoPopup`, `HelpButton` popover | `pages/layout-new.tsx:40-41` |
| File viewer/panels inside session view | side panels, review panel, terminal panel (layout state, not URL) | `pages/session/*` (`review-panel-v2.tsx`, `terminal-panel-v2.tsx`) |

## API Endpoint Catalog

Transport facts (verified in `docs/CODEBASE_MAP.md` §4 and re-checked at the cited lines): all request
methods are generated hey-api SDK calls (`@opencode-ai/sdk/v2/client`, generated code in
`packages/sdk/js/src/v2/gen/`); the live stream is **`GET /global/event`** (SSE), consumed exclusively by
`server-sdk.tsx:177` (`eventSdk.global.event()`) and fanned out via `event.on/listen`; frames are
`{directory, payload:{id,type,properties}}`, `payload.type === "sync"` dropped (`server-sdk.tsx:195`).
The interactive terminal uses a WebSocket `"${url}/pty/${id}/connect?directory=…&cursor=…"`
(`utils/terminal-websocket-url.ts`, used by `components/terminal.tsx:577`).

**Shared bootstrap set** — fired by every mounted `ServerSyncProvider` (i.e., every route in new mode;
legacy-shell routes; `/new-session`'s own pair). From `context/global-sync/bootstrap.ts`:
`sdk.project.list` (:96), `sdk.session.get` (:172), `sdk.provider.list` (:184), `sdk.app.agents` (:190),
`sdk.path.get` (:196), `sdk.config.get` (:246), `sdk.session.status` (:249), `sdk.project.current`
(:276), `sdk.vcs.get` (:285), `sdk.command.list` (:291), `sdk.permission.list` (:295),
`sdk.question.list` (:326). From `context/server-sync.tsx`: `client.session.list` (:285),
`client.global.config` (:471), `sdk.mcp.status` (:65), `sdk.lsp.status` (:78), `sdk.mcp.connect`/
`sdk.mcp.disconnect` (:509/:512). Plus SSE start at `server-sync.tsx:449/455`.

**Per-route calls:**

| SDK call | Call site | Purpose / consumption |
|---|---|---|
| `client.session.list({ roots:true })` | `pages/agentic-terminal/index.tsx:70-75` | choose the most-recent unarchived root when `?session` is absent |
| `client.session.get` / `children` | `pages/agentic-terminal/index.tsx:77-87,103-120` | resolve explicit targets and hydrate the attached session tree before listening |
| `client.session.status` / ServerSync `session.sync|diff|todo` | `pages/agentic-terminal/index.tsx:116-129,162-165` | canonical attach/resnapshot state and idle-boundary confirmation |
| `client.question.list` / `reply` | `pages/agentic-terminal/index.tsx:121-129,149-154` | rebuild pending forks and answer the gated held request |
| `client.session.promptAsync` / `create` | `pages/agentic-terminal/index.tsx:155-177` | send serialized prompts and structured viewer edits; create a target on first prompt |
| `client.file.read` | `pages/agentic-terminal/index.tsx:166-169` | hydrate canonical viewer content for registered files |
| `client.session.update` | `pages/home.tsx:547`; `pages/layout.tsx:877,1485` | rename/mutate session metadata; store updated via events |
| `client.session.promptAsync` | `components/prompt-input/submit.ts:155` | submit a prompt (session + draft composers); results stream back over SSE |
| `client.session.abort` | `pages/session.tsx:1844` | stop a running session |
| `client.session.list` | `pages/layout.tsx:1234,1448,1585` | legacy sidebar session lists |
| `client.vcs.diff` | `pages/session.tsx:689,737` | review-panel diffs |
| `client.vcs.status` | `pages/layout.tsx:1526,1594` | branch/dirty indicators (legacy shell) |
| `client.project.initGit` | `pages/session.tsx:842` | init repo action |
| `client.project.update` | `pages/layout.tsx:1296` | project metadata (legacy shell) |
| `client.worktree.list/create/remove/reset` | `pages/layout.tsx:1188,1825,1390,1463` | worktree management (legacy shell) |
| `client.instance.dispose` | `pages/layout.tsx:1459` | dispose a server instance (legacy shell) |

**Event subscriptions** (the read path; two emitter layers per `docs/CODEBASE_MAP.md` §10.1 —
`useServerSDK().event` is directory-keyed, `useSDK().event` is type-keyed):

| Subscriber | Site | Keying |
|---|---|---|
| Agentic Terminal live source | `pages/agentic-terminal/index.tsx:144-148` → `live/live-source.ts` | attached directory plus wrapper `global` key; adapts `session.created|updated|deleted`, `message.updated`, `message.part.updated`, `session.status|idle|error|diff`, `todo.updated`, `question.asked|replied|rejected`, and reconnect `server.connected` |
| main store reducer | `context/server-sync.tsx:374` → `global-sync/event-reducer.ts:36,108` | directory (`listen`) |
| file tree/content | `context/file.tsx:217` | type (`useSDK().event.listen`; `sdk = useSDK()` at `file.tsx:59`) |
| notifications | `context/notification.tsx:387` | directory |
| permission prompts | `context/permission.tsx:322` | directory (handler consumes `e.name` as the directory, `permission.tsx:316-319`) |
| PTY lifecycle (`pty.exited`) | `context/terminal.tsx:238` | type |
| session VCS refresh | `pages/session.tsx:944` | type (`useSDK().event.listen`; `sdk = useSDK()` at `session.tsx:359`) |
| legacy shell refresh | `pages/layout.tsx:389` | directory (`listen`) |
| usage-limit dialogs (`session.status`) | `pages/session/usage-exceeded-dialogs.tsx:54` | type |

## Completeness notes

- Route registrations, redirects, and URL builders above are exhaustive for `packages/app` — the only
  `<Route>` elements in the codebase's mounted router are in `app.tsx:603-638` (`Routes`), and all
  `Navigate`/`navigate(` sites in `app.tsx`, `context/tabs.tsx`, `pages/home.tsx` were enumerated.
  `pages/layout.tsx` (legacy shell, 1800+ lines) and `pages/session.tsx` internals were sampled at the
  cited lines rather than exhaustively traced; their additional in-page navigations stay within the
  routes listed here.
- The shipped Agentic Terminal has two explicit `/agentic` registrations, one per layout mode, and the
  same `AgenticTerminalRoute` surface/provider contract in both. Its optional `?session` selector,
  create-on-first-prompt navigation, SDK calls, and event subscriptions are included above. Companion
  implemented-state visual record: `docs/DESIGN_MAP.md`.
- **Chrome entry points to `/agentic`** (added 2026-07-19, desktop-chrome reachability change): four
  routes in (see Navigation Web) — command palette `agentic.open` (both modes), desktop View menu
  (both modes; native macOS + in-app Windows/Linux menu), the legacy titlebar terminal button, and the
  legacy sidebar-rail terminal button. Note the two pointer-visible chrome buttons exist **only in the
  legacy layout**: the v2 titlebar branch (`titlebar.tsx:252-536`) has no agentic button, and
  `SidebarContent` is consumed only by the legacy shell (`pages/layout.tsx:2222`). In the new layout,
  discoverability is palette/menu/URL only. Covered by
  `packages/app/e2e/agentic-terminal/chrome-reachability.spec.ts`.

---
last_synthesized: 2026-07-16T07:13:08Z
synthesized_from:
  - .architect-team/integration-drafts/explorer-1.md  # boundary contracts (12 boundaries)
  - .architect-team/integration-drafts/explorer-2.md  # end-to-end 10-hop runtime trace + convergence record
  - .architect-team/integration-drafts/explorer-3.md  # dev-stack / test-harness + honest no-mocks recipe
convergence: round-robin round 1 complete 2026-07-16 — all three drafts confirmed mutually consistent; every claim below is source-verified with file:line citations read directly in this worktree
scope: opencode monorepo (worktree agentic-terminal) — every cross-package integration boundary relevant to the Agentic Terminal run
---

# INTEGRATION MAP

Terminology: **"instance server"** = the legacy HTTP server inside `packages/opencode`
(`Server.listen`, `src/server/server.ts`); **"new server"** = `packages/server`. **The app talks to
the instance server exclusively** — it never consumes `packages/server`'s `/api/*` surface. All
paths are repo-relative to the worktree root.

## Boundary index (13)

| # | Boundary | Section |
|---|---|---|
| B1 | app ↔ instance server — SSE `/global/event` (the live spine) | [B1](#b1) |
| B2 | app ↔ instance server — HTTP request path (generated SDK) + bootstrap set | [B2](#b2) |
| B3 | app-internal event fan-out — two-key emitter API and the three stores | [B3](#b3) |
| B4 | instance server ↔ core — EventV2 bus, EventV2Bridge, GlobalBus | [B4](#b4) |
| B5 | schema — the event contract source of truth (exact payload shapes) | [B5](#b5) |
| B6 | SDK codegen boundary (hey-api, with post-gen patches) | [B6](#b6) |
| B7 | app ↔ instance server — PTY WebSocket | [B7](#b7) |
| B8 | desktop ↔ app embedding | [B8](#b8) |
| B9 | app ↔ session-ui / ui contracts | [B9](#b9) |
| B10 | palette carriers — the two `opencode.json` theme files (no build coupling) | [B10](#b10) |
| B11 | dev-environment boundary — bringing the full stack up locally | [B11](#b11) |
| B12 | test-harness boundary — what the e2e suite really does + the honest no-mocks recipe | [B12](#b12) |
| B13 | control-plane relay — remote-workspace event mirroring | [B13](#b13) |

---

## Wiring a new live event-consuming surface (load-bearing contracts)

The six contracts below are binding on ANY surface (Agentic Terminal Phase B included) that renders
live event data. Each is verified at the cited lines; violating any one produces silent data loss,
not errors.

1. **Load-before-listen.** `server-session.apply` DROPS `message.part.updated` for a message not
   already in the store when no page load is in flight (`packages/app/src/context/server-session.ts:849-859`)
   and silently ignores `message.part.delta` for unknown parts (`server-session.ts:950-953`).
   Events alone will never materialize a transcript: the surface must first page messages in via
   `session.sync(sessionID)` (`server-session.ts:692-704`) or `prefetch` (`server-session.ts:706-715`)
   — 20 messages initial / 200 per history page (`server-session.ts:24-25`) — after which the event
   feed keeps it current. Unknown *session infos* DO auto-resolve (`server-session.ts:739-750`); the
   drop is message/part-level only. If the surface renders sessions it did not navigate to, it must
   call `session.sync()` per displayed session or the feed silently stays empty.

2. **The canonical fold is `createServerSession().apply`, NOT `event-reducer.ts`.** All live
   message/part/status/diff/todo/permission/question folding happens in
   `packages/app/src/context/server-session.ts:739-1046` (invoked for every payload at
   `server-sync.tsx:380`), with optimistic-message reconciliation, orphan-part guards, delta
   accumulation, tombstones, and LRU eviction. `event-reducer.ts`'s message/part content branches
   are DEAD in production wiring: the sole non-test caller of `applyDirectoryEvent`
   (`server-sync.tsx:410`, grep-verified) passes `sessionContent: false` (`server-sync.tsx:419`),
   which early-returns every `SESSION_CONTENT_EVENTS` type (`event-reducer.ts:20-34`, skip at
   `:123`). New fold logic must copy `server-session.ts` semantics.

3. **Recovery is resnapshot, not replay.** The server never emits SSE `id:` lines (`eventData`
   hardcodes `id: undefined`, `handlers/global.ts:16-23`), so the generated client's
   `Last-Event-ID` resume machinery is inert on `/global/event` — events missed while disconnected
   are lost. Every (re)connect re-emits `server.connected` as the first frame
   (`handlers/global.ts:49`); the app treats it as "refetch the world"
   (`global-sync/event-reducer.ts:42-45`) plus a re-bootstrap of every active directory store
   (`server-sync.tsx:396-402`, suppressed within 1.5 s of initial boot via `recent`,
   `server-sync.tsx:378`). `start()` is idempotent (`started` flag + generation counter,
   `server-sdk.tsx:161-169`). Consumers must DROP frames with `payload.type === "sync"`
   (`server-sdk.tsx:195`) — these are the durable-event companion frames produced by
   `event-v2-bridge.ts:45-61`, the event-sourcing mirror, not UI data.

4. **The two-key event API.** Directory-keyed: `useServerSDK().event = { on(directory, cb),
   listen(cb), start }` (`server-sdk.tsx:267-271`), callbacks receive `(e.name = directory,
   e.details = payload)`. Type-keyed: `useSDK().event.on("<type>", cb)` via the per-directory
   re-fan `createDirSdkContext` (`server-sdk.tsx:311-340`; context `app/src/context/sdk.tsx:7-17`).
   Subscribe type-keyed for targeted concerns (e.g. `pty.exited`, `session.status`); read the
   reactive stores (B3) for everything else.

5. **Missing `directory` on synthetic frames.** The handler's own `server.connected` and
   `server.heartbeat` frames construct `{payload}` only — NO `directory` field
   (`handlers/global.ts:45,49`) — despite `GlobalEventSchema` declaring it required
   (`groups/global.ts:35-48`); the route is `handleRaw` (unvalidated). The app's
   `event.directory ?? "global"` default (`server-sdk.tsx:196`) is what keeps them routable. Any
   hand-rolled consumer must replicate that default.

6. **Mount under (or replicate) `ServerSyncProvider` — never open a second stream.** The stream
   starts lazily: only a mounted `ServerSyncProvider`'s `onMount` → rAF → `setTimeout(0)` →
   `serverSDK.event.start()` opens it (`server-sync.tsx:443-458`). In new-layout mode, any sibling
   route inside `Routes` already sits under `SelectedServerProviders = ServerKey →
   ServerSDKProvider → ServerSyncProvider` (`app/src/app.tsx:157-165`), so the stream is live for
   free; `ResolvedDraftRoute` (`app.tsx:199-222`) is the template for mounting one's own provider
   pair outside the shells. Read transcript state from `useServerSync().session.data` or the
   `useSync()` proxy (B3).

---

<a id="b1"></a>
## B1. app ↔ instance server — the SSE `/global/event` stream (the live spine)

**Participants.** `packages/app` (consumer; single owner `src/context/server-sdk.tsx`) ↔
`packages/opencode` instance server (producer). NOT `packages/server` — the app never talks to
`/api/event`.

**Transport.** `GET /global/event`, `text/event-stream`, over `fetch` streaming — NOT
`EventSource`, NOT WebSocket. Served by
`packages/opencode/src/server/routes/instance/httpapi/handlers/global.ts:33-66` (`eventResponse`),
registered via `.handleRaw("event", event)` at `handlers/global.ts:150`; path constant
`groups/global.ts:67` (`GlobalPaths.event = "/global/event"`), endpoint schema `:85-93`.
Compression is exempted for `/event` + `/global/event` (`middleware/compression.ts:11,48`).
Response headers disable caching and proxy buffering (`Cache-Control: no-cache, no-transform`,
`X-Accel-Buffering: no`; `handlers/global.ts:57-63`).

**Wire frame shape** (contract: `GlobalEventSchema`, `groups/global.ts:35-48`; generated type
`GlobalEvent`, `packages/sdk/js/src/v2/gen/types.gen.ts:730-734`):

```ts
{ directory: string, project?: string, workspace?: string,
  payload: { id: "evt_…", type: <event type>, properties: <event data> }   // one variant per manifest definition
         | InstanceDisposed
         | { type: "sync", id, syncEvent: { type: "<type>.v<N>", id, seq, aggregateID, data } } }
```

- The payload union is generated from `EventManifest.Latest` (`groups/global.ts:39-47`); the `sync`
  variants exist for every durable definition (`groups/global.ts:16-33`); the sync producer is
  `event-v2-bridge.ts:45-61` (B4).
- **Stream lifecycle:** first frame is always `{payload:{type:"server.connected", properties:{}}}`
  (`handlers/global.ts:49`); then live GlobalBus events verbatim as
  `{directory, payload:{id,type,properties}}`; a `{type:"server.heartbeat"}` frame every **10 s**
  (`handlers/global.ts:43-46`, `Stream.tick("10 seconds")`, first tick dropped). `GlobalBus`
  back-fills a missing `payload.id` with a fresh `evt_` id (`packages/opencode/src/bus/global.ts:14-19`).
- **No SSE ids, ever:** every frame is encoded with `id: undefined` (`handlers/global.ts:16-23`,
  `eventData`) → resnapshot recovery model (Wiring §3).
- **Schema/wire mismatch:** synthetic `server.connected`/`server.heartbeat` frames omit the
  schema-required `directory` (Wiring §5).
- **Auth:** env-gated — with `OPENCODE_SERVER_PASSWORD` set, HTTP Basic (username default
  `"opencode"`); `createSdkForServer` injects the `Authorization` header on every request
  **including the SSE fetch** (`app/src/utils/server.ts:26-38`); unset, the middleware is a
  pass-through (B11). Desktop always sets a generated password (B8).

**Client consume loop** (`packages/app/src/context/server-sdk.tsx`, the single owner):

1. Two SDK clients per server: `eventSdk` (stream; `server-sdk.tsx:94-98`) and `sdk` (requests,
   `throwOnError: true`; `server-sdk.tsx:256-260`), both via `createSdkForServer`
   (`app/src/utils/server.ts:20-41` → `createOpencodeClient` from `@opencode-ai/sdk/v2/client`,
   Basic auth header injected from `ServerConnection` credentials at `server.ts:26-38`).
2. `start()` (`server-sdk.tsx:161-230`): `await eventSdk.global.event({signal, onSseError})`
   (`server-sdk.tsx:177`) → `for await (const event of events.stream)` (`server-sdk.tsx:192`).
3. **`payload.type === "sync"` frames are dropped** (`server-sdk.tsx:195`).
4. Enqueue with tail-coalescing: `lsp.updated` per directory and `message.part.updated` per
   `(directory,messageID,partID)` replace the previous queue tail (`coalescedKey`
   `server-sdk.tsx:20-27`, `enqueueServerEvent` `:29-38`).
5. Flush on a ~16 ms frame (`FLUSH_FRAME_MS`, `server-sdk.tsx:104`; flush loop `:113-131`); at
   flush, consecutive `message.part.delta` events for the same (directory,messageID,partID,field)
   are string-concatenated (`coalesceServerEvents`, `server-sdk.tsx:40-72`); then
   `batch(() => emitter.emit(event.directory, event.payload))` (`server-sdk.tsx:126-128`) into a
   **directory-keyed** `createGlobalEmitter` (`server-sdk.tsx:99-101`).
6. Cooperative yield: the read loop `await wait(0)` every 8 ms (`STREAM_YIELD_MS`,
   `server-sdk.tsx:201-203`).

**Liveness & reconnect — TWO nested retry loops + a watchdog:**

1. *Inner (generated SDK)*: `packages/sdk/js/src/v2/gen/core/serverSentEvents.gen.ts:95-233` —
   infinite `while(true)` reconnect with exponential backoff (default 3 s base
   `sseDefaultRetryDelay` at `:96`, doubling, cap 30 s at `:230`), honors server `retry:` fields,
   re-sends `Last-Event-ID` (`:110-112,170-171`) — a dead capability on this route (no `id:`
   fields). Parse is a hand-rolled `data:/event:/id:/retry:` splitter over `TextDecoderStream`
   (`:135-213`).
2. *Outer (app)*: per-attempt `AbortController`; **15 s heartbeat watchdog** aborts the attempt
   when no frame arrives (`HEARTBEAT_TIMEOUT_MS`, `server-sdk.tsx:145-159` — fed by the server's
   10 s heartbeat); 250 ms reconnect delay (`RECONNECT_DELAY_MS`, `server-sdk.tsx:106,220-221`);
   `pagehide` stops / `pageshow(persisted)` restarts / `visibilitychange` force-aborts a stale
   attempt when the tab becomes visible after >15 s of silence (`server-sdk.tsx:239-248`).

Recovery on reconnect is resnapshot-shaped (Wiring §3); stream start is lazy (Wiring §6).

### The three SSE routes (only one matters to the app)

| Route | Package / handler | Frame | Notes |
|---|---|---|---|
| `GET /global/event` | `packages/opencode` `handlers/global.ts:33-66` | `{directory, payload:{id,type,properties}}` + sync frames | **the app's route** (this section) |
| `GET /event` | `packages/opencode` `handlers/event.ts:25-99` | bare `{id,type,properties}` | location-filtered to one instance directory (`event.ts:36-39`), ends on `server.instance.disposed` (`Stream.takeUntil`, `event.ts:61`), 10 s heartbeat frames; consumed by TUI/legacy clients |
| `GET /api/event` | `packages/server` `handlers/event.ts:20-52` | Effect-Schema-encoded `{id,type,data,durable?,location?}` (`OpenCodeEvent`) | `EventV2.allBounded(events, 256)` (`event.ts:9,33`) — dies on subscriber overflow; comment-line heartbeats every 15 s (`event.ts:37`); contract in `packages/protocol/src/groups/event.ts:29-56` |

`/event` and `/api/event` use `properties` vs `data` respectively — the field name differs by
route. OpenAPI documents all three streams via a hand-patched spec (`public.ts:155-171` maps them
to `Event` / `GlobalEvent` / `V2Event` schemas).

---

<a id="b2"></a>
## B2. app ↔ instance server — HTTP request path (generated SDK) and the bootstrap set

**Mechanism.** All requests go through the generated hey-api client (`OpencodeClient`,
`packages/sdk/js/src/v2/gen/sdk.gen.ts`; `createOpencodeClient` at
`packages/sdk/js/src/v2/client.ts:50-93`). The SDK package exports: `.` (server helpers),
`./client` (legacy v1), `./v2/client`, `./v2/types` (`packages/sdk/js/package.json` `exports`).
App wrapper: `createSdkForServer` (`packages/app/src/utils/server.ts:20-41`) — injects
`Authorization: Basic …` when the connection has a password, and `baseUrl: server.url`.

**Per-server context creation.** `GlobalProvider.ensureServerCtx(conn)` builds one
`{queryClient, sdk, sync, projects}` per server connection inside its own Solid root
(`app/src/context/global.tsx:45-55,96-154`; `createServerSdkContext` at `:110`,
`createServerSyncContext` at `:111`). `useServerSDK`/`useServerSync` are memos resolving the
current connection to that registry (`server-sdk.tsx:294-309`, `server-sync.tsx:540-555`) — so
contexts survive route changes and server switches without re-instantiating.

**Bootstrap calls (fired by every mounted ServerSyncProvider).** Global set
(`global-sync/bootstrap.ts:106-131`): `global.config.get` (:88), `provider.list` (:184),
`path.get` (:196), `project.list` (:96). Per-directory set (`bootstrapDirectory`,
`bootstrap.ts:206-381`): `loadSessions` → `session.list` (via `server-sync.tsx:285`),
`app.agents` (:190), `config.get` (:246), `session.status` (:249), `project.current` (:276),
`path.get` (fallback, :279), `vcs.get` (:285), `command.list` (:291), `v2.reference.list` (:202),
`permission.list` (:295), `question.list` (:326), `mcp.status` (`server-sync.tsx:65`),
`experimental.resource.list` (`server-sync.tsx:71`), `session.get` warm-ups (:172). TanStack Query
keys are `[scope, directory, name]` (`server-sync.tsx:62-99`). Config updates:
`global.config.update` (`server-sync.tsx:471`).

**Session-content fetches** (server-scoped, see B3): `session.get` (`server-session.ts:243`),
`session.messages` with `x-next-cursor` header pagination (`server-session.ts:470-485`),
`session.message` (:487-497), `session.diff` (:1137), `session.todo` (:1148).

**Directory scoping mechanics (the load-bearing contract).** A directory-scoped client is created
with `{directory}` (`server-sdk.tsx:315-319`), which `createOpencodeClient` turns into an
`x-opencode-directory` header (`packages/sdk/js/src/v2/client.ts:63-68`, value
`encodeURIComponent`ed); a request interceptor rewrites that header into a `?directory=` query
param for GET/HEAD requests (`v2/client.ts:18-48`, also emitting `location[directory]` for
`/api/*` paths). Server-side, workspace routing resolves `?directory=` → `x-opencode-directory`
header → `process.cwd()` in that order
(`packages/opencode/src/server/routes/instance/httpapi/middleware/workspace-routing.ts:87`), and
instances are loaded per-request from that directory (`middleware/instance-context.ts:29`; design
note at `src/cli/cmd/serve.ts:10-12`).

**Key route contract (instance server).** `SessionPaths` at
`packages/opencode/src/server/routes/instance/httpapi/groups/session.ts:78-96` —
`POST /session` create (`:203`), `GET /session` list, `GET /session/:id/message` (paged via
`x-next-cursor` response header), `POST /session/:id/prompt_async` (204 fire-and-forget, `:329`),
`POST /session/:id/message` streaming prompt (`:316`), `POST /session/:id/shell` (`:356`),
`POST /session/:id/command` (`:343`), `POST /session/:id/abort` (`:253`),
`POST /session/:id/permissions/:permissionID` (`:395`), `DELETE /session/:id` (`:215`). Health:
`GET /global/health` → `{healthy: true, version}` (`groups/global.ts:66`,
`handlers/global.ts:74-76`).

**Failure semantics.** Response interceptor throws on `text/html` content-type ("Request is not
supported by this version of OpenCode Server", `v2/client.ts:84-90`); errors wrapped by
`error-interceptor.ts`; the app request client is `throwOnError: true` (`server-sdk.tsx:256-260`).

**The prompt write path (why SSE is the only read channel).** `client.session.promptAsync`
(`app/src/components/prompt-input/submit.ts:155`) → `POST /session/:id/prompt_async`
(`groups/session.ts:96,329`) → handler `handlers/session.ts:311-329`: validates the session
(:315), **forks** the prompt run into the server scope fire-and-forget
(`Effect.forkIn(scope, {startImmediately: true})`, :316,:326), returns 204 (:328); a failed run
publishes `session.error` (:320-323). Request/response carries no run output — everything the UI
shows arrives via B1 events.

---

<a id="b3"></a>
## B3. app-internal event fan-out — two-key emitter API and the THREE stores

**Two-key API (both layers wrap the same stream).**

- **Directory-keyed** — `useServerSDK().event = { on(directory, cb), listen(cb), start }`
  (`server-sdk.tsx:267-271`); callbacks get `(e.name = directory, e.details = payload)`. Fed by
  the B1 consume loop; frames with no directory land under `"global"` (`server-sdk.tsx:196`).
- **Type-keyed** — `useSDK()` (directory-scoped context, `app/src/context/sdk.tsx:7-17`) exposes a
  per-type emitter: `createDirSdkContext` subscribes to one directory (`server-sdk.tsx:323`) and
  re-fans the feed into `emitter.emit(event.type, event)` with
  `SDKEventMap = {[type]: Extract<Event,{type}>}` (`server-sdk.tsx:311-340`). Usage:
  `sdk.event.on("pty.exited", cb)`.

**All subscriber sites (grep-verified, exhaustive for `packages/app/src`):**
directory-keyed: `server-sync.tsx:374` (main reducer), `notification.tsx:387`,
`permission.tsx:322` (uses `e.name` as directory, `permission.tsx:316-319`),
`pages/layout.tsx:389`; type-keyed: `file.tsx:217`, `terminal.tsx:238` (`pty.exited`),
`pages/session.tsx:944`, `usage-exceeded-dialogs.tsx:54` (`session.status`); infrastructure:
`server-sdk.tsx:323` (the re-fan).

**THE THREE STORES.** The main reducer subscription (`server-sync.tsx:374-431`) routes each
payload three ways (plus a `homeSessions.apply/refresh` home-index cache update,
`server-sync.tsx:381-384`):

1. **Server-scoped session store** (`session.apply(event)`, `server-sync.tsx:380`): the
   `createServerSession` store (`app/src/context/server-session.ts:138-152`, instantiated
   server-wide at `server-sync.tsx:215`) holds ALL session content — `info`, `session_status`,
   `session_diff`, `todo`, `permission`, `question`, `message` (by sessionID), `part` (by
   messageID), `part_text_accum_delta`. Its `apply()` (`server-session.ts:739-1046`) is the real
   live fold for `message.updated/removed`, `message.part.updated/removed/delta`,
   `session.status/diff`, `todo.updated`, `permission.*`, `question.*` — with optimistic-message
   confirmation, orphan-part guards, delta accumulation into both `part[messageID][i][field]` and
   `part_text_accum_delta[partID]` (`server-session.ts:942-983`), tombstones, in-flight page-load
   interleaving, and LRU eviction. **Session content is NOT per-directory** — this store is
   server-wide.
2. **Per-directory child stores** (`applyDirectoryEvent`, `server-sync.tsx:410-430`) — called with
   **`sessionContent: false`** (`server-sync.tsx:419`), so the reducer's early-return
   (`event-reducer.ts:123`, `SESSION_CONTENT_EVENTS` set at `:20-34`) SKIPS all
   message/part/status/diff/todo/permission/question events there. The per-directory reducer only
   maintains: session-list insert/update/archive/delete (`event-reducer.ts:130-187`),
   `vcs.branch.updated` (:322), `lsp.updated`/`reference.updated` refetch triggers (:403-410),
   `server.instance.disposed` → re-bootstrap push (:126-129).
3. **Global store** (`applyGlobalEvent`, `server-sync.tsx:386-404` → `event-reducer.ts:36-63`):
   `directory === "global"` events only — `project.updated` merge,
   `server.connected`/`global.disposed` → refetch + directory re-bootstrap queue.

**The seam that hides this:** `useSync()` (`app/src/context/sync.tsx:112-117` →
`createDirSyncContext`, `app/src/context/directory-sync.ts:22-153`) exposes `data` as a **Proxy**
(`directory-sync.ts:30-36`) that serves the nine session-content fields (`sessionFields`
`directory-sync.ts:10-20`, incl. `session_working`) from `serverSync.session.data` and everything
else from the per-directory child store. So `useSync().data` looks like one `State`
(`global-sync/types.ts:35-85`) but is two stores stitched together. (`context/sync.tsx` holds only
the `useSync` hook + optimistic helpers; the factory lives in `context/directory-sync.ts`.)

**Load-before-listen** is a hard contract of this boundary — see Wiring §1
(`server-session.ts:849-859`, `:950-953`, `:692-715`, `:739-750`).

**Run-relevance.** Phase B reads transcript state from `useServerSync().session.data` (or a
`useSync()` proxy) and/or subscribes type-keyed via a directory-scoped SDK context; any new fold
logic models on `server-session.ts:739-1046` (Wiring §2).

---

<a id="b4"></a>
## B4. instance server ↔ core — EventV2 bus, EventV2Bridge, GlobalBus (in-process)

**Core bus.** `EventV2` service tag `@opencode/Event` (`packages/core/src/event.ts:150`).
Interface (`event.ts:126-148`): `publish(definition, data, options)` (:127 — durable events get
`{aggregateID, seq, version}` and are persisted to the SQLite event store), `subscribe` (per-type
stream, :132), `all()` (unbounded stream, :133), `durable({aggregateID, after})` (replay + live
per aggregate, :134), deprecated callback `listen` (:136), plus `project` (:137) /
`replay`/`replayAll`/`remove`/`claim`. `allBounded(events, capacity)` (`event.ts:152-164`) wraps
`listen` in a dropping queue that FAILS with `SubscriberOverflowError` on overflow — slow SSE
consumers on `/api/event` get killed, not lagged. `publish` (`event.ts:419-439`) stamps
`id: evt_…`, attaches `location` from the Effect context, and for durable definitions commits to
SQLite (`EventTable`/`EventSequenceTable`, seq-checked, projector hooks) before `notify`
(`:406-417`) pushes to listeners + typed pubsub + all-pubsub.

**Event definition framework.** `packages/schema/src/event.ts`: `define({type, durable?, schema})`
(`event.ts:42-70`) produces an Effect Schema struct that doubles as the runtime definition;
payload envelope `{id: "evt_…", type, data, durable?, location?, metadata?}` (`event.ts:29-40`);
IDs branded `Event.ID` (`event.ts:9-13`). `latest()` picks the highest durable version per type
(`event.ts:76-92`); `versionedType(type, version)` = `"<type>.<version>"` (`event.ts:94-96`).
Catalog: `packages/schema/src/event-manifest.ts` aggregates ~30 modules into `Definitions` /
`ServerDefinitions` / `Latest` (`event-manifest.ts:37-84`).

**Bridge.** `packages/opencode/src/event-v2-bridge.ts` wraps the core service: `publish` attaches
a `Location` (directory/workspace/project) from `InstanceRef` when none given
(`event-v2-bridge.ts:19-33`); a global `listen` mirrors EVERY bus event onto the Node `GlobalBus`
as `{directory, project, workspace, payload:{id, type, properties: event.data}}`
(`event-v2-bridge.ts:35-44`). **The `data` → `properties` rename happens exactly once, at
`event-v2-bridge.ts:43`** — everything upstream (schema, core) says `data`; everything the app
sees says `properties`. For durable events the bridge emits a second
`{type:"sync", syncEvent:{id, type:"<type>.v<N>", seq, aggregateID, data}}` frame
(`event-v2-bridge.ts:45-61`) — the frames the app drops at `server-sdk.tsx:195`. (The
control-plane workspace mirror is a *forwarder* of remote sync frames, not an origin — see B13.)

**GlobalBus.** `packages/opencode/src/bus/global.ts` — a plain Node `EventEmitter` (`:11-22`)
that back-fills a missing `payload.id` (`:14-19`). Subscribers: the SSE handlers
(`handlers/global.ts:39`, `handlers/event.ts:55`), the TUI worker (`cli/tui/worker.ts:24`), and
the control plane (`control-plane/util.ts:35`).

**Where the events are actually born.** For a live prompt run, the v1 session/message publishers
live in the **legacy runtime** `packages/opencode/src/session/session.ts`, publishing through the
injected `EventV2Bridge` service (`session.ts:498`): `session.created` :537, `session.deleted`
:624, `message.updated` :633, `message.part.updated` :639, `session.updated` :748,
`message.removed` :859, `message.part.removed` :871, `message.part.delta` :886; `session.status`
from `session/status.ts:41-43`. `packages/core` owns the bus itself; its `session.ts:242`
publishes only the v2-service `session.created`.

---

<a id="b5"></a>
## B5. schema — the event contract source of truth (exact payload shapes)

All verified in `packages/schema/src` (defined via `define(...)` from
`packages/schema/src/event.ts:42`):

| type | payload (`properties` on the wire) | defined at |
|---|---|---|
| `session.created` / `session.updated` / `session.deleted` | `{ sessionID, info: Session }` | `packages/schema/src/v1/session.ts:572-595` |
| `message.updated` | `{ sessionID, info: Message }` | `v1/session.ts:596-603` |
| `message.removed` | `{ sessionID, messageID }` | `v1/session.ts:604-611` |
| `message.part.updated` | `{ sessionID, part: Part, time: number }` | `v1/session.ts:612-620` |
| `message.part.removed` | `{ sessionID, messageID, partID }` | `v1/session.ts:621-629` |
| `message.part.delta` | `{ sessionID, messageID, partID, field, delta }` | `v1/session.ts:632-641` |
| `session.diff` | `{ sessionID, diff: FileDiff.Info[] }` | `v1/session.ts:643-649` |
| `session.error` | `{ sessionID?, error }` | `v1/session.ts:651-657` |
| `session.status` | `{ sessionID, status: {type:"idle"} \| {type:"retry", attempt, message, next, action?} \| {type:"busy"} }` | `packages/schema/src/session-status-event.ts:9-41` |
| `pty.created` / `pty.updated` | `{ info: Pty.Info }` | publishers `packages/core/src/pty.ts:242,250` |
| `pty.exited` | `{ id, exitCode }` | publisher `core/src/pty.ts:232` |
| `pty.deleted` | `{ id }` | publisher `core/src/pty.ts:149` |

Notes:

- The `session.status` `retry` variant is rich — `{attempt, message, next, action?}`
  (`session-status-event.ts:13-28`) — and a deprecated `session.idle` event still fires on idle
  transitions (`session-status-event.ts:44-49`; emit `session/status.ts:43`).
- Plus `permission.asked/replied`, `question.*`, `todo.updated`, `project.updated`,
  `server.connected`, `server.heartbeat`, `global.disposed`, `server.instance.disposed`, and the
  durable v2 `session.next.*` family (`packages/schema/src/session-event.ts`) — present in the SDK
  `Event` union but NOT handled by the app's reducers yet.
- **Authoritative client-side union:** `Event` in `packages/sdk/js/src/v2/gen/types.gen.ts:7-…`
  (~80 variants); `GlobalEvent` `:730`, `Message` `:376`, `Part` `:627`. The app's handled subset
  is exactly the reducer switches in B3.

---

<a id="b6"></a>
## B6. SDK codegen boundary (hey-api)

**Flow** (`packages/sdk/js/script/build.ts`, run as `bun run build` in `sdk/js`):

1. `bun dev generate > openapi.json` executed in `packages/opencode` (`build.ts:12-14`) — the
   server emits its own OpenAPI spec, assembled/normalized in
   `packages/opencode/src/server/routes/instance/httpapi/public.ts`: the three SSE routes are
   documented by hand-patching (`Event` / `GlobalEvent` / `V2Event` schemas, `public.ts:155-171`)
   and auth metadata is stripped from legacy routes (`public.ts:146-153` — auth stays
   runtime-middleware, invisible to the generated client).
2. Prune unreachable `SessionNext*1` schema dupes (`build.ts:20-45`).
3. `createClient` from `@hey-api/openapi-ts` → `src/v2/gen/` with plugins `@hey-api/typescript`,
   `@hey-api/sdk` (instance `OpencodeClient`, flat params, `auth: false`), `@hey-api/client-fetch`
   (baseUrl `http://localhost:4096`) (`build.ts:47-72`).
4. Three post-codegen source patches **with hard failure if they stop applying**: numeric
   session-history query types (`build.ts:74-95`) and an `SseFn` TReturn generic fix
   (`build.ts:97-113`); then prettier + `tsc`.

**Stability rules.** Generated files carry the auto-generated banner (`types.gen.ts:1`) — never
hand-edit `src/v2/gen/*`. The SSE method binding: `global.event()` →
`client.sse.get({url: "/global/event"})` (`sdk.gen.ts:1336-1341`). Contract changes flow one way:
schema (`packages/schema`) → server routes (`packages/opencode`) → `bun dev generate` → hey-api →
SDK → app. The app imports ONLY `@opencode-ai/sdk/v2/client` for types + client
(`server-sdk.tsx:1`, `global-sync/types.ts:1-19`). Parallel Effect-native clients
(`packages/client`, `packages/sdk-next`, codegen in `packages/httpapi-codegen`) are NOT consumed
by the app. If Phase B needs any new server surface, this is the only sanctioned path to typed
client access.

---

<a id="b7"></a>
## B7. app ↔ instance server — PTY WebSocket (`/pty/:id/connect`)

**Routes.** `packages/opencode/src/server/routes/instance/httpapi/groups/pty.ts:29-38`
(`/pty/shells | /pty | /pty/:ptyID | …/connect-token | …/connect`); separate `PtyConnectApi` for
the WS route (`groups/pty.ts:139-172`) with its own `PtyConnectAuthorization` middleware; path
constant `groups/pty.ts:37`; connect endpoint `handlers/pty.ts:163` (`ptyConnectHandlers`).
**The endpoint is on the instance server** — NOT `packages/server/src/pty-environment.ts`, which
is only a trivial env-var provider Layer for the new server surface (returns `{}`; ~20 lines).

**Client.** `app/src/components/terminal.tsx:577-578` opens
`new WebSocket(terminalWebSocketURL(...))`; URL builder
`app/src/utils/terminal-websocket-url.ts:3-28` →
`ws(s)://…/pty/{id}/connect?directory=…&cursor=…[&ticket=…|&auth_token=…]`.

**Handshake.** Optional short-lived ticket via `client.pty.connectToken`
(`POST /pty/:ptyID/connect-token`, header `x-opencode-ticket: 1`;
`components/terminal.tsx:526-545`; 403 → CORS/CSRF error surfaced); ticket validation
`server/shared/pty-ticket.ts:5`; auth exception — PTY connect accepts the ticket in lieu of Basic
credentials (`middleware/authorization.ts:134-150`). Server upgrades at `handlers/pty.ts:207`
(`ctx.request.upgrade`), registers with `WebSocketTracker` (`:217`), and immediately sends a
binary meta frame carrying the cursor (`:245`, `PtyProtocol.metaFrame`).

**Wire protocol** (verified client-side, `components/terminal.tsx`):

- keystrokes: raw string `ws.send(data)` from ghostty's `onData` (`:463-465`);
- output: plain string frames appended to the terminal; client advances
  `cursor += data.length` (`:619-623`);
- control: `ArrayBuffer` frames whose first byte is `0` followed by JSON `{cursor}` — resume
  bookkeeping (`:600-617`);
- resize is **NOT** on the socket: `client.pty.update({ptyID, size:{cols, rows}})` over HTTP,
  debounced ~100 ms (`:244-253`, `:293-316`).

**Lifecycle.** Create `sdk.client.pty.create({title})` (`context/terminal.tsx:311-312`); close
`sdk.client.pty.remove({ptyID})` (`:415`); **exit notification arrives over the SSE stream, not
the WS** — `sdk.event.on("pty.exited", …)` (`context/terminal.tsx:238`), published by core at
`packages/core/src/pty.ts:232` `{id, exitCode}`. Lifecycle events
(`pty.created|updated|exited|deleted`) all arrive over the normal B1 SSE stream.

**Failure/reconnect.** Close code 1000 = clean stop; anything else retries with backoff
`min(250·2^min(tries,4), 4000)` ms after re-checking the PTY still exists (404 probe → fail)
(`:547-563`, `:641-651`). Reconnect resumes from `?cursor=`, replaying missed output.

**Run-relevance.** The "Agentic Terminal" name notwithstanding, the design's transcript feed is B1
data; B7 matters only if the surface embeds real interactive terminals (reuse
`components/terminal.tsx` wholesale — ghostty-web, not xterm). It is also the template for any
future bidirectional (non-SSE) channel.

---

<a id="b8"></a>
## B8. desktop ↔ app embedding (and the only enforced-auth deployment)

`packages/desktop/src/renderer/index.tsx` imports `AppBaseProviders`, `AppInterface`,
`PlatformProvider`, `ServerConnection`, … from `@opencode-ai/app` (`renderer/index.tsx:3-16`) and
mounts `<AppInterface defaultServer={key} servers={servers()} router={router} startup=…
serverScoped=…>` (`renderer/index.tsx:408-429`) with a `MemoryRouter` (`:20`), awaiting sidecar
credentials first (`window.api.awaitInitialization()`, `:346-347`); the sidecar server connection's
`{url, username, password}` come from the Electron main process' spawned server
(`renderer/index.tsx:387-404`).

**Sidecar.** Main spawns an Electron `utilityProcess` running `sidecar.js`
(`desktop/src/main/server.ts:55-143`), which imports `virtual:opencode-server` and calls
`Server.listen({port, password…})` (`main/sidecar.ts:53-63`) with
`OPENCODE_SERVER_USERNAME="opencode"` / `OPENCODE_SERVER_PASSWORD=<generated>` in env
(`sidecar.ts:85-86`). Health polling with Basic auth at `main/server.ts:184-195`.
**Health-check asymmetry:** desktop does NOT pass `disableHealthCheck`, so `ConnectionGate`'s
blocking startup check applies there; the web entry disables it (B11).

Type-only secondary entry points also cross the boundary: `@opencode-ai/app/desktop-menu` (main
process menu, `desktop/src/main/menu.ts:8`), `@opencode-ai/app/updater`,
`@opencode-ai/app/wsl/types` (preload + renderer, `preload/types.ts:1-3`). The event-stream
mechanics are identical to web — same SDK, same `/global/event`; the Electron `platform.fetch` is
substituted only for non-loopback plain-HTTP servers (`server-sdk.tsx:83-92`). Web entry
equivalent: `app/src/entry.tsx` (server URL from `VITE_OPENCODE_SERVER_HOST/PORT` or
`location.origin`).

**Run-relevance.** A new top-level route added in `packages/app` appears in desktop for free, but
anything it does must survive Basic-auth'd servers (the SDK layer already handles this) and must
not assume web-only APIs without checking `usePlatform()`.

**web/docs boundary: none.** `packages/web` (Astro) only mentions `@opencode-ai/sdk` inside docs
content (`packages/web/src/content/docs/*/sdk.mdx`); no code import of app/ui/sdk exists.

---

<a id="b9"></a>
## B9. app ↔ session-ui / ui contracts

**session-ui `Data` contract.** `packages/session-ui/src/context/data.tsx` defines the consumption
contract: `DataProvider` / `useData` (`data.tsx:44-63`) expose
`{store, directory, navigateToSession, sessionHref}` (provider props also take `directory`,
`onNavigateToSession`, `onSessionHref`); the `Data` type (`data.tsx:13-38`) requires `session`,
`session_status`, `session_diff` (+ optional `session_diff_preload`), `message: {[sessionID]:
Message[]}`, `part: {[messageID]: Part[]}`, optional `part_text_accum_delta`, optional
`agent`/`provider` — typed directly against `@opencode-ai/sdk/v2` types.
`NormalizedProviderListResponse` is DEFINED in session-ui (`data.tsx:5-11`) and imported by the
app's store types (`global-sync/types.ts:20,44` — a reverse dependency worth knowing).

**How the app satisfies it.** `DirectoryDataProvider` (`app/src/pages/directory-layout.tsx:16-74`)
passes `data={sync().data}` (`directory-layout.tsx:63-70`) — the stitched Proxy from B3 — plus
href/navigate callbacks. Mounted at `app.tsx:211` (draft route), `directory-layout.tsx:117`
(directory layout), `pages/session.tsx:271` (target-session route). The shapes align because the
app's `State` (`global-sync/types.ts:35-85`) is a superset of `Data` (Data ⊂ State; `State` adds
todo/permission/question/mcp/lsp/vcs/etc.). `part_text_accum_delta` is the streaming-text
accumulator both sides share.

**ui design system & context factory.** `createSimpleContext({name, init})` from
`@opencode-ai/ui/context` (`packages/ui/src/context/helper.tsx`) is the cross-package provider
idiom every app context uses (`server-sdk.tsx:2`, `server-sync.tsx:39`, `sdk.tsx:1`, session-ui
`data.tsx:2`). Components: legacy at `@opencode-ai/ui/<name>`, redesign at
`@opencode-ai/ui/v2/<name>-v2`; theme at `./theme/*` (per `packages/ui/package.json` exports; v2
tokens in `src/v2/styles/{colors,theme}.css`). The app-side terminal derives ghostty colors from
v2 CSS variables via `resolveV2Token(resolveThemeVariantV2(...))`
(`app/src/components/terminal.tsx:73-84`, `:265`) with light/dark defaults (`:53-66`).

**Run-relevance.** A Phase-A Agentic Terminal can mount `DataProvider` over a simulated store
shaped like `Data`; Phase B swaps in `sync().data` unchanged — verified compatible. The new-layout
shell and v2 tokens are the target idiom for the new surface.

---

<a id="b10"></a>
## B10. Palette carriers — the two `opencode.json` theme files (NO build coupling)

- `packages/tui/src/theme/assets/opencode.json` is the TUI's own palette asset and the design's
  cited source of record (DESIGN_MAP frontmatter). It is read ONLY by the TUI:
  `packages/tui/src/theme/index.ts:24` (`import opencode from "./assets/opencode.json"`), with a
  hardcoded fallback mirror in `src/component/error-component.tsx:16`. **Nothing in
  `packages/ui`, `packages/app`, or `packages/session-ui` reads this file** (repo-wide grep: only
  those two TUI hits; all other "opencode.json" matches are the *config file* of the same name).
- **Separately**, `packages/ui/src/theme/themes/opencode.json` is a hand-maintained
  desktop-theme-schema file (different format, different hash;
  `$schema: https://opencode.ai/desktop-theme.json`) whose dark palette carries the same signature
  hexes — `neutral #0a0a0a`, `ink #eeeeee`, `primary #fab283`, `accent #9d7cd8`,
  `success #7fd88f`, `error #e06c75`, `info #56b6c2`, `warning #f5a742` — plus syntax/markdown
  overrides. It IS imported on the web side: `packages/ui/src/theme/default-themes.ts:27`, cast to
  `DesktopTheme` as `opencodeTheme` (`default-themes.ts:65`), registered under the `opencode` key
  in `DEFAULT_THEMES` (`default-themes.ts:104`) as the selectable "OpenCode" theme.
- **No build-time sync exists between the two files** — parity is manual.
- Nuance to DESIGN_MAP: its claim that `#fab283` survives in the app system "only as legacy oc-2
  syntax literals" misses this in-repo desktop-theme carrying the full palette. It is theme-level
  (not a v2 semantic token), so DESIGN_MAP's implementation stance (surface-scoped exact-hex
  tokens) still stands — but the ui theme JSON is a legitimate in-repo source to reference for the
  hex values.

---

<a id="b11"></a>
## B11. Dev-environment boundary — bringing the full stack up locally

### The recipe (verified against `packages/app/AGENTS.md:10-16`, `package.json` scripts, source)

```bash
# 0. Install once, at the repo root (Bun 1.3.14 workspace):
bun install

# 1. Real backend — from packages/opencode  (terminal 1):
bun run --conditions=browser ./src/index.ts serve --port 4096
#    = `bun dev serve --port 4096`; prints "opencode server listening on http://127.0.0.1:4096"
#    (src/cli/cmd/serve.ts:19-20)

# 2. App dev server — from packages/app  (terminal 2):
bun dev -- --port 4444          # root shortcut: bun dev:web
#    open http://localhost:4444 — the DEV app targets http://localhost:4096 by default
```

Load-bearing facts an implementer/test author must know:

1. **Port 4096 is a convention, not a server default.** `serve`'s yargs defaults are `port: 0`
   (ephemeral!) and `hostname: "127.0.0.1"` (`packages/opencode/src/cli/network.ts:6-16`); global
   config `server.port`/`server.hostname` can override (`network.ts:62-80`). Always pass `--port`.
2. **How the app finds the server** (`packages/app/src/entry.tsx:102-113`): on `*.opencode.ai`
   hosts → `http://localhost:4096`; in Vite DEV →
   `http://${VITE_OPENCODE_SERVER_HOST ?? "localhost"}:${VITE_OPENCODE_SERVER_PORT ?? 4096}`;
   in a prod build → `location.origin`. A localStorage override
   (`opencode.settings.dat:defaultServerUrl`, `entry.tsx:14`) takes precedence as the *default*
   selection. The active connection is a `ServerConnection.Http` whose identity key is its URL
   (`ServerConnection.key`, `context/server.tsx:224-237`); `SelectedServerProviders` remounts the
   server-scoped subtree keyed on that `ServerKey` (`app.tsx:505-512`, `:157-165`).
3. **Auth handshake: none by default.** The server warns
   `"OPENCODE_SERVER_PASSWORD is not set; server is unsecured."` (`serve.ts:15-17`) and its
   authorization middleware becomes a pass-through when no password is configured
   (`middleware/authorization.ts:104`, `:122`; `server/auth.ts:24-26`). When a password IS set:
   HTTP Basic (`username` defaults `"opencode"`), accepted either as an `Authorization` header or
   an `?auth_token=<base64(user:pass)>` query param (`authorization.ts:12`, `:77-83`); the web app
   ingests `?auth_token=` at boot and strips it from the URL (`entry.tsx:157`, `clearAuthToken`
   `:115-120`); `createSdkForServer` then sends the Basic header on every request including the
   SSE fetch (`utils/server.ts:26-38`). Desktop always enforces auth via the generated sidecar
   password (B8).
4. **CORS is open for local dev:** any `http://localhost:*` or `http://127.0.0.1:*` origin is
   always allowed (plus `oc://renderer`, tauri schemes, `*.opencode.ai`, and `--cors` extras) —
   `packages/server/src/cors.ts:11-19`, wired at
   `server/routes/instance/httpapi/server.ts:124`. App-on-4444 → server-on-4096 works with no
   flags.
5. **The web entry disables the startup health gate** — `entry.tsx:175` passes
   `disableHealthCheck`, so `ConnectionGate`'s resource resolves `true` immediately
   (`app.tsx:395-397`). The blocking splash/health flow described in ROUTE_MAP's Entry Conditions
   is *structural but inert on web*; it bites only in desktop (B8). Server unreachability on web
   surfaces later, as failed SDK calls / a dead event stream, not as the `ConnectionError` screen
   at startup.
6. **Project rules:** never restart the app or server process mid-task
   (`packages/app/AGENTS.md:8`); `opencode dev web` proxies the hosted app and is useless for
   local UI work (`AGENTS.md:12`).
7. Desktop dev: `bun dev:desktop` (electron-vite); storybook: `bun dev:storybook`.

---

<a id="b12"></a>
## B12. Test-harness boundary — what the e2e suite actually does, and the honest real-stream path

### What exists today (the surprise)

`packages/app/playwright.config.ts` boots the Vite dev server itself (`webServer.command =
"bun run dev -- --host 0.0.0.0 --port ${PLAYWRIGHT_PORT ?? 3000}"`, baseURL
`http://127.0.0.1:3000`, `reuseExistingServer` unless CI) and injects
`VITE_OPENCODE_SERVER_HOST/PORT` (default `127.0.0.1:4096`) — which *looks* like it expects a real
backend on 4096. **It does not.**

**Every one of the 58 spec files under `packages/app/e2e/**` mocks the backend at the browser
network layer.** (Glob-verified count: 13 `performance/timeline-stability` + 7
`performance/timeline` + 37 `regression` + 1 `smoke` = 58.) The three mock mechanisms:

1. **`mockOpenCodeServer(page, config)`** (`e2e/utils/mock-server.ts:29-138`) —
   `page.route("**/*")` intercepts every request whose port matches the configured server port and
   fulfills it from in-test fixtures. The SSE routes `/global/event` and `/event` are fulfilled
   with a **static one-shot `text/event-stream` body** (`:57`, `:177-183`); `/global/health`
   returns `{healthy:true}` (`:58`); unmatched target-port paths return `{}` (`:135`); non-server
   ports fall through to the network (`:54`).
2. **`installSseTransport(page, {server})`** (`e2e/utils/sse-transport.ts:58-284`) — an
   `addInitScript` that **replaces `window.fetch`** for `/global/event` + `/event` on the target
   origin, handing the test a live controllable `ReadableStream`: `send / burst / split(payload,
   byte-cuts) / heartbeat / writeRaw / close / disconnect / error`, plus connection records and
   per-delivery acknowledgements. This is how transport-level behavior (reconnects, split frames,
   multibyte chunk boundaries, heartbeats) is tested — see
   `e2e/regression/session-timeline-transport.spec.ts`.
3. **Bespoke per-spec `page.route` mocks** for multi-server scenarios (e.g.
   `e2e/regression/cross-server-tab-close.spec.ts:79-101`, serving fake servers on 4096 AND 4097).

Specs that import only `@playwright/test` (e.g.
`e2e/regression/session-timeline-projection.spec.ts:1-10`) go through the shared fixture
`e2e/performance/timeline-stability/fixture.ts` — it imports both mechanisms (`fixture.ts:18-19`)
and installs them in `setupTimeline` (`fixture.ts:112-116`).

**Contract-drift mitigation:** the shared fixture validates every mocked message/part/event
against the *real* Effect schemas — `Schema.decodeUnknownSync(SessionV1.WithParts /
SessionV1.Part / SessionStatusEvent.Info)` with `onExcessProperty: "error"`, and a
`GlobalEvent`-typed event union (`fixture.ts:72-84`, `:30-49`) — so mocks cannot silently drift
from the schema contract. But **no existing spec exercises a real server, real Effect runtime, or
real LLM loop; the "real dev event stream" bar is NOT met anywhere in the current suite** — Phase
B's no-mock flows are genuinely new infrastructure. State seeding is via `localStorage` init
scripts (`settings.v3` for `newLayoutDesigns`, `opencode.global.dat:server` for the server list,
`opencode.window.browser.dat:tabs` for tabs — `cross-server-tab-close.spec.ts:12-25`).

Env knobs: `PLAYWRIGHT_PORT`, `PLAYWRIGHT_BASE_URL`, `PLAYWRIGHT_SERVER_HOST/PORT`,
`PLAYWRIGHT_WORKERS` (CI default 5), `PLAYWRIGHT_FULLY_PARALLEL=1`, `OPENCODE_PERFORMANCE=1`
(unlocks `performance/**` specs), `CI` (retries=2, forbidOnly).

### The honest path to "real dev event stream, no mocks"

Nothing in the harness *prevents* real-backend testing — the mocks are opt-in per spec. A
real-stream spec is: **start a real server, don't install any mock, create the session over plain
HTTP, assert on the UI (and optionally on a second raw SSE consumer).**

1. **Bring-up:** start the backend per B11 (`bun dev serve --port 4096` in `packages/opencode`,
   `OPENCODE_SERVER_PASSWORD` unset), then `bun run test:e2e` — the config's `webServer` boots
   Vite pointed at it and `reuseExistingServer` keeps iteration fast. For isolation, a per-run
   port + scratch directory works: `serve --port <p>` and `PLAYWRIGHT_SERVER_PORT=<p>` +
   `VITE_OPENCODE_SERVER_PORT` follow automatically through the config.
2. **Create a controlled real session from the spec (no UI dependency):**
   `await fetch("http://127.0.0.1:4096/session?directory=" + encodeURIComponent(scratchDir),
   {method: "POST"})` → `Session.Info` (`groups/session.ts:203-214`; directory routing
   `workspace-routing.ts:87`). This alone deterministically produces real `session.created` /
   `session.updated` frames on `/global/event` tagged with that directory — no LLM, no
   credentials. `PATCH /session/:id` (rename) is another deterministic event source.
3. **Drive richer real activity:** `POST /session/:id/shell` (`groups/session.ts:356`) /
   `.../command` (`:343`) produce real message/part events through the session pipeline;
   `POST /session/:id/prompt_async` (`:329`) exercises the full agent loop but requires a
   configured provider (real credentials or an opencode-config'd local model) — that cost should
   be stated in the test plan, not hidden. *(Shell/command event richness is contract-inferred,
   not yet executed — verify when building Phase B specs.)*
4. **Observe:** primary assertions on the app DOM (the app's own `/global/event` consumer is live
   under any route inside `ServerSyncProvider`); ground-truth assertions by opening a second raw
   SSE consumer in the spec (`fetch` streaming; expect first frame `server.connected`, 10 s
   heartbeats, `{directory, payload}` frames — B1; the `server.connected`/`server.heartbeat`
   frames carry no `directory` field, so the consumer must not require it).
   **Load-before-listen caveat (binding on test design):** transcript-level assertions require
   the app to have paged in the session's messages first — `server-session.apply` DROPS
   `message.part.updated` for a message not in the store (`server-session.ts:849-859`) and
   ignores `message.part.delta` for unknown parts (`:950-953`). Navigating the app to the session
   (which triggers `session.sync(sessionID)`, `server-session.ts:692-715`) BEFORE driving
   part-producing activity is the reliable order. Session-LIST assertions are safe without it:
   `session.apply` auto-resolves unknown session infos (`server-session.ts:739-750`), so
   `session.created/updated` from step 2 shows up regardless.
5. **Cleanup:** `DELETE /session/:id` (`groups/session.ts:215`) and delete the scratch directory.

This is exactly the stack the Agentic Terminal's "no mocks" bar needs: the only genuinely new test
infrastructure Phase B requires is a tiny spec-side helper for (2)-(5); everything else exists.

---

<a id="b13"></a>
## B13. Control-plane relay — remote-workspace event mirroring (forwarder, not origin)

In multi-workspace setups, the control-plane workspace mirror is a *consumer* of a remote server's
`/global/event` stream: it replays remote durable `sync` frames into the local `EventV2` store
(`packages/opencode/src/control-plane/workspace.ts:401-411` —
`events.replay(payload.syncEvent, {publish: true, ownerID})`) and then re-emits the raw remote
frame (including `sync` frames) onto the local `GlobalBus` tagged `workspace: space.id`
(`workspace.ts:414-421`). The control plane subscribes to `GlobalBus` at
`control-plane/util.ts:35`.

Consequence: `{type:"sync"}` frames on a local `/global/event` stream can arrive via TWO paths —
the primary origin (`event-v2-bridge.ts:45-61`, one companion frame per locally published durable
event; on a plain single-instance server this is the only source) and this relay of remote frames.
The app's drop at `server-sdk.tsx:195` guards against both. The control plane is a forwarder, not
an origin.

---

## End-to-end runtime trace — one real prompt turn (10 hops)

What Phase B live wiring will follow, hop by hop. Scenario: a session exists; the user submits a
prompt; the assistant streams a text part; the turn ends.

**Hop 1 — submit.** `client.session.promptAsync(…)`
(`packages/app/src/components/prompt-input/submit.ts:155`) →
`POST /session/:sessionID/prompt_async`
(`packages/opencode/src/server/routes/instance/httpapi/groups/session.ts:96`) → handler forks the
prompt run and returns 204 (`handlers/session.ts:311-329`). Optimistic user message is inserted
client-side meanwhile (`directory-sync.ts:92-112` → `server-session.ts` optimistic map).

**Hop 2 — emit.** The session runtime in `packages/opencode/src/session/session.ts` publishes v1
events through the EventV2Bridge as the run progresses:

| moment | publish site | payload |
|---|---|---|
| session created | `session.ts:537` (legacy runtime) / `packages/core/src/session.ts:242` (v2 service) | `{sessionID, info}` |
| status → busy/retry/idle | `packages/opencode/src/session/status.ts:41-43` | `{sessionID, status}` (+ deprecated `session.idle`) |
| message row upsert | `session.ts:633` | `{sessionID, info: Message}` |
| part snapshot | `session.ts:639-642` | `{sessionID, part: structuredClone(part), time: Date.now()}` |
| streaming token | `session.ts:886` | `{sessionID, messageID, partID, field, delta}` |
| session touch/update | `session.ts:748` | `{sessionID, info}` |
| removals | `session.ts:859`, `:871` | `{sessionID, messageID[, partID]}` |

**Hop 3 — bus.** `EventV2.publish` (`packages/core/src/event.ts:419-439`) stamps `id`/`location`,
commits durable events to SQLite, then `notify` (`:406-417`) fans to listeners/typed/all pubsubs.

**Hop 4 — bridge.** The EventV2Bridge listener (`packages/opencode/src/event-v2-bridge.ts:35-44`)
reshapes to `{directory, project, workspace, payload:{id, type, properties: data}}` and emits on
`GlobalBus`; durable events add a `"sync"` companion frame (`:45-61`).

**Hop 5 — SSE encode.** `handlers/global.ts:33-66`: `GlobalBus.on("event")` → Effect Stream →
`server.connected` prologue + 10 s heartbeats merged → `JSON.stringify` per frame → `Sse.encode()`
→ chunked `text/event-stream` response on `/global/event`.

**Hop 6 — SSE decode.** Generated client
(`sdk/js/src/v2/gen/core/serverSentEvents.gen.ts:95-233`): fetch-stream, frame parse,
`JSON.parse`, yields typed `GlobalEvent`s; inner retry loop with exponential backoff
(+ `Last-Event-ID`, inert here — the server sends no `id:` fields, B1).

**Hop 7 — consume + fan-out.** `server-sdk.tsx` `start()` loop (`:161-230`): iterate
`events.stream` (`:192`), drop `"sync"` (`:195`), enqueue `{directory ?? "global", payload}` with
`message.part.updated`/`lsp.updated` tail-coalescing (`:20-38`), flush on ~16 ms frames merging
contiguous `message.part.delta` (`:40-72`, `:113-131`), then
`batch(() => emitter.emit(directory, payload))` (`:126-128`). Outer watchdog/reconnect per B1.

**Hop 8 — reduce.** `server-sync.tsx:374-431`: every payload → `session.apply(event)` (`:380`)
into the server-wide content store (`server-session.ts:739`: status `:781`, message upsert
`:786-816`, part upsert `:846-902`, delta accumulation into both `part[messageID][i][field]` and
`part_text_accum_delta[partID]` `:942-983`); session-list membership → `applyDirectoryEvent`
(`:410`, content events skipped by `sessionContent:false` `:419`); `"global"` frames →
`applyGlobalEvent` (`:387`).

**Hop 9 — read.** `useSync()` (`context/sync.tsx:112-117`) → `createDirSyncContext`
(`directory-sync.ts:22`) → the `data` Proxy (`:30-36`) merges content fields (server-session) with
directory fields (child store) into the `State` shape (`global-sync/types.ts:35-85`).

**Hop 10 — render.** `DirectoryDataProvider` (`pages/directory-layout.tsx:63-70`) passes
`sync().data` into session-ui's `DataProvider` (`session-ui/src/context/data.tsx:44-63`); timeline
components read `store.message[sessionID]` / `store.part[messageID]` /
`store.part_text_accum_delta[partID]` and SolidJS fine-grained reactivity re-renders exactly the
streaming part. Targeted UIs subscribe directly instead: `session.status` dialogs
(`pages/session/usage-exceeded-dialogs.tsx:54`, type-keyed), permission prompts
(`context/permission.tsx:322`, directory-keyed), etc.

**Stream start precondition:** none of hops 6-10 happen until a mounted `ServerSyncProvider` runs
`serverSDK.event.start()` (`server-sync.tsx:443-458`, rAF + setTimeout deferred).

### PTY divergence (what a terminal session does differently)

Control plane stays on B1/B2; the byte plane is a dedicated WebSocket (B7):

1. create → `pty.create` POST (`context/terminal.tsx:311`) → core `Pty.create` publishes
   `pty.created` over **SSE** (`core/src/pty.ts:242`);
2. connect → optional ticket (`components/terminal.tsx:526-545`) →
   `new WebSocket(…/pty/:id/connect?directory&cursor&ticket)` (`:577`; URL:
   `utils/terminal-websocket-url.ts:14-27`); server upgrade + cursor meta frame
   (`handlers/pty.ts:207`, `:245`);
3. bytes: keystrokes = raw string sends (`:464`); output = string frames appended, cursor advanced
   (`:619-623`); binary first-byte-0 frames = `{cursor}` control (`:602-616`);
4. resize over HTTP `pty.update` debounced 100 ms (`:244-253`) — never over the socket;
5. exit signaled over **SSE** (`pty.exited`, type-keyed sub at `context/terminal.tsx:238`; emit
   `core/pty.ts:232`); reconnect resumes from cursor with 250 ms→4 s backoff after a 404
   existence probe (`:547-563`).

---

## Corrections to sibling maps (fleet-confirmed)

The following corrections were surfaced independently by the integration explorers, cross-verified
in round-robin convergence, and re-read from source. Apply them when consuming CODEBASE_MAP.md,
ROUTE_MAP.md, or DESIGN_MAP.md.

### CODEBASE_MAP.md

1. **§4.5 overstates `event-reducer.ts` (event-reducer canonicality).** The live
   message/part/status/permission/question/todo/diff fold is `server-session.ts` `apply()`
   (`server-sync.tsx:380`), NOT `applyDirectoryEvent` — the sole production caller passes
   `sessionContent: false` (`server-sync.tsx:419`), which skips all of `SESSION_CONTENT_EVENTS`
   (`event-reducer.ts:20-34`, `:123`); those branches are dead outside tests. The reducer file
   remains canonical only for session-list/vcs/lsp/reference/project/global events. The
   "canonical reference for folding events into UI state" for a transcript-rendering surface is
   `server-session.ts:739-1046`.
2. **§3.6 PTY location.** The socket endpoint is
   `packages/opencode/.../handlers/pty.ts:163` + `groups/pty.ts:37`, not
   `packages/server/src/pty-environment.ts` (a trivial env-provider stub belonging to the new
   server surface).
3. **§3.8/§9 "Playwright expects a real opencode backend on :4096" is wrong in practice.** All 58
   e2e specs mock the backend at the browser network layer, directly or via the shared timeline
   fixture (`fixture.ts:112-116`); the suite runs green with nothing listening on 4096. The
   `VITE_*`/`PLAYWRIGHT_*` env vars only fix the origin the mocks intercept. Material for Phase
   A/B planning: mock infrastructure exists and is schema-validated, but the "real dev event
   stream" bar is NOT met by the current suite anywhere (B12).
4. **§3.1 "default `localhost:4096`"** is the *app-side* default only; the server's own `serve`
   defaults are port **0** (ephemeral) / hostname `127.0.0.1` (`cli/network.ts:6-16`). Recipes
   must always pass `--port` (B11).
5. **§4.1 emit-site attribution.** "Events originate in `packages/core`" is true of the bus, but
   the v1 session/message publishers for a prompt run live in
   `packages/opencode/src/session/session.ts` (`:537,:624,:633,:639,:748,:859,:871,:886`) and
   `session/status.ts:41-43`; core's `session.ts:242` publishes only the v2-service
   `session.created` (B4).
6. **§3.3 store-topology nuance.** Session content is NOT per-directory: `directory-sync.ts:30-36`
   is a Proxy forwarding the nine content fields to the shared server-wide server-session store,
   everything else to the per-directory child store; the map describes the *view*, not the
   storage. The factory lives in `context/directory-sync.ts` (`createDirSyncContext`);
   `context/sync.tsx` holds only the `useSync` hook + optimistic helpers (B3).
7. **§4.6/§10.2 SSE semantics.** `Last-Event-ID` resume never happens on `/global/event` — the
   route emits `id: undefined` frames (`handlers/global.ts:16-23`); disconnection loses events;
   recovery is the `server.connected` → re-bootstrap path (`event-reducer.ts:42-45`,
   `server-sync.tsx:396-402`). And reconnect is TWO nested loops (SDK 3 s-exp-30 s inner +
   app 250 ms outer + 15 s watchdog vs server 10 s heartbeat), not one (B1).
8. **Frame details the map omits:** optional `project`/`workspace` fields on every frame
   (`types.gen.ts:730-734`); the durable `"sync"` companion frames (dropped at
   `server-sdk.tsx:195` — this is what the "sync skip" is actually for); server heartbeat every
   10 s (`handlers/global.ts:43-46`) vs the client's 15 s watchdog; `server.connected` always
   first frame (`:49`); `lsp.updated` is tail-coalesced alongside `message.part.updated`
   (`server-sdk.tsx:21`); `session.status`'s `retry` variant carries `{attempt, message, next,
   action?}` (`session-status-event.ts:13-28`) and a deprecated `session.idle` still fires
   (`status.ts:43`, `session-status-event.ts:44-49`).
9. **Addition — env-gated Basic auth.** Server auth exists and is env-gated
   (`OPENCODE_SERVER_PASSWORD`, Basic auth or `?auth_token=`), enforced always in desktop via the
   generated sidecar password; no map mentions it. Any "connect to a server" UI or test helper
   must tolerate it (B8, B11).
10. **Addition — load-before-listen** is a hard contract nowhere in the maps: part events for
    unknown messages/parts are dropped (`server-session.ts:849-859,950-953`); a live surface must
    `session.sync(id)` before events fill a transcript (Wiring §1).

### ROUTE_MAP.md

11. **"Entry Conditions" needs a qualifier (ConnectionGate web-inert).** The web entry passes
    `disableHealthCheck` (`entry.tsx:175`), so the blocking ConnectionGate health check
    (`app.tsx:395-397`) is a no-op on web/dev/Playwright; the blocking check + `ConnectionError`
    screen effectively apply to desktop (sidecar) only (B11).
12. **Subscriber-key labels confirmed:** `file.tsx:217` is type-keyed (it's `useSDK()`'s
    `event.listen`, iterating the type-keyed emitter); `permission.tsx:322` is directory-keyed
    (uses `e.name` as directory, `permission.tsx:316-319`).

### DESIGN_MAP.md

13. **ui `opencode.json` palette carrier.** `packages/ui/src/theme/themes/opencode.json` (imported
    at `default-themes.ts:27`, registered at `:104`) carries the full opencode dark palette
    (`#fab283` primary et al.) as a selectable desktop theme — an in-repo hex source the map's
    app-v2-token comparison omits. It is theme-level (not v2 semantic tokens), so the map's
    surface-scoped exact-hex-token stance stands, but the file is a legitimate reference for the
    hex values; there is no build-time sync with the TUI asset (B10).

### Wire nuance (any hand-rolled consumer)

14. `server.connected`/`server.heartbeat` frames lack the schema-required `directory` field
    (`handlers/global.ts:45,49` vs `groups/global.ts:36`); the app's `?? "global"` default
    (`server-sdk.tsx:196`) is what keeps them routable. Replicate it (Wiring §5).

import type { Event, Session } from "@opencode-ai/sdk/v2/client"
import { useSearchParams } from "@solidjs/router"
import { createMemo, onCleanup, onMount, Show } from "solid-js"
import { useQuery } from "@tanstack/solid-query"
import { homeSessionIndexKey, type HomeSessionIndex } from "@/context/global-sync/home-session-index"
import { useServer } from "@/context/server"
import { useServerSDK } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"
import { TerminalHotkeys } from "./hotkeys"
import { LiveSessionSource, liveStoreSnapshot, registeredFilePayload } from "./live/live-source"
import { ForkBanner } from "./panels/fork-banner"
import { TerminalFeed } from "./panels/feed"
import { PromptQueue } from "./panels/prompt-queue"
import { TerminalRail } from "./panels/rail"
import { RightPanel } from "./panels/right-panel"
import { TerminalTopbar } from "./panels/topbar"
import { TerminalTui } from "./panels/tui"
import { FileViewer } from "./panels/viewer"
import { TerminalStoreProvider, useTerminalStore, type TerminalProjectionActions } from "./store"
import "./tokens.css"

export interface AgenticTerminalRouteProps {
  showCost?: boolean
}

function AgenticTerminalPanels(props: { showCost: boolean }) {
  const terminal = useTerminalStore()

  onMount(() => terminal.source.start())
  onCleanup(() => terminal.source.dispose())

  return (
    <div
      class="agentic-terminal"
      data-testid="agentic-terminal"
      data-view={terminal.state.view}
      data-show-cost={props.showCost ? "true" : "false"}
    >
      <TerminalHotkeys />
      <TerminalTopbar />
      <Show when={terminal.state.view === "mission"} fallback={<TerminalTui showCost={props.showCost} />}>
        <div
          style={{
            display: "grid",
            "grid-template-columns": "270px minmax(0, 1fr) 344px",
            flex: 1,
            "min-height": 0,
            "min-width": 0,
          }}
        >
          <TerminalRail showCost={props.showCost} />
          <main style={{ display: "flex", "min-height": 0, "min-width": 0, "flex-direction": "column" }}>
            <ForkBanner />
            <TerminalFeed />
          </main>
          <RightPanel />
        </div>
      </Show>
      <PromptQueue />
      <FileViewer terminal={terminal} />
    </div>
  )
}

function AgenticTerminalLive(props: AgenticTerminalRouteProps) {
  const server = useServer()
  const serverSDK = useServerSDK()
  const serverSync = useServerSync()
  const [search, setSearch] = useSearchParams<{ session?: string }>()
  const sessions = useQuery(() => ({
    queryKey: homeSessionIndexKey(server.key),
    queryFn: async (): Promise<HomeSessionIndex> => ({
      sessions: await serverSDK().client.session.list({ roots: true, limit: 5_000 }).then((response) => response.data ?? []),
      eventSequence: serverSync().homeSessions.eventSequence(),
    }),
  }))
  const requested = useQuery(() => ({
    queryKey: [server.key, "agentic-terminal-session", search.session ?? ""] as const,
    enabled: !!search.session,
    queryFn: async () => {
      if (!search.session) return undefined
      const session = await serverSDK().client.session
        .get({ sessionID: search.session })
        .then((response) => response.data ?? undefined)
      if (session) serverSync().session.remember(session)
      return session
    },
  }))
  const target = createMemo(() => {
    if (search.session) return serverSync().session.data.info[search.session] ?? requested.data
    return sessions.data?.sessions
      .filter((session) => !session.time.archived)
      .sort((a, b) => b.time.updated - a.time.updated || b.id.localeCompare(a.id))[0]
  })

  const createSource = (actions: TerminalProjectionActions) => {
    const initial = target()
    const contextLimits = () => Object.fromEntries(
      [...serverSync().data.provider.all.values()].flatMap((provider) =>
        Object.values(provider.models).map((model) => [`${provider.id}/${model.id}`, model.limit.context] as const),
      ),
    )
    const hydrateTree = async (sessionID: string, force = false) => {
      const selected = await serverSync().session.resolve(sessionID, force ? { force: true } : undefined)
      const seen = new Set<string>()
      const visit = async (session: Session): Promise<void> => {
        if (seen.has(session.id)) return
        seen.add(session.id)
        serverSync().session.remember(session)
        const children = await serverSDK().client.session
          .children({ sessionID: session.id, directory: session.directory })
          .then((response) => response.data ?? [])
        await Promise.all(children.map(visit))
      }
      await visit(selected)
      await Promise.all([...seen].flatMap((id) => [
        serverSync().session.sync(id, force ? { force: true } : undefined),
        serverSync().session.diff(id, force ? { force: true } : undefined),
        serverSync().session.todo(id, force ? { force: true } : undefined),
      ]))
      const questions = await serverSDK().client.question
        .list({ directory: selected.directory })
        .then((response) => response.data ?? [])
      const grouped = Object.groupBy(questions, (question) => question.sessionID)
      for (const id of seen) serverSync().session.set("question", id, grouped[id] ?? [])
      const statuses = await serverSDK().client.session
        .status({ directory: selected.directory })
        .then((response) => response.data ?? {})
      for (const id of seen) serverSync().session.set("session_status", id, statuses[id] ?? { type: "idle" })
    }
    return new LiveSessionSource({
      sessionID: initial?.id,
      directory: initial?.directory ?? serverSync().data.path.directory,
      syncSession: (sessionID, options) => serverSync().session.sync(sessionID, options),
      hydrateSnapshot: (sessionID, options) => hydrateTree(sessionID, options?.force),
      snapshot: (sessionID) =>
        liveStoreSnapshot({
          sessionID: serverSync().session.lineage.peek(sessionID)?.root.id ?? sessionID,
          directory: serverSync().session.data.info[sessionID]?.directory ?? serverSync().data.path.directory,
          actions,
          sessionData: serverSync().session.data,
          contextLimits: contextLimits(),
        }),
      subscribeDirectory: (directory, listener) =>
        serverSDK().event.on(directory, (event) => listener(event as Event)),
      subscribeGlobal: (listener) =>
        serverSDK().event.on("global", (event) => listener(event as Event)),
      startEvents: () => serverSDK().event.start(),
      replyQuestion: (input) =>
        serverSDK().client.question.reply({
          requestID: input.requestID,
          directory: initial?.directory ?? serverSync().data.path.directory,
          answers: input.answers,
        }),
      promptAsync: (input) =>
        serverSDK().client.session.promptAsync({
          sessionID: input.sessionID,
          directory: serverSync().session.data.info[input.sessionID]?.directory ?? initial?.directory ?? serverSync().data.path.directory,
          messageID: input.messageID,
          parts: input.parts,
        }),
      sessionStatus: (sessionID) =>
        serverSDK().client.session
          .status({ directory: serverSync().session.data.info[sessionID]?.directory ?? initial?.directory ?? serverSync().data.path.directory })
          .then((response) => response.data?.[sessionID]),
      readFile: (path) =>
        serverSDK().client.file
          .read({ directory: initial?.directory ?? serverSync().data.path.directory, path })
          .then((response) => response.data),
      createSession: async (title) => {
        const directory = initial?.directory ?? serverSync().data.path.directory
        const session = await serverSDK().client.session
          .create({ directory, title: title.slice(0, 120) })
          .then((response) => response.data ?? undefined)
        if (session) serverSync().session.remember(session)
        return session
      },
      onSessionCreated: (session: Session) => setSearch({ session: session.id }, { replace: true }),
      onReset: () => actions.resetProjection({ preserveUi: true, preserveQueue: true, preserveFileEdits: true }),
      onEvent: actions.fold,
      onAgents: actions.registerAgents,
      onFiles: (files) => actions.registerFiles(files.map(registeredFilePayload)),
      onSessionTitle: actions.setSessionTitle,
      dequeue: actions.shiftQueue,
    })
  }

  return (
    <Show when={!sessions.isLoading && !requested.isLoading}>
      <Show when={`${target()?.id ?? "new"}\0${target()?.directory ?? serverSync().data.path.directory}`} keyed>
        <TerminalStoreProvider createSource={createSource}>
          <AgenticTerminalPanels showCost={props.showCost ?? true} />
        </TerminalStoreProvider>
      </Show>
    </Show>
  )
}

export default function AgenticTerminalRoute(props: AgenticTerminalRouteProps) {
  return <AgenticTerminalLive {...props} />
}

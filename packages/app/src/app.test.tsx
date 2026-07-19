import { afterEach, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test"
import { readFileSync } from "node:fs"
import { createSignal, Show } from "solid-js"
import { isServer, render } from "solid-js/web"
import h from "solid-js/h"
import { DialogProvider } from "@opencode-ai/ui/context/dialog"
import { CommandProvider, useCommand, type CommandOption } from "@/context/command"
import { LanguageProvider } from "@/context/language"
import { PlatformProvider, type Platform } from "@/context/platform"
import { SettingsProvider, useSettings } from "@/context/settings"
import { DESKTOP_MENU } from "./desktop-menu"

// Bun's TSX transpiler emits the classic React.createElement-shaped JSX pragma
// for every .tsx source file it loads (there is no solid-js-aware compiler
// under bun test) -- matched here with solid-js/h, per the precedent in
// components/titlebar.test.tsx. This is required even though this file's own
// tree-construction code below uses explicit h() calls (see the note further
// down): app.tsx and the context modules it imports (settings.tsx,
// language.tsx, dialog.tsx, command.tsx, platform.tsx) still contain real JSX
// in their own source that bun transpiles the same way.
const React = { createElement: h, Fragment: h.Fragment }
Object.assign(globalThis, { React, Fragment: h.Fragment })

describe("agentic terminal menu registration", () => {
  test("View menu contains agentic.open command entry", () => {
    const viewMenu = DESKTOP_MENU.find((menu) => menu.id === "view")
    expect(viewMenu).toBeDefined()
    expect(viewMenu?.items).toBeDefined()

    const agenticEntry = viewMenu?.items?.find(
      (item) => item.type === "item" && item.command === "agentic.open",
    )
    expect(agenticEntry).toBeDefined()
    expect(agenticEntry?.type).toBe("item")
    if (agenticEntry?.type === "item") {
      expect(agenticEntry.label).toBe("Agentic Terminal")
    }
  })
})

// PROD-SAFETY: Component-mount coverage for the AgenticCommands context-provider
// crash (SR-agentic-commands-context-provider-20260719T092909Z / diagnostic plan
// .architect-team/diagnostic-research/agentic-commands-context/diagnostic-plan-20260719T1010Z.md).
//
// Before this suite, app.test.tsx never rendered a single component -- the test
// above is a pure DESKTOP_MENU data assertion. AgenticCommands calls useCommand()
// (app.tsx:528), which requires a CommandProvider ancestor; when it was mounted
// outside the shared CommandProvider (the old app.tsx:582 site, sibling of
// <ServerShell>), useCommand() threw synchronously on every boot -- unreachable
// from the unit suite, only caught by the packaged-exe smoke step.
//
// These tests mount the REAL AgenticCommands (imported from ./app -- its
// definition is untouched) inside the REAL provider chain CommandProvider's own
// init requires (Dialog, Settings, Language -- command.tsx:251-253; Settings
// additionally needs Platform via persisted()/usePlatform()), under a
// memory-mode router root (AgenticCommands also calls useNavigate()) -- exactly
// mirroring the real app.tsx tree. The invariant asserted is "registration is
// visible to the SAME provider instance the palette/WindowsAppMenu read" -- not
// merely "doesn't throw". A SIBLING probe (never a child of AgenticCommands)
// reads the shared CommandProvider's live `options`; this is precisely the
// assertion a re-introduced site-(iii) isolated <CommandProvider> around
// AgenticCommands would FAIL (forbidden per diagnostic plan §3 -- an isolated
// provider boots cleanly but hides the command from the palette and the
// Windows View menu).
//
// Two distinct tooling wrinkles had to be worked around, neither touching
// product code:
//
// 1. app.tsx's top-level imports pull in the whole page tree (session pages,
//    layouts, home, the agentic-terminal route, comments, prompt) which
//    transitively reach two Vite-only asset imports bun's module loader cannot
//    parse (`?worker&url`: packages/session-ui/src/pierre/worker.ts and
//    packages/session-ui/src/components/markdown-worker.ts, reached via
//    @opencode-ai/session-ui/file and the session/home/layout pages). None of
//    those modules are needed to mount AgenticCommands (it only touches
//    useCommand/useLanguage/useNavigate), so they are replaced with minimal
//    same-shape stubs via bun:test's mock.module BEFORE the module is
//    imported -- the same established pattern already used by
//    components/prompt-input/submit.test.ts in this package. mock.module must
//    run before app.tsx is imported (static imports are hoisted ahead of any
//    other module-scope statement), so both the mocks and the subsequent
//    dynamic `import("./app")` live in beforeAll.
//
// 2. bun's .tsx transpiler has no solid-js-aware compiler (unlike the real
//    Vite build): it emits a classic React.createElement-shaped JSX pragma
//    (matched here with solid-js/h, per the precedent in
//    components/titlebar.test.tsx and pages/agentic-terminal/__tests__/panels-a.test.tsx),
//    which evaluates `{expr}` JSX children EAGERLY as positional call
//    arguments. Solid's real compiler instead defers a context provider's
//    `{props.children}` into a lazy `get children()` accessor, read only
//    after the provider's own context mutation runs. Chaining multiple REAL
//    context providers (Platform -> Language -> Dialog -> Settings -> Command)
//    via plain nested JSX/h() positional children breaks this deferral one
//    level at a time (each provider's own context becomes visible only to
//    whatever is constructed strictly AFTER it, never to what's nested
//    directly inside its own JSX children expression) and consumers throw
//    "X context must be used within a context provider" despite a real
//    provider being present. The fix (verified empirically against this
//    exact bug, mirroring panels-a.test.tsx's `get children(){ return
//    children() }` idiom) is to hand every provider its children as an
//    explicit `get children()` accessor on the SAME props object passed to
//    `h()`/`createComponent`, never as an additional positional argument --
//    this is what buildTree does at every level below.
let AgenticCommands: typeof import("./app").AgenticCommands
let MemoryRouter: typeof import("@solidjs/router").MemoryRouter
let Route: typeof import("@solidjs/router").Route

beforeAll(async () => {
  // Guard mirrors describe.skipIf(isServer) below: without --conditions=browser
  // (the "test:unit" script's default, which titlebar.test.tsx's suite also
  // relies on being skipped under), @solidjs/router resolves to its
  // server/SSR build, and MERELY IMPORTING it throws synchronously at
  // module-evaluation time (not just at render time) -- confirmed via an
  // isolated reproduction that imports nothing else. app.tsx (which this
  // suite dynamically imports below) also imports @solidjs/router, so a
  // STATIC top-level `import ... from "@solidjs/router"` in this file would
  // hit the same crash regardless of this guard (static imports are hoisted
  // ahead of any runtime check); routing everything through a dynamic
  // import() inside this isServer-guarded beforeAll is what actually avoids
  // it. None of this setup is needed when the mount-test describe block below
  // is going to skip anyway.
  if (isServer) return

  const router = await import("@solidjs/router")
  MemoryRouter = router.MemoryRouter
  Route = router.Route

  mock.module("@opencode-ai/session-ui/file", () => ({ File: () => null }))
  mock.module("@/pages/directory-layout", () => ({
    default: () => null,
    DirectoryDataProvider: (props: { children?: unknown }) => props.children,
  }))
  mock.module("@/pages/layout", () => ({ default: (props: { children?: unknown }) => props.children }))
  mock.module("@/pages/layout-new", () => ({ default: (props: { children?: unknown }) => props.children }))
  mock.module("@/pages/session", () => ({
    SessionPage: () => null,
    SessionRouteErrorBoundary: (props: { children?: unknown }) => props.children,
    TargetSessionRouteContent: () => null,
  }))
  mock.module("@/pages/home", () => ({ NewHome: () => null, LegacyHome: () => null }))
  mock.module("@/pages/agentic-terminal", () => ({ default: () => null }))
  mock.module("@/context/comments", () => ({ CommentsProvider: (props: { children?: unknown }) => props.children }))
  mock.module("@/context/prompt", () => ({ PromptProvider: (props: { children?: unknown }) => props.children }))

  const mod = await import("./app")
  AgenticCommands = mod.AgenticCommands
})

const stubPlatform: Platform = {
  platform: "web",
  openLink: () => {},
  restart: async () => {},
  back: () => {},
  forward: () => {},
  notify: async () => {},
}

function CommandProbe(props: { onReady: (getOptions: () => CommandOption[]) => void }) {
  const command = useCommand()
  props.onReady(() => command.options)
  return null
}

function SettingsProbe(props: { onReady: (settings: ReturnType<typeof useSettings>) => void }) {
  const settings = useSettings()
  props.onReady(settings)
  return null
}

// Combines the leaf consumers into ONE component (rather than an array of
// several null-returning components passed as JSX/h() children). solid-js/h
// has a bug in its array-children resolution (dist/h.js: `while
// (list[i][$ELEMENT]) list[i] = list[i]()` does not guard against an entry
// resolving to `null`, which every one of these leaves does) that throws
// "null is not an object" as soon as more than one null-returning component
// shares an array slot. Calling them as plain function invocations from a
// single wrapper sidesteps that h()-library bug without touching product
// code; each hook call below still resolves against whatever Owner/context is
// active at the point TestLeaves itself is mounted (deferred correctly by the
// buildTree pattern), identically to mounting them individually.
function TestLeaves(props: {
  onCommandReady: (getOptions: () => CommandOption[]) => void
  onSettingsReady?: (settings: ReturnType<typeof useSettings>) => void
}) {
  AgenticCommands()
  CommandProbe({ onReady: props.onCommandReady })
  if (props.onSettingsReady) SettingsProbe({ onReady: props.onSettingsReady })
  return null
}

function seedNewLayoutDesigns(enabled: boolean) {
  // Matches the raw (unprefixed) "settings.v3" key persisted() writes to when
  // called with a bare string target (context/settings.tsx:223) -- the same
  // key the e2e setLayoutMode() helper seeds (e2e/agentic-terminal/chrome-reachability.spec.ts).
  localStorage.setItem("settings.v3", JSON.stringify({ general: { newLayoutDesigns: enabled } }))
}

// Builds PlatformProvider > LanguageProvider > DialogProvider > SettingsProvider
// > MemoryRouter(root) > CommandProvider > [AgenticCommands, probes, route
// content] -- see the note above on why `children` must be a `get children()`
// accessor at every level rather than a positional h()/JSX argument.
function buildTree(commandChildren: () => unknown) {
  return h(PlatformProvider, {
    value: stubPlatform,
    get children() {
      return h(LanguageProvider, {
        get children() {
          return h(DialogProvider, {
            get children() {
              return h(SettingsProvider, {
                get children() {
                  return h(MemoryRouter, {
                    root: () =>
                      h(CommandProvider, {
                        get children() {
                          return commandChildren()
                        },
                      }),
                    get children() {
                      return h(Route, { path: "/", component: () => null })
                    },
                  })
                },
              })
            },
          })
        },
      })
    },
  })
}

// SettingsProvider's store resolves via persisted()'s createResource (even in
// the synchronous localStorage-backed web-platform path, the resource's
// fetcher is `async`, so it settles on a microtask, not synchronously at
// mount) -- see context/settings.tsx:253-255: newLayoutDesigns() falls back
// to legacyNewLayoutDesignsDefault while `!ready()`, which would otherwise
// mask an unseeded/mis-seeded store behind a coincidentally-matching default.
// Poll (via microtask ticks) until settings.ready() is genuinely true before
// asserting on newLayoutDesigns(), so the ON/OFF assertions below prove the
// seed itself, not the pre-ready fallback.
async function waitForSettingsReady(settings: () => ReturnType<typeof useSettings>) {
  for (let i = 0; i < 50; i++) {
    if (settings().ready()) return
    await Promise.resolve()
  }
  throw new Error("settings never became ready")
}

function mountAgenticCommandsTree(host: HTMLElement) {
  let getOptions: () => CommandOption[] = () => []
  let settings: ReturnType<typeof useSettings> | undefined

  const dispose = render(
    buildTree(() =>
      h(TestLeaves, {
        onCommandReady: (fn: () => CommandOption[]) => (getOptions = fn),
        onSettingsReady: (s: ReturnType<typeof useSettings>) => (settings = s),
      }),
    ),
    host,
  )

  return {
    dispose,
    getOptions: () => getOptions(),
    settings: () => settings!,
  }
}

describe.skipIf(isServer)("AgenticCommands — context-provider mount (SR-agentic-commands-context-provider)", () => {
  let host: HTMLDivElement

  beforeEach(() => {
    localStorage.clear()
    host = document.createElement("div")
    document.body.append(host)
  })

  afterEach(() => {
    localStorage.clear()
    host.remove()
  })

  test("registers agentic.open, visible to a SIBLING probe on the SAME shared CommandProvider instance", () => {
    const harness = mountAgenticCommandsTree(host)

    const options = harness.getOptions()
    const entry = options.find((option) => option.id === "agentic.open")
    expect(entry).toBeDefined()
    expect(entry?.onSelect).toBeDefined()

    harness.dispose()
  })

  test("registers agentic.open with newLayoutDesigns seeded ON (new layout fork)", async () => {
    seedNewLayoutDesigns(true)
    const harness = mountAgenticCommandsTree(host)
    await waitForSettingsReady(harness.settings)

    // Guard against the seed silently not landing (mirrors the e2e spec's own
    // "confirm the new-layout branch actually rendered" guard).
    expect(harness.settings().general.newLayoutDesigns()).toBe(true)
    expect(harness.getOptions().some((option) => option.id === "agentic.open")).toBe(true)

    harness.dispose()
  })

  test("registers agentic.open with newLayoutDesigns seeded OFF (legacy layout fork)", async () => {
    seedNewLayoutDesigns(false)
    const harness = mountAgenticCommandsTree(host)
    await waitForSettingsReady(harness.settings)

    expect(harness.settings().general.newLayoutDesigns()).toBe(false)
    expect(harness.getOptions().some((option) => option.id === "agentic.open")).toBe(true)

    harness.dispose()
  })

  test("keyed remount (app.tsx:575 analogue) leaves exactly one agentic.open registration — no duplicate, no orphan", () => {
    let getOptions: () => CommandOption[] = () => []
    const [key, setKey] = createSignal("legacy")

    const dispose = render(
      h(Show, {
        when: key(),
        keyed: true,
        get children() {
          return () =>
            buildTree(() =>
              h(TestLeaves, { onCommandReady: (fn: () => CommandOption[]) => (getOptions = fn) }),
            )
        },
      }),
      host,
    )

    const before = getOptions().filter((option) => option.id === "agentic.open")
    expect(before.length).toBe(1)

    // Mirrors app.tsx:575 -- the keyed <Show> tears down and rebuilds the whole
    // router subtree, including CommandProvider itself (diagnostic plan §1
    // probe 1: the registration store is per-provider-instance, and register()
    // installs an onCleanup removal keyed by scope, so this must settle at
    // exactly one entry post-remount: never zero (orphan), never two (duplicate)).
    setKey("new")

    const after = getOptions().filter((option) => option.id === "agentic.open")
    expect(after.length).toBe(1)

    dispose()
  })

  test("throws 'Command context must be used within a context provider' when mounted outside CommandProvider", () => {
    // Documents the defect class at its real site: useCommand() (app.tsx:528)
    // throws unconditionally without a CommandProvider ancestor (createContext
    // has no default value — packages/ui/src/context/helper.tsx:9,32-36). This
    // is exactly what the pre-fix app.tsx:582 mount (outside CommandProvider)
    // hit on every boot. No provider chain is needed for this assertion, so it
    // is unaffected by the h()-pragma nesting wrinkle documented above.
    expect(() => {
      render(h(AgenticCommands, {}), host)
    }).toThrow("Command context must be used within a context provider")
  })
})

// COMPOSITION-LEVEL REGRESSION FENCE (Phase 3 adversarial review,
// .architect-team/reviews/9-adversarial.json, attack 3 "coverage-genuineness",
// verdict: broke). The component-mount suite above (buildTree()/TestLeaves())
// builds its OWN replica provider tree -- it mounts a genuine, non-stub
// CommandProvider and a genuine AgenticCommands, but that tree is structurally
// INDEPENDENT of app.tsx's real JSX composition (SharedProviders/AppInterface
// are never imported or rendered by any test in this file). It therefore
// cannot observe a regression where the forbidden site-(iii) trap (wrapping
// <AgenticCommands/> in its own, isolated CommandProvider) is reintroduced
// directly inside app.tsx itself -- the suite above would keep passing
// unchanged. The genuine BEHAVIORAL fence against that exact regression class
// is packages/app/e2e/agentic-terminal/chrome-reachability.spec.ts test 1
// (drives the real command palette against the real live app.tsx composition;
// an isolated-registry regression would make "agentic.open" invisible to the
// palette and time out that test's wait), wired into CI via
// .github/workflows/test.yml's e2e job. See .architect-team/reviews/9.json for
// the corrected evidence language distinguishing the two fences.
//
// This describe block adds a second, FAST, unit-speed fence for the SAME
// regression class, deliberately brittle to app.tsx's literal JSX source text
// (reading it directly via node:fs -- no import, no render, so it is
// unaffected by this package's bun-transpiler/JSX-pragma constraints
// documented above, and runs under BOTH default and --conditions=browser
// invocations). Its job is narrow and explicit: fence the 03af00544 crash
// class and its site-(iii) variant at unit speed by asserting the structural
// invariant the fix establishes in app.tsx -- exactly one CommandProvider JSX
// instantiation exists, and the single <AgenticCommands/> mount is a
// descendant of THAT provider's own JSX subtree inside SharedProviders, never
// a sibling of it and never inside a second, isolated CommandProvider
// elsewhere. It is NOT a substitute for the e2e composition fence, which
// remains the authoritative, real-browser check.
describe("AgenticCommands mount site — app.tsx composition structural fence", () => {
  const appTsxSource = readFileSync(new URL("./app.tsx", import.meta.url), "utf8")

  test("exactly one CommandProvider is instantiated in app.tsx", () => {
    // Matches JSX opening tags only (`<CommandProvider>` / `<CommandProvider `)
    // -- the `import { CommandProvider, ... } from "@/context/command"`
    // declaration has no leading "<" and is not matched.
    const commandProviderOpenTags = appTsxSource.match(/<CommandProvider(\s|>)/g) ?? []
    expect(commandProviderOpenTags.length).toBe(1)
  })

  test("the single AgenticCommands mount sits inside SharedProviders' CommandProvider subtree", () => {
    const sharedProvidersStart = appTsxSource.indexOf("function SharedProviders(")
    expect(sharedProvidersStart).toBeGreaterThan(-1)
    const nextFunctionStart = appTsxSource.indexOf("\nfunction ", sharedProvidersStart + 1)
    expect(nextFunctionStart).toBeGreaterThan(sharedProvidersStart)
    const sharedProvidersBody = appTsxSource.slice(sharedProvidersStart, nextFunctionStart)

    const openIndex = sharedProvidersBody.indexOf("<CommandProvider>")
    const closeIndex = sharedProvidersBody.indexOf("</CommandProvider>")
    expect(openIndex).toBeGreaterThan(-1)
    expect(closeIndex).toBeGreaterThan(openIndex)

    // <AgenticCommands/> must appear strictly between CommandProvider's own
    // open and close tags -- a sibling mount (the old app.tsx:582 site,
    // outside any provider) or a mount after the close tag would fail this.
    const agenticMountIndex = sharedProvidersBody.indexOf("<AgenticCommands")
    expect(agenticMountIndex).toBeGreaterThan(openIndex)
    expect(agenticMountIndex).toBeLessThan(closeIndex)

    // Exactly one <AgenticCommands/> JSX mount exists in the WHOLE file (the
    // `export function AgenticCommands()` declaration has no leading "<" and
    // is not matched) -- guards against a regression that reintroduces a
    // SECOND mount elsewhere while leaving this one in place.
    const allMounts = appTsxSource.match(/<AgenticCommands(\s|\/|>)/g) ?? []
    expect(allMounts.length).toBe(1)
  })

  test("no CommandProvider wraps AgenticCommands anywhere outside SharedProviders (anti site-(iii))", () => {
    // Belt-and-suspenders against the forbidden site-(iii) trap: since exactly
    // one CommandProvider exists in the whole file (first test above) and its
    // subtree is the one that contains the mount (second test above), there is
    // no OTHER CommandProvider instance anywhere for a future edit to
    // isolate AgenticCommands's registration inside. Re-derives both facts
    // independently (not just re-asserting the prior tests) so this test
    // fails on its own if the invariant is ever violated.
    const commandProviderOpenTags = [...appTsxSource.matchAll(/<CommandProvider(\s|>)/g)]
    expect(commandProviderOpenTags.length).toBe(1)
    const providerIndex = commandProviderOpenTags[0]!.index!
    const commandProviderCloseIndex = appTsxSource.indexOf("</CommandProvider>", providerIndex)
    const agenticMountIndex = appTsxSource.indexOf("<AgenticCommands")
    expect(agenticMountIndex).toBeGreaterThan(providerIndex)
    expect(agenticMountIndex).toBeLessThan(commandProviderCloseIndex)
  })
})

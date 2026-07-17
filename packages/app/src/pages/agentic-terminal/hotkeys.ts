import { onCleanup, onMount } from "solid-js"
import { useTerminalStore, type TerminalStoreContextValue } from "./store"

function isTextEntryTarget(target: EventTarget | null) {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
}

export function handleTerminalHotkey(event: KeyboardEvent, terminal: TerminalStoreContextValue) {
  const { state, actions, source } = terminal

  if (isTextEntryTarget(event.target)) {
    if (event.key === "Escape" && state.openFile) actions.closeFile()
    return
  }

  if (event.key === " ") {
    event.preventDefault()
    source.toggle()
    return
  }

  if (event.key === "v") {
    actions.setView(state.view === "mission" ? "tui" : "mission")
    return
  }

  if (event.key === "Escape") {
    if (state.openFile) actions.closeFile()
    return
  }

  if (event.key === "ArrowRight") {
    if (!state.fork.open) source.stepForward()
    return
  }

  if (event.key === "ArrowLeft") {
    source.stepBackward()
    return
  }

  if (!state.fork.open || (event.key !== "1" && event.key !== "2")) return
  const option = state.fork.options.find((item) => item.key === event.key)
  if (option) source.resolveFork(option.value ?? option.key)
}

export function useTerminalHotkeys(terminal = useTerminalStore()) {
  const listener = (event: KeyboardEvent) => handleTerminalHotkey(event, terminal)

  onMount(() => window.addEventListener("keydown", listener))
  onCleanup(() => window.removeEventListener("keydown", listener))
}

export function TerminalHotkeys() {
  useTerminalHotkeys()
  return null
}

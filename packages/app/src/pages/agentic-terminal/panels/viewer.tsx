import { createEffect, createSignal, For, Match, Show, Switch } from "solid-js"
import type { TerminalStoreContextValue } from "../store"

export interface FileViewerProps {
  terminal: TerminalStoreContextValue
}

interface MarkdownBlock {
  text: string
  kind: "h1" | "h2" | "bullet" | "meta" | "code" | "body"
}

export function parseMarkdownBlocks(content: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = []
  let inCode = false

  for (const original of content.split("\n")) {
    if (original.trim().startsWith("```")) {
      inCode = !inCode
      continue
    }
    if (!original.trim()) continue
    if (inCode) {
      blocks.push({ text: original, kind: "code" })
      continue
    }
    if (original.startsWith("# ")) {
      blocks.push({ text: original.slice(2).replaceAll("`", ""), kind: "h1" })
      continue
    }
    if (original.startsWith("## ")) {
      blocks.push({ text: original.slice(3).replaceAll("`", ""), kind: "h2" })
      continue
    }
    if (original.startsWith("- ")) {
      blocks.push({ text: `• ${original.slice(2).replaceAll("`", "")}`, kind: "bullet" })
      continue
    }
    if (/^_.*_$/.test(original.trim())) {
      blocks.push({ text: original.trim().slice(1, -1).replaceAll("`", ""), kind: "meta" })
      continue
    }
    blocks.push({ text: original.replaceAll("`", ""), kind: "body" })
  }

  return blocks
}

function MarkdownView(props: { content: string }) {
  const styles = {
    h1: { color: "var(--terminal-primary)", "font-size": "17px", "font-weight": 700, margin: "6px 0" },
    h2: { color: "var(--terminal-accent)", "font-size": "13.5px", "font-weight": 700, margin: "12px 0 4px" },
    bullet: { color: "var(--terminal-content)", "font-size": "12.5px", "margin-left": "10px", margin: "2px 0 2px 10px" },
    meta: { color: "var(--terminal-muted)", "font-size": "11.5px", margin: "2px 0" },
    code: { color: "var(--terminal-success)", "font-size": "12.5px", background: "var(--terminal-panel)", padding: "1px 10px", margin: 0 },
    body: { color: "var(--terminal-content)", "font-size": "12.5px", margin: "2px 0" },
  } as const

  return (
    <div style={{ flex: 1, "overflow-y": "auto", "overflow-x": "hidden", padding: "14px 18px", "line-height": 1.6, "text-wrap": "pretty" }}>
      <For each={parseMarkdownBlocks(props.content)}>{(block) => <div style={{ ...styles[block.kind], "border-radius": block.kind === "code" ? "4px" : "0" }}>{block.text}</div>}</For>
    </div>
  )
}

function CodeView(props: { content: string }) {
  const colorFor = (line: string) => {
    const trimmed = line.trim()
    if (trimmed.startsWith("//")) return "var(--terminal-dim)"
    if (/^(import|export|const|return|if)\b/.test(trimmed)) return "var(--terminal-code-keyword)"
    return "var(--terminal-content)"
  }

  return (
    <div style={{ flex: 1, "min-height": 0, "overflow-y": "auto", "overflow-x": "auto", padding: "12px 0" }}>
      <For each={props.content.split("\n")}>
        {(line, index) => (
          <div style={{ display: "flex", width: "max-content", "min-width": "100%", "font-size": "12.5px", "line-height": 1.6 }}>
            <span style={{ color: "var(--terminal-line-number)", padding: "0 14px", "white-space": "pre", "user-select": "none" }}>
              {String(index() + 1).padStart(3)}
            </span>
            <span style={{ color: colorFor(line), "white-space": "pre" }}>{line || " "}</span>
          </div>
        )}
      </For>
    </div>
  )
}

export function FileViewer(props: FileViewerProps) {
  const [buffer, setBuffer] = createSignal("")
  const path = () => props.terminal.state.openFile
  const file = () => {
    const current = path()
    return current ? props.terminal.state.files[current] : undefined
  }
  const modified = () => {
    const current = path()
    return current ? props.terminal.state.fileEdits[current] !== undefined : false
  }
  const content = () => {
    const current = path()
    const canonical = file()?.content ?? ""
    return current && props.terminal.state.fileEdits[current] !== undefined
      ? props.terminal.state.fileEdits[current]!
      : canonical
  }

  createEffect(() => {
    const currentPath = path()
    if (!currentPath || props.terminal.state.editing) return
    setBuffer(content())
  })

  const beginEdit = () => {
    setBuffer(content())
    props.terminal.actions.setEditing(true)
  }
  const save = () => {
    const current = path()
    if (!current) return
    props.terminal.actions.saveFileEdit(current, buffer())
    props.terminal.source.saveFileEdit?.(current, buffer())
  }
  const revert = () => {
    const current = path()
    if (!current) return
    props.terminal.actions.revertFileEdit(current)
    setBuffer(file()?.content ?? "")
  }

  return (
    <Show when={path() && file()}>
      <aside
        data-screen-label="File viewer"
        style={{
          position: "absolute",
          top: "46px",
          right: 0,
          bottom: 0,
          width: "640px",
          "max-width": "84vw",
          display: "flex",
          "flex-direction": "column",
          background: "var(--terminal-overlay)",
          "border-left": "1px solid var(--terminal-border-strong)",
          "box-shadow": "var(--terminal-viewer-shadow)",
          "z-index": 20,
        }}
      >
        <header style={{ display: "flex", "align-items": "center", gap: "10px", padding: "10px 14px", "border-bottom": "1px solid var(--terminal-border)" }}>
          <span style={{ color: "var(--terminal-file)", "font-size": "12px" }}>▤</span>
          <span style={{ flex: 1, color: "var(--terminal-text)", "font-size": "12.5px", overflow: "hidden", "text-overflow": "ellipsis", "white-space": "nowrap" }}>{path()}</span>
          <span style={{ color: "var(--terminal-muted)", border: "1px solid var(--terminal-border-strong)", "border-radius": "4px", padding: "1px 6px", "font-size": "10px" }}>{file()?.lang}</span>
          <Show when={modified()}>
            <span data-viewer-modified="true" style={{ color: "var(--terminal-warn)", border: "1px solid var(--terminal-warn)", "border-radius": "4px", padding: "1px 6px", "font-size": "10px" }}>modified</span>
          </Show>
          <button
            type="button"
            data-viewer-action={props.terminal.state.editing ? "save" : "edit"}
            onClick={() => (props.terminal.state.editing ? save() : beginEdit())}
            style={{ background: "var(--terminal-raised)", border: "1px solid var(--terminal-border-strong)", "border-radius": "4px", color: "var(--terminal-text)", "font-family": "inherit", "font-size": "11px", padding: "4px 12px", cursor: "pointer" }}
          >
            {props.terminal.state.editing ? "save" : "edit"}
          </button>
          <Show when={modified()}>
            <button
              type="button"
              data-viewer-action="revert"
              onClick={revert}
              style={{ background: "transparent", border: "1px solid var(--terminal-border)", "border-radius": "4px", color: "var(--terminal-muted)", "font-family": "inherit", "font-size": "11px", padding: "4px 10px", cursor: "pointer" }}
            >
              revert
            </button>
          </Show>
          <button
            type="button"
            aria-label="Close file viewer"
            data-viewer-action="close"
            onClick={() => props.terminal.actions.closeFile()}
            style={{ background: "transparent", border: "none", color: "var(--terminal-muted)", "font-family": "inherit", "font-size": "14px", padding: "2px 6px", cursor: "pointer" }}
          >
            ✕
          </button>
        </header>

        <Switch>
          <Match when={props.terminal.state.editing}>
            <textarea
              id="fileeditor"
              value={buffer()}
              onInput={(event) => setBuffer(event.currentTarget.value)}
              spellcheck={false}
              style={{ flex: 1, background: "var(--terminal-bg)", border: "none", outline: "none", resize: "none", color: "var(--terminal-code-keyword)", "font-family": "inherit", "font-size": "12.5px", "line-height": 1.6, padding: "14px 16px" }}
            />
          </Match>
          <Match when={file()?.lang === "md"}>
            <MarkdownView content={content()} />
          </Match>
          <Match when={file()?.lang !== "md"}>
            <CodeView content={content()} />
          </Match>
        </Switch>

        <footer style={{ "flex-shrink": 0, padding: "7px 14px", "border-top": "1px solid var(--terminal-border)", color: "var(--terminal-dim)", "font-size": "10.5px" }}>
          edits stay in this session · esc to close
        </footer>
      </aside>
    </Show>
  )
}

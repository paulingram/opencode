import { expect, test } from "bun:test"
import { isServer, render } from "solid-js/web"

test.skipIf(isServer)("agentic terminal component tests resolve the browser renderer", () => {
  const host = document.createElement("div")
  document.body.append(host)
  const dispose = render(() => {
    const node = document.createElement("span")
    node.textContent = "browser"
    return node
  }, host)
  expect(host.textContent).toBe("browser")
  dispose()
  host.remove()
})

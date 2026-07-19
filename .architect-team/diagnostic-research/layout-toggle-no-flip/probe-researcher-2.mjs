// Diagnostic probe — researcher 2 — SR-layout-toggle-no-flip-20260719T1130Z
// Drives the packages/app dev server (reused, already listening on :3000) headless
// and reproduces chrome-reachability.spec.ts test 4's exact seed + click sequence,
// then runs the counterfactual: a profile seeded ONCE like a real transition-eligible
// user (no init-script re-seed across the product-initiated reload).
//
// Evidence captured per scenario:
//   (a) post-click switch state           -> sessionStorage snapshot taken at beforeunload
//   (b) localStorage settings.v3 post-click (pre-reload + post-reload)
//   (c) keyed remount / v2 markers        -> titlebar-v2 presence pre-reload + final
//   (d) console/page errors
//   (e) document load count               -> proves whether window.location.reload fired
//
// Run: node probe-researcher-2.mjs   (Node v24; resolves @playwright/test from packages/app)

import { createRequire } from "node:module"

const APP_PKG = "C:/Users/Paul/Documents/terminus_maximus/.opencode-worktrees/agentic-terminal-desktop-app/packages/app/package.json"
const require = createRequire(APP_PKG)
const { chromium } = require("@playwright/test")

const BASE = "http://127.0.0.1:3000"

// Runs on EVERY document load. Counts loads and snapshots app state into
// sessionStorage at beforeunload (sessionStorage survives a same-tab reload).
const instrumentation = () => {
  try {
    const n = Number(sessionStorage.getItem("probe.loads") || "0") + 1
    sessionStorage.setItem("probe.loads", String(n))
    window.addEventListener("beforeunload", () => {
      try {
        sessionStorage.setItem("probe.unload.settings", localStorage.getItem("settings.v3") ?? "null")
        sessionStorage.setItem(
          "probe.unload.titlebarV2",
          document.querySelector('[data-slot="titlebar-v2"]') ? "present" : "absent",
        )
        const row = document.querySelector('[data-action="settings-new-layout-designs"]')
        const sw = row && (row.querySelector('[role="switch"]') || row.querySelector('[data-slot="switch-input"]'))
        sessionStorage.setItem(
          "probe.unload.switch",
          sw ? (sw.getAttribute("aria-checked") ?? String(sw.checked)) : "no-switch-in-dom",
        )
        sessionStorage.setItem("probe.unload.url", location.href)
      } catch {}
    })
  } catch {}
}

// EXACT replica of the failing test's setLayoutMode(page, false) seed — re-runs on
// every document load, including any product-initiated reload.
const testSeed = () => {
  try {
    localStorage.setItem(
      "settings.v3",
      JSON.stringify({ general: { newLayoutDesigns: false, layoutTransitionEligible: true } }),
    )
    localStorage.setItem("app-version.v1", JSON.stringify({ version: "1.18.2" }))
  } catch {}
}

// Counterfactual: same values, but written ONCE (guarded), like a real persisted
// profile of a transition-eligible user who has launched 1.18.2 before.
const realUserSeed = () => {
  try {
    if (!localStorage.getItem("probe.seeded")) {
      localStorage.setItem("probe.seeded", "1")
      localStorage.setItem(
        "settings.v3",
        JSON.stringify({ general: { newLayoutDesigns: false, layoutTransitionEligible: true } }),
      )
      localStorage.setItem("app-version.v1", JSON.stringify({ version: "1.18.2" }))
    }
  } catch {}
}

async function drive(page, log) {
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" })
  await page.waitForSelector("[data-component='sidebar-nav-desktop']", { timeout: 20000 })
  log.push("legacy sidebar rendered")

  // Test 4 fidelity: legacy entry -> /agentic -> back -> sidebar.
  await page.getByRole("button", { name: "Agentic Terminal" }).first().click()
  await page.waitForURL((u) => u.pathname === "/agentic", { timeout: 20000 })
  log.push("navigated to /agentic via legacy entry")
  await page.goBack()
  await page.waitForSelector("[data-component='sidebar-nav-desktop']", { timeout: 20000 })
  log.push("goBack -> legacy shell")

  await page.getByRole("button", { name: "Settings" }).first().click()
  const toggleRow = page.locator('[data-action="settings-new-layout-designs"]')
  await toggleRow.getByRole("switch").waitFor({ state: "visible", timeout: 20000 })
  log.push("settings dialog open, toggle row visible")

  const control = toggleRow.locator('[data-slot="switch-control"]')
  await control.scrollIntoViewIfNeeded()
  await control.click()
  log.push("switch-control clicked")

  // Race the 0ms-setTimeout reload: try to read state in the SAME document.
  let immediate
  try {
    immediate = await page.evaluate(() => {
      const row = document.querySelector('[data-action="settings-new-layout-designs"]')
      const sw = row && (row.querySelector('[role="switch"]') || row.querySelector('[data-slot="switch-input"]'))
      return {
        ariaChecked: sw ? (sw.getAttribute("aria-checked") ?? String(sw.checked)) : "no-switch",
        settingsV3: localStorage.getItem("settings.v3"),
        titlebarV2: document.querySelector('[data-slot="titlebar-v2"]') ? "present" : "absent",
        loads: sessionStorage.getItem("probe.loads"),
      }
    })
  } catch (e) {
    immediate = { error: "evaluate raced navigation: " + String(e.message).slice(0, 120) }
  }

  let flipped = true
  try {
    await page.waitForSelector('[data-slot="titlebar-v2"]', { timeout: 15000 })
  } catch {
    flipped = false
  }

  const final = await page.evaluate(() => ({
    url: location.href,
    loads: sessionStorage.getItem("probe.loads"),
    unloadSettings: sessionStorage.getItem("probe.unload.settings"),
    unloadTitlebarV2: sessionStorage.getItem("probe.unload.titlebarV2"),
    unloadSwitch: sessionStorage.getItem("probe.unload.switch"),
    unloadUrl: sessionStorage.getItem("probe.unload.url"),
    settingsV3Now: localStorage.getItem("settings.v3"),
    titlebarV2Now: document.querySelector('[data-slot="titlebar-v2"]') ? "present" : "absent",
    legacySidebarNow: document.querySelector("[data-component='sidebar-nav-desktop']") ? "present" : "absent",
    settingsDialogOpenNow: document.querySelector('[data-action="settings-new-layout-designs"]') ? "yes" : "no",
  }))

  return { immediate, flipped, final }
}

async function scenario(browser, name, seedFn) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  const errors = []
  page.on("pageerror", (e) => errors.push("pageerror: " + String(e).slice(0, 200)))
  page.on("console", (m) => {
    if (m.type() === "error") errors.push("console.error: " + m.text().slice(0, 200))
  })
  await page.addInitScript(instrumentation)
  await page.addInitScript(seedFn)

  const log = []
  let result
  try {
    result = await drive(page, log)
  } catch (e) {
    result = { fatal: String(e).slice(0, 500) }
  }
  await context.close()
  return { name, log, ...result, errors: errors.slice(0, 10) }
}

const browser = await chromium.launch({ headless: true })
const A = await scenario(browser, "A: exact test-4 seed (init script re-runs on reload)", testSeed)
const B = await scenario(browser, "B: real transition-eligible user (seed written once)", realUserSeed)
await browser.close()

console.log(JSON.stringify({ A, B }, null, 2))

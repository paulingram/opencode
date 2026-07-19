// Diagnostic probe — researcher 1 — SR-layout-toggle-no-flip-20260719T1130Z
// Question: why does the New-layout-designs switch click not transition the app
// to the v2 layout in the e2e run (chrome-reachability.spec.ts test 4)?
//
// Scenario A ("as-failing-test"): seeds EXACTLY like the failing test's
//   setLayoutMode(page, false) — an addInitScript that re-runs on EVERY document
//   load (including product-initiated window.location.reload()).
// Scenario B ("real-user counterfactual"): identical seed but applied ONCE
//   (guarded by sessionStorage), emulating a real transition-eligible user who
//   is currently on legacy — a persistent profile that survives the reload.
//
// Instrumentation (recorder init script, added BEFORE the seed script so it
// observes the pre-seed carried-over localStorage on each boot):
//   - __bootLog: per-document-load record of location.href + settings.v3 +
//     app-version.v1 AS CARRIED OVER from the previous document (pre-clobber).
//   - __titlebarV2SeenAt: MutationObserver flags if [data-slot="titlebar-v2"]
//     ever attaches, even transiently (detects the keyed-Show remount flash
//     before the reload).
// Plus: framenavigated/load counters, console errors, pageerror, post-click
// aria-checked + localStorage sampling (reload-race tolerant).
import fs from "node:fs"
import { createRequire } from "node:module"
const require = createRequire("C:/Users/Paul/Documents/terminus_maximus/.opencode-worktrees/agentic-terminal-desktop-app/packages/app/package.json")
const { chromium } = require("@playwright/test")

const BASE = process.env.PROBE_BASE_URL ?? "http://127.0.0.1:3000"
const OUT = new URL("./probe-artifacts/", import.meta.url)
fs.mkdirSync(OUT, { recursive: true })

const recorderScript = () => {
  try {
    const log = JSON.parse(sessionStorage.getItem("__bootLog") ?? "[]")
    log.push({
      href: location.href,
      t: Date.now(),
      settingsV3_preSeed: localStorage.getItem("settings.v3"),
      appVersion_preSeed: localStorage.getItem("app-version.v1"),
    })
    sessionStorage.setItem("__bootLog", JSON.stringify(log))
    const seen = () => {
      if (!sessionStorage.getItem("__titlebarV2SeenAt")) {
        sessionStorage.setItem("__titlebarV2SeenAt", JSON.stringify({ t: Date.now(), href: location.href }))
      }
    }
    const check = () => {
      if (document.querySelector?.('[data-slot="titlebar-v2"]')) seen()
    }
    check()
    new MutationObserver(check).observe(document.documentElement, { childList: true, subtree: true })
  } catch {}
}

// EXACT copy of the failing test's seed (chrome-reachability.spec.ts:77-89), mode=false
const seedEveryLoad = (mode) => {
  try {
    localStorage.setItem(
      "settings.v3",
      JSON.stringify({ general: { newLayoutDesigns: mode, layoutTransitionEligible: true } }),
    )
    localStorage.setItem("app-version.v1", JSON.stringify({ version: "1.18.2" }))
  } catch {}
}

// Real-user counterfactual: same profile contents, applied once per tab session
const seedOnce = (mode) => {
  try {
    if (sessionStorage.getItem("__seededOnce")) return
    localStorage.setItem(
      "settings.v3",
      JSON.stringify({ general: { newLayoutDesigns: mode, layoutTransitionEligible: true } }),
    )
    localStorage.setItem("app-version.v1", JSON.stringify({ version: "1.18.2" }))
    sessionStorage.setItem("__seededOnce", "1")
  } catch {}
}

async function runScenario(browser, name, seedFn) {
  const result = { scenario: name, consoleErrors: [], pageErrors: [], loads: [] }
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  const page = await context.newPage()
  page.on("console", (m) => {
    if (m.type() === "error") result.consoleErrors.push(m.text().slice(0, 500))
  })
  page.on("pageerror", (e) => result.pageErrors.push(String(e).slice(0, 500)))
  page.on("framenavigated", (f) => {
    if (f === page.mainFrame()) result.loads.push({ url: f.url(), t: Date.now() })
  })

  await context.addInitScript(recorderScript) // added FIRST: sees pre-seed storage
  await context.addInitScript(seedFn, false) // added SECOND: the test's seed (mode=false)

  await page.goto(BASE + "/")
  await page.waitForSelector("[data-component='sidebar-nav-desktop']", { timeout: 30000 })

  // Drive exactly like test 4 does after goBack (we start at "/", same shell)
  const settingsButton = page.getByRole("button", { name: "Settings" }).first()
  await settingsButton.click()
  const toggleRow = page.locator('[data-action="settings-new-layout-designs"]')
  const toggleInput = toggleRow.getByRole("switch")
  await toggleInput.waitFor({ state: "visible", timeout: 15000 })
  result.preClick = {
    ariaChecked: await toggleInput.getAttribute("aria-checked").catch(() => "<unreadable>"),
    settingsV3: await page.evaluate(() => localStorage.getItem("settings.v3")).catch(() => "<unreadable>"),
  }
  await toggleRow.locator('[data-slot="switch-control"]').scrollIntoViewIfNeeded()
  const clickAt = Date.now()
  await toggleRow.locator('[data-slot="switch-control"]').click()

  // (a)/(b) immediate post-click sampling — tolerant of the reload racing us
  result.immediatePostClick = { t: Date.now() - clickAt }
  try {
    result.immediatePostClick.ariaChecked = await toggleInput.getAttribute("aria-checked", { timeout: 500 })
  } catch (e) {
    result.immediatePostClick.ariaChecked = "<race:" + String(e).slice(0, 80) + ">"
  }
  try {
    result.immediatePostClick.settingsV3 = await page.evaluate(() => localStorage.getItem("settings.v3"))
  } catch (e) {
    result.immediatePostClick.settingsV3 = "<race:" + String(e).slice(0, 80) + ">"
  }

  // (c) does the v2 titlebar appear within 20s?
  let titlebarAppeared = false
  try {
    await page.waitForSelector('[data-slot="titlebar-v2"]', { timeout: 20000 })
    titlebarAppeared = true
  } catch {}
  result.titlebarV2AppearedWithin20s = titlebarAppeared

  // Final state dump
  result.final = await page
    .evaluate(() => ({
      href: location.href,
      settingsV3: localStorage.getItem("settings.v3"),
      appVersion: localStorage.getItem("app-version.v1"),
      bootLog: JSON.parse(sessionStorage.getItem("__bootLog") ?? "[]"),
      titlebarV2SeenAt: sessionStorage.getItem("__titlebarV2SeenAt"),
      titlebarV2NowInDom: !!document.querySelector('[data-slot="titlebar-v2"]'),
      legacySidebarNowInDom: !!document.querySelector("[data-component='sidebar-nav-desktop']"),
      dialogOpenCount: document.querySelectorAll('[role="dialog"]').length,
      switchInDom: !!document.querySelector('[data-action="settings-new-layout-designs"]'),
    }))
    .catch((e) => ({ error: String(e).slice(0, 300) }))

  await page.screenshot({ path: new URL(`${name}-final.png`, OUT).pathname.replace(/^\/([A-Za-z]:)/, "$1") })
  await context.close()
  return result
}

const browser = await chromium.launch({ headless: true })
const results = {}
results.A_asFailingTest_seedEveryLoad = await runScenario(browser, "A-as-failing-test", seedEveryLoad)
results.B_realUser_seedOnce = await runScenario(browser, "B-real-user-counterfactual", seedOnce)
await browser.close()

const outPath = new URL("probe-results.json", OUT).pathname.replace(/^\/([A-Za-z]:)/, "$1")
fs.writeFileSync(outPath, JSON.stringify(results, null, 2))
console.log(JSON.stringify(results, null, 2))

// Diagnostic probe for SR-layout-toggle-no-flip-20260719T1130Z (researcher 3).
// Drives the live Vite dev server on http://127.0.0.1:3000 (already running,
// per AGENTS.md "never restart the app") with the repo's own @playwright/test
// chromium, reproducing chrome-reachability.spec.ts test 4's toggle step under
// instrumentation, plus a seed-once "real transition-eligible user"
// counterfactual.
//
// Scenario A  — EXACT test-4 seed semantics: addInitScript re-seeds
//               settings.v3 = {newLayoutDesigns:false, layoutTransitionEligible:true}
//               on EVERY document load (that is what page.addInitScript does).
// Scenario B1 — seed ONCE (guarded by a marker key): same initial profile, but
//               subsequent reloads keep whatever the app wrote. This is what a
//               real transition-eligible legacy-mode user's profile does.
// Scenario B2 — seed ONCE, eligible:true but NO newLayoutDesigns key at all
//               (documents the dev-channel default resolution).
//
// In-page instrumentation persists a log into localStorage "__probe_log"
// (via captured native setItem so it survives reloads and is never clobbered
// by the seed, which only writes settings.v3/app-version.v1):
//   boot counter, every settings.v3 setItem (value + boot#), first appearance
//   of [data-slot="titlebar-v2"] / [data-component='sidebar-nav-desktop'] per
//   boot, and pagehide (proves a full navigation/reload happened).

import { createRequire } from "module"
import { mkdirSync, writeFileSync } from "fs"
import { fileURLToPath } from "url"
import { dirname, join } from "path"

const appPkg =
  "C:/Users/Paul/Documents/terminus_maximus/.opencode-worktrees/agentic-terminal-desktop-app/packages/app/package.json"
const require = createRequire(appPkg)
const { chromium } = require("@playwright/test")

const here = dirname(fileURLToPath(import.meta.url))
const artifacts = join(here, "artifacts")
mkdirSync(artifacts, { recursive: true })

const BASE = "http://127.0.0.1:3000"

const instrumentation = () => {
  try {
    const nativeSet = Storage.prototype.setItem.bind(localStorage)
    const nativeGet = Storage.prototype.getItem.bind(localStorage)
    const boot = parseInt(nativeGet("__probe_boots") || "0", 10) + 1
    nativeSet("__probe_boots", String(boot))
    const log = (entry) => {
      let arr = []
      try {
        arr = JSON.parse(nativeGet("__probe_log") || "[]")
      } catch {}
      arr.push(Object.assign({ t: Date.now(), boot }, entry))
      nativeSet("__probe_log", JSON.stringify(arr))
    }
    log({ ev: "boot", url: location.href })
    // Shadow the instance method so app writes to settings.v3 are recorded.
    localStorage.setItem = function (key, value) {
      if (key === "settings.v3" || key === "app-version.v1") log({ ev: "setItem", key, value })
      return nativeSet(key, value)
    }
    let seenV2 = false
    let seenLegacy = false
    const check = () => {
      if (!seenV2 && document.querySelector('[data-slot="titlebar-v2"]')) {
        seenV2 = true
        log({ ev: "titlebar-v2-appeared" })
      }
      if (!seenLegacy && document.querySelector("[data-component='sidebar-nav-desktop']")) {
        seenLegacy = true
        log({ ev: "legacy-sidebar-appeared" })
      }
    }
    const start = () => {
      check()
      new MutationObserver(check).observe(document.documentElement, { childList: true, subtree: true })
    }
    if (document.readyState === "loading") addEventListener("DOMContentLoaded", start)
    else start()
    addEventListener("pagehide", () => log({ ev: "pagehide", url: location.href }))
  } catch (e) {}
}

// Seeds. everyBoot mirrors the spec's addInitScript exactly; seedOnce guards
// with a marker key so it applies only to the first document load.
const seedEveryBoot = (payload) => {
  try {
    localStorage.setItem("settings.v3", JSON.stringify(payload.settings))
    localStorage.setItem("app-version.v1", JSON.stringify({ version: "1.18.2" }))
  } catch {}
}
const seedOnce = (payload) => {
  try {
    if (localStorage.getItem("__probe_seeded")) return
    localStorage.setItem("settings.v3", JSON.stringify(payload.settings))
    localStorage.setItem("app-version.v1", JSON.stringify({ version: "1.18.2" }))
    localStorage.setItem("__probe_seeded", "1")
  } catch {}
}

async function runScenario(browser, name, { seedFn, settings }) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  const events = []
  const consoleErrors = []
  page.on("load", () => events.push({ ev: "node:page-load", url: page.url(), t: Date.now() }))
  page.on("framenavigated", (f) => {
    if (f === page.mainFrame()) events.push({ ev: "node:framenavigated", url: f.url(), t: Date.now() })
  })
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 500))
  })
  page.on("pageerror", (err) => consoleErrors.push("pageerror: " + String(err).slice(0, 500)))

  await page.addInitScript(instrumentation)
  await page.addInitScript(seedFn, { settings })

  const result = { scenario: name, settingsSeed: settings, events, consoleErrors }
  try {
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded" })

    // Which chrome booted?
    const bootMarker = await Promise.race([
      page
        .waitForSelector("[data-component='sidebar-nav-desktop']", { timeout: 20000 })
        .then(() => "legacy-sidebar"),
      page.waitForSelector('[data-slot="titlebar-v2"]', { timeout: 20000 }).then(() => "titlebar-v2"),
    ]).catch((e) => "neither: " + String(e).slice(0, 120))
    result.bootChrome = bootMarker

    if (bootMarker !== "legacy-sidebar") {
      // Can't drive the legacy Settings button; record state and stop.
      result.note = "did not boot into legacy chrome; toggle flow not driven"
    } else {
      // Open Settings via the real sidebar control, exactly like test 4.
      const settingsButton = page.getByRole("button", { name: "Settings" }).first()
      await settingsButton.click()

      const toggleRow = page.locator('[data-action="settings-new-layout-designs"]')
      const toggleInput = toggleRow.getByRole("switch")
      await toggleInput.waitFor({ state: "visible", timeout: 15000 })
      result.preClickAriaChecked = await toggleInput.getAttribute("aria-checked")
      result.preClickStorage = await page.evaluate(() => localStorage.getItem("settings.v3"))

      await toggleRow.locator('[data-slot="switch-control"]').scrollIntoViewIfNeeded()
      await toggleRow.locator('[data-slot="switch-control"]').click()

      // Race the product's setTimeout(reload): grab immediate post-click state.
      try {
        result.postClickImmediate = await page.evaluate(() => ({
          aria: document.querySelector('[data-action="settings-new-layout-designs"] [role="switch"]')
            ?.getAttribute("aria-checked"),
          storage: localStorage.getItem("settings.v3"),
          titlebarV2: !!document.querySelector('[data-slot="titlebar-v2"]'),
          legacySidebar: !!document.querySelector("[data-component='sidebar-nav-desktop']"),
        }))
      } catch (e) {
        result.postClickImmediate = "evaluate destroyed (navigation in flight): " + String(e).slice(0, 160)
      }

      // Let any reload + reboot settle.
      await page.waitForTimeout(6000)
    }

    result.finalUrl = page.url()
    result.finalState = await page.evaluate(() => ({
      boots: localStorage.getItem("__probe_boots"),
      settingsV3: localStorage.getItem("settings.v3"),
      appVersion: localStorage.getItem("app-version.v1"),
      titlebarV2: !!document.querySelector('[data-slot="titlebar-v2"]'),
      legacySidebar: !!document.querySelector("[data-component='sidebar-nav-desktop']"),
      switchPresent: !!document.querySelector('[data-action="settings-new-layout-designs"]'),
    }))
    result.probeLog = JSON.parse(await page.evaluate(() => localStorage.getItem("__probe_log") || "[]"))
    await page.screenshot({ path: join(artifacts, name + "-final.png"), fullPage: false })
  } catch (e) {
    result.error = String(e && e.stack ? e.stack : e).slice(0, 2000)
    try {
      await page.screenshot({ path: join(artifacts, name + "-error.png") })
    } catch {}
  }
  await context.close()
  return result
}

const browser = await chromium.launch({ headless: true })
const results = []
results.push(
  await runScenario(browser, "A-exact-test-seed-everyboot", {
    seedFn: seedEveryBoot,
    settings: { general: { newLayoutDesigns: false, layoutTransitionEligible: true } },
  }),
)
results.push(
  await runScenario(browser, "B1-seed-once-real-eligible-user", {
    seedFn: seedOnce,
    settings: { general: { newLayoutDesigns: false, layoutTransitionEligible: true } },
  }),
)
results.push(
  await runScenario(browser, "B2-seed-once-no-override", {
    seedFn: seedOnce,
    settings: { general: { layoutTransitionEligible: true } },
  }),
)
await browser.close()

writeFileSync(join(artifacts, "probe-results.json"), JSON.stringify(results, null, 2))
console.log(JSON.stringify(results, null, 2))

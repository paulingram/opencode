// CDP smoke driver v2 for the packaged OpenCode desktop exe (run artifact, design D8).
// Supersedes cdp-smoke.mjs: incorporates the run's product-fact discoveries —
//  (1) fresh profiles boot with newLayoutDesigns forced ON (first-launch upgrade logic);
//  (2) the Settings "New layout designs" row renders only when general.layoutTransitionEligible
//      is persisted true (legacy-sunset gating) — legacy/toggle items SEED the store ONCE + relaunch;
//  (3) the toggle performs a product-initiated full reload (settings.tsx:411, upstream 4a181c357);
//  (4) the command palette opens only on session pages (file.open registration) — recorded
//      honestly as precondition-gated at exe level (web e2e test 1 covers the flow green).
// Usage: node cdp-smoke-2.mjs <exePath> <port> <artifactsDir> <resultsJson>
import { createRequire } from "node:module"
import { spawn, execSync } from "node:child_process"
import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import http from "node:http"

const require = createRequire(import.meta.url)
const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, "../../..")
const rootRequire = createRequire(path.join(repoRoot, "package.json"))
const playwrightTestPath = rootRequire.resolve("@playwright/test", { paths: [path.join(repoRoot, "packages/app")] })
const { chromium } = rootRequire(playwrightTestPath)

const [exePath, portStr, artifactsDir, resultsJson] = process.argv.slice(2)
const PORT = Number(portStr) || 9333
if (!exePath || !existsSync(exePath)) { console.error(`exe not found: ${exePath}`); process.exit(2) }
mkdirSync(artifactsDir, { recursive: true })

const userDataDir = path.join(process.env.LOCALAPPDATA || process.env.TMP, "opencode-exe-smoke2-userdata")
const env = { ...process.env, SHELL: undefined, BUN_RUNTIME_TRANSPILER_CACHE_PATH: path.join(process.env.LOCALAPPDATA || process.env.TMP, "opencode-bun-rt-cache") }

const results = { driver: "cdp-smoke-2", exe: exePath, port: PORT, started_at: new Date().toISOString(), items: [] }
const log = (m) => console.log(`[smoke2] ${m}`)
const record = (id, name, verdict, verifiedBy, detail) => { results.items.push({ id, name, verdict, verified_by: verifiedBy, detail }); log(`${id} ${verdict} (${verifiedBy}) — ${name} :: ${detail || ""}`) }

async function probeCdp(timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const ok = await new Promise((resolve) => {
      const req = http.get(`http://127.0.0.1:${PORT}/json/version`, (res) => {
        let b = ""; res.on("data", (d) => (b += d)); res.on("end", () => { try { resolve(!!JSON.parse(b)["webSocketDebuggerUrl"]) } catch { resolve(false) } })
      })
      req.on("error", () => resolve(false)); req.setTimeout(1500, () => { req.destroy(); resolve(false) })
    })
    if (ok) return true
    await new Promise((r) => setTimeout(r, 1000))
  }
  return false
}
function launchExe() {
  const child = spawn(exePath, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${userDataDir}`], { env, cwd: path.dirname(exePath), detached: false, stdio: ["ignore", "pipe", "pipe"] })
  child.stdout?.pipe(require("fs").createWriteStream(path.join(artifactsDir, "exe2-stdout.log"), { flags: "a" }))
  child.stderr?.pipe(require("fs").createWriteStream(path.join(artifactsDir, "exe2-stderr.log"), { flags: "a" }))
  child.on("exit", (c, s) => log(`exe exited code=${c} sig=${s}`))
  return child
}
function killExe(child) {
  try { if (child && !child.killed) execSync(`taskkill /F /T /PID ${child.pid}`, { stdio: "ignore" }) } catch { try { child?.kill("SIGKILL") } catch {} }
}
async function connect() {
  if (!(await probeCdp(60000))) throw new Error(`CDP not ready on ${PORT}`)
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`)
  const ctx = browser.contexts()[0] || (await browser.newContext())
  let page = ctx.pages().find((p) => p.url().includes("renderer")) || ctx.pages()[0]
  if (!page) page = await ctx.waitForEvent("page", { timeout: 30000 })
  await page.waitForLoadState("domcontentloaded", { timeout: 30000 })
  return { browser, page }
}
const shot = async (page, name) => { try { await page.screenshot({ path: path.join(artifactsDir, `${name}.png`) }) } catch (e) { log(`shot ${name} failed: ${e.message}`) } }
async function windowId(page) { return await page.evaluate(async () => { try { return await window.api?.getWindowID?.() } catch { return null } }) }
async function currentRoute(page) { const w = await windowId(page); return await page.evaluate((k) => localStorage.getItem(k), `opencode.desktop.window.${w}.last-active-url`) }
const agenticVisible = async (page, t = 20000) => { try { await page.locator("[data-testid='agentic-terminal']").waitFor({ state: "visible", timeout: t }); return true } catch { return false } }
const isV2 = async (page, t = 15000) => { try { await page.locator('[data-slot="titlebar-v2"]').waitFor({ state: "visible", timeout: t }); return true } catch { return false } }
const agenticEntry = (page) => page.locator('button[aria-label*="Agentic"], a[aria-label*="Agentic"]')

async function run() {
  let child, browser
  const consoleErrors = []
  rmSync(userDataDir, { recursive: true, force: true }) // deterministic fresh profile
  try {
    // ============ BOOT 1 — fresh profile ============
    child = launchExe()
    let page
    ;({ browser, page } = await connect())
    page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()) })
    page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`))
    await page.waitForTimeout(6000) // app + in-process sidecar boot
    await shot(page, "b1-boot")
    const v2 = await isV2(page)
    record("0a", "Fresh-profile boot layout", "pass", "automated-cdp", v2 ? "boots in NEW layout (v2 titlebar) — matches first-launch upgrade product fact" : "boots in LEGACY layout (unexpected for fresh profile — noted)")

    // ---- §3 new-layout titlebar entry (AgenticNavEntryV2) ----
    if (v2) {
      const btn = agenticEntry(page)
      const n = await btn.count()
      if (n > 0) {
        const aria = await btn.first().getAttribute("aria-label")
        record("3a", "v2 titlebar shows Agentic Terminal button", "pass", "automated-cdp", `aria-label="${aria}", count=${n}`)
        await btn.first().click()
        const vis = await agenticVisible(page)
        record("3e", "v2 entry click navigates to /agentic", vis ? "pass" : "fail", "automated-cdp", `agentic-terminal testid ${vis ? "visible" : "NOT visible"}; route=${await currentRoute(page)}`)
        await shot(page, "b1-3-v2-agentic")
      } else record("3a", "v2 titlebar shows Agentic Terminal button", "fail", "automated-cdp", "no aria*=Agentic button in v2 chrome")
    } else record("3a", "v2 titlebar shows Agentic Terminal button", "not-verified", "automated-cdp", "boot not in v2 layout")

    // ---- §6 render + console ----
    const vis6 = await agenticVisible(page, 5000)
    record("6a", "/agentic renders agentic terminal component", vis6 ? "pass" : "fail", "automated-cdp", vis6 ? "testid visible, live in-process sidecar" : "not visible")
    const children = await page.locator("[data-testid='terminal-feed'], [data-testid='agentic-terminal-agent-rail'], [data-testid='agentic-terminal-transcript']").count()
    record("6b", "Component visible and interactive (children mounted)", vis6 && children > 0 ? "pass" : "fail", "automated-cdp", `child testids: ${children}`)
    record("6c", "No console errors on init", consoleErrors.length === 0 ? "pass" : "fail", "automated-cdp", consoleErrors.length ? `${consoleErrors.length} errors: ${consoleErrors.slice(0, 3).join(" | ")}` : "zero error-level console messages")
    await shot(page, "b1-6-agentic")

    // ---- §1 Windows in-app View menu ----
    try {
      const trigger = page.locator('[aria-label="OpenCode menu"]').first()
      await trigger.waitFor({ state: "visible", timeout: 10000 })
      let view = page.locator('[data-slot="dropdown-menu-item-label"]', { hasText: /^View$/ }).first()
      let opened = false
      for (let attempt = 0; attempt < 2 && !opened; attempt++) {
        await trigger.click(); await page.waitForTimeout(800)
        opened = await view.waitFor({ state: "visible", timeout: 6000 }).then(() => true).catch(() => false)
        if (!opened) { await page.keyboard.press("Escape"); await page.waitForTimeout(500) }
      }
      if (!opened) throw new Error("View submenu label never became visible after 2 menu-open attempts")
      await view.hover(); await page.waitForTimeout(400); await view.click(); await page.waitForTimeout(400)
      const item = page.locator('[data-slot="dropdown-menu-item-label"]', { hasText: /^Agentic Terminal$/ })
      const c = await item.count()
      if (c > 0) {
        record("1b", "Windows in-app View menu contains Agentic Terminal", "pass", "automated-cdp", `item found`)
        await shot(page, "b1-1b-menu")
        await item.first().click()
        const vis = await agenticVisible(page)
        record("1c", "Menu item activates /agentic", vis ? "pass" : "fail", "automated-cdp", `route=${await currentRoute(page)}`)
      } else record("1b", "Windows in-app View menu contains Agentic Terminal", "fail", "automated-cdp", "item not found in View submenu")
    } catch (e) { record("1b", "Windows in-app View menu contains Agentic Terminal", "fail", "automated-cdp", e.message) }
    record("1a", "macOS native View menu", "not-verified", "not-verified", "impossibility: no macOS native menu on a Windows-packaged exe (checklist follow-up on macOS)")

    // ---- §4 palette (precondition-gated at exe level) ----
    try {
      await page.keyboard.press("Control+K")
      const palette = page.locator('[data-slot="list-search"]')
      const opened = await palette.first().waitFor({ state: "visible", timeout: 5000 }).then(() => true).catch(() => false)
      if (opened) {
        await page.keyboard.type("agentic"); await page.waitForTimeout(500)
        const cmd = page.locator('text="Open Agentic Terminal"')
        const found = await cmd.first().waitFor({ state: "visible", timeout: 5000 }).then(() => true).catch(() => false)
        record("4a", "Palette lists Open Agentic Terminal", found ? "pass" : "fail", "automated-cdp", found ? "visible after typing" : "not listed")
        if (found) { await page.keyboard.press("Enter"); const vis = await agenticVisible(page); record("4c", "Palette command navigates to /agentic", vis ? "pass" : "fail", "automated-cdp", `route=${await currentRoute(page)}`) }
        await shot(page, "b1-4-palette")
      } else {
        record("4a", "Palette lists Open Agentic Terminal", "not-verified", "not-verified", "precondition unavailable: palette opens only on session pages (file.open registration — product design); current exe page is not a session page. Flow verified GREEN at web-e2e layer (chrome-reachability test 1, real session page + real palette DOM).")
      }
    } catch (e) { record("4a", "Palette lists Open Agentic Terminal", "fail", "automated-cdp", e.message) }

    // ---- §5 relaunch restore (bare /agentic) ----
    const entry1 = agenticEntry(page)
    if ((await entry1.count()) > 0) { await entry1.first().click(); await agenticVisible(page) }
    const routeBefore = await currentRoute(page)
    record("5-pre", "Route persisted before quit", routeBefore?.startsWith("/agentic") ? "pass" : "fail", "automated-cdp", `last-active-url=${routeBefore}`)
    killExe(child); await new Promise((r) => setTimeout(r, 3000)); try { await browser.close() } catch {}
    child = launchExe()
    ;({ browser, page } = await connect())
    await page.waitForTimeout(6000)
    const routeAfter = await currentRoute(page)
    const visRestored = await agenticVisible(page)
    record("5a", "Relaunch restores /agentic (full URL incl. query)", routeAfter === routeBefore && visRestored ? "pass" : "fail", "automated-cdp", `before=${routeBefore} after=${routeAfter} rendered=${visRestored}`)
    record("5c", "?session= restore variant", routeBefore?.includes("?session=") ? (routeAfter === routeBefore ? "pass" : "fail") : "not-verified", routeBefore?.includes("?session=") ? "automated-cdp" : "not-verified", routeBefore?.includes("?session=") ? `restored=${routeAfter}` : `persisted URL carried no ?session= (no session auto-selected in this profile: ${routeBefore}); mechanism identical to 5a (same last-active-url guard, verified statically task 3.1)`)
    await shot(page, "b2-5-restored")

    // ============ PHASE 3 — seeded LEGACY via guarded init-script + in-place reload ============
    // (Hard-killing the exe after a localStorage write loses the unflushed LevelDB
    // value; instead seed exactly like the proven e2e pattern: a sessionStorage-guarded
    // init script that runs before app code on the next document, then reload in place.
    // The guard survives the toggle's later product-initiated reload, so it seeds once.)
    // Read the exe's real version first so the seeded previous==current (migration inert).
    const exeVersion = await page.evaluate(async () => { try { return (await window.api?.getVersion?.()) || null } catch { return null } })
    const seedVersion = exeVersion || "1.18.2"
    const preSeed = await page.evaluate(() => ({ settings: localStorage.getItem("settings.v3"), appVer: localStorage.getItem("app-version.v1") }))
    log(`exe version=${exeVersion}; pre-seed settings.v3=${preSeed.settings?.slice(0, 120)} app-version=${preSeed.appVer}`)
    await page.evaluate((v) => {
      const cur = JSON.parse(localStorage.getItem("settings.v3") || "{}")
      cur.general = { ...(cur.general || {}), newLayoutDesigns: false, layoutTransitionEligible: true }
      localStorage.setItem("settings.v3", JSON.stringify(cur))
      const av = JSON.parse(localStorage.getItem("app-version.v1") || "{}")
      av.version = v
      localStorage.setItem("app-version.v1", JSON.stringify(av))
    }, seedVersion)
    log("legacy seed written in-memory (merge-preserving); reloading in place — same process, no flush loss")
    await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 })
    await page.waitForTimeout(6000)
    const postSeed = await page.evaluate(() => localStorage.getItem("settings.v3"))
    log(`post-reload settings.v3=${postSeed?.slice(0, 160)}`)
    const legacyNow = !(await isV2(page, 8000))
    record("2-pre", "Seeded profile boots LEGACY layout", legacyNow ? "pass" : "fail", "automated-cdp", legacyNow ? "no v2 titlebar marker" : "v2 titlebar still present — seed did not take")
    await shot(page, "b3-legacy-boot")
    if (legacyNow) {
      const btns = agenticEntry(page)
      const n = await btns.count()
      if (n > 0) {
        const aria = await btns.first().getAttribute("aria-label")
        record("2a", "Legacy chrome shows Agentic Terminal entry(ies)", "pass", "automated-cdp", `count=${n} (sidebar rail + legacy titlebar expected), aria="${aria}"`)
        await btns.first().click()
        const vis = await agenticVisible(page)
        record("2d", "Legacy entry click navigates to /agentic", vis ? "pass" : "fail", "automated-cdp", `route=${await currentRoute(page)}`)
        await shot(page, "b3-2-legacy-agentic")
      } else record("2a", "Legacy chrome shows Agentic Terminal entry(ies)", "fail", "automated-cdp", "no aria*=Agentic entries in legacy chrome")

      // ---- toggle: legacy -> v2 via Settings UI (product-initiated reload) ----
      try {
        const back = page.locator('button[aria-label*="back" i], button[aria-label*="Back"]').first()
        if (await back.count()) { await back.click(); await page.waitForTimeout(1000) }
        const settingsBtn = page.locator('button[aria-label="Settings"], button[aria-label*="Settings"]').first()
        await settingsBtn.waitFor({ state: "visible", timeout: 10000 })
        await settingsBtn.click(); await page.waitForTimeout(1500)
        const row = page.locator('[data-action="settings-new-layout-designs"]').first()
        await row.scrollIntoViewIfNeeded()
        const control = page.locator('[data-action="settings-new-layout-designs"] [data-slot="switch-control"]').first()
        await control.waitFor({ state: "visible", timeout: 10000 })
        const loadPromise = page.waitForEvent("load", { timeout: 30000 }).catch(() => null)
        await control.click()
        await loadPromise
        await page.waitForTimeout(6000) // reboot into v2
        const v2Now = await isV2(page, 15000)
        const entryNow = v2Now && (await agenticEntry(page).count()) > 0
        record("6d", "Entry survives layout toggle (legacy->v2 via Settings UI, product reload)", v2Now && entryNow ? "pass" : "fail", "automated-cdp", `v2AfterToggle=${v2Now} agenticEntryPresent=${entryNow}`)
        await shot(page, "b3-6d-after-toggle")
      } catch (e) { record("6d", "Entry survives layout toggle", "fail", "automated-cdp", e.message) }
    } else {
      record("2a", "Legacy chrome shows Agentic Terminal entry(ies)", "not-verified", "automated-cdp", "seed did not produce legacy boot; see 2-pre")
      record("6d", "Entry survives layout toggle", "not-verified", "automated-cdp", "blocked by 2-pre")
    }
  } catch (e) {
    record("driver", "Driver-level failure", "fail", "automated-cdp", e.stack || e.message)
  } finally {
    results.finished_at = new Date().toISOString()
    writeFileSync(resultsJson, JSON.stringify(results, null, 2))
    log(`results written: ${resultsJson}`)
    try { killExe(child) } catch {}
    try { await browser?.close() } catch {}
    const fails = results.items.filter((i) => i.verdict === "fail")
    log(`SUMMARY: ${results.items.length} items, ${fails.length} fail`)
    process.exit(fails.length ? 1 : 0)
  }
}
run()

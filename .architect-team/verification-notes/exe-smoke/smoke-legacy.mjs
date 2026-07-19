// Focused legacy+toggle exe smoke (checklist §2 + §6d). Companion to cdp-smoke-2.mjs.
// Seeds the DESKTOP's real settings store (electron-store JSON at
// %APPDATA%/ai.opencode.desktop.dev/default.dat — values are JSON-strings) while the
// app is closed; backs it up first and restores it afterward. This is the correct
// seed path discovered in run 4: the desktop app does NOT read renderer localStorage
// for settings (only the router's last-active-url lives there).
// Usage: node smoke-legacy.mjs <exePath> <port> <artifactsDir> <resultsJson>
import { createRequire } from "node:module"
import { spawn, execSync } from "node:child_process"
import { existsSync, mkdirSync, writeFileSync, readFileSync, copyFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import http from "node:http"

const require = createRequire(import.meta.url)
const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, "../../..")
const rootRequire = createRequire(path.join(repoRoot, "package.json"))
const { chromium } = rootRequire(rootRequire.resolve("@playwright/test", { paths: [path.join(repoRoot, "packages/app")] }))

const [exePath, portStr, artifactsDir, resultsJson] = process.argv.slice(2)
const PORT = Number(portStr) || 9333
mkdirSync(artifactsDir, { recursive: true })
const storePath = path.join(process.env.APPDATA, "ai.opencode.desktop.dev", "default.dat")
const backupPath = storePath + ".smoke-backup"
if (!existsSync(storePath)) { console.error(`store not found: ${storePath}`); process.exit(2) }

const env = { ...process.env, SHELL: undefined }
const results = { driver: "smoke-legacy", started_at: new Date().toISOString(), items: [] }
const log = (m) => console.log(`[legacy] ${m}`)
const record = (id, name, verdict, verifiedBy, detail) => { results.items.push({ id, name, verdict, verified_by: verifiedBy, detail }); log(`${id} ${verdict} — ${name} :: ${detail || ""}`) }

async function probeCdp(timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const ok = await new Promise((resolve) => {
      const req = http.get(`http://127.0.0.1:${PORT}/json/version`, (res) => { let b = ""; res.on("data", (d) => (b += d)); res.on("end", () => { try { resolve(!!JSON.parse(b)["webSocketDebuggerUrl"]) } catch { resolve(false) } }) })
      req.on("error", () => resolve(false)); req.setTimeout(1500, () => { req.destroy(); resolve(false) })
    })
    if (ok) return true
    await new Promise((r) => setTimeout(r, 1000))
  }
  return false
}
const shot = async (page, name) => { try { await page.screenshot({ path: path.join(artifactsDir, `${name}.png`) }) } catch {} }
const isV2 = async (page, t = 12000) => { try { await page.locator('[data-slot="titlebar-v2"]').waitFor({ state: "visible", timeout: t }); return true } catch { return false } }
const agenticVisible = async (page, t = 20000) => { try { await page.locator("[data-testid='agentic-terminal']").waitFor({ state: "visible", timeout: t }); return true } catch { return false } }

let child, browser
try {
  // 0. ensure no exe instance running, backup store, seed legacy
  try { execSync('taskkill /F /T /IM "OpenCode Dev.exe"', { stdio: "ignore" }) } catch {}
  await new Promise((r) => setTimeout(r, 2000))
  copyFileSync(storePath, backupPath)
  const store = JSON.parse(readFileSync(storePath, "utf-8"))
  const settings = JSON.parse(store["settings.v3"] || "{}")
  settings.general = { ...(settings.general || {}), newLayoutDesigns: false, layoutTransitionEligible: true }
  store["settings.v3"] = JSON.stringify(settings)
  writeFileSync(storePath, JSON.stringify(store, null, "\t"))
  log(`seeded ${storePath} (backup at ${backupPath}); app-version left as-is: ${store["app-version.v1"]}`)

  // 1. launch + connect
  child = spawn(exePath, [`--remote-debugging-port=${PORT}`], { env, cwd: path.dirname(exePath), detached: false, stdio: "ignore" })
  if (!(await probeCdp(60000))) throw new Error("CDP not ready")
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`)
  const ctx = browser.contexts()[0]
  await new Promise((r) => setTimeout(r, 10000)) // let all windows/pages appear + renderer paint
  const pages = ctx.pages()
  log(`pages: ${pages.map((p) => p.url()).join(" | ")}`)
  // Pick the page that actually renders app chrome: any button with an aria-label.
  let page = null
  for (const p of pages) {
    const chromeCount = await p.locator("button[aria-label]").count().catch(() => 0)
    log(`page ${p.url()} -> aria-buttons=${chromeCount}`)
    if (chromeCount > 0) { page = p; break }
  }
  if (!page) {
    // wait up to 30s for chrome to appear on any page
    const deadline = Date.now() + 30000
    while (!page && Date.now() < deadline) {
      for (const p of ctx.pages()) {
        if ((await p.locator("button[aria-label]").count().catch(() => 0)) > 0) { page = p; break }
      }
      if (!page) await new Promise((r) => setTimeout(r, 2000))
    }
  }
  if (!page) { for (const [i, p] of ctx.pages().entries()) await shot(p, `L-boot-page${i}`); throw new Error("no page with app chrome found after 40s") }
  await new Promise((r) => setTimeout(r, 3000))
  await shot(page, "L-boot")

  // 2. §2: legacy layout + entries
  const legacy = !(await isV2(page, 8000))
  record("2-pre", "Store-seeded profile boots LEGACY layout", legacy ? "pass" : "fail", "automated-cdp", legacy ? "no v2 titlebar marker after electron-store seed" : "v2 titlebar still present")
  if (!legacy) throw new Error("legacy boot failed; aborting before toggle")
  const btns = page.locator('button[aria-label*="Agentic"], a[aria-label*="Agentic"]')
  const n = await btns.count()
  const aria = n ? await btns.first().getAttribute("aria-label") : null
  record("2a", "Legacy chrome shows Agentic Terminal entry(ies)", n > 0 ? "pass" : "fail", "automated-cdp", `count=${n} aria="${aria}" (sidebar rail per sidebar-shell.tsx:95-104 + legacy titlebar per titlebar.tsx:660-668)`)
  if (n > 0) {
    await btns.first().click()
    const vis = await agenticVisible(page)
    record("2d", "Legacy entry click navigates to /agentic", vis ? "pass" : "fail", "automated-cdp", vis ? "agentic-terminal testid visible" : "not visible")
    await shot(page, "L-2-agentic")
  }

  // 3. §6d: toggle legacy -> v2 via Settings UI (product-initiated reload)
  const back = page.locator('button[aria-label*="back" i]').first()
  if (await back.count()) { await back.click(); await new Promise((r) => setTimeout(r, 1200)) }
  const settingsBtn = page.locator('button[aria-label="Settings"]').first()
  await settingsBtn.waitFor({ state: "visible", timeout: 10000 })
  await settingsBtn.click(); await new Promise((r) => setTimeout(r, 1500))
  const row = page.locator('[data-action="settings-new-layout-designs"]').first()
  await row.scrollIntoViewIfNeeded()
  const control = page.locator('[data-action="settings-new-layout-designs"] [data-slot="switch-control"]').first()
  await control.waitFor({ state: "visible", timeout: 10000 })
  await shot(page, "L-6d-pre-toggle")
  const loadP = page.waitForEvent("load", { timeout: 30000 }).catch(() => null)
  await control.click()
  await loadP
  await new Promise((r) => setTimeout(r, 6000))
  const v2Now = await isV2(page, 15000)
  const entryNow = v2Now && (await page.locator('button[aria-label*="Agentic"]').count()) > 0
  record("6d", "Entry survives layout toggle (legacy->v2, Settings UI, product reload)", v2Now && entryNow ? "pass" : "fail", "automated-cdp", `v2After=${v2Now} entryPresent=${entryNow}`)
  if (v2Now && entryNow) {
    await page.locator('button[aria-label*="Agentic"]').first().click()
    const vis = await agenticVisible(page)
    record("6d-nav", "Post-toggle v2 entry navigates to /agentic", vis ? "pass" : "fail", "automated-cdp", vis ? "navigates + renders" : "failed")
  }
  await shot(page, "L-6d-after-toggle")
} catch (e) {
  record("driver", "Driver-level failure", "fail", "automated-cdp", e.stack?.slice(0, 400) || e.message)
} finally {
  try { if (child && !child.killed) execSync(`taskkill /F /T /PID ${child.pid}`, { stdio: "ignore" }) } catch {}
  await new Promise((r) => setTimeout(r, 2000))
  try { copyFileSync(backupPath, storePath); log("store restored from backup") } catch (e) { log(`STORE RESTORE FAILED: ${e.message} — backup remains at ${backupPath}`) }
  results.finished_at = new Date().toISOString()
  writeFileSync(resultsJson, JSON.stringify(results, null, 2))
  try { await browser?.close() } catch {}
  const fails = results.items.filter((i) => i.verdict === "fail")
  log(`SUMMARY: ${results.items.length} items, ${fails.length} fail`)
  process.exit(fails.length ? 1 : 0)
}

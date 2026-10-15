#!/usr/bin/env node
/** Tarifs! : une partie v3.1.3 (sauvegarde v16) reprend dans la nouvelle version (v17). node test/upgrade-tarifs.mjs <ancien-site> */
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync, mkdtempSync } from "node:fs";
import { join, extname } from "node:path";
import { tmpdir } from "node:os";
const pw = await import(process.env.PLAYWRIGHT ?? "/workspace/conglomerat/node_modules/playwright/index.mjs");
const { chromium } = pw.default ?? pw;
const WANT = process.env.WANT ?? "v3.2.0";
const OLD = process.argv[2], NEW = new URL("..", import.meta.url).pathname;
let root = OLD;
const T = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".png": "image/png", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };
const srv = createServer((q, r) => {
  let f = join(root, decodeURIComponent(q.url.split("?")[0]).replace(/^\/hss-site\//, ""));
  if (existsSync(f) && statSync(f).isDirectory()) f = join(f, "index.html");
  if (!existsSync(f)) return r.writeHead(404).end();
  r.writeHead(200, { "content-type": T[extname(f)] ?? "application/octet-stream", "cache-control": "max-age=600" });
  r.end(readFileSync(f));
});
await new Promise((r) => srv.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${srv.address().port}/hss-site/tarifs/`;
const dir = mkdtempSync(join(tmpdir(), "hss-upt-"));
const o = { headless: true, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, executablePath: "/usr/bin/google-chrome" };
const peek = (p) => p.evaluate(() => { const raw = localStorage.getItem("tarifs-save"); const e = raw && JSON.parse(raw); return e ? { v: e.version, m: e.game.month, name: e.game.pmName } : null; });
let ctx = await chromium.launchPersistentContext(dir, o);
let p = ctx.pages()[0];
await p.goto(url);
await p.evaluate(() => navigator.serviceWorker.ready);
await p.getByRole("button", { name: /Nouvelle partie/i }).click();
await p.locator("#nom-pm").fill("Sam Okoro");
await p.locator("#lancer-partie").click();
await p.waitForSelector("[data-month]", { state: "attached" });
const skip = p.locator("button:has-text('Passer')").first();
if (await skip.isVisible().catch(() => false)) await skip.click();
for (let k = 0; k < 2; k++) {
  for (let i = 0; i < 8; i++) {
    const f = p.locator('[data-event][data-forced="1"]');
    if (!(await f.count())) break;
    let c = f.first().locator("[data-choice]:not([disabled])").first();
    if (!(await c.isVisible().catch(() => false))) { await f.first().locator("[data-event-toggle]").click().catch(() => {}); c = f.first().locator("[data-choice]:not([disabled])").first(); }
    await c.click();
  }
  const m0 = (await peek(p))?.m ?? 0;
  await p.locator("#mois-suivant").click();
  await p.waitForFunction((m) => JSON.parse(localStorage.getItem("tarifs-save") || "{}").game?.month > m, m0);
}
await p.waitForTimeout(1200);
const before = await peek(p);
await ctx.close();
root = NEW;
ctx = await chromium.launchPersistentContext(dir, o);
p = ctx.pages()[0];
await p.goto(url);
await p.locator("#continuer-partie").waitFor({ timeout: 4000 });
let footer = await p.locator("text=/High Stakes Studio · v3\\./").first().innerText();
if (!footer.includes(WANT)) { await p.waitForTimeout(1500); await p.reload(); await p.locator("#continuer-partie").waitFor({ timeout: 4000 }); footer = await p.locator("text=/High Stakes Studio · v3\\./").first().innerText(); }
await p.locator("#continuer-partie").click();
await p.waitForSelector(`[data-month="${before.m}"]`, { state: "attached", timeout: 5000 });
await p.waitForTimeout(800);
for (let i = 0; i < 8; i++) {
  const f = p.locator('[data-event][data-forced="1"]');
  if (!(await f.count())) break;
  let c = f.first().locator("[data-choice]:not([disabled])").first();
  if (!(await c.isVisible().catch(() => false))) { await f.first().locator("[data-event-toggle]").click().catch(() => {}); c = f.first().locator("[data-choice]:not([disabled])").first(); }
  await c.click();
}
await p.locator("#mois-suivant").click();
await p.waitForFunction((m) => JSON.parse(localStorage.getItem("tarifs-save") || "{}").game?.month > m, before.m);
const after = await peek(p);
console.log(`[upgrade-tarifs] avant : sauvegarde v${before.v}, mois ${before.m}, ${before.name} → après : pied de page « ${footer.trim()} », reprise au mois ${before.m}, un mois de plus → mois ${after?.m}, sauvegarde v${after?.v}`);
await ctx.close();
srv.close();
if (!footer.includes(WANT) || !after || after.m <= before.m || after.v !== 17) process.exit(1);

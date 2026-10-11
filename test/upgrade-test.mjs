#!/usr/bin/env node
/** Mise à jour d'un joueur existant : ancienne version + partie → nouvelle version servie → la partie reste, la nouvelle version s'affiche. */
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync, mkdtempSync } from "node:fs";
import { join, extname } from "node:path";
import { tmpdir } from "node:os";
const pw = await import(process.env.PLAYWRIGHT ?? "/workspace/conglomerat/node_modules/playwright/index.mjs");
const { chromium } = pw.default ?? pw;
const WANT = process.env.WANT ?? "v1.3";
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
const url = `http://127.0.0.1:${srv.address().port}/hss-site/conglomerat/`;
const dir = mkdtempSync(join(tmpdir(), "hss-up-"));
const o = { headless: true, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, executablePath: "/usr/bin/google-chrome" };
let ctx = await chromium.launchPersistentContext(dir, o);
let p = ctx.pages()[0];
await p.goto(url);
await p.evaluate(() => navigator.serviceWorker.ready);
await p.locator("#nouvelle-partie").click();
await p.locator('[data-start="depanneur"]').click();
await p.locator("#avec-tutoriel").uncheck();
await p.locator("#lancer-partie").click();
for (let i = 0; i < 3; i++) await p.locator("#mois-suivant").click();
await p.waitForSelector('[data-month="3"]', { state: "attached" });
await p.waitForTimeout(1200);
await ctx.close();
root = NEW; // déploiement de la nouvelle version
ctx = await chromium.launchPersistentContext(dir, o);
p = ctx.pages()[0];
const t0 = Date.now();
await p.goto(url);
await p.locator("#continuer-partie").waitFor({ timeout: 3000 });
const ms = Date.now() - t0;
let footer = await p.locator("text=/High Stakes Studio · v1\\./").first().innerText();
if (!footer.includes(WANT)) { await p.waitForTimeout(1500); await p.reload(); await p.locator("#continuer-partie").waitFor({ timeout: 3000 }); footer = await p.locator("text=/High Stakes Studio · v1\\./").first().innerText(); }
await p.locator("#continuer-partie").click();
await p.waitForSelector('[data-month="3"]', { state: "attached", timeout: 4000 });
console.log(`[upgrade] ancienne → nouvelle : Continuer en ${ms} ms, pied de page « ${footer.trim()} », partie reprise au mois 3`);
await ctx.close();
srv.close();
if (!footer.includes(WANT)) process.exit(1);

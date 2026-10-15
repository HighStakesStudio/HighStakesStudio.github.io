#!/usr/bin/env node
/**
 * Test local du site : sert ce dossier sous un préfixe (/hss-site/), comme GitHub Pages (/<repo>/).
 * Pour chaque jeu, à 390 px : nouvelle partie, un mois, FERMETURE complète du navigateur,
 * réouverture avec le même profil → « Continuer » reprend. Vérifie aussi manifeste, service worker
 * et rechargement hors ligne. Usage : node test/site-test.mjs [chemin/vers/playwright]
 */
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync, mkdtempSync } from "node:fs";
import { join, extname } from "node:path";
import { tmpdir } from "node:os";

const pw = await import(process.argv[2] ?? process.env.PLAYWRIGHT ?? "/workspace/conglomerat/node_modules/playwright/index.mjs");
const { chromium } = pw.default ?? pw;
const root = new URL("..", import.meta.url).pathname;
const PREFIX = "/hss-site/";
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".png": "image/png", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json", ".json": "application/json" };
let online = true;
const srv = createServer((req, res) => {
  if (!online) return req.socket.destroy();
  const url = decodeURIComponent(req.url.split("?")[0]);
  if (!url.startsWith(PREFIX)) return res.writeHead(404).end("hors préfixe");
  let f = join(root, url.slice(PREFIX.length));
  if (existsSync(f) && statSync(f).isDirectory()) f = join(f, "index.html");
  if (!existsSync(f)) return res.writeHead(404).end("404");
  res.writeHead(200, { "content-type": TYPES[extname(f)] ?? "application/octet-stream" });
  res.end(readFileSync(f));
});
await new Promise((r) => srv.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${srv.address().port}${PREFIX}`;
const exe = ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable"].find((p) => existsSync(p));
const results = [];
const fail = (m) => { throw new Error(m); };
const opts = { headless: true, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, ...(exe ? { executablePath: exe } : {}) };

const skipTuto = async (p) => {
  for (const sel of ["#passer-tutoriel", "button:has-text('Passer')"]) {
    const b = p.locator(sel).first();
    if (await b.isVisible({ timeout: 800 }).catch(() => false)) await b.click().catch(() => {});
  }
};

const FLOWS = {
  async conglomerat(p) {
    await p.locator("#nouvelle-partie").click();
    await p.locator('[data-start="depanneur"]').click();
    await p.locator("#avec-tutoriel").uncheck();
    await p.locator("#lancer-partie").click();
    await p.waitForSelector("[data-month]", { state: "attached" });
    await p.locator("#mois-suivant").click();
    await p.waitForSelector('[data-month="1"]', { state: "attached" });
    return (await p.evaluate(() => window.__congloPeek())).month;
  },
  async tarifs(p) {
    await p.getByRole("button", { name: /Nouvelle partie/i }).click();
    await p.locator("#nom-pm").fill("Sam Okoro");
    await p.locator("#lancer-partie").click();
    await p.waitForSelector("[data-month]", { state: "attached" });
    await skipTuto(p);
    for (let i = 0; i < 8; i++) {
      const cards = p.locator("[data-event]");
      if (!(await cards.count())) break;
      const forced = p.locator('[data-event][data-forced="1"]');
      const card = (await forced.count()) ? forced.first() : cards.first();
      let c = card.locator("[data-choice]:not([disabled])").first();
      if (!(await c.isVisible().catch(() => false))) { await card.locator("[data-event-toggle]").click().catch(() => {}); c = card.locator("[data-choice]:not([disabled])").first(); }
      if (!(await c.isVisible().catch(() => false))) break;
      await c.click();
    }
    const m0 = (await p.evaluate(() => window.__peek())).month;
    await p.locator("#mois-suivant").click();
    await p.waitForSelector(`[data-month="${m0 + 1}"]`, { state: "attached" });
    return m0 + 1;
  },
  async yukon(p) {
    await p.getByRole("button", { name: /Nouvelle partie/i }).click();
    await p.locator("#nom-pm").fill("Sam Okoro");
    await p.locator("#lancer-partie").click();
    await p.waitForSelector("[data-month]", { state: "attached" });
    await skipTuto(p);
    for (let i = 0; i < 5; i++) {
      const c = p.locator("[data-event] [data-choice]:not([disabled])");
      if (!(await c.count())) break;
      await c.first().click();
    }
    const m0 = (await p.evaluate(() => window.__peek())).day;
    await p.locator("#jour-suivant").click();
    await p.waitForSelector(`[data-month="${m0 + 1}"]`, { state: "attached" });
    return m0 + 1;
  },
  async nordic(p) {
    const name = p.locator("label:has-text('Nom de la société') input");
    await name.fill("Boréale Test");
    await p.locator("button[type=submit]").first().click();
    await p.getByRole("button", { name: /Mois suivant/ }).first().waitFor({ timeout: 15000 });
    await skipTuto(p);
    await p.getByRole("button", { name: /Mois suivant/ }).first().click({ force: true });
    await p.waitForTimeout(800);
    return p.evaluate(() => {
      const raw = localStorage.getItem("nordic-resources-save");
      return raw ? JSON.parse(raw).state.game.month : -1;
    });
  },
};
const CONTINUE = {
  conglomerat: async (p) => { await p.locator("#continuer-partie").click({ timeout: 10000 }); await p.waitForSelector("[data-month]", { state: "attached" }); return (await p.evaluate(() => window.__congloPeek())).month; },
  tarifs: async (p) => { await p.locator("#continuer-partie").click({ timeout: 10000 }); await p.waitForSelector("[data-month]", { state: "attached" }); return (await p.evaluate(() => window.__peek())).month; },
  yukon: async (p) => { await p.locator("#continuer-partie").click({ timeout: 10000 }); await p.waitForSelector("[data-month]", { state: "attached" }); return (await p.evaluate(() => window.__peek())).day; },
  nordic: async (p) => {
    await p.locator("[data-continue] button:has-text('Continuer la partie'), button:has-text('Continuer la partie')").first().click({ timeout: 10000 });
    await p.getByRole("button", { name: /Mois suivant/ }).first().waitFor({ timeout: 10000 });
    return p.evaluate(() => JSON.parse(localStorage.getItem("nordic-resources-save")).state.game.month);
  },
};

try {
  // Page d'accueil.
  {
    const b = await chromium.launch(exe ? { executablePath: exe } : {});
    const p = await b.newPage({ viewport: { width: 390, height: 844 } });
    const errs = [];
    p.on("response", (r) => r.status() >= 400 && errs.push(`${r.status()} ${r.url()}`));
    await p.goto(BASE);
    const links = await p.$$eval("a.game", (a) => a.map((x) => x.getAttribute("href")));
    if (links.join() !== "conglomerat/,tarifs/,yukon/,nordic/") fail(`liens : ${links}`);
    const imgs = await p.$$eval("img", (l) => l.every((i) => i.complete && i.naturalWidth > 0));
    if (!imgs || errs.length) fail(`accueil : images ${imgs} ${errs}`);
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth > 391);
    if (overflow) fail("accueil déborde à 390 px");
    await p.screenshot({ path: join(root, "test/accueil-390.png"), fullPage: true });
    results.push("Accueil : 4 cartes (liens relatifs), images OK, 390 px sans débordement");
    await b.close();
  }
  for (const game of ["conglomerat", "tarifs", "yukon", "nordic"]) {
    const dir = mkdtempSync(join(tmpdir(), `hss-${game}-`));
    const url = `${BASE}${game}/`;
    let ctx = await chromium.launchPersistentContext(dir, opts);
    let p = ctx.pages()[0] ?? (await ctx.newPage());
    const errs = [];
    p.on("pageerror", (e) => errs.push(e.message));
    await p.goto(url);
    // PWA : manifeste valide, service worker actif avec la bonne portée.
    const pwa = await p.evaluate(async () => {
      const href = document.querySelector('link[rel="manifest"]')?.href;
      const m = await (await fetch(href)).json();
      const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(() => r(null), 8000))]);
      const icons = await Promise.all(m.icons.map(async (i) => (await fetch(new URL(i.src, href))).ok));
      return { name: m.name, start: new URL(m.start_url, href).pathname, scope: reg?.scope ? new URL(reg.scope).pathname : null, display: m.display, icons: icons.every(Boolean), sizes: m.icons.map((i) => i.sizes).join(" "), persisted: await navigator.storage.persisted() };
    });
    if (pwa.display !== "standalone" || !pwa.icons || !pwa.scope?.endsWith(`/hss-site/${game}/`) || pwa.start !== `/hss-site/${game}/` || !/192x192/.test(pwa.sizes) || !/512x512/.test(pwa.sizes)) fail(`${game} PWA : ${JSON.stringify(pwa)}`);
    const month = await FLOWS[game](p);
    await p.waitForTimeout(1500);
    await ctx.close(); // navigateur fermé entièrement
    ctx = await chromium.launchPersistentContext(dir, opts);
    p = ctx.pages()[0] ?? (await ctx.newPage());
    p.on("pageerror", (e) => errs.push(e.message));
    await p.goto(url);
    const back = await CONTINUE[game](p);
    if (back !== month) fail(`${game} : reprise au mois ${back}, attendu ${month}`);
    // Hors ligne : serveur coupé, rechargement → le jeu s'affiche depuis le cache du service worker.
    online = false;
    await ctx.setOffline(true);
    await p.reload();
    await p.waitForTimeout(1500);
    const offlineOk = await p.evaluate(() => document.body.innerText.length > 50 && !!document.querySelector("#root, #app, main"));
    const offCont = await p.locator("text=/Continuer/").first().isVisible().catch(() => false);
    online = true;
    await ctx.setOffline(false);
    if (!offlineOk || !offCont) fail(`${game} : hors ligne KO (${offlineOk}, continuer ${offCont})`);
    await p.screenshot({ path: join(root, `test/${game}-reprise-390.png`) });
    await ctx.close();
    if (errs.length) fail(`${game} : erreurs JS ${errs.slice(0, 3)}`);
    results.push(`${game} : PWA OK (« ${pwa.name} », portée ${pwa.scope}, standalone, icônes 192/512, persisted=${pwa.persisted}) ; mois ${month} → navigateur fermé → rouvert → Continuer → mois ${back} ; hors ligne : rechargement OK + Continuer visible`);
  }
  console.log(results.map((r) => `[site] ${r}`).join("\n"));
} catch (e) {
  console.log(results.map((r) => `[site] ${r}`).join("\n"));
  console.error("[site] ÉCHEC", e.message);
  process.exitCode = 1;
} finally {
  srv.close();
}

#!/usr/bin/env node
/**
 * Construit le site statique High Stakes Studio : une page d'accueil + un dossier par jeu.
 * Chaque jeu = son HTML autonome (tout en un fichier) + manifeste PWA + service worker + icônes,
 * avec des chemins RELATIFS : le site marche sous n'importe quel préfixe (https://<user>.github.io/<repo>/).
 * Usage : node build.mjs   (relit les builds hors ligne des trois dépôts)
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

const here = new URL(".", import.meta.url).pathname;
const GAMES = [
  {
    dir: "conglomerat", name: "Conglomérat", short: "Conglomérat", version: "1.2.3",
    html: "/workspace/conglomerat/dist-offline/conglomerat-offline.html", icons: "/workspace/conglomerat/public",
    theme: "#0f2340", desc: "Bâtissez un conglomérat québécois : commerce, restauration, hôtellerie, industrie, médias et finance.",
  },
  {
    dir: "tarifs", name: "Tarifs!", short: "Tarifs!", version: "3.1.3",
    html: "/workspace/tarifs/dist-offline/tarifs-offline.html", icons: "/workspace/tarifs/public",
    theme: "#0e1317", desc: "Premier ministre du Canada face aux tarifs du président Grant.",
  },
  {
    dir: "nordic", name: "Nordic Resources", short: "Nordic", version: "13.6",
    html: "/workspace/nordic-resources-v13.6.html", icons: "/workspace/nordic/public",
    theme: "#14140f", desc: "Société minière et pétrolière : du capital de départ au premier cash-flow libre.",
  },
];
const ICONS = ["icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png", "favicon.svg"];

const head = (g) => `
<link rel="manifest" href="./manifest.webmanifest" />
<link rel="apple-touch-icon" href="./apple-touch-icon.png" />
<link rel="icon" href="./favicon.svg" type="image/svg+xml" />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-title" content="${g.short}" />
<script>
  // PWA : service worker du dossier du jeu (portée distincte = application distincte).
  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
    addEventListener("load", function () {
      navigator.serviceWorker.register("./sw.js", { scope: "./", updateViaCache: "none" }).then(function (r) { r.update().catch(function () {}); }).catch(function () {});
    });
    // Nouvelle version active : recharger une seule fois (la partie est déjà enregistrée), jamais en boucle.
    var hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener("controllerchange", function () {
      if (!hadController) return;
      try { if (sessionStorage.getItem("hss-sw-reload")) return; sessionStorage.setItem("hss-sw-reload", "1"); } catch (e) { return; }
      location.reload();
    });
  }
  // Sauvegardes protégées contre le ménage automatique du navigateur.
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) {}
</script>`;

const sw = (g, hash) => `/* Service worker ${g.name} v${g.version} — jeu hors ligne. */
const CACHE = "hss-${g.dir}-${hash}";
const FILES = ["./", "./index.html", "./manifest.webmanifest", ${ICONS.map((i) => `"./${i}"`).join(", ")}];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("hss-${g.dir}-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});
// Réseau d'abord pour la page (mises à jour), cache sinon ; cache d'abord pour le reste.
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put("./index.html", copy)); return r; })
        .catch(() => caches.match("./index.html")),
    );
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
});
`;

for (const g of GAMES) {
  const out = join(here, g.dir);
  mkdirSync(out, { recursive: true });
  let html = readFileSync(g.html, "utf8");
  html = html.replace(/<link rel="(manifest|apple-touch-icon)"[^>]*>/g, "");
  html = html.replace("</head>", `${head(g)}\n</head>`);
  writeFileSync(join(out, "index.html"), html);
  for (const i of ICONS) if (existsSync(join(g.icons, i))) copyFileSync(join(g.icons, i), join(out, i));
  const manifest = {
    name: g.name, short_name: g.short, description: g.desc, lang: "fr-CA",
    id: "./", start_url: "./", scope: "./", display: "standalone", orientation: "any",
    background_color: g.theme, theme_color: g.theme, categories: ["games", "simulation"],
    icons: [
      { src: "./icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "./icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "./icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  writeFileSync(join(out, "manifest.webmanifest"), JSON.stringify(manifest, null, 2));
  const hash = createHash("sha1").update(html).digest("hex").slice(0, 10);
  writeFileSync(join(out, "sw.js"), sw(g, hash));
  console.log(`[site] ${g.dir}/ v${g.version} (${Math.round(html.length / 1024)} Ko)`);
}
mkdirSync(join(here, "assets"), { recursive: true });
copyFileSync("/workspace/hss-logo/high-stakes-studio-carre.png", join(here, "assets/studio.png"));
copyFileSync("/workspace/hss-logo/high-stakes-studio-icone.png", join(here, "assets/studio-icone.png"));
copyFileSync("/workspace/tarifs-logo/tarifs-logo-carre.png", join(here, "assets/tarifs.png"));
copyFileSync("/workspace/conglomerat/public/icon-512.png", join(here, "assets/conglomerat.png"));
copyFileSync("/workspace/nordic/public/icon-512.png", join(here, "assets/nordic.png"));
writeFileSync(join(here, ".nojekyll"), "");

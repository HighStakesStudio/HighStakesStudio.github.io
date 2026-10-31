/* Service worker FIX — jeu hors ligne. Source versionnée : fix/public/sw.js.
 * Le jeton de cache (ligne CACHE) est remplacé à la publication (hss-site/build.mjs) par « hss-fix-v<version>-<empreinte> ».
 * Règle : on ne met JAMAIS en cache une réponse en erreur (404, 500…) : `if (r.ok)` avant chaque cache.put. */
const CACHE = "hss-fix-v1.2.1-4bca74103d";
const FILES = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png", "./apple-touch-icon.png", "./favicon.svg"];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("hss-fix-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});
// Page : réseau d'abord (mises à jour) ; une réponse en erreur n'écrase pas la copie hors ligne. Reste : cache d'abord.
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((r) => {
          if (r.ok) {
            const copy = r.clone();
            caches.open(CACHE).then((c) => c.put("./index.html", copy));
            return r;
          }
          return caches.match("./index.html").then((hit) => hit || r);
        })
        .catch(() => caches.match("./index.html")),
    );
    return;
  }
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((r) => {
      if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return r;
    })),
  );
});

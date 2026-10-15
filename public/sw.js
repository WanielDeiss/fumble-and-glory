// Service worker: makes the app installable and keeps it working offline.
// Page, data and UI strings: network first, so new cards show up as soon as you're online;
// the last copy is used when offline. Hashed build assets and fonts never change: cache first.
// Bump CACHE only when this file's caching logic changes.
const CACHE = "fg-v2";
const scope = new URL(self.registration.scope);
const ASSETS = `${scope.pathname}assets/`;
const FONTS = `${scope.pathname}fonts/`;

const isLocal = (url) => url.origin === scope.origin && url.pathname.startsWith(scope.pathname);
// Data and UI strings are fetched with a ?v= cache buster; store them under the bare path.
const keyFor = (req, url) => (req.mode === "navigate" ? scope.href : url.origin + url.pathname);

self.addEventListener("install", (event) => {
  event.waitUntil(precache().catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (!isLocal(url) || url.pathname.endsWith("/sw.js")) return;
  if (url.pathname.startsWith(ASSETS) || url.pathname.startsWith(FONTS)) event.respondWith(cacheFirst(req));
  else event.respondWith(networkFirst(event, req, keyFor(req, url)));
});

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === "opaque") await cache.put(req, res.clone());
  return res;
}

async function networkFirst(event, req, key) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) {
      await cache.put(key, res.clone());
      if (key === scope.href) event.waitUntil(res.clone().text().then(pruneAssets));
    }
    return res;
  } catch (err) {
    const hit = await cache.match(key);
    if (hit) return hit;
    throw err;
  }
}

/** Asset URLs (JS, CSS) referenced by the given index.html. */
function assetsIn(html) {
  return [...html.matchAll(/(?:src|href)="([^"]*\/assets\/[^"]+)"/g)].map((m) => new URL(m[1], scope).href);
}

/** Drop cached build assets from older deploys. */
async function pruneAssets(html) {
  const keep = new Set(assetsIn(html));
  const cache = await caches.open(CACHE);
  const stale = (await cache.keys()).filter((req) => new URL(req.url).pathname.startsWith(ASSETS) && !keep.has(req.url));
  await Promise.all(stale.map((req) => cache.delete(req)));
}

/** Cache the app shell, current decks and UI strings so the app works offline right after the first visit. */
async function precache() {
  const cache = await caches.open(CACHE);
  const fetchFresh = (path) => fetch(new URL(path, scope), { cache: "no-cache" });

  const page = await fetchFresh("./");
  await cache.put(scope.href, page.clone());
  await cache.addAll(assetsIn(await page.text()));

  const manifestRes = await fetchFresh("data/manifest.json");
  await cache.put(new URL("data/manifest.json", scope).href, manifestRes.clone());
  const manifest = await manifestRes.json();
  const paths = [
    "data/taxonomy.json",
    ...manifest.decks.map((d) => `data/${d}`),
    ...manifest.locales.map((l) => `i18n/ui.${l}.json`),
    "manifest.webmanifest",
    "icons/icon-192.png",
    "icons/icon.svg",
    "fonts/fraunces-latin.woff2",
    "fonts/alegreya-sans-400-latin.woff2",
    "fonts/alegreya-sans-500-latin.woff2",
    "fonts/alegreya-sans-700-latin.woff2",
  ];
  await Promise.all(paths.map(async (p) => {
    const res = await fetchFresh(p);
    if (res.ok) await cache.put(new URL(p, scope).href, res);
  }));
}

// TürkiyeCanlı service worker — uygulamanin ana ekrandan acilmasi ve cevrimdisi calismasi icin.
//
// Strateji:
// - Sayfalar, CSS ve JS: once ag (her zaman en guncel surum), ag yoksa onbellek.
//   Boylece yeni bir deploy aninda gelir; eski CSS/JS ile yeni HTML karismaz.
// - Gorseller, yazi tipleri ve surumlu CDN kutuphaneleri: once onbellek (hizli), arka planda tazele.
// - /api/quakes ve /api/fires: once ag; baglanti yoksa son bilinen veri gosterilir.
// - Giris/admin API'leri ve harita karolari hic onbelleklenmez.
const VERSION = "v4";
const SHELL_CACHE = `tc-shell-${VERSION}`;
const RUNTIME_CACHE = `tc-runtime-${VERSION}`;

const SHELL = [
  "/",
  "/index.html",
  "/hava.html",
  "/deprem.html",
  "/yangin.html",
  "/login.html",
  "/ayarlar.html",
  "/offline.html",
  "/css/base.css",
  "/css/home.css",
  "/css/dash.css",
  "/css/weather.css",
  "/css/quake.css",
  "/css/fire.css",
  "/js/main.js",
  "/js/home.js",
  "/js/dash.js",
  "/js/cities.js",
  "/js/weather-icons.js",
  "/js/weather.js",
  "/js/quake.js",
  "/js/fire.js",
  "/js/charts.js",
  "/js/vendor/chart.umd.min.js",
  "/img/logo.svg",
  "/fonts/satoshi-400.woff2",
  "/fonts/satoshi-500.woff2",
  "/fonts/satoshi-700.woff2",
  "/fonts/cabinet-grotesk-800.woff2",
  "/img/app/icon-192.png",
  "/manifest.webmanifest",
];

const CDN_HOSTS = ["unpkg.com"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      // tek bir dosya eksik diye kurulumun tamami basarisiz olmasin
      .then((cache) => Promise.all(SHELL.map((url) => cache.add(url).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => ![SHELL_CACHE, RUNTIME_CACHE].includes(k)).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request, fallbackUrl) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = (await cache.match(request)) || (await caches.match(request, { ignoreSearch: true }));
    if (cached) return cached;
    if (fallbackUrl) return caches.match(fallbackUrl);
    throw err;
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  const refresh = fetch(request)
    .then((response) => {
      if (response.ok || response.type === "opaque") cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached || refresh;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith("/api/")) {
      if (url.pathname === "/api/quakes" || url.pathname.startsWith("/api/quakes/") || url.pathname === "/api/fires") {
        event.respondWith(networkFirst(request));
      }
      return; // giris/admin vb. her zaman dogrudan aga
    }
    if (request.mode === "navigate") {
      event.respondWith(networkFirst(request, "/offline.html"));
      return;
    }
    if (/\.(css|js|webmanifest)$/.test(url.pathname)) {
      event.respondWith(networkFirst(request));
      return;
    }
    if (/\.(png|svg|webp|jpg|ico|woff2?)$/.test(url.pathname)) {
      event.respondWith(staleWhileRevalidate(request));
    }
    return;
  }

  if (CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});

// VYORA AI – Service Worker
// Speichert nur die App-Dateien (Seiten, Skripte, Icons, Schrift).
// Persönliche Daten und alle Anfragen an Supabase/Oura werden NICHT
// angefasst oder zwischengespeichert.

const CACHE = "vyora-app-v2";

const APP_FILES = [
  "./",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  "./vendor/supabase-js-2.119.2.js",
  "./datenschutz.html",
  "./impressum.html",
  "./nutzungsbedingungen.html"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE).then(cache =>
      // Einzeln laden: fehlt eine Datei, klappt der Rest trotzdem.
      Promise.all(APP_FILES.map(url =>
        cache.add(new Request(url, { cache: "reload" })).catch(() => {})
      ))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key.startsWith("vyora-") && key !== CACHE)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

const sameOrigin = url => url.origin === self.location.origin;

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Fremde Server (Supabase, Oura, ...) nie anfassen.
  if (!sameOrigin(url)) return;

  // Seiten: immer zuerst aus dem Netz (damit Updates sofort da sind),
  // nur offline aus dem Speicher.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok && url.pathname.endsWith("/")) {
            const copy = response.clone();
            caches.open(CACHE).then(cache => cache.put("./", copy));
          }
          return response;
        })
        .catch(async () =>
          (await caches.match(request, { ignoreSearch: true })) ||
          (await caches.match("./")) ||
          Response.error()
        )
    );
    return;
  }

  // Feste Dateien (Skripte mit Versionsnummer, Icons, Schrift,
  // App-Design und App-Code mit ?v=Prüfsumme):
  // sofort aus dem Speicher, im Hintergrund aktualisieren.
  const cacheable =
    url.pathname.includes("/vendor/") ||
    url.pathname.includes("/css/") ||
    url.pathname.includes("/js/") ||
    url.pathname.includes("/icons/") ||
    url.pathname.endsWith(".webmanifest");

  if (!cacheable) return;

  event.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(request);
      const network = fetch(request)
        .then(response => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

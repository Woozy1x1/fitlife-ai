// VYORA AI – Service Worker
// Speichert nur die App-Dateien (Seiten, Skripte, Icons, Schrift).
// Persönliche Daten und alle Anfragen an Supabase/Oura werden NICHT
// angefasst oder zwischengespeichert.

const CACHE = "vyora-app-v4";

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

// Push-Erinnerungen anzeigen (Inhalt kommt verschlüsselt vom Server)
self.addEventListener("push", event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_e) {}
  const view = typeof data.view === "string" ? data.view : "homeView";
  event.waitUntil(self.registration.showNotification(data.title || "VYORA", {
    body: data.body || "",
    icon: "icons/icon-192.png",
    badge: "icons/icon-192.png",
    tag: "vyora-" + view,
    data: { view }
  }));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const view = event.notification.data?.view || "homeView";
  const target = new URL("./#" + view, self.registration.scope).href;
  event.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of list) {
      if (client.url.startsWith(self.registration.scope)) {
        await client.focus();
        client.postMessage({ type: "open-view", view });
        return;
      }
    }
    await self.clients.openWindow(target);
  })());
});

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

  // Module ohne Versionsnummer (js/<Ordner>/*.js): immer zuerst aus dem Netz
  // (der Browser fragt nur nach, ob sich die Datei geändert hat), offline aus
  // dem Speicher. So reicht es, eine einzelne Moduldatei auszutauschen.
  if (url.pathname.includes("/js/") && url.pathname.endsWith(".js") && !url.searchParams.has("v")) {
    event.respondWith(
      fetch(request, { cache: "no-cache" })
        .then(response => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then(cache => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => (await caches.match(request)) || Response.error())
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

// CPUAGEN Service Worker — offline support + file caching
const CACHE_NAME = "cpuagen-v1";
const PRECACHE = ["/app/chat", "/app/code", "/app/dual", "/app/settings"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  // Network-first for API, cache-first for assets
  if (e.request.url.includes("/api/")) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

// Virtual File System sync via message
self.addEventListener("message", (e) => {
  if (e.data?.type === "CACHE_FILE") {
    caches.open("cpuagen-files").then((cache) => {
      cache.put(
        new Request(`/vfs/${e.data.path}`),
        new Response(e.data.content, { headers: { "Content-Type": e.data.mime || "text/plain" } })
      );
    });
  }
});

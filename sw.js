const CACHE_NAME = "cardapio-semana-v4";
const ASSETS = [
  "./index.html",
  "./styles.css",
  "./data.js",
  "./app.js",
  "./manifest.json",
  "./icon.svg",
  "./vendor/pdf-lib.min.js",
  "./vendor/pdf.min.js",
  "./vendor/pdf.worker.min.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// Network-first: enquanto o app estiver em desenvolvimento ativo, sempre busca a versão
// mais nova primeiro e só cai pro cache (offline) se a rede falhar. Cache-first travava
// o app numa versão antiga toda vez que os arquivos mudavam.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request)
      .then((fresh) => {
        const copy = fresh.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return fresh;
      })
      .catch(() => caches.match(event.request))
  );
});

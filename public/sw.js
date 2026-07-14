// Service worker minimal : cache de l'app shell pour un usage hors-ligne.
// Stratégie : réseau d'abord, repli sur le cache (app + navigations).
const CACHE = 'suivi-bebe-v1';
const CORE = ['/', '/index.html', '/manifest.webmanifest', '/favicon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  event.respondWith(
    fetch(request)
      .then((resp) => {
        // On met en cache une copie des ressources récupérées.
        const copy = resp.clone();
        caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
        return resp;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        // Repli navigation -> page d'accueil en cache.
        if (request.mode === 'navigate') {
          const shell = await caches.match('/index.html');
          if (shell) return shell;
        }
        return Response.error();
      }),
  );
});

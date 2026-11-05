const CACHE_NAME = 'iglesia-pwa-v1';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/manifest.json',
  '/js/app.js',
  '/js/api.js',
  '/js/ui.js',
  '/js/views/announcements.js',
  '/js/views/attendance.js',
  '/js/views/auth.js',
  '/js/views/dashboard.js',
  '/js/views/donations.js',
  '/js/views/events.js',
  '/js/views/library.js',
  '/js/views/members.js',
  '/js/views/ministries.js',
  '/js/views/profile.js',
  '/js/views/reports.js',
  '/js/views/settings.js',
  '/js/views/users.js',
  '/vendor/chart.js/chart.umd.min.js',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg',
  '/icons/icon-maskable-512.svg',
];

// Instalación: precachear recursos estáticos esenciales
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activación: limpieza de cachés anteriores y reclamación inmediata de clientes
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE_NAME)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Estrategia de Fetch
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. Excluir peticiones que NO son GET, o que apuntan a la API o descargas dinámicas
  if (
    request.method !== 'GET' ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/uploads/')
  ) {
    return;
  }

  // 2. Navegación HTML (SPA): Network first, fallback al cache /index.html
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // 3. Fuentes externas (Google Fonts): Cache first, con fallback a red y guardado en caché
  if (url.origin !== location.origin) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // 4. Recursos estáticos locales: Stale-While-Revalidate o Cache First
  event.respondWith(
    caches.match(request).then((cached) => {
      const fetchPromise = fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.ok) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return networkResponse;
        })
        .catch(() => null);

      return cached || fetchPromise;
    })
  );
});

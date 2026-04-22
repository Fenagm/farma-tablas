const CACHE_NAME = 'farmacia-clinica-v3';
const BASE_PATH = self.location.pathname.replace(/[^/]+$/, '');
const ASSETS_TO_CACHE = [
  BASE_PATH,
  `${BASE_PATH}index.html`,
  `${BASE_PATH}app.js`,
  `${BASE_PATH}manifest.json`,
];

// Instalación del Service Worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Cacheando assets');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .catch((err) => {
        console.error('[SW] Error al cachear:', err);
      })
  );
  self.skipWaiting();
});

// Activación del Service Worker
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Eliminando cache viejo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Interceptación de peticiones
self.addEventListener('fetch', (event) => {
  // Solo manejar peticiones GET
  if (event.request.method !== 'GET') return;

  // Ignorar peticiones externas (Firebase, Google Fonts, etc.)
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          // Devolver desde caché y actualizar en segundo plano
          return cachedResponse;
        }
        // Si no está en caché, intentar la red
        return fetch(event.request).then((response) => {
          // Si la respuesta es válida, guardarla en caché
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
          return response;
        });
      })
      .catch(() => {
        // Si falla todo, devolver offline page si es HTML
        if (event.request.headers.get('accept').includes('text/html')) {
          return caches.match(`${BASE_PATH}index.html`);
        }
      })
  );
});

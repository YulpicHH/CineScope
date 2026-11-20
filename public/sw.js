const CACHE_VERSION = 'cinescope-static-v1';
const STATIC_PRECACHE_URLS = [
  '/manifest.webmanifest',
  '/apple-touch-icon.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

const NEVER_CACHE_HOSTS = new Set([
  'api.themoviedb.org',
  'kinopoiskapiunofficial.tech',
]);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(STATIC_PRECACHE_URLS))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_VERSION)
            .map((oldKey) => caches.delete(oldKey)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isStaticAssetPath(pathname) {
  return (
    pathname.startsWith('/assets/') ||
    pathname.startsWith('/icons/') ||
    pathname === '/apple-touch-icon.png' ||
    pathname === '/manifest.webmanifest'
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') {
    return;
  }

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return;
  }

  // Никогда не кэшируем API-запросы (ни собственный прокси /api/*, ни внешние API)
  if (NEVER_CACHE_HOSTS.has(url.hostname)) {
    return;
  }

  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) {
    return;
  }

  // Не перехватываем сторонние домены (постеры TMDB, шрифты, трейлеры YouTube)
  if (url.origin !== self.location.origin) {
    return;
  }

  // HTML-навигация — Network-First, чтобы обновления после деплоя на Vercel применялись сразу
  const acceptHeader = request.headers.get('accept') || '';
  const isNavigation =
    request.mode === 'navigate' || acceptHeader.includes('text/html');

  if (isNavigation) {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.ok && networkResponse.type === 'basic') {
            const copy = networkResponse.clone();
            caches
              .open(CACHE_VERSION)
              .then((cache) => cache.put('/index.html', copy))
              .catch(() => undefined);
          }
          return networkResponse;
        })
        .catch(async () => {
          const cachedShell = await caches.match('/index.html');
          if (cachedShell) return cachedShell;
          const cachedExact = await caches.match(request);
          if (cachedExact) return cachedExact;
          return new Response('Нет подключения к сети.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
        }),
    );
    return;
  }

  // Статические ассеты (/assets/*, иконки, манифест) — Cache-First
  if (isStaticAssetPath(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.ok && networkResponse.type === 'basic') {
            const copy = networkResponse.clone();
            caches
              .open(CACHE_VERSION)
              .then((cache) => cache.put(request, copy))
              .catch(() => undefined);
          }
          return networkResponse;
        });
      }),
    );
  }
});

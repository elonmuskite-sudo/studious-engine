const CACHE_NAME = 'nexus-chat-v5';
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/logo.svg'];

self.addEventListener('install', (event) => {
  // Cache each entry independently so one failed request cannot leave the app shell uncached.
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(APP_SHELL.map((url) => cache.add(new Request(url, { cache: 'reload' }))))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

function isPageRequest(request) {
  if (request.mode === 'navigate') return true;
  const accept = request.headers.get('accept') || '';
  const url = new URL(request.url);
  return accept.includes('text/html') || (request.destination === '' && !/\.[a-z0-9]+$/i.test(url.pathname));
}

async function appShellFallback(request) {
  const match = (key) => caches.match(key, { ignoreSearch: true }).catch(() => undefined);
  return (await match(request)) || (await match('/index.html')) || (await match('/'));
}

async function handlePageRequest(request) {
  try {
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
    }
    return response;
  } catch {
    const cached = await appShellFallback(request);
    if (cached) return cached;
    // Retry once in case the first attempt failed on a transient network blip.
    try {
      return await fetch(request);
    } catch {
      return new Response('Nexus Chat is temporarily unavailable offline.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (isPageRequest(request)) {
    event.respondWith(handlePageRequest(request));
    return;
  }

  event.respondWith(
    caches.match(request)
      .catch(() => undefined)
      .then((cached) => cached || fetch(request))
      .catch(() => new Response('This resource is temporarily unavailable.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      }))
  );
});

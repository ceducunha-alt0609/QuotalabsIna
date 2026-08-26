/* QuotaLab Inadimplência PRO · Service Worker · isolado */
const CACHE_PREFIX  = 'quotalab-ina-';
const CACHE_NAME    = 'quotalab-ina-v134';
const FONTS_CACHE   = 'quotalab-ina-fonts-v1';
const CDN_CACHE     = 'quotalab-ina-cdn-v1';
const APP_SCOPE     = '/QuotalabsIna/';

const SHELL_ASSETS = [
  './',
  './ql_inadimplencia_SALVO__3_.html',
  './ql_inadimplencia_SALVO__3_.html?utm_source=pwa',
  './manifest.json',
  './icons/icon.svg',
  './icons/favicon.ico',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-32.png',
  './icons/icon-16.png'
];

function normalizeUrl(url) {
  const u = new URL(url);
  ['utm_source','utm_medium','utm_campaign','tab'].forEach(p => u.searchParams.delete(p));
  return u.toString();
}

const CDN_ORIGINS = ['fonts.googleapis.com','fonts.gstatic.com','cdnjs.cloudflare.com'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
      .catch(err => console.warn('[SW] Install cache parcial:', err))
  );
});

self.addEventListener('activate', event => {
  const valid = [CACHE_NAME, FONTS_CACHE, CDN_CACHE];
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k.startsWith(CACHE_PREFIX) && !valid.includes(k)).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.protocol === 'chrome-extension:') return;

  if (CDN_ORIGINS.some(o => url.hostname.includes(o))) {
    const cacheName = url.hostname.includes('font') ? FONTS_CACHE : CDN_CACHE;
    event.respondWith(staleWhileRevalidate(event.request, cacheName));
    return;
  }

  // Nunca interceptar outro PWA hospedado no mesmo domínio GitHub Pages.
  if (url.origin === self.location.origin && !url.pathname.startsWith(APP_SCOPE)) return;

  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(event.request));
    return;
  }
  event.respondWith(networkFirst(event.request));
});

async function cacheFirst(request) {
  const normalized = normalizeUrl(request.url);
  const normReq = normalized !== request.url ? new Request(normalized) : request;
  const cached = await caches.match(normReq) || await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(normReq, response.clone());
    }
    return response;
  } catch {
    return await caches.match('./ql_inadimplencia_SALVO__3_.html') ||
      new Response('<h1>Offline</h1><p>Conecte-se para carregar o QuotaLab.</p>', {headers:{'Content-Type':'text/html'}});
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return await caches.match(request) || new Response('Offline', {status:503});
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);
  return cached || fetchPromise;
}

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'CLEAR_CACHE') {
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k.startsWith(CACHE_PREFIX)).map(k => caches.delete(k))
    )).then(() => event.source?.postMessage({type:'CACHE_CLEARED'}));
  }
});

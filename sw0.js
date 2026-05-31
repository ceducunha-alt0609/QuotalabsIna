/* ═══════════════════════════════════════════════
   QuotaLab · Service Worker · v133.5B
   Estratégia:
   - App shell (HTML + ícones + manifest) → cache-first
   - Google Fonts + CDN libs             → stale-while-revalidate
   - Tudo mais                           → network-first com fallback
═══════════════════════════════════════════════ */

const CACHE_NAME    = 'quotalab-v133-5b';
const FONTS_CACHE   = 'quotalab-fonts-v1';
const CDN_CACHE     = 'quotalab-cdn-v1';

/* ── Arquivos do app shell — cacheados na instalação ── */
const SHELL_ASSETS = [
  './',
  './ql_inadimplencia_SALVO__3_.html',
  './manifest.json',
  './icons/icon.svg',
  './icons/favicon.ico',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-32.png',
  './icons/icon-16.png',
];

/* ── Origens tratadas como CDN (stale-while-revalidate) ── */
const CDN_ORIGINS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdnjs.cloudflare.com',
];

/* ═══ INSTALL ═══ */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
      .catch(err => console.warn('[SW] Install cache parcial:', err))
  );
});

/* ═══ ACTIVATE ═══ */
self.addEventListener('activate', event => {
  const valid = [CACHE_NAME, FONTS_CACHE, CDN_CACHE];
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => !valid.includes(k))
          .map(k => { console.log('[SW] Removendo cache antigo:', k); return caches.delete(k); })
      ))
      .then(() => self.clients.claim())
  );
});

/* ═══ FETCH ═══ */
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  /* Ignorar não-GET e chrome-extension */
  if (event.request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;

  /* ── Fonts / CDN → stale-while-revalidate ── */
  if (CDN_ORIGINS.some(o => url.hostname.includes(o))) {
    const cacheName = url.hostname.includes('font') ? FONTS_CACHE : CDN_CACHE;
    event.respondWith(staleWhileRevalidate(event.request, cacheName));
    return;
  }

  /* ── App shell → cache-first ── */
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  /* ── Tudo mais → network-first ── */
  event.respondWith(networkFirst(event.request));
});

/* ════ Estratégias ════ */

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    /* offline e não está no cache — retorna página principal como fallback */
    return caches.match('./ql_inadimplencia_SALVO__3_.html');
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
    const cached = await caches.match(request);
    return cached || new Response('Offline', { status: 503 });
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request)
    .then(response => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  return cached || fetchPromise;
}

/* ═══ MENSAGENS (do app → SW) ═══ */
self.addEventListener('message', event => {
  /* Forçar atualização imediata quando o app pede */
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  /* Limpar cache sob demanda (ex: após reset de dados) */
  if (event.data?.type === 'CLEAR_CACHE') {
    caches.keys().then(keys =>
      Promise.all(keys.map(k => caches.delete(k)))
    ).then(() => event.source?.postMessage({ type: 'CACHE_CLEARED' }));
  }
});

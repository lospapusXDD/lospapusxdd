// Los Papus Service Worker v14
const CACHE = 'lospapus-v14';
const ASSETS = [
  './index.html',
  'https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600;700;900&family=Orbitron:wght@400;700;900&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://unpkg.com/aos@2.3.1/dist/aos.css',
  'https://unpkg.com/aos@2.3.1/dist/aos.js',
  'https://cdnjs.cloudflare.com/ajax/libs/typed.js/2.0.12/typed.min.js',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // No cachear Firebase — siempre va a la red
  if (e.request.url.includes('firebase') ||
      e.request.url.includes('firestore') ||
      e.request.url.includes('gstatic')) {
    e.respondWith(fetch(e.request));
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached => {
      const fetchPromise = fetch(e.request).then(res => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE).then(cache => cache.put(e.request, clone));
        }
        return res;
      }).catch(() => cached || new Response('Offline', { status: 503 }));
      // Network first para index.html, cache first para el resto
      if (e.request.url.includes('index.html') || e.request.url.endsWith('/')) {
        return fetchPromise;
      }
      return cached || fetchPromise;
    })
  );
});

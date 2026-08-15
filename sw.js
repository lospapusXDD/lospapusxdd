// Service worker de desactivación: limpia cachés y se auto-desregistra.
self.addEventListener('install', e => {
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))).then(() => {
      self.registration.unregister().then(() => {
        clients.matchAll().then(clients => clients.forEach(c => c.navigate(c.url)));
      });
    })
  );
  self.clients.claim();
});
self.addEventListener('fetch', e => { e.respondWith(fetch(e.request)); });
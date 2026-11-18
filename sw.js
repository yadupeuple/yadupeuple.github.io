// Y'a du peuple ? — service worker : (1) notifications (alertes « c'est calme » sur les favoris),
// (2) mémoire du fond de carte OpenFreeMap (style, polices, icônes, tuiles déjà vues) pour que la carte s'affiche
// presque tout de suite aux ouvertures suivantes. Le code de l'appli n'est PAS mis en cache : il se met à jour avec ?v=N comme avant.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = {}; }
  e.waitUntil(self.registration.showNotification(d.title || "Y'a du peuple ?", {
    body: d.body || '',
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    tag: d.tag || undefined,
    data: { url: d.url || './' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of list) {
      if ('focus' in c) {
        await c.focus();
        if ('navigate' in c) { try { await c.navigate(url); } catch {} }
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});

// ---------------------------------------------------------------------------
// Mémoire de la carte (OpenFreeMap)
// ---------------------------------------------------------------------------
const MAP_HOST = 'tiles.openfreemap.org';
const MAP_CACHE = 'ydp-map-v1';
const MAX_ENTRIES = 700; // ~ quelques dizaines de Mo au maximum : les plus anciennes sont retirées

self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith('ydp-map-') && k !== MAP_CACHE) await caches.delete(k);
})()));

async function trim(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_ENTRIES; i++) await cache.delete(keys[i]);
}
let lastTrim = 0; // le tri se fait au plus une fois par minute (pas à chaque tuile : sinon la carte attend pendant les zooms)
async function put(cache, req, res) {
  if (res && res.ok && res.status === 200) {
    await cache.put(req, res.clone());
    if (Date.now() - lastTrim > 60000) { lastTrim = Date.now(); await trim(cache); }
  }
  return res;
}
// Tuiles (adresse versionnée), polices, icônes : ne changent jamais pour une même adresse → on sert la copie gardée.
async function cacheFirst(e, req) {
  const cache = await caches.open(MAP_CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  e.waitUntil(put(cache, req, res));
  return res;
}
// Style de la carte et liste des versions de tuiles : copie gardée tout de suite, mise à jour en arrière-plan.
async function staleWhileRevalidate(e, req) {
  const cache = await caches.open(MAP_CACHE);
  const hit = await cache.match(req);
  const refresh = fetch(req).then((res) => put(cache, req, res)).catch(() => null);
  if (hit) { e.waitUntil(refresh); return hit; }
  return (await refresh) || fetch(req);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname !== MAP_HOST) return;
  const immutable = /^\/(fonts|sprites)\//.test(url.pathname) || /^\/planet\/[^/]+\/\d+\/\d+\/\d+\./.test(url.pathname);
  e.respondWith((async () => {
    try { return await (immutable ? cacheFirst(e, req) : staleWhileRevalidate(e, req)); }
    catch { return fetch(req); }
  })());
});

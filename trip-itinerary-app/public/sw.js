// Wayfare service worker: offline app shell, photo cache, and push reminders.
const VERSION = 'wayfare-v1';
const SHELL = `${VERSION}-shell`;
const IMAGES = `${VERSION}-images`;
const MAX_IMAGES = 250;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      const res = await fetch('/', { cache: 'reload' });
      const html = await res.clone().text();
      await cache.put('/', res);
      // Precache the hashed JS/CSS referenced by index.html so the app opens offline.
      const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
      await cache.addAll([...new Set(assets), '/manifest.webmanifest', '/icon.svg', '/apple-touch-icon.png']);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (!key.startsWith(VERSION)) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // App navigations: network first, fall back to the cached shell.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && url.origin === location.origin) caches.open(SHELL).then((c) => c.put('/', res.clone()));
          return res;
        })
        .catch(() => caches.match('/')),
    );
    return;
  }

  // Our API: always live (the app keeps its own offline copy in IndexedDB).
  if (url.origin === location.origin && url.pathname.startsWith('/api/')) return;

  // Same-origin static assets: cache first (they're content-hashed).
  if (url.origin === location.origin) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) caches.open(SHELL).then((c) => c.put(req, res.clone()));
            return res;
          }),
      ),
    );
    return;
  }

  // Destination photos (Wikimedia): cache first so trips look right offline.
  if (url.hostname === 'upload.wikimedia.org') {
    event.respondWith(
      caches.open(IMAGES).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok || res.type === 'opaque') {
          await cache.put(req, res.clone());
          const keys = await cache.keys();
          for (const k of keys.slice(0, Math.max(0, keys.length - MAX_IMAGES))) await cache.delete(k);
        }
        return res;
      }),
    );
  }
});

self.addEventListener('push', (event) => {
  let data = { title: 'Wayfare', body: 'You have an upcoming plan.', url: '/' };
  try {
    data = { ...data, ...event.data.json() };
  } catch {
    if (event.data) data.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.tag,
      data: { url: data.url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const w of wins) {
        if ('focus' in w) {
          await w.navigate(url).catch(() => undefined);
          return w.focus();
        }
      }
      return self.clients.openWindow(url);
    })(),
  );
});

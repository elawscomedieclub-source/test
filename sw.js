// Service worker : permet l'installation de l'application et garde une copie du site pour les coupures de réseau.
// Stratégie : le réseau d'abord (vous avez toujours la dernière version), la copie enregistrée en secours.
// Les données (Supabase) et les bibliothèques externes ne sont jamais mises en cache ici.
const VERSION = 'eq-v5';
const SHELL = ['./', 'index.html', 'app.js', 'api.js', 'backend.js', 'config.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;          // Supabase, polices, bibliothèques : laissés au navigateur
  e.respondWith(
    fetch(req).then((res) => {
      if (res && res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then((hit) => hit || caches.match('index.html')))
  );
});

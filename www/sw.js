/* 오프라인 캐시 (PWA 웹 배포용) — 앱 셸은 캐시 우선, 지도 타일은 네트워크 우선 */
const V = 'egs-v1.0.0';
const SHELL = ['./', 'index.html', 'css/app.css', 'js/data.js', 'js/native.js', 'js/store.js', 'js/app.js', 'lib/capacitor.js', 'lib/jsQR.js', 'lib/leaflet/leaflet.js', 'lib/leaflet/leaflet.css', 'assets/logo-mark.png', 'assets/logo-full.png', 'assets/mascot-hero.jpg', 'assets/mascot-avatar.jpg', 'manifest.webmanifest'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (u.origin !== location.origin) { e.respondWith(fetch(e.request).catch(() => caches.match(e.request))); return; }
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => { const cp = res.clone(); caches.open(V).then(c => c.put(e.request, cp)); return res; })));
});

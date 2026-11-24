const CACHE = 'shiftcal-v14';
const V = '?v=14';
const ASSETS = [
  './', 'index.html', 'style.css' + V, 'app.js' + V, 'holidays.js' + V, 'manifest.json',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];
const FONT_HOST = 'cdn.jsdelivr.net';

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // 웹폰트: 캐시 우선 (한 번 받으면 오프라인에서도 사용)
  if (url.host === FONT_HOST) {
    e.respondWith(
      caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
        if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
        return res;
      }))
    );
    return;
  }
  if (url.origin !== location.origin) return;
  // 앱 파일: 항상 서버에 최신 여부 확인(브라우저 임시 저장 무시), 오프라인이면 캐시
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return res; })
      .catch(() => caches.match(e.request).then(r => r || caches.match('index.html')))
  );
});

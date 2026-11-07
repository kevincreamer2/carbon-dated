// Carbon Dated offline support.
// Pages are fetched fresh from the network whenever there is one, so a new deploy shows up straight away;
// the saved copy is only used when the phone is offline (on the Tube, in a dead spot).
// Icons and fonts are served from the saved copy and refreshed in the background.
// The scores Worker (another domain) is never cached: crowd stats just don't appear offline.
const CACHE = 'carbon-dated-v1';
const CORE = ['/', '/favicon.svg', '/favicon-32.png', '/apple-touch-icon.png', '/icon-192.png', '/site.webmanifest'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameSite = url.origin === self.location.origin;
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!sameSite && !isFont) return;

  // The game page: network first, saved copy if offline
  if (req.mode === 'navigate' || (sameSite && (url.pathname === '/' || url.pathname.endsWith('.html')))) {
    e.respondWith(
      fetch(req).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put('/', copy)); }
        return res;
      }).catch(() => caches.match('/').then(r => r || Response.error()))
    );
    return;
  }

  // Icons, manifest and fonts: saved copy first, refreshed in the background
  e.respondWith(
    caches.match(req).then(hit => {
      const fresh = fetch(req).then(res => {
        if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return res;
      }).catch(() => hit || Response.error());
      return hit || fresh;
    })
  );
});

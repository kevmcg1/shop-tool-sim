// Makes repeat visits fast: the libraries from the CDNs (three.js, Font Awesome, the fonts) and this site's own versioned files are kept
// on the device after the first visit and served from there. The page itself (index.html) always asks the network first, so a new
// release shows up straight away; every css/ and js/ file carries ?v=N, so a changed file is a new address and is never stale.
const CACHE = 'shop-tool-sim-v1';
const CDN = /^https:\/\/(cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com|fonts\.gstatic\.com)\//;
const FONT_CSS = /^https:\/\/fonts\.googleapis\.com\//;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

async function cacheFirst(req, cors){
  const c = await caches.open(CACHE), hit = await c.match(req.url);
  if (hit) return hit;
  // a plain <script> asks without CORS and would get a bulky opaque copy; ask with CORS (these CDNs allow it), which is just as good to the page
  const res = await fetch(cors ? new Request(req.url, { mode: 'cors', credentials: 'omit' }) : req);
  if (res && res.ok) c.put(req.url, res.clone());
  return res;
}
async function networkFirst(req){
  const c = await caches.open(CACHE);
  try { const res = await fetch(req); if (res && res.ok) c.put(req, res.clone()); return res; }
  catch (e) { const hit = await c.match(req); if (hit) return hit; throw e; }
}
async function staleWhileRevalidate(req){
  const c = await caches.open(CACHE), hit = await c.match(req.url);
  const net = fetch(req).then(res => { if (res && res.ok) c.put(req.url, res.clone()); return res; }).catch(() => hit);
  return hit || net;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (CDN.test(req.url)) { e.respondWith(cacheFirst(req, true).catch(() => fetch(req))); return; }
  if (FONT_CSS.test(req.url)) { e.respondWith(staleWhileRevalidate(req).catch(() => fetch(req))); return; }
  if (url.origin === location.origin) {
    if (req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('.html')) { e.respondWith(networkFirst(req)); return; }
    if (url.search.includes('v=')) { e.respondWith(cacheFirst(req, false).catch(() => fetch(req))); return; }
  }
});

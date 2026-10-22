const CACHE='los-santos-gps-shell-v50';
const SHELL=['./','./index.html','./app.js','./scene.js','./geo.js','./config.js','./style.css','./manifest.webmanifest','./icon.png','./icon-512.png','./cloud-1.webp','./cloud-2.webp','./cloud-3.webp','./vendor/three.min.js','./vendor/maplibre-gl.js','./vendor/maplibre-gl.css'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('los-santos-gps-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(u.origin!==self.location.origin||e.request.method!=='GET')return;u.search='';const key=u.href;
 e.respondWith(fetch(e.request).then(r=>{if(r.ok){const copy=r.clone();e.waitUntil(caches.open(CACHE).then(c=>c.put(key,copy)));}return r;}).catch(async()=>await caches.match(key)||new Response('Çevrimdışı: bu dosya henüz kaydedilmedi.',{status:503})));});

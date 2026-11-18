/* MYCAR 3.2 - network-first shell updates, offline fallback, scoped caching. */
const CACHE='mycar-shell-cloud-v10-grouped-bars-3-3-1';
const VERSION='3.3.1';
const ASSETS=[
  './','./index.html','./app.js?v=3.3.1','./auth.js?v=3.3.1',
  './auth-config.js','./cloud-sync.js?v=3.3.1',
  './assets/app.css?v=3.3.1','./assets/car-photos.css?v=3.3.1',
  './assets/tng-import.css?v=3.3.1','./assets/auth.css?v=3.3.1',
  './tng-import.js?v=3.3.1','./vehicle-photos.js?v=3.3.1',
  './assets/toyota-corolla-cross-3q.webp',
  './manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./icons/apple-touch-icon.png'
];
const SCOPE=new URL(self.registration.scope).pathname;
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  // Do NOT remove unrelated apps' caches on github.io origin.
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys
    .filter(key=>key.startsWith('mycar-') && key!==CACHE)
    .map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('message',event=>{
  if(event.data?.type==='MYCAR_SKIP_WAITING')self.skipWaiting();
});
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin || !url.pathname.startsWith(SCOPE))return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    try {
      // Bypass browser HTTP cache on online visits; new deployments become visible.
      const response=await fetch(req,{cache:'no-store'});
      if(response.ok && response.type==='basic') await cache.put(req,response.clone());
      return response;
    }catch(error){
      const saved=await cache.match(req,{ignoreSearch:true});
      if(saved)return saved;
      if(req.mode==='navigate')return (await cache.match('./index.html')) || Response.error();
      return Response.error();
    }
  })());
});

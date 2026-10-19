// Service worker: la app funciona como PWA. Caché del "cascarón" (páginas, estilos, scripts, plantillas);
// nunca se cachean las llamadas a Supabase ni las imágenes firmadas de reportes.
const VERSION = 'pm-8fee724cfd';
const SHELL = ['./', './index.html', './login.html', './cuenta.html', './expediente.html', './ranking.html', './manuales.html', './reglamento.html', './privacidad.html', './sin-conexion.html', './estilos.css', './favicon.svg', './manifest.webmanifest',
  './reportes/bajas/', './reportes/bajas/plantilla.png', './reportes/reclutamiento/', './reportes/reclutamiento/plantilla.png',
  './reportes/patrullaje/', './reportes/patrullaje/plantilla.png', './reportes/toma-territorio/', './reportes/toma-territorio/plantilla.png', './reportes/plantilla/'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => Promise.allSettled(SHELL.map(u => c.add(u)))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request; if(req.method !== 'GET') return;
  const url = new URL(req.url);
  if(url.origin !== self.location.origin) return;                       // Supabase, Cloudflare, fuentes: directo a la red
  if(req.mode === 'navigate'){                                           // páginas: red primero, caché si no hay conexión
    e.respondWith(fetch(req).then(r => { const c = r.clone(); caches.open(VERSION).then(x => x.put(req, c)); return r; })
      .catch(() => caches.match(req, { ignoreSearch:true }).then(r => r || caches.match('./sin-conexion.html'))));
    return;
  }
  if(/\.(js|css|webmanifest)(\?|$)/.test(url.pathname + url.search)){   // scripts y estilos: red primero (traen ?v=), caché de respaldo
    e.respondWith(fetch(req).then(r => { const c = r.clone(); caches.open(VERSION).then(x => x.put(req, c)); return r; }).catch(() => caches.match(req)));
    return;
  }
  if(/\.(png|jpg|jpeg|svg|pdf|webp)$/i.test(url.pathname)){            // plantillas, iconos, manuales: caché primero
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(x => { const c = x.clone(); caches.open(VERSION).then(k => k.put(req, c)); return x; })));
  }
});

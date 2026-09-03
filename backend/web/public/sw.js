/*
 * Service worker para que la app abra sin señal.
 *
 * El caso de uso es un sótano de gimnasio en Bogotá: la app está instalada en la
 * pantalla de inicio (app.webmanifest declara display: standalone) y se consulta
 * entre series. Sin esto no abría, porque el servidor manda todo con
 * `cache-control: no-cache` y no había nada guardado.
 *
 * Dos estrategias, según lo que cambia:
 *
 *   plan.json  → red primero, caché como respaldo. El plan se regenera cada
 *                semana con run_weekly.sh; estando en línea siempre gana el
 *                fresco, y sin señal se ve el último que se descargó.
 *   lo demás   → caché primero y revalidación en segundo plano. Abre instantáneo
 *                y sin red; si hubo deploy, la siguiente apertura ya trae el
 *                código nuevo. Para una guía que se lee entre series, abrir
 *                rápido vale más que estar al día al milisegundo.
 *
 * CACHE lleva versión: al cambiarla, `activate` borra las anteriores. Súbela
 * cuando cambies la lista de SHELL o la lógica de aquí; para cambios de
 * contenido no hace falta, porque plan.json va por red.
 */
const CACHE = 'gimnasio-v1';

// El esqueleto de la app. Las fotos de /ex/ no van aquí a propósito: son 28
// archivos que solo hacen falta al abrir el desplegable de un ejercicio, así que
// se guardan sobre la marcha y no retrasan la primera carga.
const SHELL = [
  '/',
  '/index.html',
  '/app.js',
  '/figure.js',
  '/poses.js',
  '/loads.js',
  '/photos.js',
  '/styles.css',
  '/plan.json',
  '/icon.svg',
  '/app.webmanifest',
];

self.addEventListener('install', (e) => {
  // addAll falla entero si un archivo falla; se piden de a uno para que un 404
  // en un asset no deje la app sin caché ninguna.
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => null))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function fresh(req, cache) {
  return fetch(req).then((res) => {
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  });
}

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;
  // Tipografías de Google: distinto origen, pero sin ellas la app se ve con la
  // fuente del sistema. Se guardan igual.
  const isFont = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!sameOrigin && !isFont) return;

  // El plan cambia cada semana: en línea siempre gana el de la red.
  if (sameOrigin && url.pathname === '/plan.json') {
    e.respondWith(
      caches.open(CACHE).then((c) =>
        fresh(request, c).catch(() => c.match(request).then((hit) => hit || Response.error()))),
    );
    return;
  }

  // Navegación: si no hay red, sirve el index guardado en vez de la pantalla de
  // dinosaurio. La app es de una sola página, así que cualquier ruta cae ahí.
  if (request.mode === 'navigate') {
    e.respondWith(
      caches.open(CACHE).then((c) =>
        fresh(request, c).catch(() => c.match('/index.html').then((hit) => hit || Response.error()))),
    );
    return;
  }

  e.respondWith(
    caches.open(CACHE).then((c) => c.match(request).then((hit) => {
      const red = fresh(request, c).catch(() => hit);
      return hit || red;
    })),
  );
});

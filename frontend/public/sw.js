// Service worker de TenisAI. Solo hace una cosa: si no hay conexión, en vez del error del
// navegador muestra una página propia. No guarda en caché páginas ni datos de la API, así
// que la app siempre enseña información actual (análisis, partidos, ranking).
// Cambiar la versión al modificar la página sin conexión o el logo: así se descargan de nuevo
const VERSION = "tenisai-v2";
const SIN_CONEXION = "/offline.html";
const PRECARGA = [SIN_CONEXION, "/logo.webp"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(PRECARGA))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  // Borra las cachés de versiones anteriores y toma el control de las pestañas abiertas
  event.waitUntil(
    caches
      .keys()
      .then((claves) => Promise.all(claves.filter((c) => c !== VERSION).map((c) => caches.delete(c))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.mode === "navigate") {
    // Navegación entre páginas: de la red; sin conexión, la página propia
    event.respondWith(fetch(request).catch(() => caches.match(SIN_CONEXION)));
    return;
  }
  // Lo que usa la página sin conexión (el logo) sale de la caché aunque no haya red.
  // El resto de peticiones van a la red sin tocar
  const url = new URL(request.url);
  if (request.method === "GET" && url.origin === self.location.origin && PRECARGA.includes(url.pathname)) {
    event.respondWith(caches.match(request).then((guardada) => guardada ?? fetch(request)));
  }
});

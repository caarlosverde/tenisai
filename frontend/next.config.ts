import type { NextConfig } from "next";

// Carpeta de la aplicación. Con el compilador nativo de Next este archivo se ejecuta como
// CommonJS (hay __dirname); con el de reserva en WebAssembly (si Windows bloquea el
// nativo), como módulo ES, donde no existe: entonces vale la carpeta desde la que se arranca
const carpetaApp = typeof __dirname === "string" ? __dirname : process.cwd();

// Motor de análisis (FastAPI) visto desde el servidor de Next
const MOTOR = process.env.API_INTERNAL_URL ?? "http://localhost:8001";

const nextConfig: NextConfig = {
  // La imagen de Docker de producción (frontend/Dockerfile) usa la salida autónoma: un
  // server.js con solo las dependencias necesarias. En local se sigue usando next start
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  // El navegador y la app llaman al motor en /motor/...: Next lo reenvía con las cabeceras
  // (cookie de sesión, Range de los vídeos). En producción, el proxy inverso (Caddy) envía
  // /motor directamente al motor y este reenvío solo se usa en desarrollo
  async rewrites() {
    return [{ source: "/motor/:path*", destination: `${MOTOR}/:path*` }];
  },
  experimental: {
    // Next copia en memoria el cuerpo de lo que reenvía y, por defecto, solo los primeros
    // 10 MB: un vídeo llegaría cortado. Margen sobre el límite de 150 MB del motor
    proxyClientMaxBodySize: "160mb",
    // Tiempo máximo sin actividad en la conexión con el motor (por defecto, 30 s)
    proxyTimeout: 120_000,
  },
  // En desarrollo, la web también se puede abrir desde un móvil de la misma wifi
  // (http://192.168.x.x:3000). Sin esto, Next bloquea los recursos de desarrollo que pide
  // otro host
  allowedDevOrigins: ["192.168.*.*"],
  turbopack: {
    // La raíz del repositorio tiene otro package-lock.json (no es un monorepo):
    // la aplicación vive en esta carpeta
    root: carpetaApp,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        // El service worker no se cachea: así cada versión nueva llega en la siguiente visita
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;

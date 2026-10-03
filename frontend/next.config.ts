import type { NextConfig } from "next";

// Carpeta de la aplicación. Con el compilador nativo de Next este archivo se ejecuta como
// CommonJS (hay __dirname); con el de reserva en WebAssembly (si Windows bloquea el
// nativo), como módulo ES, donde no existe: entonces vale la carpeta desde la que se arranca
const carpetaApp = typeof __dirname === "string" ? __dirname : process.cwd();

const nextConfig: NextConfig = {
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

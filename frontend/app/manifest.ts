import type { MetadataRoute } from "next";

// Manifiesto de la app instalable (PWA): con él el móvil ofrece "Instalar TenisAI" y la
// abre a pantalla completa con su icono, como una app más
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "TenisAI — Análisis biomecánico del tenis",
    short_name: "TenisAI",
    description:
      "Graba tu golpe y la visión artificial te dice qué corregir. Juega, registra partidos y sube en el ranking.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#020617",
    theme_color: "#020617",
    lang: "es-ES",
    dir: "ltr",
    categories: ["sports", "health", "fitness"],
    icons: [
      { src: "/iconos/icono-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/iconos/icono-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/iconos/icono-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/iconos/icono-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Accesos directos al mantener pulsado el icono
    shortcuts: [
      {
        name: "Analizar un golpe",
        short_name: "Analizar",
        url: "/#analizar",
        icons: [{ src: "/iconos/icono-192.png", sizes: "192x192" }],
      },
      { name: "Buscar partido", url: "/comunidad/convocatorias" },
      { name: "Ranking", url: "/comunidad/ranking" },
    ],
  };
}

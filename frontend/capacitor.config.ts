import type { CapacitorConfig } from "@capacitor/cli";

/**
 * App de Android: la web de TenisAI dentro de un WebView, con acceso a funciones del
 * móvil (cámara al subir un vídeo, menú de compartir, botón atrás). No se compila la web
 * dentro de la app: abre `server.url`, así que las mejoras de la web llegan sin publicar
 * otra versión en Google Play.
 *
 * La dirección la fija scripts/movil.mts (npm run movil -- emulador | wifi | https://...).
 */
const url = process.env.TENISAI_URL ?? "http://10.0.2.2:3000";

const config: CapacitorConfig = {
  // Identificador en Google Play: no se puede cambiar después de publicar la app
  appId: "com.tenisai.app",
  appName: "TenisAI",
  // Páginas locales: la de sin conexión (errorPath) y el index.html que Capacitor exige
  webDir: "movil/www",
  backgroundColor: "#020617",
  // La web puede saber que está dentro de la app (además de con Capacitor.isNativePlatform)
  appendUserAgent: "TenisAI-Android",
  server: {
    url,
    // HTTP sin cifrar solo para la web de desarrollo del ordenador; producción va por https
    cleartext: url.startsWith("http://"),
    errorPath: "sin-conexion.html",
  },
  plugins: {
    SystemBars: {
      // La web ya respeta la muesca y la barra de gestos con env(safe-area-inset-*)
      initialViewportFitValueHint: "cover",
      // Texto e iconos claros: el fondo de la app es oscuro
      style: "DARK",
    },
  },
};

export default config;

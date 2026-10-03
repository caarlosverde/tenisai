"use client";

import { useEffect } from "react";

/**
 * Registra el service worker de la app instalable (public/sw.js). Solo en producción: en
 * desarrollo interferiría con la recarga en caliente, así que si quedó uno de otra sesión
 * se elimina.
 */
export default function RegistroServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV === "production") {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch((error) => console.error("No se pudo registrar el service worker:", error));
    } else {
      void navigator.serviceWorker
        .getRegistrations()
        .then((registros) => registros.forEach((registro) => void registro.unregister()));
    }
  }, []);
  return null;
}

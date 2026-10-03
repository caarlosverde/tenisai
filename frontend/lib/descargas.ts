import { Capacitor } from "@capacitor/core";

/** true dentro de la app de Android (la web cargada en el WebView de Capacitor). */
export function esAppNativa(): boolean {
  return Capacitor.isNativePlatform();
}

function base64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(String(lector.result).split(",", 2)[1] ?? "");
    lector.onerror = () => reject(lector.error ?? new Error("No se pudo leer el archivo."));
    lector.readAsDataURL(blob);
  });
}

/**
 * Guarda un archivo generado en el navegador (el informe PDF, el CSV de métricas).
 * En la web lo descarga. En la app, el WebView no gestiona descargas: se guarda en la
 * caché de la app y se abre el menú de compartir de Android (Drive, Archivos, WhatsApp...).
 */
export async function guardarArchivo(blob: Blob, nombre: string): Promise<void> {
  if (!esAppNativa()) {
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = nombre;
    enlace.click();
    // El navegador ya tiene el archivo al volver de click(); se libera en el siguiente ciclo
    setTimeout(() => URL.revokeObjectURL(url), 0);
    return;
  }

  // Solo se cargan dentro de la app
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([
    import("@capacitor/filesystem"),
    import("@capacitor/share"),
  ]);
  const { uri } = await Filesystem.writeFile({
    path: nombre,
    data: await base64(blob),
    directory: Directory.Cache,
  });
  try {
    await Share.share({ title: nombre, files: [uri] });
  } catch (error) {
    // Cerrar el menú sin elegir nada no es un error
    if (error instanceof Error && /cancel/i.test(error.message)) return;
    throw error;
  }
}

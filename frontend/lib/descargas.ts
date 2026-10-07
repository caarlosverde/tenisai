/**
 * Descarga un archivo generado en el navegador (el informe PDF, el CSV de métricas):
 * un enlace temporal al contenido al que se "hace clic".
 */
export function guardarArchivo(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombre;
  enlace.click();
  // El navegador ya tiene el archivo al volver de click(); se libera en el siguiente ciclo
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

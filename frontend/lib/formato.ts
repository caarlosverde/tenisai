// Formatos de fecha comunes (es-ES).

function formatear(iso: string, opciones: Intl.DateTimeFormatOptions): string {
  try {
    return new Intl.DateTimeFormat("es-ES", opciones).format(new Date(iso));
  } catch {
    return iso;
  }
}

/** "30 sept 2026, 19:30" */
export function fechaCorta(iso: string): string {
  return formatear(iso, { dateStyle: "medium", timeStyle: "short" });
}

/** "30 de septiembre de 2026, 19:30" */
export function fechaLarga(iso: string): string {
  return formatear(iso, { dateStyle: "long", timeStyle: "short" });
}

/** "4,20 MB" */
export function tamanoArchivo(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/** "30 sept" (ejes de gráficas) */
export function fechaEje(iso: string): string {
  return formatear(iso, { day: "2-digit", month: "short" });
}

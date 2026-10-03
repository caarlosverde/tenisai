// Vídeos que se pueden analizar: los que graban los móviles. El motor los convierte a
// MP4 H.264 al recibirlos (api.py), así que aquí solo se filtra lo evidente.

export const MAX_VIDEO_MB = 150;
export const MAX_VIDEO_BYTES = MAX_VIDEO_MB * 1024 * 1024;

/** Valor del atributo accept de los <input type="file">. */
export const ACCEPT_VIDEO = "video/mp4,video/quicktime,video/x-m4v,.mp4,.mov,.m4v";

const POR_TIPO: Record<string, "MP4" | "MOV"> = {
  "video/mp4": "MP4",
  "video/x-m4v": "MP4",
  "video/quicktime": "MOV",
};

/** "MP4", "MOV" o null si no es un vídeo admitido (por tipo o, si falta, por extensión). */
export function formatoVideo(archivo: { name: string; type: string }): "MP4" | "MOV" | null {
  if (POR_TIPO[archivo.type]) return POR_TIPO[archivo.type];
  const extension = archivo.name.toLowerCase().split(".").pop();
  if (extension === "mp4" || extension === "m4v") return "MP4";
  if (extension === "mov") return "MOV";
  return null;
}

/** Nombre para el historial: sin extensión ("IMG_0042.MOV" → "IMG_0042"). */
export function nombreSinExtension(nombre: string): string {
  return nombre.replace(/\.[a-z0-9]{2,4}$/i, "");
}

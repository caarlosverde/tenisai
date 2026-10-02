// Imágenes de los fallos: fotograma original a resolución completa, con el
// esqueleto y la zona del fallo dibujados, recortado alrededor del jugador.

import { type CoachHit, type PoseTracks } from "./tipos";
import { interpolateFrame } from "./pose";
import { waitSeeked } from "./video";
import { drawOverlay } from "./dibujo";

/** Alto de la imagen final: suficiente para verla grande sin pesar demasiado. */
const ALTO_SALIDA = 960;

type Rect = { x: number; y: number; w: number; h: number };

/**
 * Recorte del fotograma centrado en el jugador, con margen para las etiquetas
 * (van encima de las articulaciones) y proporción vertical como mínimo 4:5.
 */
export function recorteJugador(
  bbox: [number, number, number, number] | null,
  ancho: number,
  alto: number,
): Rect {
  if (!bbox) return { x: 0, y: 0, w: ancho, h: alto };
  const [x1, y1, x2, y2] = bbox;
  const bw = Math.max(1, (x2 - x1) * ancho);
  const bh = Math.max(1, (y2 - y1) * alto);
  const cx = ((x1 + x2) / 2) * ancho;
  const cy = ((y1 + y2) / 2) * alto - bh * 0.06; // algo más de aire arriba

  let h = Math.min(alto, bh * 1.5);
  let w = Math.min(ancho, Math.max(bw * 1.7, h * 0.8));
  // Si el ancho quedó limitado por el fotograma, se mantiene una proporción razonable
  if (w / h < 0.6) h = Math.min(alto, w / 0.6);
  w = Math.min(ancho, w);

  const x = Math.min(Math.max(0, cx - w / 2), ancho - w);
  const y = Math.min(Math.max(0, cy - h / 2), alto - h);
  return { x, y, w, h };
}

/** Espera a que el navegador pinte el fotograma ya buscado en el <video>. */
function siguientePintado(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

export async function imagenDeFallo(
  video: HTMLVideoElement,
  tracks: PoseTracks | null,
  hit: CoachHit,
  lateralidad: string | null,
): Promise<string | null> {
  if (video.readyState < 1) {
    await new Promise<void>((resolve) => {
      video.addEventListener("loadedmetadata", () => resolve(), { once: true });
      window.setTimeout(resolve, 4000);
    });
  }
  video.pause();
  await waitSeeked(video, hit.t);
  await siguientePintado();

  const ancho = video.videoWidth;
  const alto = video.videoHeight;
  if (!ancho || !alto) return null;

  const frame = tracks ? interpolateFrame(tracks, hit.t) : null;
  const recorte = recorteJugador(frame?.bbox ?? null, ancho, alto);
  const factor = ALTO_SALIDA / recorte.h;

  // 1) Fotograma completo con el esqueleto y el fallo, a resolución original.
  //    La escala hace que, tras recortar y redimensionar, los textos se lean a ~22 px.
  const lienzo = document.createElement("canvas");
  lienzo.width = ancho;
  lienzo.height = alto;
  const ctx = lienzo.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, ancho, alto);
  if (frame) {
    drawOverlay(
      ctx,
      video,
      frame,
      { skeleton: true, angles: true, bbox: false },
      [hit],
      {
        width: ancho,
        height: alto,
        clear: false,
        letterbox: false,
        lateralidad,
        escala: 1.7 / factor,
      },
    );
  }

  // 2) Recorte alrededor del jugador, reescalado con suavizado de alta calidad
  const salida = document.createElement("canvas");
  salida.width = Math.round(recorte.w * factor);
  salida.height = ALTO_SALIDA;
  const ctxSalida = salida.getContext("2d");
  if (!ctxSalida) return null;
  ctxSalida.imageSmoothingEnabled = true;
  ctxSalida.imageSmoothingQuality = "high";
  ctxSalida.drawImage(
    lienzo,
    recorte.x,
    recorte.y,
    recorte.w,
    recorte.h,
    0,
    0,
    salida.width,
    salida.height,
  );

  try {
    return salida.toDataURL("image/jpeg", 0.9);
  } catch {
    // Vídeo sin cabeceras CORS: el canvas queda "contaminado" y no se puede exportar
    return null;
  }
}

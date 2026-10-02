// Fallos del entrenador: agrupación, ventana temporal y zonas del cuerpo.

import { type ZonaCorporal, type EventoDetalle, type CoachFeedback, type CoachHit } from "./tipos";
import { HIGHLIGHT_EDGES } from "./constantes";

export function isZona(value: string | undefined): value is ZonaCorporal {
  return (
    value === "piernas" ||
    value === "brazo_der" ||
    value === "brazo_izq" ||
    value === "spacing" ||
    value === "backswing" ||
    value === "base_tronco"
  );
}

export function flattenFaults(feedback: CoachFeedback[]): CoachHit[] {
  const hits: CoachHit[] = [];
  for (const evento of feedback) {
    if (evento.tipo === "optimo" || evento.tipo === "correcto") continue;
    const zona = evento.zona_corporal;
    if (!isZona(zona)) continue;
    const detalles: EventoDetalle[] =
      evento.eventos_detalle && evento.eventos_detalle.length > 0
        ? evento.eventos_detalle
        : (evento.timestamps ?? []).map((t) => ({
            t,
            valor_medido: "",
            nota_corta: evento.mensaje,
          }));
    for (const detalle of detalles) {
      hits.push({
        t: detalle.t,
        zona,
        categoria: evento.categoria,
        titulo: evento.titulo ?? "Fallo técnico",
        valor_medido: detalle.valor_medido,
        nota_corta: detalle.nota_corta,
        objetivo: evento.objetivo_texto ?? "",
        consejo: evento.consejo_corto ?? evento.mensaje,
        tipo: evento.tipo,
        fase: detalle.fase ?? evento.fase,
        fase_nombre: detalle.fase_nombre ?? evento.fase_nombre,
        fase_corta: detalle.fase_corta ?? evento.fase_corta,
      });
    }
  }
  return hits;
}

export function activeHits(hits: CoachHit[], time: number, windowSec: number): CoachHit[] {
  return hits
    .filter((hit) => Math.abs(time - hit.t) <= windowSec)
    .sort((a, b) => Math.abs(a.t - time) - Math.abs(b.t - time));
}

export function ladoDom(lat?: string | null) {
  const zurdo = lat === "zurdo";
  return {
    hombro: zurdo ? "hombro_izq" : "hombro_der",
    codo: zurdo ? "codo_izq" : "codo_der",
    muneca: zurdo ? "muneca_izq" : "muneca_der",
    cadera: zurdo ? "cadera_izq" : "cadera_der",
    angCodo: (zurdo ? "codo_izq" : "codo_der") as "codo_izq" | "codo_der",
  };
}

export function highlightedEdgeSet(zonas: ZonaCorporal[]): Set<string> {
  const keys = new Set<string>();
  for (const zona of zonas) {
    for (const [a, b] of HIGHLIGHT_EDGES[zona] ?? []) {
      keys.add(`${a}|${b}`);
      keys.add(`${b}|${a}`);
    }
  }
  return keys;
}

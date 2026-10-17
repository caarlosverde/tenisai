import type { ResumenGeneral } from "@/lib/api";

/**
 * El mensaje del resumen sin lo que ya está a la vista: la adaptación al perfil
 * (se muestra aparte, más discreta) y la frase con la nota (está en la insignia).
 * Con varios tipos de golpe, `golpes` dice cuántos de cada uno ("4 derechas y 4
 * reveses a dos manos") para ponerlo en la cabecera.
 */
export function mensajeResumen(
  resumen: Pick<ResumenGeneral, "mensaje" | "adaptacion">,
): { texto: string; golpes: string | null } {
  let mensaje = resumen.mensaje;
  if (resumen.adaptacion && mensaje.startsWith(resumen.adaptacion)) {
    mensaje = mensaje.slice(resumen.adaptacion.length).replace(/^[.\s]+/, "");
  }
  const nota = /^Análisis de ([^:]+): valoración biomecánica de \d+\/100\.?\s*/.exec(mensaje);
  const golpes = nota && /\d/.test(nota[1]) ? nota[1] : null;
  return { texto: (nota ? mensaje.slice(nota[0].length) : mensaje).trim(), golpes };
}

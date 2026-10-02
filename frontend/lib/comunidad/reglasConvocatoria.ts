// Reglas de «Buscar partido» (convocatorias). Funciones puras: las usan la API, los
// formularios y los tests. Las importaciones llevan extensión para que Node las ejecute
// directamente en los tests.
import { LIMITES_PERFIL, LUGAR_MAX, NIVELES, esModalidad, type Modalidad, type Nivel } from "./perfil.ts";

/** Una convocatoria se publica con al menos este margen y como mucho a 60 días vista. */
export const ANTELACION_MINIMA_MS = 10 * 60_000;
export const ANTELACION_MAXIMA_DIAS = 60;
export const COMENTARIO_MAX = 280;
export const MENSAJE_SOLICITUD_MAX = 200;
/** España: las fechas de los partidos se muestran y comparan en hora peninsular. */
export const ZONA_HORARIA = "Europe/Madrid";

export type DatosConvocatoria = {
  modalidad: Modalidad;
  fechaHora: Date;
  lugar: string;
  ciudad: string;
  nivel: Nivel | null;
  plazas: number;
  comentario: string | null;
};

type Resultado = { ok: true; datos: DatosConvocatoria } | { ok: false; error: string };

function texto(valor: unknown): string {
  return typeof valor === "string" ? valor.replace(/\s+/g, " ").trim() : "";
}

/** Plazas que se pueden pedir: en individual, un rival; en dobles, de 1 a 3 jugadores. */
export function plazasPosibles(modalidad: Modalidad): number[] {
  return modalidad === "dobles" ? [1, 2, 3] : [1];
}

export function validarConvocatoria(
  entrada: Record<string, unknown>,
  ahora: Date = new Date(),
): Resultado {
  if (!esModalidad(entrada.modalidad)) return { ok: false, error: "Elige individual o dobles." };
  const modalidad = entrada.modalidad;

  const fechaHora = typeof entrada.fechaHora === "string" ? new Date(entrada.fechaHora) : null;
  if (!fechaHora || Number.isNaN(fechaHora.getTime())) {
    return { ok: false, error: "Indica el día y la hora del partido." };
  }
  if (fechaHora.getTime() < ahora.getTime() + ANTELACION_MINIMA_MS) {
    return { ok: false, error: "El partido tiene que ser al menos dentro de 10 minutos." };
  }
  if (fechaHora.getTime() > ahora.getTime() + ANTELACION_MAXIMA_DIAS * 86_400_000) {
    return { ok: false, error: `Solo se pueden publicar partidos de los próximos ${ANTELACION_MAXIMA_DIAS} días.` };
  }

  const lugar = texto(entrada.lugar);
  if (!lugar) return { ok: false, error: "Indica dónde se juega (club, polideportivo…)." };
  if (lugar.length > LUGAR_MAX) return { ok: false, error: `El lugar admite como mucho ${LUGAR_MAX} caracteres.` };

  const ciudad = texto(entrada.ciudad);
  if (!ciudad) return { ok: false, error: "Indica la ciudad: así te encuentran los jugadores de la zona." };
  if (ciudad.length > LIMITES_PERFIL.ciudad) {
    return { ok: false, error: `La ciudad admite como mucho ${LIMITES_PERFIL.ciudad} caracteres.` };
  }

  let nivel: Nivel | null = null;
  if (entrada.nivel !== undefined && entrada.nivel !== null && entrada.nivel !== "") {
    const encontrado = NIVELES.find((n) => n.valor === entrada.nivel);
    if (!encontrado) return { ok: false, error: "El nivel no es válido." };
    nivel = encontrado.valor;
  }

  const plazas = entrada.plazas === undefined ? 1 : Number(entrada.plazas);
  if (!plazasPosibles(modalidad).includes(plazas)) {
    return {
      ok: false,
      error: modalidad === "dobles" ? "En dobles faltan de 1 a 3 jugadores." : "En individual buscas un rival.",
    };
  }

  const comentario = typeof entrada.comentario === "string" ? entrada.comentario.trim() : "";
  if (comentario.length > COMENTARIO_MAX) {
    return { ok: false, error: `El comentario admite como mucho ${COMENTARIO_MAX} caracteres.` };
  }

  return {
    ok: true,
    datos: { modalidad, fechaHora, lugar, ciudad, nivel, plazas, comentario: comentario || null },
  };
}

/** Día "AAAA-MM-DD" en hora de España. */
export function diaEnEspana(fecha: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_HORARIA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(fecha);
}

/** El resultado se puede registrar desde el mismo día del partido. */
export function puedeRegistrarResultado(fechaHora: Date, ahora: Date = new Date()): boolean {
  return diaEnEspana(fechaHora) <= diaEnEspana(ahora);
}

export function textoPlazas(libres: number): string {
  if (libres <= 0) return "Completo";
  return libres === 1 ? "Falta 1 jugador" : `Faltan ${libres} jugadores`;
}

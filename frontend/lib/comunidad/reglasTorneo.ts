// Reglas para crear un torneo. Funciones puras (con extensiones en las importaciones
// para que los tests las ejecuten con Node directamente).
import { LIMITES_PERFIL, LUGAR_MAX, NIVELES, esModalidad, type Modalidad, type Nivel } from "./perfil.ts";
import { diaEnEspana } from "./reglasConvocatoria.ts";

export const PLAZAS_TORNEO = [4, 8, 16, 32] as const;
export const NOMBRE_TORNEO_MAX = 80;
export const DESCRIPCION_TORNEO_MAX = 1000;
/** Un torneo se puede anunciar con hasta seis meses de antelación. */
export const ANTELACION_TORNEO_DIAS = 180;

export type DatosTorneo = {
  nombre: string;
  descripcion: string | null;
  modalidad: Modalidad;
  plazas: number;
  lugar: string;
  ciudad: string;
  nivel: Nivel | null;
  cierreInscripcion: Date;
  /** Día de comienzo, a mediodía UTC (como los partidos). */
  inicio: Date;
};

type Resultado = { ok: true; datos: DatosTorneo } | { ok: false; error: string };

function linea(valor: unknown): string {
  return typeof valor === "string" ? valor.replace(/\s+/g, " ").trim() : "";
}

export function validarTorneo(entrada: Record<string, unknown>, ahora: Date = new Date()): Resultado {
  const nombre = linea(entrada.nombre);
  if (nombre.length < 3) return { ok: false, error: "Pon un nombre al torneo (al menos 3 caracteres)." };
  if (nombre.length > NOMBRE_TORNEO_MAX) {
    return { ok: false, error: `El nombre admite como mucho ${NOMBRE_TORNEO_MAX} caracteres.` };
  }

  const descripcion =
    typeof entrada.descripcion === "string"
      ? entrada.descripcion.replace(/[^\S\n]+/g, " ").replace(/\n{3,}/g, "\n\n").trim()
      : "";
  if (descripcion.length > DESCRIPCION_TORNEO_MAX) {
    return { ok: false, error: `La descripción admite como mucho ${DESCRIPCION_TORNEO_MAX} caracteres.` };
  }

  if (!esModalidad(entrada.modalidad)) return { ok: false, error: "Elige individual o dobles." };
  const plazas = Number(entrada.plazas);
  if (!(PLAZAS_TORNEO as readonly number[]).includes(plazas)) {
    return { ok: false, error: `El cuadro puede ser de ${PLAZAS_TORNEO.join(", ")} plazas.` };
  }

  const lugar = linea(entrada.lugar);
  if (!lugar) return { ok: false, error: "Indica dónde se juega." };
  if (lugar.length > LUGAR_MAX) return { ok: false, error: `El lugar admite como mucho ${LUGAR_MAX} caracteres.` };
  const ciudad = linea(entrada.ciudad);
  if (!ciudad) return { ok: false, error: "Indica la ciudad." };
  if (ciudad.length > LIMITES_PERFIL.ciudad) {
    return { ok: false, error: `La ciudad admite como mucho ${LIMITES_PERFIL.ciudad} caracteres.` };
  }

  let nivel: Nivel | null = null;
  if (entrada.nivel !== undefined && entrada.nivel !== null && entrada.nivel !== "") {
    const encontrado = NIVELES.find((n) => n.valor === entrada.nivel);
    if (!encontrado) return { ok: false, error: "El nivel no es válido." };
    nivel = encontrado.valor;
  }

  const hoy = diaEnEspana(ahora);
  const diaInicio = typeof entrada.inicio === "string" ? entrada.inicio : "";
  const inicio = /^\d{4}-\d{2}-\d{2}$/.test(diaInicio) ? new Date(`${diaInicio}T12:00:00Z`) : null;
  if (!inicio || Number.isNaN(inicio.getTime()) || inicio.toISOString().slice(0, 10) !== diaInicio) {
    return { ok: false, error: "Indica el día en que empieza el torneo." };
  }
  if (diaInicio < hoy) return { ok: false, error: "El torneo no puede empezar en el pasado." };
  if (inicio.getTime() > ahora.getTime() + ANTELACION_TORNEO_DIAS * 86_400_000) {
    return { ok: false, error: `Solo se pueden anunciar torneos de los próximos ${ANTELACION_TORNEO_DIAS} días.` };
  }

  const cierre = typeof entrada.cierreInscripcion === "string" ? new Date(entrada.cierreInscripcion) : null;
  if (!cierre || Number.isNaN(cierre.getTime())) {
    return { ok: false, error: "Indica hasta cuándo se admiten inscripciones." };
  }
  if (cierre.getTime() <= ahora.getTime()) {
    return { ok: false, error: "El cierre de inscripciones tiene que ser futuro." };
  }
  if (diaEnEspana(cierre) > diaInicio) {
    return { ok: false, error: "Las inscripciones tienen que cerrar, como tarde, el día que empieza el torneo." };
  }

  return {
    ok: true,
    datos: {
      nombre,
      descripcion: descripcion || null,
      modalidad: entrada.modalidad,
      plazas,
      lugar,
      ciudad,
      nivel,
      cierreInscripcion: cierre,
      inicio,
    },
  };
}

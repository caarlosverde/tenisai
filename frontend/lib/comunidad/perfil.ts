// Perfil de jugador de la comunidad: valores permitidos, validación y presentación.
// Funciones puras, compartidas por la API, las páginas y los formularios.

export const NIVELES = [
  { valor: "iniciacion", etiqueta: "Iniciación" },
  { valor: "intermedio", etiqueta: "Intermedio" },
  { valor: "avanzado", etiqueta: "Avanzado" },
  { valor: "competicion", etiqueta: "Competición" },
] as const;

export type Nivel = (typeof NIVELES)[number]["valor"];

export const MODALIDADES = [
  { valor: "individual", etiqueta: "Individual" },
  { valor: "dobles", etiqueta: "Dobles" },
] as const;

export type Modalidad = (typeof MODALIDADES)[number]["valor"];

/** Longitud máxima del lugar de un partido. */
export const LUGAR_MAX = 80;

export const LIMITES_PERFIL = {
  ciudad: 60,
  club: 80,
  disponibilidad: 120,
  bio: 280,
} as const;

export type PerfilJugador = {
  perfilPublico: boolean;
  ciudad: string | null;
  club: string | null;
  nivel: Nivel | null;
  disponibilidad: string | null;
  bio: string | null;
};

type ResultadoPerfil =
  | { ok: true; datos: Partial<PerfilJugador> }
  | { ok: false; error: string };

const NOMBRES_CAMPO: Record<keyof typeof LIMITES_PERFIL, string> = {
  ciudad: "La ciudad",
  club: "El club",
  disponibilidad: "La disponibilidad",
  bio: "La presentación",
};

export function esModalidad(valor: unknown): valor is Modalidad {
  return MODALIDADES.some((m) => m.valor === valor);
}

export function etiquetaNivel(nivel: string | null | undefined): string | null {
  return NIVELES.find((n) => n.valor === nivel)?.etiqueta ?? null;
}

/** Valida solo los campos del perfil de jugador que llegan en la petición. */
export function validarPerfilJugador(entrada: Record<string, unknown>): ResultadoPerfil {
  const datos: Partial<PerfilJugador> = {};

  if (entrada.perfilPublico !== undefined) {
    if (typeof entrada.perfilPublico !== "boolean") {
      return { ok: false, error: "perfilPublico debe ser verdadero o falso." };
    }
    datos.perfilPublico = entrada.perfilPublico;
  }

  if (entrada.nivel !== undefined) {
    if (entrada.nivel === null || entrada.nivel === "") {
      datos.nivel = null;
    } else if (NIVELES.some((n) => n.valor === entrada.nivel)) {
      datos.nivel = entrada.nivel as Nivel;
    } else {
      return { ok: false, error: "El nivel no es válido." };
    }
  }

  for (const campo of Object.keys(LIMITES_PERFIL) as (keyof typeof LIMITES_PERFIL)[]) {
    const valor = entrada[campo];
    if (valor === undefined) continue;
    if (valor !== null && typeof valor !== "string") {
      return { ok: false, error: `${NOMBRES_CAMPO[campo]} debe ser un texto.` };
    }
    // Espacios repetidos fuera; en la presentación se respetan los saltos de línea
    const texto =
      campo === "bio"
        ? (valor ?? "").replace(/[^\S\n]+/g, " ").replace(/\n{3,}/g, "\n\n").trim()
        : (valor ?? "").replace(/\s+/g, " ").trim();
    if (texto.length > LIMITES_PERFIL[campo]) {
      return {
        ok: false,
        error: `${NOMBRES_CAMPO[campo]} admite como mucho ${LIMITES_PERFIL[campo]} caracteres.`,
      };
    }
    datos[campo] = texto || null;
  }

  return { ok: true, datos };
}

/**
 * Nombre que ve cada persona. Los amigos (y uno mismo) ven nombre y apellidos; el
 * resto, el nombre y la inicial del primer apellido. Hay usuarios desde los 14 años.
 */
export function nombreVisible(
  persona: { nombre: string; apellidos: string },
  completo: boolean,
): string {
  if (completo) return `${persona.nombre} ${persona.apellidos}`.trim();
  const inicial = persona.apellidos.trim().charAt(0);
  return inicial ? `${persona.nombre} ${inicial.toUpperCase()}.` : persona.nombre;
}

/** Ciudad normalizada para comparar ("Leganés" = "leganes "). */
export function claveCiudad(ciudad: string | null | undefined): string {
  return (ciudad ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

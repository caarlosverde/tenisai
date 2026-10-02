// Reglas de validación compartidas por el registro y la edición del perfil.

export const USERNAME_REGEX = /^[a-zA-Z0-9_.-]{3,30}$/;
export const PASSWORD_MIN_LENGTH = 8;

// Edad mínima para dar el consentimiento por uno mismo en España (art. 7 LOPDGDD)
export const EDAD_MINIMA = 14;

export const RANGOS = {
  edad: { min: EDAD_MINIMA, max: 120, unidad: "años", nombre: "La edad" },
  altura: { min: 50, max: 250, unidad: "cm", nombre: "La altura" },
  peso: { min: 20, max: 250, unidad: "kg", nombre: "El peso" },
} as const;

export type DatosPersonales = {
  nombre: string;
  apellidos: string;
  edad: number;
  altura: number;
  peso: number;
};

type Resultado =
  | { ok: true; datos: Partial<DatosPersonales> }
  | { ok: false; error: string };

/**
 * Valida los datos personales recibidos en una petición.
 * Con `todosObligatorios` (registro) exige todos; si no (edición), solo valida los que llegan.
 */
export function validarDatosPersonales(
  entrada: Record<string, unknown>,
  todosObligatorios: boolean,
): Resultado {
  const datos: Partial<DatosPersonales> = {};

  for (const campo of ["nombre", "apellidos"] as const) {
    const valor = entrada[campo];
    if (valor === undefined && !todosObligatorios) continue;
    const texto = typeof valor === "string" ? valor.trim() : "";
    if (!texto) return { ok: false, error: `El campo ${campo} es obligatorio.` };
    if (texto.length > 80) return { ok: false, error: `El campo ${campo} es demasiado largo.` };
    datos[campo] = texto;
  }

  for (const campo of ["edad", "altura", "peso"] as const) {
    const valor = entrada[campo];
    if (valor === undefined && !todosObligatorios) continue;
    const numero = Number(valor);
    const { min, max, unidad, nombre } = RANGOS[campo];
    const informado = valor !== null && valor !== "";
    if (campo === "edad" && informado && Number.isFinite(numero) && numero >= 0 && numero < EDAD_MINIMA) {
      return {
        ok: false,
        error: `Debes tener al menos ${EDAD_MINIMA} años para usar TenisAI.`,
      };
    }
    if (valor === null || valor === "" || !Number.isFinite(numero) || numero < min || numero > max) {
      return { ok: false, error: `${nombre} debe estar entre ${min} y ${max} ${unidad}.` };
    }
    datos[campo] = campo === "edad" ? Math.trunc(numero) : Math.round(numero * 10) / 10;
  }

  return { ok: true, datos };
}

export function validarPasswordNueva(password: unknown): string | null {
  if (typeof password !== "string" || password.length < PASSWORD_MIN_LENGTH) {
    return `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`;
  }
  if (password.length > 200) return "La contraseña es demasiado larga.";
  return null;
}

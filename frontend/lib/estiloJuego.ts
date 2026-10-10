export const LATERALIDAD_VALORES = ["diestro", "zurdo"] as const;
export const ESTILO_REVES_VALORES = ["1_mano", "2_manos"] as const;
export const ESTILO_DERECHA_VALORES = ["tradicional", "nadal"] as const;

export type Lateralidad = (typeof LATERALIDAD_VALORES)[number];
export type EstiloReves = (typeof ESTILO_REVES_VALORES)[number];
export type EstiloDerecha = (typeof ESTILO_DERECHA_VALORES)[number];

export const LATERALIDAD_DEFAULT: Lateralidad = "diestro";
export const ESTILO_REVES_DEFAULT: EstiloReves = "2_manos";
export const ESTILO_DERECHA_DEFAULT: EstiloDerecha = "tradicional";

export function normalizarLateralidad(value: unknown): Lateralidad {
  return LATERALIDAD_VALORES.includes(value as Lateralidad)
    ? (value as Lateralidad)
    : LATERALIDAD_DEFAULT;
}

export function normalizarEstiloReves(value: unknown): EstiloReves {
  return ESTILO_REVES_VALORES.includes(value as EstiloReves)
    ? (value as EstiloReves)
    : ESTILO_REVES_DEFAULT;
}

export function normalizarEstiloDerecha(value: unknown): EstiloDerecha {
  return ESTILO_DERECHA_VALORES.includes(value as EstiloDerecha)
    ? (value as EstiloDerecha)
    : ESTILO_DERECHA_DEFAULT;
}

/** Codo en el impacto de la derecha: brazo recto o «doble flexión». */
export const CODO_DERECHA_VALORES = ["recto", "flexionado"] as const;
export type CodoDerecha = (typeof CODO_DERECHA_VALORES)[number];
export const CODO_DERECHA_DEFAULT: CodoDerecha = "recto";

export function normalizarCodoDerecha(value: unknown): CodoDerecha {
  return CODO_DERECHA_VALORES.includes(value as CodoDerecha)
    ? (value as CodoDerecha)
    : CODO_DERECHA_DEFAULT;
}

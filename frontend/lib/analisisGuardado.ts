// Lectura del campo `detalles` (JSON) de un análisis guardado en la base de datos.

/** Copia de una evaluación del entrenador guardada con el análisis. */
export type EvaluacionGuardada = {
  titulo?: string;
  tipo?: string;
  categoria?: string;
  mensaje?: string;
  fase_nombre?: string;
};

export function leerDetalles(detalles: string | null): {
  evaluaciones: EvaluacionGuardada[];
  adaptacion: string | null;
} {
  if (!detalles) return { evaluaciones: [], adaptacion: null };
  try {
    const datos = JSON.parse(detalles) as {
      evaluaciones?: EvaluacionGuardada[];
      adaptacion?: string | null;
    };
    return {
      evaluaciones: Array.isArray(datos.evaluaciones) ? datos.evaluaciones : [],
      adaptacion: datos.adaptacion ?? null,
    };
  } catch {
    return { evaluaciones: [], adaptacion: null };
  }
}

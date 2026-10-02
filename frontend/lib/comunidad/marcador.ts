// Validación y formato del marcador de un partido. Funciones puras.
//
// Un partido se juega a un set, al mejor de 3 o al mejor de 5. Cada set es normal
// (6-0 … 6-4, 7-5 o 7-6 con tie-break) salvo, opcionalmente, el decisivo, que puede
// ser un super tie-break a 10 puntos (habitual en dobles y en torneos amateur).

/** Juegos (o puntos, en un super tie-break) del equipo 1 y del equipo 2. */
export type SetJuegos = [number, number];

export type ResultadoMarcador =
  | { ok: true; sets: SetJuegos[]; ganador: 1 | 2 }
  | { ok: false; error: string };

export const MAX_SETS = 5;

function esSetNormal(a: number, b: number): boolean {
  const [mayor, menor] = a > b ? [a, b] : [b, a];
  return (mayor === 6 && menor <= 4) || (mayor === 7 && (menor === 5 || menor === 6));
}

function esSuperTieBreak(a: number, b: number): boolean {
  const [mayor, menor] = a > b ? [a, b] : [b, a];
  // A 10 con diferencia de 2: 10-8, 11-9, 12-10…
  return mayor >= 10 && (mayor === 10 ? mayor - menor >= 2 : mayor - menor === 2);
}

/**
 * Comprueba que los sets forman un partido terminado y válido, y calcula el ganador.
 * Los sets llegan siempre desde el punto de vista del equipo 1.
 */
export function validarMarcador(entrada: unknown): ResultadoMarcador {
  if (!Array.isArray(entrada) || entrada.length === 0) {
    return { ok: false, error: "Indica el resultado de al menos un set." };
  }
  if (entrada.length > MAX_SETS) {
    return { ok: false, error: `Un partido tiene como mucho ${MAX_SETS} sets.` };
  }

  const sets: SetJuegos[] = [];
  let ganados1 = 0;
  let ganados2 = 0;

  for (const [indice, set] of entrada.entries()) {
    const numero = indice + 1;
    if (
      !Array.isArray(set) ||
      set.length !== 2 ||
      !set.every((juegos) => Number.isInteger(juegos) && juegos >= 0 && juegos <= 99)
    ) {
      return { ok: false, error: `El set ${numero} está incompleto.` };
    }
    const [a, b] = set as SetJuegos;
    const esUltimo = indice === entrada.length - 1;
    const empatados = ganados1 === ganados2 && ganados1 > 0;

    if (!esSetNormal(a, b) && !(esUltimo && empatados && esSuperTieBreak(a, b))) {
      return {
        ok: false,
        error: esSuperTieBreak(a, b)
          ? `El set ${numero} (${a}-${b}) parece un super tie-break: solo vale como set decisivo, con los sets empatados.`
          : `El set ${numero} (${a}-${b}) no es un resultado posible: un set acaba 6-0 … 6-4, 7-5 o 7-6.`,
      };
    }

    if (a > b) ganados1 += 1;
    else ganados2 += 1;
    sets.push([a, b]);
  }

  if (ganados1 === ganados2) {
    return { ok: false, error: "El partido no puede acabar en empate: falta el set decisivo." };
  }

  const ganador: 1 | 2 = ganados1 > ganados2 ? 1 : 2;
  if (Math.max(ganados1, ganados2) > 3) {
    return { ok: false, error: "Como mucho se juega al mejor de 5 sets." };
  }
  // El partido termina en cuanto alguien llega a los sets necesarios: el último set
  // tiene que ganarlo el ganador (con 2-0 y un tercer set perdido ya había acabado)
  const ultimo = sets[sets.length - 1];
  if ((ultimo[0] > ultimo[1] ? 1 : 2) !== ganador) {
    return {
      ok: false,
      error: "El partido ya estaba decidido antes del último set: revisa el orden de los sets.",
    };
  }

  return { ok: true, sets, ganador };
}

/** "6-4 3-6 [10-8]" desde el punto de vista del equipo indicado. */
export function textoMarcador(sets: SetJuegos[], desdeEquipo: 1 | 2 = 1): string {
  return sets
    .map(([a, b]) => {
      const [propios, rivales] = desdeEquipo === 1 ? [a, b] : [b, a];
      return Math.max(a, b) >= 10 ? `[${propios}-${rivales}]` : `${propios}-${rivales}`;
    })
    .join(" ");
}

/** Lee los sets guardados en la base de datos (JSON); vacío si el texto no es válido. */
export function leerSets(texto: string): SetJuegos[] {
  try {
    const valor: unknown = JSON.parse(texto);
    return Array.isArray(valor)
      ? valor.filter(
          (set): set is SetJuegos =>
            Array.isArray(set) && set.length === 2 && set.every(Number.isInteger),
        )
      : [];
  } catch {
    return [];
  }
}

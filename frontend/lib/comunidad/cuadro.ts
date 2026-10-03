// Cuadro de eliminatoria de un torneo. Funciones puras: las usan el sorteo, el registro
// de resultados y los tests.

export type Participante = { id: string; puntos: number };

export type CruceGenerado = {
  ronda: number;
  posicion: number;
  a: string | null;
  b: string | null;
  ganador: string | null;
  /** "bye": pasa sin jugar porque no tiene rival en la primera ronda. */
  tipo: "normal" | "bye";
};

/** Huecos del cuadro: la potencia de 2 que da cabida a todos (mínimo 2). */
export function tamanoCuadro(participantes: number): number {
  let tamano = 2;
  while (tamano < participantes) tamano *= 2;
  return tamano;
}

export function numeroRondas(tamano: number): number {
  return Math.round(Math.log2(tamano));
}

/**
 * Orden clásico de cabezas de serie en la primera ronda: con 8 huecos, 1-8, 4-5, 2-7, 3-6.
 * Así el 1 y el 2 solo pueden cruzarse en la final, y los huecos libres (byes) caen
 * frente a los mejores.
 */
export function ordenSemillas(tamano: number): number[] {
  let orden = [1, 2];
  while (orden.length < tamano) {
    const doble = orden.length * 2;
    orden = orden.flatMap((semilla) => [semilla, doble + 1 - semilla]);
  }
  return orden;
}

/** Cruce de la ronda siguiente al que pasa el ganador, y en qué lado. */
export function siguienteCruce(
  ronda: number,
  posicion: number,
): { ronda: number; posicion: number; lado: "a" | "b" } {
  return { ronda: ronda + 1, posicion: Math.floor(posicion / 2), lado: posicion % 2 === 0 ? "a" : "b" };
}

/** "Final", "Semifinales", "Cuartos de final"... según lo que falta para la final. */
export function nombreRonda(ronda: number, rondas: number): string {
  const restantes = rondas - ronda;
  return (
    ["Final", "Semifinales", "Cuartos de final", "Octavos de final", "Dieciseisavos de final"][restantes] ??
    `Ronda ${ronda}`
  );
}

/**
 * Sortea el cuadro: cabezas de serie por puntos (a igualdad, por id para que sea
 * reproducible), cruces de la primera ronda y rondas siguientes vacías. Quien no tiene
 * rival en la primera ronda pasa directamente a la segunda.
 */
export function generarCuadro(participantes: Participante[]): {
  rondas: number;
  semillas: Map<string, number>;
  cruces: CruceGenerado[];
} {
  if (participantes.length < 2) throw new Error("Hacen falta al menos dos participantes.");
  const ordenados = [...participantes].sort((x, y) => y.puntos - x.puntos || x.id.localeCompare(y.id));
  const semillas = new Map(ordenados.map((p, i) => [p.id, i + 1]));
  const porSemilla = (semilla: number) => ordenados[semilla - 1]?.id ?? null;

  const tamano = tamanoCuadro(ordenados.length);
  const rondas = numeroRondas(tamano);
  const orden = ordenSemillas(tamano);
  const cruces: CruceGenerado[] = [];

  for (let posicion = 0; posicion < tamano / 2; posicion += 1) {
    const a = porSemilla(orden[2 * posicion]);
    const b = porSemilla(orden[2 * posicion + 1]);
    const bye = a === null || b === null;
    cruces.push({ ronda: 1, posicion, a, b, ganador: bye ? (a ?? b) : null, tipo: bye ? "bye" : "normal" });
  }
  for (let ronda = 2; ronda <= rondas; ronda += 1) {
    for (let posicion = 0; posicion < tamano / 2 ** ronda; posicion += 1) {
      cruces.push({ ronda, posicion, a: null, b: null, ganador: null, tipo: "normal" });
    }
  }

  // Los que pasan sin jugar ya ocupan su sitio en la segunda ronda
  for (const cruce of cruces.filter((c) => c.ronda === 1 && c.ganador)) {
    if (rondas < 2) break;
    const destino = siguienteCruce(cruce.ronda, cruce.posicion);
    const siguiente = cruces.find((c) => c.ronda === destino.ronda && c.posicion === destino.posicion)!;
    siguiente[destino.lado] = cruce.ganador;
  }

  return { rondas, semillas, cruces };
}

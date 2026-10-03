// Puntos del ranking con el sistema Elo (el de la FIDE en ajedrez; en tenis lo usan
// rankings como el de Tennis Abstract). Funciones puras, sin base de datos: las usan
// la confirmación de partidos, el script de datos de ejemplo y los tests.

export const PUNTOS_INICIALES = 1200;
/** Hasta este número de partidos los puntos de un jugador nuevo se mueven más deprisa. */
export const PARTIDOS_PROVISIONALES = 5;
const K_PROVISIONAL = 40;
const K_NORMAL = 24;
const PUNTOS_MINIMOS = 100;

export type JugadorElo = {
  id: string;
  puntos: number;
  /** Partidos confirmados de la modalidad antes de este. */
  partidos: number;
};

/** Cuánto puede variar la puntuación en un partido (mayor mientras es provisional). */
export function factorK(partidosJugados: number): number {
  return partidosJugados < PARTIDOS_PROVISIONALES ? K_PROVISIONAL : K_NORMAL;
}

/** Probabilidad de que gane quien tiene `a` puntos frente a quien tiene `b`. */
export function probabilidadVictoria(a: number, b: number): number {
  return 1 / (1 + 10 ** ((b - a) / 400));
}

function media(jugadores: JugadorElo[]): number {
  return jugadores.reduce((suma, j) => suma + j.puntos, 0) / jugadores.length;
}

/**
 * Puntos de cada jugador tras el partido (id -> puntos nuevos).
 *
 * Cada equipo juega con la media de sus jugadores (en individual, la del único
 * jugador). Ganar a quien se esperaba que ganara da más puntos que ganar al débil.
 * En dobles los dos miembros de una pareja reciben el cambio con su propio K, de
 * modo que un jugador nuevo se ajusta antes a su nivel real.
 */
export function calcularPuntos(
  equipo1: JugadorElo[],
  equipo2: JugadorElo[],
  ganador: 1 | 2,
): Map<string, number> {
  if (equipo1.length === 0 || equipo2.length === 0) {
    throw new Error("Cada equipo necesita al menos un jugador.");
  }
  const esperado1 = probabilidadVictoria(media(equipo1), media(equipo2));
  const resultado1 = ganador === 1 ? 1 : 0;

  const nuevos = new Map<string, number>();
  for (const [equipo, real, esperado] of [
    [equipo1, resultado1, esperado1],
    [equipo2, 1 - resultado1, 1 - esperado1],
  ] as const) {
    for (const jugador of equipo) {
      const cambio = Math.round(factorK(jugador.partidos) * (real - esperado));
      nuevos.set(jugador.id, Math.max(PUNTOS_MINIMOS, jugador.puntos + cambio));
    }
  }
  return nuevos;
}

export function esProvisional(partidosJugados: number): boolean {
  return partidosJugados < PARTIDOS_PROVISIONALES;
}

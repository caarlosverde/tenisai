// Ranking de la comunidad por modalidad (servidor).
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { esProvisional } from "@/lib/comunidad/elo";
import { claveCiudad, nombreVisible, type Modalidad } from "@/lib/comunidad/perfil";
import { cargarRelaciones, hayBloqueo, puedeVerPerfil } from "@/lib/comunidad/relaciones";
import type { AmbitoRanking, FilaRanking } from "@/lib/comunidad/tipos";

/** Filas que se muestran; la del usuario se añade aparte si queda por debajo. */
export const FILAS_RANKING = 100;

const SELECT_RANKING = {
  id: true,
  username: true,
  nombre: true,
  apellidos: true,
  ciudad: true,
  perfilPublico: true,
  puntosIndividual: true,
  partidosIndividual: true,
  victoriasIndividual: true,
  puntosDobles: true,
  partidosDobles: true,
  victoriasDobles: true,
} as const;

type Candidato = {
  id: string;
  username: string;
  nombre: string;
  apellidos: string;
  ciudad: string | null;
  perfilPublico: boolean;
  puntos: number;
  partidos: number;
  victorias: number;
};

export type Ranking = {
  filas: FilaRanking[];
  /** Fila del usuario si no está entre las mostradas (o si su perfil es privado). */
  miFila: FilaRanking | null;
  aviso: string | null;
  miCiudad: string | null;
};

function aCandidato(
  u: {
    id: string;
    username: string;
    nombre: string;
    apellidos: string;
    ciudad: string | null;
    perfilPublico: boolean;
    puntosIndividual: number;
    partidosIndividual: number;
    victoriasIndividual: number;
    puntosDobles: number;
    partidosDobles: number;
    victoriasDobles: number;
  },
  modalidad: Modalidad,
): Candidato {
  const dobles = modalidad === "dobles";
  return {
    id: u.id,
    username: u.username,
    nombre: u.nombre,
    apellidos: u.apellidos,
    ciudad: u.ciudad,
    perfilPublico: u.perfilPublico,
    puntos: dobles ? u.puntosDobles : u.puntosIndividual,
    partidos: dobles ? u.partidosDobles : u.partidosIndividual,
    victorias: dobles ? u.victoriasDobles : u.victoriasIndividual,
  };
}

/** Jugadores con algún partido confirmado en la modalidad (y, si se indica, más puntos). */
function filtroModalidad(modalidad: Modalidad, masDe?: number): Prisma.UserWhereInput {
  const puntos = masDe === undefined ? undefined : { gt: masDe };
  return modalidad === "dobles"
    ? { partidosDobles: { gt: 0 }, puntosDobles: puntos }
    : { partidosIndividual: { gt: 0 }, puntosIndividual: puntos };
}

/** Más puntos primero; a igualdad, más victorias y más partidos. */
function ordenar(a: Candidato, b: Candidato): number {
  return (
    b.puntos - a.puntos ||
    b.victorias - a.victorias ||
    b.partidos - a.partidos ||
    a.username.localeCompare(b.username)
  );
}

/** Posiciones con empates (1, 2, 2, 4): quien tiene los mismos puntos comparte puesto. */
function conPosiciones(ordenados: Candidato[]): (Candidato & { posicion: number })[] {
  return ordenados.map((c, i) => {
    let primero = i;
    while (primero > 0 && ordenados[primero - 1].puntos === c.puntos) primero -= 1;
    return { ...c, posicion: primero + 1 };
  });
}

export async function cargarRanking(
  yoId: string,
  modalidad: Modalidad,
  ambito: AmbitoRanking,
): Promise<Ranking> {
  const [yoDb, relaciones] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: yoId }, select: SELECT_RANKING }),
    cargarRelaciones(yoId),
  ]);
  const yo = aCandidato(yoDb, modalidad);
  const nombreModalidad = modalidad === "dobles" ? "dobles" : "individual";

  let candidatos: Candidato[];
  let aviso: string | null = null;

  if (ambito === "amigos") {
    const ids = [...relaciones.amigos, yoId];
    const usuarios = await prisma.user.findMany({
      where: { id: { in: ids }, ...filtroModalidad(modalidad) },
      select: SELECT_RANKING,
    });
    candidatos = usuarios.map((u) => aCandidato(u, modalidad));
  } else {
    // Ranking abierto: solo perfiles públicos con algún partido confirmado
    const usuarios = await prisma.user.findMany({
      where: { perfilPublico: true, ...filtroModalidad(modalidad) },
      select: SELECT_RANKING,
    });
    candidatos = usuarios.map((u) => aCandidato(u, modalidad));
    if (ambito === "ciudad") {
      const clave = claveCiudad(yo.ciudad);
      if (!clave) {
        candidatos = [];
        aviso = "Añade tu ciudad en Ajustes de la cuenta para ver el ranking de tu ciudad.";
      } else {
        candidatos = candidatos.filter((c) => claveCiudad(c.ciudad) === clave);
      }
    }
  }

  // Si el usuario no aparece (perfil privado), se calcula dónde estaría
  const fueraDeLista =
    yo.partidos > 0 && !candidatos.some((c) => c.id === yoId) && !aviso;
  const ordenados = conPosiciones([...candidatos, ...(fueraDeLista ? [yo] : [])].sort(ordenar));

  const filasTodas = ordenados
    // Los bloqueos ocultan la fila, pero las posiciones del resto no cambian
    .filter((c) => !hayBloqueo(relaciones.estado(c.id)))
    .map((c): FilaRanking => {
      const relacion = relaciones.estado(c.id);
      return {
        posicion: c.posicion,
        username: c.username,
        nombre: nombreVisible(c, relacion === "yo" || relacion === "amigos"),
        ciudad: c.ciudad,
        puntos: c.puntos,
        partidos: c.partidos,
        victorias: c.victorias,
        provisional: esProvisional(c.partidos),
        esYo: relacion === "yo",
        enlace: puedeVerPerfil(relacion, c.perfilPublico),
      };
    });

  const miFilaCompleta = filasTodas.find((f) => f.esYo) ?? null;
  let filas = filasTodas.filter((f) => !(fueraDeLista && f.esYo)).slice(0, FILAS_RANKING);
  let miFila: FilaRanking | null = null;
  if (miFilaCompleta && (fueraDeLista || !filas.some((f) => f.esYo))) {
    miFila = miFilaCompleta;
    filas = filas.filter((f) => !f.esYo);
  }

  if (!aviso) {
    if (yo.partidos === 0) {
      aviso = `Aún no tienes partidos de ${nombreModalidad} confirmados: apareces en el ranking a partir del primero.`;
    } else if (fueraDeLista) {
      aviso =
        "Tu perfil es privado, así que no apareces en este ranking. Abajo ves en qué puesto estarías.";
    }
  }

  return { filas, miFila, aviso, miCiudad: yo.ciudad };
}

/** Puesto del usuario en el ranking general de la modalidad (null si no figura en él). */
export async function puestoGeneral(
  user: { perfilPublico: boolean; puntos: number; partidos: number },
  modalidad: Modalidad,
): Promise<number | null> {
  if (!user.perfilPublico || user.partidos === 0) return null;
  const mejores = await prisma.user.count({
    where: { perfilPublico: true, ...filtroModalidad(modalidad, user.puntos) },
  });
  return mejores + 1;
}

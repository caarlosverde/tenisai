// Partidos de la comunidad (servidor): registro, confirmación con puntos Elo y vistas.
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { calcularPuntos } from "@/lib/comunidad/elo";
import { leerSets, validarMarcador } from "@/lib/comunidad/marcador";
import { LUGAR_MAX, esModalidad, nombreVisible, type Modalidad } from "@/lib/comunidad/perfil";
import { puedeRegistrarResultado } from "@/lib/comunidad/reglasConvocatoria";
import {
  cargarRelaciones,
  puedeJugarCon,
  puedeVerPerfil,
  type Relaciones,
} from "@/lib/comunidad/relaciones";
import type { EstadoPartido, JugadorResumen, PartidoVista } from "@/lib/comunidad/tipos";

/** Un partido se puede registrar hasta un año después de jugarlo. */
const ANTIGUEDAD_MAX_DIAS = 365;

type Fallo = { ok: false; status: number; error: string };

/** Otra confirmación se adelantó: deshace la transacción. */
class YaNoPendiente extends Error {}

/** La convocatoria ya tenía un resultado enlazado: deshace la transacción. */
class ResultadoYaRegistrado extends Error {}

type PuntosModalidad = { puntos: number; partidos: number };

function puntosDe(
  user: { puntosIndividual: number; partidosIndividual: number; puntosDobles: number; partidosDobles: number },
  modalidad: Modalidad,
): PuntosModalidad {
  return modalidad === "dobles"
    ? { puntos: user.puntosDobles, partidos: user.partidosDobles }
    : { puntos: user.puntosIndividual, partidos: user.partidosIndividual };
}

function actualizacionPuntos(
  modalidad: Modalidad,
  puntos: number,
  gano: boolean,
): Prisma.UserUpdateInput {
  const victoria = { increment: gano ? 1 : 0 };
  return modalidad === "dobles"
    ? { puntosDobles: puntos, partidosDobles: { increment: 1 }, victoriasDobles: victoria }
    : { puntosIndividual: puntos, partidosIndividual: { increment: 1 }, victoriasIndividual: victoria };
}

export type DatosPartido = {
  modalidad?: unknown;
  jugadoEn?: unknown;
  lugar?: unknown;
  companero?: unknown;
  rivales?: unknown;
  sets?: unknown;
  /** Convocatoria de «Buscar partido» de la que sale el resultado. */
  convocatoriaId?: unknown;
};

/** Convocatoria ya jugada por la que se registra el resultado (y sus jugadores aceptados). */
async function convocatoriaParaResultado(
  creadorId: string,
  id: unknown,
  modalidad: Modalidad,
): Promise<{ id: string; aceptados: Set<string> } | Fallo | null> {
  if (id === undefined || id === null || id === "") return null;
  if (typeof id !== "string") return fallo(400, "Convocatoria no válida.");
  const convocatoria = await prisma.convocatoria.findUnique({
    where: { id },
    select: {
      creadorId: true,
      estado: true,
      partidoId: true,
      fechaHora: true,
      modalidad: true,
      solicitudes: { where: { estado: "aceptada" }, select: { userId: true } },
    },
  });
  if (
    !convocatoria ||
    convocatoria.creadorId !== creadorId ||
    convocatoria.estado !== "completa" ||
    convocatoria.partidoId ||
    !puedeRegistrarResultado(convocatoria.fechaHora)
  ) {
    return fallo(409, "No se puede registrar el resultado de ese partido publicado.");
  }
  if (convocatoria.modalidad !== modalidad) {
    return fallo(400, "La modalidad no coincide con la del partido publicado.");
  }
  return { id, aceptados: new Set(convocatoria.solicitudes.map((s) => s.userId)) };
}

function fallo(status: number, error: string): Fallo {
  return { ok: false, status, error };
}

/** Fecha "AAAA-MM-DD" de un partido ya jugado (hoy incluido) y no demasiado antigua. */
function leerFecha(valor: unknown): Date | null {
  if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null;
  // A mediodía UTC: el día no cambia por la zona horaria al mostrarlo
  const fecha = new Date(`${valor}T12:00:00Z`);
  if (Number.isNaN(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== valor) return null;
  const dia = 24 * 60 * 60 * 1000;
  const ahora = Date.now();
  if (fecha.getTime() > ahora + dia || fecha.getTime() < ahora - ANTIGUEDAD_MAX_DIAS * dia) {
    return null;
  }
  return fecha;
}

function listaUsernames(valor: unknown): string[] | null {
  if (!Array.isArray(valor) || !valor.every((v) => typeof v === "string" && v.trim())) return null;
  return valor.map((v: string) => v.trim());
}

/**
 * Registra un partido pendiente de confirmar. Quien lo registra va en el equipo 1
 * (con su compañero en dobles) y los rivales en el equipo 2.
 */
export async function crearPartido(
  creadorId: string,
  datos: DatosPartido,
): Promise<{ ok: true; id: string } | Fallo> {
  if (!esModalidad(datos.modalidad)) return fallo(400, "Elige individual o dobles.");
  const modalidad = datos.modalidad;

  const jugadoEn = leerFecha(datos.jugadoEn);
  if (!jugadoEn) {
    return fallo(400, `La fecha debe ser un día ya jugado de los últimos ${ANTIGUEDAD_MAX_DIAS} días.`);
  }

  let lugar: string | null = null;
  if (datos.lugar !== undefined && datos.lugar !== null) {
    if (typeof datos.lugar !== "string") return fallo(400, "El lugar debe ser un texto.");
    lugar = datos.lugar.replace(/\s+/g, " ").trim() || null;
    if (lugar && lugar.length > LUGAR_MAX) {
      return fallo(400, `El lugar admite como mucho ${LUGAR_MAX} caracteres.`);
    }
  }

  const rivales = listaUsernames(datos.rivales);
  const necesarios = modalidad === "dobles" ? 2 : 1;
  if (!rivales || rivales.length !== necesarios) {
    return fallo(400, modalidad === "dobles" ? "Elige a los dos rivales." : "Elige a tu rival.");
  }
  let companeros: string[] = [];
  if (modalidad === "dobles") {
    if (typeof datos.companero !== "string" || !datos.companero.trim()) {
      return fallo(400, "Elige a tu compañero.");
    }
    companeros = [datos.companero.trim()];
  } else if (datos.companero) {
    return fallo(400, "En individual no hay compañero.");
  }

  const marcador = validarMarcador(datos.sets);
  if (!marcador.ok) return fallo(400, marcador.error);

  const otros = [...companeros, ...rivales];
  if (new Set(otros.map((u) => u.toLowerCase())).size !== otros.length) {
    return fallo(400, "Cada jugador solo puede aparecer una vez.");
  }

  const convocatoria = await convocatoriaParaResultado(creadorId, datos.convocatoriaId, modalidad);
  if (convocatoria && "ok" in convocatoria) return convocatoria;

  const usuarios = await prisma.user.findMany({
    where: { username: { in: otros } },
    select: { id: true, username: true, perfilPublico: true },
  });
  const porUsername = new Map(usuarios.map((u) => [u.username, u]));
  const relaciones = await cargarRelaciones(creadorId);
  for (const username of otros) {
    const usuario = porUsername.get(username);
    if (!usuario) return fallo(404, `No existe el jugador @${username}.`);
    if (usuario.id === creadorId) return fallo(400, "Tú ya estás en el partido.");
    // Quien pidió plaza en tu convocatoria y aceptaste ya puede ir en el resultado
    const aceptado = convocatoria?.aceptados.has(usuario.id) ?? false;
    if (!aceptado && !puedeJugarCon(relaciones.estado(usuario.id), usuario.perfilPublico)) {
      return fallo(403, `No puedes apuntar a @${username}: solo a tus amigos o a jugadores con perfil público.`);
    }
  }

  // Tampoco entre ellos: alguien no puede acabar en un partido con quien le bloqueó
  const ids = [creadorId, ...usuarios.map((u) => u.id)];
  const bloqueoEntreEllos = await prisma.bloqueo.findFirst({
    where: { autorId: { in: ids }, bloqueadoId: { in: ids } },
    select: { autorId: true },
  });
  if (bloqueoEntreEllos) return fallo(403, "Estos jugadores no pueden coincidir en un partido.");

  try {
    const id = await prisma.$transaction(async (tx) => {
      const partido = await tx.partido.create({
        data: {
          modalidad,
          jugadoEn,
          lugar,
          sets: JSON.stringify(marcador.sets),
          ganador: marcador.ganador,
          creadoPorId: creadorId,
          jugadores: {
            create: [
              { userId: creadorId, equipo: 1 },
              ...companeros.map((u) => ({ userId: porUsername.get(u)!.id, equipo: 1 })),
              ...rivales.map((u) => ({ userId: porUsername.get(u)!.id, equipo: 2 })),
            ],
          },
        },
        select: { id: true },
      });
      if (convocatoria) {
        // Solo un resultado por convocatoria, aunque se envíe el formulario dos veces
        const enlazada = await tx.convocatoria.updateMany({
          where: { id: convocatoria.id, partidoId: null },
          data: { partidoId: partido.id },
        });
        if (enlazada.count !== 1) throw new ResultadoYaRegistrado();
      }
      return partido.id;
    });
    return { ok: true, id };
  } catch (error) {
    if (error instanceof ResultadoYaRegistrado) {
      return fallo(409, "El resultado de este partido ya está registrado.");
    }
    throw error;
  }
}

/**
 * Dentro de una transacción, marca un partido pendiente como confirmado y aplica los
 * puntos de todos sus jugadores. El primer paso solo marca el partido si seguía
 * pendiente: dos confirmaciones a la vez no pueden sumar los puntos dos veces.
 * La usan la confirmación de un rival y los resultados que anota el organizador de un torneo.
 */
export async function aplicarPuntos(tx: Prisma.TransactionClient, partidoId: string): Promise<void> {
  const marcado = await tx.partido.updateMany({
    where: { id: partidoId, estado: "pendiente" },
    data: { estado: "confirmado", confirmadoEn: new Date() },
  });
  if (marcado.count !== 1) throw new YaNoPendiente();

  const datos = await tx.partido.findUniqueOrThrow({
    where: { id: partidoId },
    select: {
      modalidad: true,
      ganador: true,
      jugadores: {
        select: {
          id: true,
          equipo: true,
          user: {
            select: {
              id: true,
              puntosIndividual: true,
              partidosIndividual: true,
              puntosDobles: true,
              partidosDobles: true,
            },
          },
        },
      },
    },
  });
  const modalidad: Modalidad = datos.modalidad === "dobles" ? "dobles" : "individual";
  const jugadores = datos.jugadores.flatMap((j) =>
    j.user ? [{ filaId: j.id, equipo: j.equipo, id: j.user.id, ...puntosDe(j.user, modalidad) }] : [],
  );
  const ganador = datos.ganador === 2 ? 2 : 1;
  const nuevos = calcularPuntos(
    jugadores.filter((j) => j.equipo === 1),
    jugadores.filter((j) => j.equipo === 2),
    ganador,
  );

  for (const jugador of jugadores) {
    const puntosDespues = nuevos.get(jugador.id) ?? jugador.puntos;
    await tx.user.update({
      where: { id: jugador.id },
      data: actualizacionPuntos(modalidad, puntosDespues, jugador.equipo === ganador),
    });
    await tx.jugadorPartido.update({
      where: { id: jugador.filaId },
      data: { puntosAntes: jugador.puntos, puntosDespues },
    });
  }
}

/** Un rival de quien registró el partido lo confirma: cuenta para el ranking. */
export async function confirmarPartido(
  partidoId: string,
  yoId: string,
): Promise<{ ok: true } | Fallo> {
  const partido = await prisma.partido.findUnique({
    where: { id: partidoId },
    select: { estado: true, jugadores: { select: { userId: true, equipo: true } } },
  });
  const yo = partido?.jugadores.find((j) => j.userId === yoId);
  if (!partido || !yo) return fallo(404, "Partido no encontrado.");
  if (yo.equipo !== 2) return fallo(403, "Lo tiene que confirmar un rival.");
  if (partido.estado !== "pendiente") return fallo(409, "Este partido ya no está pendiente.");
  if (partido.jugadores.some((j) => !j.userId)) {
    return fallo(409, "Uno de los jugadores ha borrado su cuenta: el partido no puede contar.");
  }

  try {
    await prisma.$transaction((tx) => aplicarPuntos(tx, partidoId));
  } catch (error) {
    if (error instanceof YaNoPendiente) return fallo(409, "Este partido ya no está pendiente.");
    throw error;
  }
  return { ok: true };
}

/** Un rival dice que el resultado no es correcto: el partido no cuenta. */
export async function rechazarPartido(
  partidoId: string,
  yoId: string,
): Promise<{ ok: true } | Fallo> {
  const partido = await prisma.partido.findFirst({
    where: { id: partidoId, jugadores: { some: { userId: yoId } } },
    select: { estado: true, jugadores: { where: { userId: yoId }, select: { equipo: true } } },
  });
  if (!partido) return fallo(404, "Partido no encontrado.");
  if (partido.jugadores[0]?.equipo !== 2) return fallo(403, "Lo tiene que rechazar un rival.");
  const cambiado = await prisma.partido.updateMany({
    where: { id: partidoId, estado: "pendiente" },
    data: { estado: "rechazado" },
  });
  if (cambiado.count !== 1) return fallo(409, "Este partido ya no está pendiente.");
  return { ok: true };
}

/** Quien lo registró lo retira mientras no esté confirmado (los confirmados no se tocan). */
export async function retirarPartido(
  partidoId: string,
  yoId: string,
): Promise<{ ok: true } | Fallo> {
  const borrados = await prisma.partido.deleteMany({
    where: { id: partidoId, creadoPorId: yoId, estado: { in: ["pendiente", "rechazado"] } },
  });
  if (borrados.count === 1) return { ok: true };
  const existe = await prisma.partido.findFirst({
    where: { id: partidoId, creadoPorId: yoId },
    select: { id: true },
  });
  return existe
    ? fallo(409, "Un partido confirmado ya forma parte del ranking y no se puede retirar.")
    : fallo(404, "Partido no encontrado.");
}

const INCLUDE_VISTA = {
  jugadores: {
    orderBy: { equipo: "asc" },
    select: {
      equipo: true,
      userId: true,
      puntosAntes: true,
      puntosDespues: true,
      user: { select: { id: true, username: true, nombre: true, apellidos: true, perfilPublico: true } },
    },
  },
} satisfies Prisma.PartidoInclude;

type PartidoConJugadores = Prisma.PartidoGetPayload<{ include: typeof INCLUDE_VISTA }>;

function resumenJugador(
  jugador: PartidoConJugadores["jugadores"][number],
  relaciones: Relaciones,
): JugadorResumen {
  const user = jugador.user;
  if (!user) return { username: null, nombre: "Cuenta eliminada", enlace: false, esYo: false };
  const relacion = relaciones.estado(user.id);
  return {
    username: user.username,
    nombre: nombreVisible(user, relacion === "yo" || relacion === "amigos"),
    enlace: puedeVerPerfil(relacion, user.perfilPublico),
    esYo: relacion === "yo",
  };
}

function vistaPartido(
  partido: PartidoConJugadores,
  yoId: string,
  relaciones: Relaciones,
  perspectivaId: string,
): PartidoVista {
  // Resultado y puntos desde el jugador de la perspectiva; acciones, solo las de quien mira
  const mio = partido.jugadores.find((j) => j.userId === perspectivaId);
  const propio = perspectivaId === yoId;
  const estado = partido.estado as EstadoPartido;
  return {
    id: partido.id,
    modalidad: partido.modalidad === "dobles" ? "dobles" : "individual",
    jugadoEn: partido.jugadoEn.toISOString(),
    lugar: partido.lugar,
    sets: leerSets(partido.sets),
    ganador: partido.ganador === 2 ? 2 : 1,
    estado,
    miEquipo: mio ? (mio.equipo === 2 ? 2 : 1) : null,
    equipo1: partido.jugadores.filter((j) => j.equipo === 1).map((j) => resumenJugador(j, relaciones)),
    equipo2: partido.jugadores.filter((j) => j.equipo !== 1).map((j) => resumenJugador(j, relaciones)),
    cambioPuntos:
      mio && mio.puntosAntes !== null && mio.puntosDespues !== null
        ? mio.puntosDespues - mio.puntosAntes
        : null,
    puedeResponder: propio && estado === "pendiente" && mio?.equipo === 2,
    puedeRetirar: propio && estado !== "confirmado" && partido.creadoPorId === yoId,
  };
}

/**
 * Partidos ordenados del más reciente al más antiguo, preparados para mostrarlos a
 * `yoId`. Con `perspectivaId` (el perfil de otro jugador) la victoria o derrota y los
 * puntos ganados son los de ese jugador.
 */
export async function cargarPartidos(
  yoId: string,
  where: Prisma.PartidoWhereInput,
  take = 50,
  perspectivaId = yoId,
): Promise<PartidoVista[]> {
  const [partidos, relaciones] = await Promise.all([
    prisma.partido.findMany({
      where,
      orderBy: [{ jugadoEn: "desc" }, { creadoEn: "desc" }],
      take,
      include: INCLUDE_VISTA,
    }),
    cargarRelaciones(yoId),
  ]);
  return partidos.map((p) => vistaPartido(p, yoId, relaciones, perspectivaId));
}

/** Partidos confirmados entre dos jugadores en equipos contrarios (victorias de cada uno). */
export function enfrentamientos(
  partidos: PartidoVista[],
  otroUsername: string,
): { ganados: number; perdidos: number } {
  let ganados = 0;
  let perdidos = 0;
  for (const p of partidos) {
    if (p.estado !== "confirmado" || p.miEquipo === null) continue;
    const rivales = p.miEquipo === 1 ? p.equipo2 : p.equipo1;
    if (!rivales.some((j) => j.username === otroUsername)) continue;
    if (p.ganador === p.miEquipo) ganados += 1;
    else perdidos += 1;
  }
  return { ganados, perdidos };
}

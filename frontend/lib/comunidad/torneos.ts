// Torneos (servidor): crear, inscribirse, sortear el cuadro y anotar resultados.
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { generarCuadro, siguienteCruce } from "@/lib/comunidad/cuadro";
import { leerSets, textoMarcador, validarMarcador } from "@/lib/comunidad/marcador";
import { aplicarPuntos } from "@/lib/comunidad/partidos";
import { nombreVisible, type Modalidad } from "@/lib/comunidad/perfil";
import { diaEnEspana } from "@/lib/comunidad/reglasConvocatoria";
import { validarTorneo } from "@/lib/comunidad/reglasTorneo";
import {
  cargarRelaciones,
  hayBloqueo,
  puedeJugarCon,
  puedeVerPerfil,
  type Relaciones,
} from "@/lib/comunidad/relaciones";
import type {
  CruceVista,
  EstadoTorneo,
  InscritoVista,
  JugadorResumen,
  TorneoResumen,
  TorneoVista,
} from "@/lib/comunidad/tipos";

type Fallo = { ok: false; status: number; error: string };
const fallo = (status: number, error: string): Fallo => ({ ok: false, status, error });

/** Otro cambio se adelantó (p. ej. dos resultados a la vez): deshace la transacción. */
class Conflicto extends Error {}

const SELECT_JUGADOR = {
  id: true,
  username: true,
  nombre: true,
  apellidos: true,
  perfilPublico: true,
  puntosIndividual: true,
  puntosDobles: true,
} as const;

const INCLUDE_TORNEO = {
  organizador: { select: { ...SELECT_JUGADOR, organizacion: true } },
  inscripciones: {
    orderBy: { creadaEn: "asc" },
    include: { user: { select: SELECT_JUGADOR }, companero: { select: SELECT_JUGADOR } },
  },
  partidos: {
    orderBy: [{ ronda: "asc" }, { posicion: "asc" }],
    include: { partido: { select: { sets: true } } },
  },
} satisfies Prisma.TorneoInclude;

type TorneoDb = Prisma.TorneoGetPayload<{ include: typeof INCLUDE_TORNEO }>;
type InscripcionDb = TorneoDb["inscripciones"][number];
type JugadorDb = InscripcionDb["user"];

export async function esOrganizador(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { rol: true } });
  return user?.rol === "organizador";
}

/** Puntos con los que entra una inscripción (en dobles, la media de la pareja). */
function puntosInscripcion(i: { user: JugadorDb; companero: JugadorDb | null }, modalidad: Modalidad): number {
  if (modalidad === "dobles") {
    const pareja = i.companero ? [i.user, i.companero] : [i.user];
    return Math.round(pareja.reduce((s, j) => s + j.puntosDobles, 0) / pareja.length);
  }
  return i.user.puntosIndividual;
}

function resumenJugador(u: JugadorDb, relaciones: Relaciones): JugadorResumen {
  const relacion = relaciones.estado(u.id);
  return {
    username: u.username,
    nombre: nombreVisible(u, relacion === "yo" || relacion === "amigos"),
    enlace: puedeVerPerfil(relacion, u.perfilPublico),
    esYo: relacion === "yo",
  };
}

function vistaInscrito(
  i: InscripcionDb,
  modalidad: Modalidad,
  yoId: string,
  relaciones: Relaciones,
): InscritoVista {
  return {
    id: i.id,
    jugadores: [i.user, ...(i.companero ? [i.companero] : [])].map((j) => resumenJugador(j, relaciones)),
    puntos: puntosInscripcion(i, modalidad),
    semilla: i.semilla,
    pendiente: i.estado !== "confirmada",
    esMia: i.userId === yoId || i.companeroId === yoId,
  };
}

function vistaTorneo(t: TorneoDb, yoId: string, relaciones: Relaciones, ahora: Date): TorneoVista {
  const modalidad: Modalidad = t.modalidad === "dobles" ? "dobles" : "individual";
  const porId = new Map(t.inscripciones.map((i) => [i.id, vistaInscrito(i, modalidad, yoId, relaciones)]));
  const confirmadas = t.inscripciones.filter((i) => i.estado === "confirmada");
  const mia = t.inscripciones.find((i) => i.userId === yoId || i.companeroId === yoId);
  const esOrganizador = t.organizadorId === yoId;
  const estado = t.estado as EstadoTorneo;
  const rondas = t.partidos.reduce((max, c) => Math.max(max, c.ronda), 0);

  const cruces: CruceVista[] = t.partidos.map((c) => {
    const sets = c.partido ? leerSets(c.partido.sets) : null;
    const a = c.inscripcion1Id ? (porId.get(c.inscripcion1Id) ?? null) : null;
    const b = c.inscripcion2Id ? (porId.get(c.inscripcion2Id) ?? null) : null;
    return {
      id: c.id,
      ronda: c.ronda,
      posicion: c.posicion,
      a,
      b,
      ganador: c.ganadorId ? (c.ganadorId === c.inscripcion1Id ? "a" : "b") : null,
      tipo: c.tipo === "bye" || c.tipo === "incomparecencia" ? c.tipo : "normal",
      marcador: sets && sets.length ? textoMarcador(sets) : null,
      pendienteDeResultado: estado === "en_curso" && !c.ganadorId && Boolean(a || b) && esCruceListo(c, t),
    };
  });

  return {
    id: t.id,
    nombre: t.nombre,
    descripcion: t.descripcion,
    modalidad,
    plazas: t.plazas,
    lugar: t.lugar,
    ciudad: t.ciudad,
    nivel: t.nivel,
    cierreInscripcion: t.cierreInscripcion.toISOString(),
    inicio: t.inicio.toISOString(),
    estado,
    organizador: { ...resumenJugador(t.organizador, relaciones), organizacion: t.organizador.organizacion },
    esOrganizador,
    // Las inscripciones a medias (falta la pareja) solo las ven sus jugadores y el organizador
    inscritos: t.inscripciones
      .filter((i) => i.estado === "confirmada" || i.userId === yoId || i.companeroId === yoId || esOrganizador)
      .map((i) => porId.get(i.id)!)
      .sort((x, y) => Number(x.pendiente) - Number(y.pendiente) || y.puntos - x.puntos),
    confirmados: confirmadas.length,
    miInscripcion: mia
      ? {
          pendiente: mia.estado !== "confirmada",
          meInvitan: mia.companeroId === yoId && mia.estado !== "confirmada",
          pareja:
            modalidad === "dobles"
              ? resumenJugador(mia.userId === yoId ? mia.companero! : mia.user, relaciones)
              : null,
        }
      : null,
    inscripcionAbierta:
      estado === "inscripcion" &&
      t.cierreInscripcion.getTime() > ahora.getTime() &&
      t.inscripciones.length < t.plazas,
    rondas,
    cruces,
    campeon: t.campeonId ? (porId.get(t.campeonId) ?? null) : null,
  };
}

/**
 * Un cruce está listo para anotar cuando sus dos lados ya se conocen. Si un lado está
 * vacío porque su jugador borró la cuenta (el cruce anterior ya tiene ganador), también:
 * el organizador da el pase por incomparecencia.
 */
function esCruceListo(c: TorneoDb["partidos"][number], t: TorneoDb): boolean {
  if (c.inscripcion1Id && c.inscripcion2Id) return true;
  if (c.ronda === 1) return true;
  const previos = t.partidos.filter(
    (p) => p.ronda === c.ronda - 1 && Math.floor(p.posicion / 2) === c.posicion,
  );
  return previos.every((p) => p.ganadorId !== null || p.tipo !== "normal");
}

export async function crearTorneo(
  yoId: string,
  entrada: Record<string, unknown>,
): Promise<{ ok: true; id: string } | Fallo> {
  if (!(await esOrganizador(yoId))) {
    return fallo(403, "Solo los organizadores y clubes pueden crear torneos.");
  }
  const validacion = validarTorneo(entrada);
  if (!validacion.ok) return fallo(400, validacion.error);
  const torneo = await prisma.torneo.create({
    data: { ...validacion.datos, organizadorId: yoId },
    select: { id: true },
  });
  return { ok: true, id: torneo.id };
}

export async function cargarTorneo(yoId: string, id: string): Promise<TorneoVista | null> {
  const [t, relaciones] = await Promise.all([
    prisma.torneo.findUnique({ where: { id }, include: INCLUDE_TORNEO }),
    cargarRelaciones(yoId),
  ]);
  return t ? vistaTorneo(t, yoId, relaciones, new Date()) : null;
}

/** Torneos para la lista: con inscripción abierta, en juego, terminados y los del usuario. */
export async function listarTorneos(yoId: string): Promise<{
  abiertos: TorneoResumen[];
  enJuego: TorneoResumen[];
  terminados: TorneoResumen[];
  mios: TorneoResumen[];
}> {
  const filas = await prisma.torneo.findMany({
    where: {
      OR: [
        { estado: { in: ["inscripcion", "en_curso"] } },
        { estado: "finalizado", inicio: { gt: new Date(Date.now() - 365 * 86_400_000) } },
        { organizadorId: yoId, estado: "cancelado", inicio: { gt: new Date() } },
      ],
    },
    orderBy: { inicio: "asc" },
    include: {
      organizador: { select: { nombre: true, organizacion: true } },
      inscripciones: {
        select: {
          id: true,
          userId: true,
          companeroId: true,
          estado: true,
          user: { select: { nombre: true, apellidos: true } },
          companero: { select: { nombre: true, apellidos: true } },
        },
      },
    },
    take: 200,
  });
  const ahora = Date.now();
  const resumenes = filas.map((t): TorneoResumen => {
    const campeon = t.inscripciones.find((i) => i.id === t.campeonId);
    return {
      id: t.id,
      nombre: t.nombre,
      modalidad: t.modalidad === "dobles" ? "dobles" : "individual",
      inicio: t.inicio.toISOString(),
      cierreInscripcion: t.cierreInscripcion.toISOString(),
      lugar: t.lugar,
      ciudad: t.ciudad,
      nivel: t.nivel,
      estado: t.estado as EstadoTorneo,
      inscripcionAbierta: t.estado === "inscripcion" && t.cierreInscripcion.getTime() > ahora,
      plazas: t.plazas,
      inscritos: t.inscripciones.filter((i) => i.estado === "confirmada").length,
      organizacion: t.organizador.organizacion ?? t.organizador.nombre,
      campeon: campeon
        ? [campeon.user, ...(campeon.companero ? [campeon.companero] : [])]
            .map((j) => nombreVisible(j, false))
            .join(" / ")
        : null,
      participo: t.inscripciones.some((i) => i.userId === yoId || i.companeroId === yoId),
      esOrganizador: t.organizadorId === yoId,
    };
  });
  return {
    abiertos: resumenes.filter((t) => t.inscripcionAbierta),
    // También los que cerraron la inscripción y esperan el sorteo
    enJuego: resumenes.filter(
      (t) => t.estado === "en_curso" || (t.estado === "inscripcion" && !t.inscripcionAbierta),
    ),
    terminados: resumenes.filter((t) => t.estado === "finalizado").reverse().slice(0, 10),
    mios: resumenes.filter(
      (t) => (t.participo || t.esOrganizador) && (t.estado === "inscripcion" || t.estado === "en_curso"),
    ),
  };
}

/** Inscribe al usuario (y, en dobles, invita a su pareja, que tiene que aceptar). */
export async function inscribirse(
  yoId: string,
  id: string,
  companeroUsername: unknown,
): Promise<{ ok: true; pendiente: boolean } | Fallo> {
  const [t, relaciones] = await Promise.all([
    prisma.torneo.findUnique({
      where: { id },
      select: {
        organizadorId: true,
        modalidad: true,
        estado: true,
        plazas: true,
        cierreInscripcion: true,
        inscripciones: { select: { userId: true, companeroId: true } },
      },
    }),
    cargarRelaciones(yoId),
  ]);
  if (!t) return fallo(404, "Torneo no encontrado.");
  if (t.organizadorId === yoId) return fallo(400, "No puedes inscribirte en tu propio torneo.");
  if (hayBloqueo(relaciones.estado(t.organizadorId))) return fallo(403, "No puedes inscribirte en este torneo.");
  if (t.estado !== "inscripcion" || t.cierreInscripcion.getTime() <= Date.now()) {
    return fallo(409, "La inscripción de este torneo está cerrada.");
  }
  if (t.inscripciones.length >= t.plazas) return fallo(409, "No quedan plazas en este torneo.");
  const ocupados = new Set(t.inscripciones.flatMap((i) => [i.userId, i.companeroId]));
  if (ocupados.has(yoId)) return fallo(409, "Ya estás inscrito en este torneo.");

  let companeroId: string | null = null;
  if (t.modalidad === "dobles") {
    if (typeof companeroUsername !== "string" || !companeroUsername.trim()) {
      return fallo(400, "Elige a tu pareja para el torneo.");
    }
    const companero = await prisma.user.findUnique({
      where: { username: companeroUsername.trim() },
      select: { id: true, perfilPublico: true },
    });
    if (!companero) return fallo(404, "No existe ese jugador.");
    if (!puedeJugarCon(relaciones.estado(companero.id), companero.perfilPublico)) {
      return fallo(403, "Tu pareja tiene que ser amigo tuyo o tener el perfil público.");
    }
    if (companero.id === t.organizadorId) return fallo(400, "El organizador no puede jugar su propio torneo.");
    if (ocupados.has(companero.id)) return fallo(409, "Tu pareja ya está inscrita en este torneo.");
    companeroId = companero.id;
  } else if (companeroUsername) {
    return fallo(400, "En individual no hay pareja.");
  }

  await prisma.inscripcionTorneo.create({
    data: {
      torneoId: id,
      userId: yoId,
      companeroId,
      estado: companeroId ? "pendiente_companero" : "confirmada",
    },
  });
  return { ok: true, pendiente: Boolean(companeroId) };
}

/** Retira la inscripción (la puede retirar cualquiera de la pareja) mientras no haya cuadro. */
export async function retirarInscripcion(yoId: string, id: string): Promise<{ ok: true } | Fallo> {
  const borradas = await prisma.inscripcionTorneo.deleteMany({
    where: {
      torneoId: id,
      torneo: { estado: "inscripcion" },
      OR: [{ userId: yoId }, { companeroId: yoId }],
    },
  });
  return borradas.count > 0
    ? { ok: true }
    : fallo(409, "No tienes una inscripción que se pueda retirar en este torneo.");
}

/** La pareja invitada acepta (la inscripción cuenta) o rechaza (se retira). */
export async function responderInvitacion(
  yoId: string,
  id: string,
  accion: "aceptar" | "rechazar",
): Promise<{ ok: true } | Fallo> {
  const inscripcion = await prisma.inscripcionTorneo.findFirst({
    where: { torneoId: id, companeroId: yoId, estado: "pendiente_companero" },
    select: { id: true, torneo: { select: { estado: true, cierreInscripcion: true } } },
  });
  if (!inscripcion) return fallo(404, "No tienes ninguna invitación pendiente en este torneo.");
  if (accion === "rechazar") {
    await prisma.inscripcionTorneo.delete({ where: { id: inscripcion.id } });
    return { ok: true };
  }
  if (inscripcion.torneo.estado !== "inscripcion" || inscripcion.torneo.cierreInscripcion.getTime() <= Date.now()) {
    return fallo(409, "La inscripción de este torneo ya está cerrada.");
  }
  await prisma.inscripcionTorneo.update({ where: { id: inscripcion.id }, data: { estado: "confirmada" } });
  return { ok: true };
}

/**
 * Cierra la inscripción y sortea el cuadro con cabezas de serie por puntos. Las parejas
 * que no llegaron a confirmarse quedan fuera.
 */
export async function sortearCuadro(yoId: string, id: string): Promise<{ ok: true } | Fallo> {
  const t = await prisma.torneo.findUnique({
    where: { id },
    select: {
      organizadorId: true,
      estado: true,
      modalidad: true,
      inscripciones: {
        where: { estado: "confirmada" },
        select: { id: true, user: { select: SELECT_JUGADOR }, companero: { select: SELECT_JUGADOR } },
      },
    },
  });
  if (!t || t.organizadorId !== yoId) return fallo(404, "Torneo no encontrado.");
  if (t.estado !== "inscripcion") return fallo(409, "El cuadro de este torneo ya está sorteado.");
  if (t.inscripciones.length < 2) return fallo(409, "Hacen falta al menos dos inscripciones para sortear el cuadro.");

  const modalidad: Modalidad = t.modalidad === "dobles" ? "dobles" : "individual";
  const cuadro = generarCuadro(
    t.inscripciones.map((i) => ({ id: i.id, puntos: puntosInscripcion(i, modalidad) })),
  );

  try {
    await prisma.$transaction(async (tx) => {
      const cambiado = await tx.torneo.updateMany({
        where: { id, estado: "inscripcion" },
        data: { estado: "en_curso" },
      });
      if (cambiado.count !== 1) throw new Conflicto("El cuadro de este torneo ya está sorteado.");
      await tx.inscripcionTorneo.deleteMany({ where: { torneoId: id, estado: { not: "confirmada" } } });
      for (const [inscripcionId, semilla] of cuadro.semillas) {
        await tx.inscripcionTorneo.update({ where: { id: inscripcionId }, data: { semilla } });
      }
      await tx.partidoTorneo.createMany({
        data: cuadro.cruces.map((c) => ({
          torneoId: id,
          ronda: c.ronda,
          posicion: c.posicion,
          inscripcion1Id: c.a,
          inscripcion2Id: c.b,
          ganadorId: c.ganador,
          tipo: c.tipo,
        })),
      });
    });
  } catch (error) {
    if (error instanceof Conflicto) return fallo(409, error.message);
    throw error;
  }
  return { ok: true };
}

/** Coloca al ganador en el cruce siguiente o, si era la final, cierra el torneo con su campeón. */
async function avanzar(
  tx: Prisma.TransactionClient,
  torneoId: string,
  ronda: number,
  posicion: number,
  ganadorId: string,
) {
  const rondas = await tx.partidoTorneo.aggregate({ where: { torneoId }, _max: { ronda: true } });
  if (ronda >= (rondas._max.ronda ?? ronda)) {
    await tx.torneo.update({ where: { id: torneoId }, data: { estado: "finalizado", campeonId: ganadorId } });
    return;
  }
  const destino = siguienteCruce(ronda, posicion);
  await tx.partidoTorneo.update({
    where: { torneoId_ronda_posicion: { torneoId, ronda: destino.ronda, posicion: destino.posicion } },
    data: destino.lado === "a" ? { inscripcion1Id: ganadorId } : { inscripcion2Id: ganadorId },
  });
}

/**
 * El organizador anota un resultado del cuadro: con marcador (crea el partido y aplica
 * los puntos del ranking) o por incomparecencia de un lado (pasa el otro, sin puntos).
 */
export async function anotarResultado(
  yoId: string,
  torneoId: string,
  cruceId: string,
  entrada: { sets?: unknown; noPresentado?: unknown },
): Promise<{ ok: true; finalizado: boolean } | Fallo> {
  const cruce = await prisma.partidoTorneo.findFirst({
    where: { id: cruceId, torneoId },
    include: {
      torneo: { select: { organizadorId: true, estado: true, modalidad: true, lugar: true } },
      inscripcion1: { select: { id: true, userId: true, companeroId: true } },
      inscripcion2: { select: { id: true, userId: true, companeroId: true } },
    },
  });
  if (!cruce || cruce.torneo.organizadorId !== yoId) return fallo(404, "Cruce no encontrado.");
  if (cruce.torneo.estado !== "en_curso") return fallo(409, "Este torneo no está en juego.");
  if (cruce.ganadorId) return fallo(409, "Este cruce ya tiene resultado.");

  const { inscripcion1: a, inscripcion2: b } = cruce;
  let ganadorId: string;
  let datosPartido: Prisma.PartidoCreateInput | null = null;

  if (entrada.noPresentado === "a" || entrada.noPresentado === "b") {
    const presente = entrada.noPresentado === "a" ? b : a;
    if (!presente) return fallo(409, "Ningún lado del cruce puede pasar.");
    ganadorId = presente.id;
  } else {
    if (!a || !b) return fallo(409, "Falta uno de los dos lados del cruce: da el pase por incomparecencia.");
    const marcador = validarMarcador(entrada.sets);
    if (!marcador.ok) return fallo(400, marcador.error);
    ganadorId = marcador.ganador === 1 ? a.id : b.id;
    const jugadoEn = new Date(`${diaEnEspana(new Date())}T12:00:00Z`);
    datosPartido = {
      modalidad: cruce.torneo.modalidad,
      jugadoEn,
      lugar: cruce.torneo.lugar,
      sets: JSON.stringify(marcador.sets),
      ganador: marcador.ganador,
      creadoPor: { connect: { id: yoId } },
      jugadores: {
        create: [
          { user: { connect: { id: a.userId } }, equipo: 1 },
          ...(a.companeroId ? [{ user: { connect: { id: a.companeroId } }, equipo: 1 }] : []),
          { user: { connect: { id: b.userId } }, equipo: 2 },
          ...(b.companeroId ? [{ user: { connect: { id: b.companeroId } }, equipo: 2 }] : []),
        ],
      },
    };
  }

  try {
    const finalizado = await prisma.$transaction(async (tx) => {
      let partidoId: string | null = null;
      if (datosPartido) {
        // El organizador hace de juez árbitro: el resultado cuenta sin esperar confirmación
        const partido = await tx.partido.create({ data: datosPartido, select: { id: true } });
        await aplicarPuntos(tx, partido.id);
        partidoId = partido.id;
      }
      const marcado = await tx.partidoTorneo.updateMany({
        where: { id: cruceId, ganadorId: null },
        data: { ganadorId, partidoId, tipo: datosPartido ? "normal" : "incomparecencia" },
      });
      if (marcado.count !== 1) throw new Conflicto("Este cruce ya tiene resultado.");
      await avanzar(tx, torneoId, cruce.ronda, cruce.posicion, ganadorId);
      const torneo = await tx.torneo.findUniqueOrThrow({ where: { id: torneoId }, select: { estado: true } });
      return torneo.estado === "finalizado";
    });
    return { ok: true, finalizado };
  } catch (error) {
    if (error instanceof Conflicto) return fallo(409, error.message);
    throw error;
  }
}

export async function cancelarTorneo(yoId: string, id: string): Promise<{ ok: true } | Fallo> {
  const cambiado = await prisma.torneo.updateMany({
    where: { id, organizadorId: yoId, estado: { in: ["inscripcion", "en_curso"] } },
    data: { estado: "cancelado" },
  });
  return cambiado.count === 1 ? { ok: true } : fallo(409, "Este torneo ya no se puede cancelar.");
}

/** Torneos ganados por un jugador (solo o con su pareja), del más reciente al más antiguo. */
export async function titulosDe(userId: string): Promise<{ id: string; nombre: string; inicio: string; modalidad: Modalidad }[]> {
  const torneos = await prisma.torneo.findMany({
    where: {
      estado: "finalizado",
      campeon: { OR: [{ userId }, { companeroId: userId }] },
    },
    orderBy: { inicio: "desc" },
    select: { id: true, nombre: true, inicio: true, modalidad: true },
  });
  return torneos.map((t) => ({
    id: t.id,
    nombre: t.nombre,
    inicio: t.inicio.toISOString(),
    modalidad: t.modalidad === "dobles" ? "dobles" : "individual",
  }));
}

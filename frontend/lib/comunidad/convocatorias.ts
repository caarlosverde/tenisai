// «Buscar partido» (servidor): publicar, pedir plaza, aceptar y las vistas de cada convocatoria.
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { claveCiudad, nombreVisible, type Modalidad } from "@/lib/comunidad/perfil";
import {
  MENSAJE_SOLICITUD_MAX,
  puedeRegistrarResultado,
  validarConvocatoria,
} from "@/lib/comunidad/reglasConvocatoria";
import {
  cargarRelaciones,
  hayBloqueo,
  puedeVerPerfil,
  type Relaciones,
} from "@/lib/comunidad/relaciones";
import type {
  ConvocatoriaVista,
  EstadoConvocatoria,
  EstadoSolicitud,
  JugadorResumen,
} from "@/lib/comunidad/tipos";

type Fallo = { ok: false; status: number; error: string };
const fallo = (status: number, error: string): Fallo => ({ ok: false, status, error });

/** Otra respuesta se adelantó y ya no quedan plazas: deshace la transacción. */
class SinPlazas extends Error {}

const SELECT_PERSONA = {
  id: true,
  username: true,
  nombre: true,
  apellidos: true,
  perfilPublico: true,
  ciudad: true,
  nivel: true,
  puntosIndividual: true,
  partidosIndividual: true,
  puntosDobles: true,
  partidosDobles: true,
} as const;

const INCLUDE = {
  creador: { select: SELECT_PERSONA },
  solicitudes: {
    orderBy: { creadaEn: "asc" },
    select: { userId: true, estado: true, mensaje: true, user: { select: SELECT_PERSONA } },
  },
} satisfies Prisma.ConvocatoriaInclude;

type ConvocatoriaDb = Prisma.ConvocatoriaGetPayload<{ include: typeof INCLUDE }>;
type Persona = ConvocatoriaDb["creador"];

/** La ve quien la publicó, quien ha pedido plaza y quien puede ver el perfil de quien la publicó. */
function visible(c: ConvocatoriaDb, yoId: string, relaciones: Relaciones): boolean {
  if (c.creadorId === yoId || c.solicitudes.some((s) => s.userId === yoId)) return true;
  const relacion = relaciones.estado(c.creadorId);
  return !hayBloqueo(relacion) && puedeVerPerfil(relacion, c.creador.perfilPublico);
}

function vista(
  c: ConvocatoriaDb,
  yoId: string,
  relaciones: Relaciones,
  ahora: Date,
): ConvocatoriaVista {
  const modalidad: Modalidad = c.modalidad === "dobles" ? "dobles" : "individual";
  const puntos = (u: Persona) => (modalidad === "dobles" ? u.puntosDobles : u.puntosIndividual);
  const partidos = (u: Persona) => (modalidad === "dobles" ? u.partidosDobles : u.partidosIndividual);
  const resumen = (u: Persona): JugadorResumen => {
    const relacion = relaciones.estado(u.id);
    return {
      username: u.username,
      nombre: nombreVisible(u, relacion === "yo" || relacion === "amigos"),
      enlace: puedeVerPerfil(relacion, u.perfilPublico),
      esYo: relacion === "yo",
    };
  };

  const aceptadas = c.solicitudes.filter((s) => s.estado === "aceptada");
  const mia = c.solicitudes.find((s) => s.userId === yoId);
  const esMia = c.creadorId === yoId;
  const juego = esMia || mia?.estado === "aceptada";
  const estado = c.estado as EstadoConvocatoria;

  return {
    id: c.id,
    modalidad,
    fechaHora: c.fechaHora.toISOString(),
    lugar: c.lugar,
    ciudad: c.ciudad,
    nivel: c.nivel,
    plazas: c.plazas,
    libres: Math.max(0, c.plazas - aceptadas.length),
    comentario: c.comentario,
    estado,
    pasada: c.fechaHora.getTime() < ahora.getTime(),
    creador: { ...resumen(c.creador), puntos: puntos(c.creador) },
    esMia,
    miSolicitud: (mia?.estado as EstadoSolicitud | undefined) ?? null,
    jugadores: juego ? [c.creador, ...aceptadas.map((s) => s.user)].map(resumen) : null,
    pendientes: esMia
      ? c.solicitudes
          .filter((s) => s.estado === "pendiente")
          .map((s) => {
            const base = resumen(s.user);
            return {
              ...base,
              // Pidió plaza: se enseña su nivel y sus puntos; la ciudad, si su perfil se ve
              ciudad: base.enlace ? s.user.ciudad : null,
              nivel: s.user.nivel,
              puntos: puntos(s.user),
              partidos: partidos(s.user),
              mensaje: s.mensaje,
            };
          })
      : null,
    partidoId: c.partidoId,
    puedeRegistrarResultado:
      esMia && estado === "completa" && !c.partidoId && puedeRegistrarResultado(c.fechaHora, ahora),
  };
}

export async function crearConvocatoria(
  yoId: string,
  entrada: Record<string, unknown>,
): Promise<{ ok: true; id: string } | Fallo> {
  const validacion = validarConvocatoria(entrada);
  if (!validacion.ok) return fallo(400, validacion.error);
  const convocatoria = await prisma.convocatoria.create({
    data: { ...validacion.datos, creadorId: yoId },
    select: { id: true },
  });
  return { ok: true, id: convocatoria.id };
}

/** Convocatorias abiertas de otros jugadores que el usuario puede ver, de la más próxima a la más lejana. */
export async function listarAbiertas(
  yoId: string,
  filtros: { modalidad: Modalidad | null; ciudad: string | null },
): Promise<ConvocatoriaVista[]> {
  const ahora = new Date();
  const [filas, relaciones] = await Promise.all([
    prisma.convocatoria.findMany({
      where: {
        estado: "abierta",
        fechaHora: { gt: ahora },
        creadorId: { not: yoId },
        ...(filtros.modalidad ? { modalidad: filtros.modalidad } : {}),
      },
      orderBy: { fechaHora: "asc" },
      include: INCLUDE,
      take: 200,
    }),
    cargarRelaciones(yoId),
  ]);
  const ciudad = claveCiudad(filtros.ciudad);
  return filas
    .filter((c) => visible(c, yoId, relaciones))
    .filter((c) => !ciudad || claveCiudad(c.ciudad) === ciudad)
    .slice(0, 50)
    .map((c) => vista(c, yoId, relaciones, ahora));
}

/**
 * Convocatorias del usuario: las próximas que ha publicado o en las que ha pedido plaza,
 * y las ya jugadas (hasta hace 30 días) de las que aún tiene que registrar el resultado.
 */
export async function misConvocatorias(
  yoId: string,
): Promise<{ proximas: ConvocatoriaVista[]; porRegistrar: ConvocatoriaVista[] }> {
  const ahora = new Date();
  const hace30Dias = new Date(ahora.getTime() - 30 * 86_400_000);
  const [filas, relaciones] = await Promise.all([
    prisma.convocatoria.findMany({
      where: {
        fechaHora: { gt: hace30Dias },
        OR: [
          { creadorId: yoId },
          { solicitudes: { some: { userId: yoId, estado: { in: ["pendiente", "aceptada"] } } } },
        ],
      },
      orderBy: { fechaHora: "asc" },
      include: INCLUDE,
    }),
    cargarRelaciones(yoId),
  ]);
  const vistas = filas.map((c) => vista(c, yoId, relaciones, ahora));
  return {
    proximas: vistas.filter((v) => !v.pasada),
    porRegistrar: vistas.filter((v) => v.puedeRegistrarResultado),
  };
}

export async function cargarConvocatoria(yoId: string, id: string): Promise<ConvocatoriaVista | null> {
  const [c, relaciones] = await Promise.all([
    prisma.convocatoria.findUnique({ where: { id }, include: INCLUDE }),
    cargarRelaciones(yoId),
  ]);
  if (!c || !visible(c, yoId, relaciones)) return null;
  return vista(c, yoId, relaciones, new Date());
}

/** Pide una plaza. Quien la publicó decide si la acepta. */
export async function solicitarPlaza(
  yoId: string,
  id: string,
  mensaje: unknown,
): Promise<{ ok: true } | Fallo> {
  const [c, relaciones] = await Promise.all([
    prisma.convocatoria.findUnique({ where: { id }, include: INCLUDE }),
    cargarRelaciones(yoId),
  ]);
  if (!c || !visible(c, yoId, relaciones)) return fallo(404, "Este partido ya no está disponible.");
  if (c.creadorId === yoId) return fallo(400, "Es tu propio partido.");
  if (c.estado !== "abierta" || c.fechaHora.getTime() <= Date.now()) {
    return fallo(409, "Este partido ya no busca jugadores.");
  }
  const previa = c.solicitudes.find((s) => s.userId === yoId);
  if (previa) {
    return previa.estado === "rechazada"
      ? fallo(409, "No hay plaza para ti en este partido.")
      : fallo(409, "Ya has pedido plaza en este partido.");
  }
  const texto = typeof mensaje === "string" ? mensaje.trim().slice(0, MENSAJE_SOLICITUD_MAX) : "";
  await prisma.solicitudConvocatoria.create({
    data: { convocatoriaId: id, userId: yoId, mensaje: texto || null },
  });
  return { ok: true };
}

/** Retira la solicitud o, si ya estaba aceptado, deja libre su plaza. */
export async function retirarSolicitud(yoId: string, id: string): Promise<{ ok: true } | Fallo> {
  const solicitud = await prisma.solicitudConvocatoria.findUnique({
    where: { convocatoriaId_userId: { convocatoriaId: id, userId: yoId } },
    select: { estado: true },
  });
  if (!solicitud) return fallo(404, "No tenías plaza ni solicitud en este partido.");
  await prisma.$transaction([
    prisma.solicitudConvocatoria.delete({
      where: { convocatoriaId_userId: { convocatoriaId: id, userId: yoId } },
    }),
    // Si estaba completa, vuelve a buscar jugadores (salvo que ya haya pasado)
    prisma.convocatoria.updateMany({
      where: { id, estado: "completa", fechaHora: { gt: new Date() }, partidoId: null },
      data: { estado: "abierta" },
    }),
  ]);
  return { ok: true };
}

/** Quien publicó la convocatoria acepta o rechaza a un jugador. */
export async function responderSolicitud(
  yoId: string,
  id: string,
  username: string,
  accion: "aceptar" | "rechazar",
): Promise<{ ok: true; estado: EstadoConvocatoria } | Fallo> {
  const c = await prisma.convocatoria.findUnique({
    where: { id },
    select: { creadorId: true, estado: true, plazas: true, fechaHora: true },
  });
  if (!c || c.creadorId !== yoId) return fallo(404, "Partido no encontrado.");
  if (c.estado === "cancelada" || c.fechaHora.getTime() <= Date.now()) {
    return fallo(409, "Este partido ya no admite cambios.");
  }
  const jugador = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  if (!jugador) return fallo(404, "Jugador no encontrado.");

  if (accion === "rechazar") {
    const cambiada = await prisma.solicitudConvocatoria.updateMany({
      where: { convocatoriaId: id, userId: jugador.id, estado: "pendiente" },
      data: { estado: "rechazada" },
    });
    if (cambiada.count !== 1) return fallo(409, "Esa solicitud ya no está pendiente.");
    return { ok: true, estado: c.estado as EstadoConvocatoria };
  }

  try {
    const estado = await prisma.$transaction(async (tx) => {
      // Primero se escribe: así dos aceptaciones a la vez no pueden pasarse de plazas
      const cambiada = await tx.solicitudConvocatoria.updateMany({
        where: { convocatoriaId: id, userId: jugador.id, estado: "pendiente" },
        data: { estado: "aceptada" },
      });
      if (cambiada.count !== 1) throw new SinPlazas("Esa solicitud ya no está pendiente.");
      const aceptadas = await tx.solicitudConvocatoria.count({
        where: { convocatoriaId: id, estado: "aceptada" },
      });
      if (aceptadas > c.plazas) throw new SinPlazas("Ya no quedan plazas libres.");
      const nuevo: EstadoConvocatoria = aceptadas === c.plazas ? "completa" : "abierta";
      await tx.convocatoria.update({ where: { id }, data: { estado: nuevo } });
      return nuevo;
    });
    return { ok: true, estado };
  } catch (error) {
    if (error instanceof SinPlazas) return fallo(409, error.message);
    throw error;
  }
}

/** Quien la publicó la cancela (los jugadores aceptados lo verán como cancelada). */
export async function cancelarConvocatoria(yoId: string, id: string): Promise<{ ok: true } | Fallo> {
  const cambiada = await prisma.convocatoria.updateMany({
    where: { id, creadorId: yoId, estado: { not: "cancelada" }, fechaHora: { gt: new Date() } },
    data: { estado: "cancelada" },
  });
  if (cambiada.count === 1) return { ok: true };
  const existe = await prisma.convocatoria.findFirst({ where: { id, creadorId: yoId }, select: { id: true } });
  return existe
    ? fallo(409, "Este partido ya no se puede cancelar.")
    : fallo(404, "Partido no encontrado.");
}

/**
 * Jugadores de una convocatoria completa, para registrar su resultado: quien la publicó
 * y los aceptados. null si el usuario no puede registrarlo.
 */
export async function jugadoresParaResultado(
  yoId: string,
  id: string,
): Promise<{ modalidad: Modalidad; fechaHora: Date; lugar: string; jugadores: Persona[] } | null> {
  const c = await prisma.convocatoria.findUnique({ where: { id }, include: INCLUDE });
  if (
    !c ||
    c.creadorId !== yoId ||
    c.estado !== "completa" ||
    c.partidoId ||
    !puedeRegistrarResultado(c.fechaHora)
  ) {
    return null;
  }
  return {
    modalidad: c.modalidad === "dobles" ? "dobles" : "individual",
    fechaHora: c.fechaHora,
    lugar: c.lugar,
    jugadores: c.solicitudes.filter((s) => s.estado === "aceptada").map((s) => s.user),
  };
}

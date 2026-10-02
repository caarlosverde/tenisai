// Amistades y bloqueos de un usuario (servidor).
import { prisma } from "@/lib/prisma";
import type { EstadoRelacion } from "@/lib/comunidad/tipos";

export type Relaciones = {
  amigos: Set<string>;
  /** Relación con otro usuario por su id. */
  estado(otroId: string): EstadoRelacion;
};

/** Carga de una vez todas las amistades y bloqueos en los que participa el usuario. */
export async function cargarRelaciones(yoId: string): Promise<Relaciones> {
  const [amistades, bloqueos] = await Promise.all([
    prisma.amistad.findMany({
      where: { OR: [{ solicitanteId: yoId }, { receptorId: yoId }] },
      select: { solicitanteId: true, receptorId: true, estado: true },
    }),
    prisma.bloqueo.findMany({
      where: { OR: [{ autorId: yoId }, { bloqueadoId: yoId }] },
      select: { autorId: true, bloqueadoId: true },
    }),
  ]);

  const amigos = new Set<string>();
  const enviadas = new Set<string>();
  const recibidas = new Set<string>();
  for (const a of amistades) {
    const otro = a.solicitanteId === yoId ? a.receptorId : a.solicitanteId;
    if (a.estado === "aceptada") amigos.add(otro);
    else if (a.solicitanteId === yoId) enviadas.add(otro);
    else recibidas.add(otro);
  }
  const bloqueados = new Set(bloqueos.filter((b) => b.autorId === yoId).map((b) => b.bloqueadoId));
  const meBloquean = new Set(bloqueos.filter((b) => b.bloqueadoId === yoId).map((b) => b.autorId));

  return {
    amigos,
    estado(otroId) {
      if (otroId === yoId) return "yo";
      if (bloqueados.has(otroId)) return "bloqueado";
      if (meBloquean.has(otroId)) return "te_bloquea";
      if (amigos.has(otroId)) return "amigos";
      if (enviadas.has(otroId)) return "enviada";
      if (recibidas.has(otroId)) return "recibida";
      return "ninguna";
    },
  };
}

export function hayBloqueo(relacion: EstadoRelacion): boolean {
  return relacion === "bloqueado" || relacion === "te_bloquea";
}

/** Un perfil lo ven su dueño y sus amigos; el resto, solo si es público y no hay bloqueo. */
export function puedeVerPerfil(relacion: EstadoRelacion, perfilPublico: boolean): boolean {
  if (relacion === "yo" || relacion === "amigos") return true;
  return !hayBloqueo(relacion) && perfilPublico;
}

/** Se puede apuntar en un partido a los amigos y a los jugadores con perfil público. */
export function puedeJugarCon(relacion: EstadoRelacion, perfilPublico: boolean): boolean {
  return relacion !== "yo" && puedeVerPerfil(relacion, perfilPublico);
}

/**
 * Lo que espera una respuesta del usuario: solicitudes de amistad, partidos por confirmar
 * y jugadores que piden plaza en sus convocatorias.
 */
export async function contarPendientes(
  yoId: string,
): Promise<{ solicitudes: number; partidos: number; convocatorias: number; torneos: number }> {
  const [solicitudes, partidos, convocatorias, torneos] = await Promise.all([
    prisma.amistad.count({ where: { receptorId: yoId, estado: "pendiente" } }),
    prisma.partido.count({
      where: { estado: "pendiente", jugadores: { some: { userId: yoId, equipo: 2 } } },
    }),
    prisma.solicitudConvocatoria.count({
      where: {
        estado: "pendiente",
        convocatoria: { creadorId: yoId, estado: "abierta", fechaHora: { gt: new Date() } },
      },
    }),
    // Invitaciones para jugar un torneo de dobles de pareja
    prisma.inscripcionTorneo.count({
      where: { companeroId: yoId, estado: "pendiente_companero", torneo: { estado: "inscripcion" } },
    }),
  ]);
  return { solicitudes, partidos, convocatorias, torneos };
}

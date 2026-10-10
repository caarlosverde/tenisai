import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { leerSets } from "@/lib/comunidad/marcador";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Descarga de todos los datos del usuario en JSON (RGPD, derecho de portabilidad). */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "No autenticado." }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        username: true,
        nombre: true,
        apellidos: true,
        edad: true,
        altura: true,
        peso: true,
        lateralidad: true,
        estiloReves: true,
        estiloDerecha: true,
        codoDerecha: true,
        privacidadAceptadaEn: true,
        createdAt: true,
        perfilPublico: true,
        ciudad: true,
        club: true,
        nivel: true,
        disponibilidad: true,
        bio: true,
        puntosIndividual: true,
        partidosIndividual: true,
        victoriasIndividual: true,
        puntosDobles: true,
        partidosDobles: true,
        victoriasDobles: true,
        amistadesEnviadas: {
          select: { estado: true, creadaEn: true, aceptadaEn: true, receptor: { select: { username: true } } },
        },
        amistadesRecibidas: {
          select: { estado: true, creadaEn: true, aceptadaEn: true, solicitante: { select: { username: true } } },
        },
        bloqueosHechos: { select: { creadoEn: true, bloqueado: { select: { username: true } } } },
        denunciasHechas: {
          select: { motivo: true, detalle: true, creadaEn: true, denunciado: { select: { username: true } } },
        },
        convocatorias: {
          orderBy: { fechaHora: "asc" },
          select: {
            modalidad: true,
            fechaHora: true,
            lugar: true,
            ciudad: true,
            nivel: true,
            plazas: true,
            comentario: true,
            estado: true,
            creadaEn: true,
          },
        },
        torneosOrganizados: {
          orderBy: { inicio: "asc" },
          select: { nombre: true, modalidad: true, inicio: true, lugar: true, ciudad: true, estado: true, plazas: true },
        },
        inscripcionesTorneo: {
          select: {
            estado: true,
            creadaEn: true,
            torneo: { select: { nombre: true, inicio: true } },
            companero: { select: { username: true } },
          },
        },
        inscripcionesCompanero: {
          select: {
            estado: true,
            creadaEn: true,
            torneo: { select: { nombre: true, inicio: true } },
            user: { select: { username: true } },
          },
        },
        solicitudesConvocatoria: {
          orderBy: { creadaEn: "asc" },
          select: {
            estado: true,
            mensaje: true,
            creadaEn: true,
            convocatoria: { select: { fechaHora: true, lugar: true, creador: { select: { username: true } } } },
          },
        },
        participaciones: {
          orderBy: { partido: { jugadoEn: "asc" } },
          select: {
            equipo: true,
            puntosAntes: true,
            puntosDespues: true,
            partido: {
              select: {
                modalidad: true,
                jugadoEn: true,
                lugar: true,
                sets: true,
                ganador: true,
                estado: true,
                jugadores: { select: { equipo: true, user: { select: { username: true } } } },
              },
            },
          },
        },
        analisis: {
          orderBy: { fecha: "asc" },
          select: {
            fecha: true,
            videoNombre: true,
            puntuacion: true,
            tipoGolpe: true,
            resumen: true,
            detalles: true,
            jobId: true,
          },
        },
      },
    });
    if (!user) {
      return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });
    }

    const {
      analisis,
      amistadesEnviadas,
      amistadesRecibidas,
      bloqueosHechos,
      denunciasHechas,
      participaciones,
      convocatorias,
      solicitudesConvocatoria,
      torneosOrganizados,
      inscripcionesTorneo,
      inscripcionesCompanero,
      ...cuenta
    } = user;
    const exportacion = {
      exportadoEn: new Date().toISOString(),
      cuenta,
      comunidad: {
        amistades: [
          ...amistadesEnviadas.map(({ receptor, ...a }) => ({ ...a, con: receptor.username, laEnvie: true })),
          ...amistadesRecibidas.map(({ solicitante, ...a }) => ({ ...a, con: solicitante.username, laEnvie: false })),
        ],
        bloqueos: bloqueosHechos.map((b) => ({ creadoEn: b.creadoEn, usuario: b.bloqueado.username })),
        denuncias: denunciasHechas.map(({ denunciado, ...d }) => ({ ...d, usuario: denunciado.username })),
        partidosPublicados: convocatorias,
        torneosOrganizados,
        torneos: [
          ...inscripcionesTorneo.map(({ torneo, companero, ...i }) => ({
            ...i,
            torneo: torneo.nombre,
            inicio: torneo.inicio,
            pareja: companero?.username ?? null,
          })),
          ...inscripcionesCompanero.map(({ torneo, user: titular, ...i }) => ({
            ...i,
            torneo: torneo.nombre,
            inicio: torneo.inicio,
            pareja: titular.username,
          })),
        ],
        plazasPedidas: solicitudesConvocatoria.map(({ convocatoria, ...s }) => ({
          ...s,
          fechaHora: convocatoria.fechaHora,
          lugar: convocatoria.lugar,
          publicadoPor: convocatoria.creador.username,
        })),
        partidos: participaciones.map(({ partido, ...p }) => ({
          ...p,
          modalidad: partido.modalidad,
          jugadoEn: partido.jugadoEn,
          lugar: partido.lugar,
          sets: leerSets(partido.sets),
          ganador: partido.ganador,
          estado: partido.estado,
          jugadores: partido.jugadores.map((j) => ({
            equipo: j.equipo,
            usuario: j.user?.username ?? null,
          })),
        })),
      },
      analisis: analisis.map(({ detalles, ...resto }) => {
        let detallesJson: unknown = detalles;
        try {
          detallesJson = detalles ? JSON.parse(detalles) : null;
        } catch {
          // Se deja el texto tal cual
        }
        return { ...resto, detalles: detallesJson };
      }),
    };

    const fecha = new Date().toISOString().slice(0, 10);
    return new NextResponse(JSON.stringify(exportacion, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="tenisai-mis-datos-${fecha}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Error en GET /api/auth/me/exportar:", error);
    return NextResponse.json(
      { error: "No se pudieron exportar tus datos." },
      { status: 500 },
    );
  }
}

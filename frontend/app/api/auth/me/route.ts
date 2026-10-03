import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { AUTH_COOKIE_NAME, AUTH_COOKIE_OPTIONS, getSession } from "@/lib/auth";
import { borrarArchivosAnalisis } from "@/lib/backend";
import { prisma } from "@/lib/prisma";
import { validarPerfilJugador, type PerfilJugador } from "@/lib/comunidad/perfil";
import { limiteConfirmacion, registrarIntento, segundosBloqueado } from "@/lib/rateLimit";
import { validarDatosPersonales } from "@/lib/validacionPerfil";

export const dynamic = "force-dynamic";

const USER_SELECT = {
  id: true,
  username: true,
  nombre: true,
  apellidos: true,
  edad: true,
  altura: true,
  peso: true,
  lateralidad: true,
  estiloReves: true,
  estiloDerecha: true,
  createdAt: true,
  perfilPublico: true,
  ciudad: true,
  club: true,
  nivel: true,
  disponibilidad: true,
  bio: true,
} as const;

export async function GET() {
  try {
    const session = await getSession();
    // Visitante anónimo: no es un error, simplemente no hay sesión
    if (!session) {
      return NextResponse.json({ user: null }, { status: 200 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: USER_SELECT,
    });

    return NextResponse.json({ user: user ?? null }, { status: 200 });
  } catch (error) {
    console.error("Error en /api/auth/me:", error);
    return NextResponse.json(
      { error: "No se pudo validar la sesión." },
      { status: 500 },
    );
  }
}

type PatchBody = {
  lateralidad?: string;
  estiloReves?: string;
  estiloDerecha?: string;
  nombre?: string;
  apellidos?: string;
  edad?: number | string;
  altura?: number | string;
  peso?: number | string;
};

/** Actualiza las preferencias de juego y/o los datos personales del usuario. */
export async function PATCH(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "No autenticado." }, { status: 401 });
    }

    const body = (await request.json()) as PatchBody;
    const data: {
      lateralidad?: string;
      estiloReves?: string;
      estiloDerecha?: string;
      nombre?: string;
      apellidos?: string;
      edad?: number;
      altura?: number;
      peso?: number;
    } & Partial<PerfilJugador> = {};

    if (body.lateralidad !== undefined) {
      if (!["diestro", "zurdo"].includes(body.lateralidad)) {
        return NextResponse.json(
          { error: "lateralidad debe ser 'diestro' o 'zurdo'." },
          { status: 400 },
        );
      }
      data.lateralidad = body.lateralidad;
    }

    if (body.estiloReves !== undefined) {
      if (!["1_mano", "2_manos"].includes(body.estiloReves)) {
        return NextResponse.json(
          { error: "estiloReves debe ser '1_mano' o '2_manos'." },
          { status: 400 },
        );
      }
      data.estiloReves = body.estiloReves;
    }

    if (body.estiloDerecha !== undefined) {
      if (!["tradicional", "nadal"].includes(body.estiloDerecha)) {
        return NextResponse.json(
          { error: "estiloDerecha debe ser 'tradicional' o 'nadal'." },
          { status: 400 },
        );
      }
      data.estiloDerecha = body.estiloDerecha;
    }

    const personales = validarDatosPersonales(body, false);
    if (!personales.ok) {
      return NextResponse.json({ error: personales.error }, { status: 400 });
    }
    Object.assign(data, personales.datos);

    const jugador = validarPerfilJugador(body as Record<string, unknown>);
    if (!jugador.ok) {
      return NextResponse.json({ error: jugador.error }, { status: 400 });
    }
    Object.assign(data, jugador.datos);

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "No hay datos que actualizar." },
        { status: 400 },
      );
    }

    const user = await prisma.user.update({
      where: { id: session.userId },
      data,
      select: USER_SELECT,
    });

    return NextResponse.json({ user }, { status: 200 });
  } catch (error) {
    console.error("Error en PATCH /api/auth/me:", error);
    return NextResponse.json(
      { error: "No se pudieron guardar los cambios." },
      { status: 500 },
    );
  }
}

/**
 * Borra la cuenta y todos sus datos (RGPD, derecho de supresión):
 * vídeos del backend, análisis, vídeos antiguos y el propio usuario.
 * Pide la contraseña para confirmar.
 */
export async function DELETE(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "No autenticado." }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as { password?: string };
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, passwordHash: true },
    });
    if (!user) {
      return NextResponse.json({ error: "La cuenta ya no existe." }, { status: 404 });
    }

    const limite = limiteConfirmacion(user.id);
    const espera = segundosBloqueado(limite);
    if (espera > 0) {
      return NextResponse.json(
        { error: "Demasiados intentos. Espera unos minutos antes de volver a probar." },
        { status: 429, headers: { "Retry-After": String(espera) } },
      );
    }

    const passwordOk =
      typeof body.password === "string" &&
      (await bcrypt.compare(body.password, user.passwordHash));
    if (!passwordOk) {
      registrarIntento(limite);
      return NextResponse.json({ error: "La contraseña no es correcta." }, { status: 403 });
    }

    // Primero los vídeos: si el backend no responde, no se borra nada de la BD
    const conArchivos = await prisma.analisis.findMany({
      where: { userId: user.id, jobId: { not: null } },
      select: { jobId: true },
    });
    try {
      for (const { jobId } of conArchivos) {
        if (jobId) await borrarArchivosAnalisis(jobId, user.id);
      }
    } catch (error) {
      console.error("No se pudieron borrar los vídeos de la cuenta:", error);
      return NextResponse.json(
        { error: "No se pudieron borrar tus vídeos. Comprueba que el motor de análisis está en marcha e inténtalo de nuevo." },
        { status: 502 },
      );
    }

    // Los análisis, amistades y bloqueos se borran en cascada con el usuario. Los
    // partidos confirmados siguen en el historial de los demás ("Cuenta eliminada");
    // los que aún no contaban se retiran, y los que se quedan sin ningún jugador, también
    await prisma.$transaction([
      prisma.partido.deleteMany({
        where: { estado: { not: "confirmado" }, jugadores: { some: { userId: user.id } } },
      }),
      prisma.user.delete({ where: { id: user.id } }),
      prisma.partido.deleteMany({ where: { jugadores: { none: { userId: { not: null } } } } }),
    ]);

    const response = new NextResponse(null, { status: 204 });
    response.cookies.set(AUTH_COOKIE_NAME, "", {
      ...AUTH_COOKIE_OPTIONS,
      maxAge: 0,
      expires: new Date(0),
    });
    return response;
  } catch (error) {
    console.error("Error en DELETE /api/auth/me:", error);
    return NextResponse.json(
      { error: "No se pudo borrar la cuenta." },
      { status: 500 },
    );
  }
}

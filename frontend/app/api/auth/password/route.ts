import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getSession, setSessionCookie } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  limiteConfirmacion,
  limpiarIntentos,
  registrarIntento,
  segundosBloqueado,
} from "@/lib/rateLimit";
import { validarPasswordNueva } from "@/lib/validacionPerfil";

export const dynamic = "force-dynamic";

type PasswordBody = {
  actual?: string;
  nueva?: string;
};

/** Cambia la contraseña comprobando antes la actual. */
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "No autenticado." }, { status: 401 });
    }

    const body = (await request.json()) as PasswordBody;
    const errorNueva = validarPasswordNueva(body.nueva);
    if (errorNueva) {
      return NextResponse.json({ error: errorNueva }, { status: 400 });
    }

    const limite = limiteConfirmacion(session.userId);
    const espera = segundosBloqueado(limite);
    if (espera > 0) {
      return NextResponse.json(
        { error: "Demasiados intentos. Espera unos minutos antes de volver a probar." },
        { status: 429, headers: { "Retry-After": String(espera) } },
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { passwordHash: true },
    });
    const actualOk =
      user !== null &&
      typeof body.actual === "string" &&
      (await bcrypt.compare(body.actual, user.passwordHash));
    if (!actualOk) {
      registrarIntento(limite);
      return NextResponse.json(
        { error: "La contraseña actual no es correcta." },
        { status: 403 },
      );
    }

    if (body.actual === body.nueva) {
      return NextResponse.json(
        { error: "La contraseña nueva debe ser distinta de la actual." },
        { status: 400 },
      );
    }

    // Nueva versión de sesión: se cierran las sesiones abiertas en otros dispositivos
    const actualizado = await prisma.user.update({
      where: { id: session.userId },
      data: {
        passwordHash: await bcrypt.hash(body.nueva as string, 10),
        sesionVersion: { increment: 1 },
      },
      select: { id: true, username: true, sesionVersion: true },
    });
    limpiarIntentos(limite[0].clave);

    // Este dispositivo sigue dentro con una sesión de la versión nueva
    const response = NextResponse.json(
      { mensaje: "Contraseña actualizada. Se han cerrado las sesiones de otros dispositivos." },
      { status: 200 },
    );
    await setSessionCookie(response, actualizado);
    return response;
  } catch (error) {
    console.error("Error en POST /api/auth/password:", error);
    return NextResponse.json(
      { error: "No se pudo cambiar la contraseña." },
      { status: 500 },
    );
  }
}

import { SignJWT } from "jose";
import { cookies } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import type { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AUTH_COOKIE_NAME, getJwtSecret, verifyAuthToken } from "@/lib/authToken";

export {
  AUTH_COOKIE_NAME,
  verifyAuthToken,
  type AuthTokenPayload,
} from "@/lib/authToken";

const SEVEN_DAYS_SECONDS = 60 * 60 * 24 * 7;

export const AUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SEVEN_DAYS_SECONDS,
};

export type SessionUser = {
  id: string;
  username: string;
  nombre: string;
};

/** Firma un JWT para el usuario y lo deja en la cookie de sesión de la respuesta. */
export async function setSessionCookie(
  response: NextResponse,
  user: { id: string; username: string; sesionVersion: number },
): Promise<void> {
  const token = await new SignJWT({
    id: user.id,
    username: user.username,
    sv: user.sesionVersion,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getJwtSecret());

  response.cookies.set(AUTH_COOKIE_NAME, token, AUTH_COOKIE_OPTIONS);
}

/**
 * Comprueba la cookie de sesión: firma válida y misma versión de sesión que en la
 * base de datos (cambiar la contraseña invalida las sesiones anteriores).
 */
async function sesionValida(): Promise<{ userId: string; token: string } | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  if (!token) return null;

  const payload = await verifyAuthToken(token);
  if (!payload) return null;

  const user = await prisma.user.findUnique({
    where: { id: payload.id },
    select: { sesionVersion: true },
  });
  if (!user || user.sesionVersion !== payload.sv) return null;

  return { userId: payload.id, token };
}

/** Sesión de la petición actual (id del usuario y su token), o null si no hay. */
export async function getSession(): Promise<{ userId: string; token: string } | null> {
  return sesionValida();
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  try {
    const session = await sesionValida();
    if (!session) return null;
    return await prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, username: true, nombre: true },
    });
  } catch (error) {
    // Los avisos internos de Next (p. ej. que la página es dinámica por leer cookies)
    // no son errores de la aplicación: se relanzan para que Next los gestione
    unstable_rethrow(error);
    console.error("No se pudo leer la sesión:", error);
    return null;
  }
}

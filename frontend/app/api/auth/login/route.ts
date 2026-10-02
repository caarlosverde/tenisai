import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { setSessionCookie } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  ipCliente,
  limpiarIntentos,
  registrarIntento,
  segundosBloqueado,
} from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

type LoginBody = {
  username?: string;
  password?: string;
};

const QUINCE_MINUTOS = 15 * 60 * 1000;

/**
 * Tres límites que se complementan:
 * - IP + usuario: frena a quien prueba contraseñas contra una cuenta.
 * - Usuario: tope aunque el atacante cambie de IP (a costa de un bloqueo temporal).
 * - IP: frena a quien prueba muchas cuentas desde el mismo sitio.
 */
function limitesLogin(ip: string, username: string) {
  const usuario = username.toLowerCase();
  return [
    { clave: `login:ip-usuario:${ip}:${usuario}`, maxIntentos: 5, ventanaMs: QUINCE_MINUTOS },
    { clave: `login:usuario:${usuario}`, maxIntentos: 10, ventanaMs: QUINCE_MINUTOS },
    { clave: `login:ip:${ip}`, maxIntentos: 30, ventanaMs: QUINCE_MINUTOS },
  ];
}

// Hash de relleno: se compara aunque el usuario no exista para que el tiempo de
// respuesta no revele qué nombres de usuario están registrados.
let hashDeRelleno: Promise<string> | null = null;
function obtenerHashDeRelleno(): Promise<string> {
  hashDeRelleno ??= bcrypt.hash("tenisai-usuario-inexistente", 10);
  return hashDeRelleno;
}

function demasiadosIntentos(segundos: number) {
  const minutos = Math.max(1, Math.ceil(segundos / 60));
  return NextResponse.json(
    {
      error: `Demasiados intentos fallidos. Vuelve a intentarlo en ${minutos} ${
        minutos === 1 ? "minuto" : "minutos"
      }.`,
    },
    { status: 429, headers: { "Retry-After": String(segundos) } },
  );
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as LoginBody;
    const username = body.username?.trim() ?? "";
    const password = body.password ?? "";

    if (!username || !password) {
      return NextResponse.json(
        { error: "Usuario y contraseña son obligatorios." },
        { status: 400 },
      );
    }

    const ip = ipCliente(request);
    const limites = limitesLogin(ip, username);
    const espera = segundosBloqueado(limites);
    if (espera > 0) {
      return demasiadosIntentos(espera);
    }

    const user = await prisma.user.findUnique({
      where: { username },
    });

    const passwordOk = await bcrypt.compare(
      password,
      user?.passwordHash ?? (await obtenerHashDeRelleno()),
    );

    if (!user || !passwordOk) {
      registrarIntento(limites);
      return NextResponse.json(
        { error: "Credenciales incorrectas." },
        { status: 401 },
      );
    }

    // Solo se limpia el contador de esta cuenta desde esta IP: acertar con una
    // cuenta propia no debe reiniciar el límite global de la IP.
    limpiarIntentos(limites[0].clave);

    const response = NextResponse.json(
      {
        mensaje: "Inicio de sesión correcto",
        user: {
          id: user.id,
          username: user.username,
          nombre: user.nombre,
        },
      },
      { status: 200 },
    );
    await setSessionCookie(response, user);
    return response;
  } catch (error) {
    console.error("Error en /api/auth/login:", error);
    return NextResponse.json(
      { error: "No se pudo completar el inicio de sesión." },
      { status: 500 },
    );
  }
}

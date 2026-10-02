import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { setSessionCookie } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  USERNAME_REGEX,
  validarDatosPersonales,
  validarPasswordNueva,
} from "@/lib/validacionPerfil";

export const dynamic = "force-dynamic";

type RegistroBody = {
  username?: string;
  password?: string;
  nombre?: string;
  apellidos?: string;
  edad?: number | string;
  altura?: number | string;
  peso?: number | string;
  aceptaPrivacidad?: boolean;
};

function badRequest(error: string) {
  return NextResponse.json({ error }, { status: 400 });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RegistroBody;

    const username = body.username?.trim() ?? "";
    const password = body.password ?? "";

    if (!username || !password) {
      return badRequest("Rellena todos los campos obligatorios.");
    }
    if (!USERNAME_REGEX.test(username)) {
      return badRequest(
        "El usuario debe tener 3-30 caracteres: letras, números, '_', '.' o '-'.",
      );
    }
    const errorPassword = validarPasswordNueva(password);
    if (errorPassword) return badRequest(errorPassword);

    const personales = validarDatosPersonales(body, true);
    if (!personales.ok) return badRequest(personales.error);
    const { nombre, apellidos, edad, altura, peso } = personales.datos as Required<
      typeof personales.datos
    >;

    if (body.aceptaPrivacidad !== true) {
      return badRequest("Debes aceptar la política de privacidad para crear la cuenta.");
    }

    const existente = await prisma.user.findUnique({
      where: { username },
    });

    if (existente) {
      return NextResponse.json(
        { error: "El nombre de usuario ya está registrado." },
        { status: 409 },
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        username,
        passwordHash,
        nombre,
        apellidos,
        edad,
        altura,
        peso,
        privacidadAceptadaEn: new Date(),
      },
      select: {
        id: true,
        username: true,
        nombre: true,
        sesionVersion: true,
      },
    });

    // Tras registrarse, el usuario queda con la sesión iniciada
    const response = NextResponse.json(
      {
        mensaje: "Cuenta creada correctamente",
        user: { id: user.id, username: user.username, nombre: user.nombre },
      },
      { status: 201 },
    );
    await setSessionCookie(response, user);
    return response;
  } catch (error) {
    console.error("Error en /api/auth/registro:", error);
    return NextResponse.json(
      { error: "No se pudo completar el registro." },
      { status: 500 },
    );
  }
}

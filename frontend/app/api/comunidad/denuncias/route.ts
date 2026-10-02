import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DETALLE_DENUNCIA_MAX, esMotivoDenuncia } from "@/lib/comunidad/denuncias";
import { limiteDiario, registrarIntento, segundosBloqueado } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

const DENUNCIAS_POR_DIA = 10;

/** Guarda una denuncia sobre un jugador para que la revise quien administra TenisAI. */
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
    const yoId = session.userId;

    const body = (await request.json().catch(() => ({}))) as {
      username?: unknown;
      motivo?: unknown;
      detalle?: unknown;
    };
    if (!esMotivoDenuncia(body.motivo)) {
      return NextResponse.json({ error: "Elige un motivo." }, { status: 400 });
    }
    const detalle =
      typeof body.detalle === "string" ? body.detalle.trim().slice(0, DETALLE_DENUNCIA_MAX) : "";

    const denunciado =
      typeof body.username === "string"
        ? await prisma.user.findUnique({ where: { username: body.username }, select: { id: true } })
        : null;
    if (!denunciado) return NextResponse.json({ error: "Jugador no encontrado." }, { status: 404 });
    if (denunciado.id === yoId) {
      return NextResponse.json({ error: "No puedes denunciarte a ti mismo." }, { status: 400 });
    }

    const limite = limiteDiario("denuncia", yoId, DENUNCIAS_POR_DIA);
    const espera = segundosBloqueado(limite);
    if (espera > 0) {
      return NextResponse.json(
        { error: "Has enviado muchas denuncias hoy. Vuelve a intentarlo mañana." },
        { status: 429, headers: { "Retry-After": String(espera) } },
      );
    }

    await prisma.denuncia.create({
      data: {
        autorId: yoId,
        denunciadoId: denunciado.id,
        motivo: body.motivo as string,
        detalle: detalle || null,
      },
    });
    registrarIntento(limite);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    console.error("Error en POST /api/comunidad/denuncias:", error);
    return NextResponse.json({ error: "No se pudo enviar la denuncia." }, { status: 500 });
  }
}

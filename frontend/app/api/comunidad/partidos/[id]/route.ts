import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { confirmarPartido, rechazarPartido, retirarPartido } from "@/lib/comunidad/partidos";

export const dynamic = "force-dynamic";

type Contexto = { params: Promise<{ id: string }> };

/** Un rival confirma el resultado (cuenta para el ranking) o lo rechaza. */
export async function PATCH(request: Request, { params }: Contexto) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

    const { id } = await params;
    const { accion } = (await request.json().catch(() => ({}))) as { accion?: unknown };
    if (accion !== "confirmar" && accion !== "rechazar") {
      return NextResponse.json({ error: "La acción debe ser confirmar o rechazar." }, { status: 400 });
    }

    const resultado =
      accion === "confirmar"
        ? await confirmarPartido(id, session.userId)
        : await rechazarPartido(id, session.userId);
    if (!resultado.ok) {
      return NextResponse.json({ error: resultado.error }, { status: resultado.status });
    }
    return NextResponse.json({ estado: accion === "confirmar" ? "confirmado" : "rechazado" });
  } catch (error) {
    console.error("Error en PATCH /api/comunidad/partidos/[id]:", error);
    return NextResponse.json({ error: "No se pudo actualizar el partido." }, { status: 500 });
  }
}

/** Quien registró el partido lo retira mientras no esté confirmado. */
export async function DELETE(_request: Request, { params }: Contexto) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

    const { id } = await params;
    const resultado = await retirarPartido(id, session.userId);
    if (!resultado.ok) {
      return NextResponse.json({ error: resultado.error }, { status: resultado.status });
    }
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Error en DELETE /api/comunidad/partidos/[id]:", error);
    return NextResponse.json({ error: "No se pudo retirar el partido." }, { status: 500 });
  }
}

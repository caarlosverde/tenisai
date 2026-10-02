import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { cancelarConvocatoria } from "@/lib/comunidad/convocatorias";

export const dynamic = "force-dynamic";

type Contexto = { params: Promise<{ id: string }> };

/** Quien publicó la convocatoria la cancela. */
export async function PATCH(request: Request, { params }: Contexto) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

    const { id } = await params;
    const { accion } = (await request.json().catch(() => ({}))) as { accion?: unknown };
    if (accion !== "cancelar") {
      return NextResponse.json({ error: "Acción no válida." }, { status: 400 });
    }
    const resultado = await cancelarConvocatoria(session.userId, id);
    if (!resultado.ok) {
      return NextResponse.json({ error: resultado.error }, { status: resultado.status });
    }
    return NextResponse.json({ estado: "cancelada" });
  } catch (error) {
    console.error("Error en PATCH /api/comunidad/convocatorias/[id]:", error);
    return NextResponse.json({ error: "No se pudo cancelar el partido." }, { status: 500 });
  }
}

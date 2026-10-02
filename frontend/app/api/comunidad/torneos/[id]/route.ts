import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { cancelarTorneo, sortearCuadro } from "@/lib/comunidad/torneos";

export const dynamic = "force-dynamic";

type Contexto = { params: Promise<{ id: string }> };

/** El organizador cierra la inscripción y sortea el cuadro, o cancela el torneo. */
export async function PATCH(request: Request, { params }: Contexto) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

    const { id } = await params;
    const { accion } = (await request.json().catch(() => ({}))) as { accion?: unknown };
    if (accion !== "sortear" && accion !== "cancelar") {
      return NextResponse.json({ error: "La acción debe ser sortear o cancelar." }, { status: 400 });
    }
    const resultado =
      accion === "sortear" ? await sortearCuadro(session.userId, id) : await cancelarTorneo(session.userId, id);
    if (!resultado.ok) {
      return NextResponse.json({ error: resultado.error }, { status: resultado.status });
    }
    return NextResponse.json({ estado: accion === "sortear" ? "en_curso" : "cancelado" });
  } catch (error) {
    console.error("Error en PATCH /api/comunidad/torneos/[id]:", error);
    return NextResponse.json({ error: "No se pudo actualizar el torneo." }, { status: 500 });
  }
}

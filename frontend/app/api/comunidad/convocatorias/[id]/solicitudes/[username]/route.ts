import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { responderSolicitud } from "@/lib/comunidad/convocatorias";

export const dynamic = "force-dynamic";

type Contexto = { params: Promise<{ id: string; username: string }> };

/** Quien publicó la convocatoria acepta o rechaza a un jugador que ha pedido plaza. */
export async function PATCH(request: Request, { params }: Contexto) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

    const { id, username } = await params;
    const { accion } = (await request.json().catch(() => ({}))) as { accion?: unknown };
    if (accion !== "aceptar" && accion !== "rechazar") {
      return NextResponse.json({ error: "La acción debe ser aceptar o rechazar." }, { status: 400 });
    }
    const resultado = await responderSolicitud(session.userId, id, username, accion);
    if (!resultado.ok) {
      return NextResponse.json({ error: resultado.error }, { status: resultado.status });
    }
    return NextResponse.json({ estadoConvocatoria: resultado.estado });
  } catch (error) {
    console.error("Error en PATCH /api/comunidad/convocatorias/[id]/solicitudes/[username]:", error);
    return NextResponse.json({ error: "No se pudo responder a la solicitud." }, { status: 500 });
  }
}

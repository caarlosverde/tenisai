import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { retirarSolicitud, solicitarPlaza } from "@/lib/comunidad/convocatorias";
import { limiteDiario, registrarIntento, segundosBloqueado } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

const SOLICITUDES_POR_DIA = 30;

type Contexto = { params: Promise<{ id: string }> };

/** Pide plaza en una convocatoria (con un mensaje opcional para quien la publicó). */
export async function POST(request: Request, { params }: Contexto) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

    const limite = limiteDiario("pedir-plaza", session.userId, SOLICITUDES_POR_DIA);
    const espera = segundosBloqueado(limite);
    if (espera > 0) {
      return NextResponse.json(
        { error: "Has pedido plaza en muchos partidos hoy. Vuelve a intentarlo mañana." },
        { status: 429, headers: { "Retry-After": String(espera) } },
      );
    }

    const { id } = await params;
    const { mensaje } = (await request.json().catch(() => ({}))) as { mensaje?: unknown };
    const resultado = await solicitarPlaza(session.userId, id, mensaje);
    if (!resultado.ok) {
      return NextResponse.json({ error: resultado.error }, { status: resultado.status });
    }
    registrarIntento(limite);
    return NextResponse.json({ estado: "pendiente" }, { status: 201 });
  } catch (error) {
    console.error("Error en POST /api/comunidad/convocatorias/[id]/solicitudes:", error);
    return NextResponse.json({ error: "No se pudo pedir plaza." }, { status: 500 });
  }
}

/** Retira la solicitud propia o deja libre la plaza si ya estaba aceptado. */
export async function DELETE(_request: Request, { params }: Contexto) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

    const { id } = await params;
    const resultado = await retirarSolicitud(session.userId, id);
    if (!resultado.ok) {
      return NextResponse.json({ error: resultado.error }, { status: resultado.status });
    }
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Error en DELETE /api/comunidad/convocatorias/[id]/solicitudes:", error);
    return NextResponse.json({ error: "No se pudo retirar la solicitud." }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { inscribirse, responderInvitacion, retirarInscripcion } from "@/lib/comunidad/torneos";
import { limiteDiario, registrarIntento, segundosBloqueado } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

const INSCRIPCIONES_POR_DIA = 30;

type Contexto = { params: Promise<{ id: string }> };

/** Inscribe al usuario (en dobles, con la pareja que indique, que tendrá que aceptar). */
export async function POST(request: Request, { params }: Contexto) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

    const limite = limiteDiario("inscripcion-torneo", session.userId, INSCRIPCIONES_POR_DIA);
    const espera = segundosBloqueado(limite);
    if (espera > 0) {
      return NextResponse.json(
        { error: "Has hecho muchas inscripciones hoy. Vuelve a intentarlo mañana." },
        { status: 429, headers: { "Retry-After": String(espera) } },
      );
    }

    const { id } = await params;
    const { companero } = (await request.json().catch(() => ({}))) as { companero?: unknown };
    const resultado = await inscribirse(session.userId, id, companero);
    if (!resultado.ok) {
      return NextResponse.json({ error: resultado.error }, { status: resultado.status });
    }
    registrarIntento(limite);
    return NextResponse.json(
      { estado: resultado.pendiente ? "pendiente_companero" : "confirmada" },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error en POST /api/comunidad/torneos/[id]/inscripcion:", error);
    return NextResponse.json({ error: "No se pudo hacer la inscripción." }, { status: 500 });
  }
}

/** La pareja invitada acepta o rechaza la inscripción. */
export async function PATCH(request: Request, { params }: Contexto) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

    const { id } = await params;
    const { accion } = (await request.json().catch(() => ({}))) as { accion?: unknown };
    if (accion !== "aceptar" && accion !== "rechazar") {
      return NextResponse.json({ error: "La acción debe ser aceptar o rechazar." }, { status: 400 });
    }
    const resultado = await responderInvitacion(session.userId, id, accion);
    if (!resultado.ok) {
      return NextResponse.json({ error: resultado.error }, { status: resultado.status });
    }
    return NextResponse.json({ estado: accion === "aceptar" ? "confirmada" : "retirada" });
  } catch (error) {
    console.error("Error en PATCH /api/comunidad/torneos/[id]/inscripcion:", error);
    return NextResponse.json({ error: "No se pudo responder a la invitación." }, { status: 500 });
  }
}

/** Retira la inscripción mientras no se haya sorteado el cuadro. */
export async function DELETE(_request: Request, { params }: Contexto) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

    const { id } = await params;
    const resultado = await retirarInscripcion(session.userId, id);
    if (!resultado.ok) {
      return NextResponse.json({ error: resultado.error }, { status: resultado.status });
    }
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Error en DELETE /api/comunidad/torneos/[id]/inscripcion:", error);
    return NextResponse.json({ error: "No se pudo retirar la inscripción." }, { status: 500 });
  }
}

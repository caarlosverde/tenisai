import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { crearPartido, type DatosPartido } from "@/lib/comunidad/partidos";
import { limiteDiario, registrarIntento, segundosBloqueado } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

const PARTIDOS_POR_DIA = 20;

/** Registra un partido; queda pendiente hasta que un rival lo confirme. */
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

    const limite = limiteDiario("registrar-partido", session.userId, PARTIDOS_POR_DIA);
    const espera = segundosBloqueado(limite);
    if (espera > 0) {
      return NextResponse.json(
        { error: "Has registrado muchos partidos hoy. Vuelve a intentarlo mañana." },
        { status: 429, headers: { "Retry-After": String(espera) } },
      );
    }

    const datos = (await request.json().catch(() => ({}))) as DatosPartido;
    const resultado = await crearPartido(session.userId, datos);
    if (!resultado.ok) {
      return NextResponse.json({ error: resultado.error }, { status: resultado.status });
    }
    registrarIntento(limite);
    return NextResponse.json({ id: resultado.id }, { status: 201 });
  } catch (error) {
    console.error("Error en POST /api/comunidad/partidos:", error);
    return NextResponse.json({ error: "No se pudo registrar el partido." }, { status: 500 });
  }
}

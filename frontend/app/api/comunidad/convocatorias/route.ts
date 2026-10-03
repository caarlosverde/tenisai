import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { crearConvocatoria } from "@/lib/comunidad/convocatorias";
import { limiteDiario, registrarIntento, segundosBloqueado } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

const CONVOCATORIAS_POR_DIA = 10;

/** Publica una convocatoria de "Buscar partido". */
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

    const limite = limiteDiario("publicar-convocatoria", session.userId, CONVOCATORIAS_POR_DIA);
    const espera = segundosBloqueado(limite);
    if (espera > 0) {
      return NextResponse.json(
        { error: "Has publicado muchos partidos hoy. Vuelve a intentarlo mañana." },
        { status: 429, headers: { "Retry-After": String(espera) } },
      );
    }

    const entrada = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const resultado = await crearConvocatoria(session.userId, entrada);
    if (!resultado.ok) {
      return NextResponse.json({ error: resultado.error }, { status: resultado.status });
    }
    registrarIntento(limite);
    return NextResponse.json({ id: resultado.id }, { status: 201 });
  } catch (error) {
    console.error("Error en POST /api/comunidad/convocatorias:", error);
    return NextResponse.json({ error: "No se pudo publicar el partido." }, { status: 500 });
  }
}

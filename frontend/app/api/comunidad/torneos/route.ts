import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { crearTorneo } from "@/lib/comunidad/torneos";
import { limiteDiario, registrarIntento, segundosBloqueado } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

const TORNEOS_POR_DIA = 10;

/** Crea un torneo. Solo para cuentas de organizador (clubes). */
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

    const limite = limiteDiario("crear-torneo", session.userId, TORNEOS_POR_DIA);
    const espera = segundosBloqueado(limite);
    if (espera > 0) {
      return NextResponse.json(
        { error: "Has creado muchos torneos hoy. Vuelve a intentarlo mañana." },
        { status: 429, headers: { "Retry-After": String(espera) } },
      );
    }

    const entrada = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const resultado = await crearTorneo(session.userId, entrada);
    if (!resultado.ok) {
      return NextResponse.json({ error: resultado.error }, { status: resultado.status });
    }
    registrarIntento(limite);
    return NextResponse.json({ id: resultado.id }, { status: 201 });
  } catch (error) {
    console.error("Error en POST /api/comunidad/torneos:", error);
    return NextResponse.json({ error: "No se pudo crear el torneo." }, { status: 500 });
  }
}

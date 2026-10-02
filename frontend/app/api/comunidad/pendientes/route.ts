import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { contarPendientes } from "@/lib/comunidad/relaciones";

export const dynamic = "force-dynamic";

/** Avisos de la comunidad para la barra de navegación (solicitudes y partidos por confirmar). */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ solicitudes: 0, partidos: 0, convocatorias: 0, torneos: 0 });
    }
    return NextResponse.json(await contarPendientes(session.userId), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Error en GET /api/comunidad/pendientes:", error);
    return NextResponse.json({ error: "No se pudieron leer los avisos." }, { status: 500 });
  }
}

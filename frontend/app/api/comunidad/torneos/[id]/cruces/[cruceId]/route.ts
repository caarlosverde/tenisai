import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { anotarResultado } from "@/lib/comunidad/torneos";

export const dynamic = "force-dynamic";

type Contexto = { params: Promise<{ id: string; cruceId: string }> };

/**
 * El organizador anota el resultado de un cruce del cuadro: `{ sets }` (desde el lado de
 * arriba del cruce) o `{ noPresentado: "a" | "b" }` para un pase por incomparecencia.
 */
export async function POST(request: Request, { params }: Contexto) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

    const { id, cruceId } = await params;
    const entrada = (await request.json().catch(() => ({}))) as { sets?: unknown; noPresentado?: unknown };
    const resultado = await anotarResultado(session.userId, id, cruceId, entrada);
    if (!resultado.ok) {
      return NextResponse.json({ error: resultado.error }, { status: resultado.status });
    }
    return NextResponse.json({ finalizado: resultado.finalizado });
  } catch (error) {
    console.error("Error en POST /api/comunidad/torneos/[id]/cruces/[cruceId]:", error);
    return NextResponse.json({ error: "No se pudo anotar el resultado." }, { status: 500 });
  }
}

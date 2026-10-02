import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "No autenticado." }, { status: 401 });
    }

    const analisis = await prisma.analisis.findMany({
      where: { userId: session.userId },
      orderBy: { fecha: "desc" },
    });

    return NextResponse.json({ analisis }, { status: 200 });
  } catch (error) {
    console.error("Error en GET /api/analisis:", error);
    return NextResponse.json(
      { error: "No se pudo obtener el historial de análisis." },
      { status: 500 },
    );
  }
}

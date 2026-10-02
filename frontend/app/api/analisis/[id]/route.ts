import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { borrarArchivosAnalisis } from "@/lib/backend";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Borra un análisis del historial y, si los tiene, sus vídeos del backend. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "No autenticado." }, { status: 401 });
    }

    const { id } = await params;
    const analisis = await prisma.analisis.findFirst({
      where: { id, userId: session.userId },
      select: { id: true, jobId: true },
    });
    if (!analisis) {
      return NextResponse.json({ error: "Análisis no encontrado." }, { status: 404 });
    }

    // Primero los archivos: si el backend falla, la fila se conserva para reintentar
    if (analisis.jobId) {
      try {
        await borrarArchivosAnalisis(analisis.jobId, session.userId);
      } catch (error) {
        console.error("No se pudieron borrar los archivos del análisis:", error);
        return NextResponse.json(
          { error: "No se pudieron borrar los vídeos. Comprueba que el motor de análisis está en marcha." },
          { status: 502 },
        );
      }
    }

    await prisma.analisis.delete({ where: { id: analisis.id } });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Error en DELETE /api/analisis/[id]:", error);
    return NextResponse.json({ error: "No se pudo borrar el análisis." }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Mismo formato que genera el backend (uuid4().hex)
const JOB_ID_REGEX = /^[0-9a-f]{32}$/;

type GuardarBody = {
  jobId?: string;
  videoNombre?: string;
  puntuacion?: number;
  tipoGolpe?: string;
  resumen?: string;
  detalles?: string | Record<string, unknown> | null;
};

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "No autenticado." }, { status: 401 });
    }
    const userId = session.userId;

    const body = (await request.json()) as GuardarBody;
    const videoNombre =
      body.videoNombre?.trim() || "Análisis biomecánico";
    const puntuacion = Number(body.puntuacion);
    const tipoGolpe = body.tipoGolpe?.trim() || "Derecha";
    const resumen = body.resumen?.trim() || "";
    const jobId = body.jobId?.trim() || null;

    if (!Number.isFinite(puntuacion)) {
      return NextResponse.json(
        { error: "La puntuación es obligatoria." },
        { status: 400 },
      );
    }

    if (jobId !== null && !JOB_ID_REGEX.test(jobId)) {
      return NextResponse.json(
        { error: "Identificador de análisis inválido." },
        { status: 400 },
      );
    }

    // Idempotente: guardar dos veces el mismo análisis devuelve el ya existente
    if (jobId) {
      const existente = await prisma.analisis.findUnique({ where: { jobId } });
      if (existente) {
        return existente.userId === userId
          ? NextResponse.json({ analisis: existente }, { status: 200 })
          : NextResponse.json(
              { error: "Este análisis pertenece a otro usuario." },
              { status: 409 },
            );
      }
    }

    let detalles: string | null = null;
    if (typeof body.detalles === "string") {
      detalles = body.detalles;
    } else if (body.detalles && typeof body.detalles === "object") {
      detalles = JSON.stringify(body.detalles);
    }

    try {
      const analisis = await prisma.analisis.create({
        data: {
          userId,
          jobId,
          videoNombre,
          puntuacion: Math.max(0, Math.min(100, Math.round(puntuacion))),
          tipoGolpe,
          resumen,
          detalles,
        },
      });
      return NextResponse.json({ analisis }, { status: 201 });
    } catch (error) {
      // Dos peticiones simultáneas con el mismo jobId: gana la primera
      if (
        jobId &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const existente = await prisma.analisis.findUnique({ where: { jobId } });
        if (existente?.userId === userId) {
          return NextResponse.json({ analisis: existente }, { status: 200 });
        }
      }
      throw error;
    }
  } catch (error) {
    console.error("Error en POST /api/analisis/guardar:", error);
    return NextResponse.json(
      { error: "No se pudo guardar el análisis." },
      { status: 500 },
    );
  }
}

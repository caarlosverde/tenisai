import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import AnalisisDetalle from "@/components/AnalisisDetalle";
import { leerDetalles } from "@/lib/analisisGuardado";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Props = { params: Promise<{ id: string }> };

// La página y generateMetadata comparten una sola consulta por petición
const cargarAnalisis = cache(async (id: string) => {
  const user = await getCurrentUser();
  if (!user) return { user: null, analisis: null };

  // Filtrar por usuario: nadie puede abrir análisis ajenos adivinando el id
  const analisis = await prisma.analisis.findFirst({
    where: { id, userId: user.id },
  });
  return { user, analisis };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const { analisis } = await cargarAnalisis(id);
  return {
    title: analisis ? `${analisis.videoNombre} · Análisis` : "Análisis no encontrado",
  };
}

export default async function AnalisisPage({ params }: Props) {
  const { id } = await params;
  const { user, analisis } = await cargarAnalisis(id);

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/analisis/${id}`)}`);
  }
  if (!analisis) {
    notFound();
  }

  const { evaluaciones, adaptacion } = leerDetalles(analisis.detalles);

  return (
    <AnalisisDetalle
      analisis={{
        id: analisis.id,
        jobId: analisis.jobId,
        fecha: analisis.fecha.toISOString(),
        videoNombre: analisis.videoNombre,
        puntuacion: analisis.puntuacion,
        tipoGolpe: analisis.tipoGolpe,
        resumen: analisis.resumen,
        adaptacion,
        evaluaciones,
      }}
    />
  );
}

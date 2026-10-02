import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import ComparacionAnalisis from "@/components/ComparacionAnalisis";
import { leerDetalles } from "@/lib/analisisGuardado";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Comparar análisis",
};

type Props = {
  searchParams: Promise<{ a?: string | string[]; b?: string | string[] }>;
};

export default async function CompararPage({ searchParams }: Props) {
  const { a, b } = await searchParams;
  const user = await getCurrentUser();
  if (!user) {
    const destino = `/analisis/comparar?a=${encodeURIComponent(String(a ?? ""))}&b=${encodeURIComponent(String(b ?? ""))}`;
    redirect(`/login?next=${encodeURIComponent(destino)}`);
  }
  if (typeof a !== "string" || typeof b !== "string" || a === b) {
    notFound();
  }

  // Solo análisis propios: con ids ajenos no se encuentra ninguno
  const filas = await prisma.analisis.findMany({
    where: { id: { in: [a, b] }, userId: user.id },
    orderBy: { fecha: "asc" },
  });
  if (filas.length !== 2) {
    notFound();
  }

  const [antes, despues] = filas.map((fila) => ({
    id: fila.id,
    jobId: fila.jobId,
    fecha: fila.fecha.toISOString(),
    videoNombre: fila.videoNombre,
    puntuacion: fila.puntuacion,
    tipoGolpe: fila.tipoGolpe,
    evaluaciones: leerDetalles(fila.detalles).evaluaciones,
  }));

  return <ComparacionAnalisis antes={antes} despues={despues} />;
}

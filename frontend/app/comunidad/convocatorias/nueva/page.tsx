import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import FormularioConvocatoria from "@/components/comunidad/FormularioConvocatoria";
import { exigirUsuario } from "@/lib/comunidad/sesion";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Publicar partido" };

export default async function NuevaConvocatoriaPage() {
  const sesion = await exigirUsuario("/comunidad/convocatorias/nueva");
  const yo = await prisma.user.findUniqueOrThrow({ where: { id: sesion.id }, select: { ciudad: true } });

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/comunidad/convocatorias"
        className="-ml-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
        Buscar partido
      </Link>
      <h2 className="mb-1 mt-3 font-display text-2xl font-semibold text-white">Publicar partido</h2>
      <p className="mb-6 text-sm text-slate-400">
        Di cuándo y dónde quieres jugar y cuántos jugadores te faltan.
      </p>
      <FormularioConvocatoria ciudadInicial={yo.ciudad} />
    </div>
  );
}

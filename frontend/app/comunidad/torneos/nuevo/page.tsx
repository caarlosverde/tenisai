import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";
import { Vacio } from "@/components/comunidad/Seccion";
import FormularioTorneo from "@/components/comunidad/FormularioTorneo";
import { exigirUsuario } from "@/lib/comunidad/sesion";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Crear torneo" };

export default async function NuevoTorneoPage() {
  const sesion = await exigirUsuario("/comunidad/torneos/nuevo");
  const yo = await prisma.user.findUniqueOrThrow({
    where: { id: sesion.id },
    select: { rol: true, ciudad: true, organizacion: true },
  });

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/comunidad/torneos"
        className="-ml-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
        Torneos
      </Link>
      <h2 className="mb-1 mt-3 font-display text-2xl font-semibold text-white">Crear torneo</h2>
      {yo.rol === "organizador" ? (
        <>
          <p className="mb-6 text-sm text-slate-400">
            Lo organiza {yo.organizacion ?? "tu cuenta"}. Los jugadores podrán inscribirse hasta la
            fecha de cierre.
          </p>
          <FormularioTorneo ciudadInicial={yo.ciudad} />
        </>
      ) : (
        <div className="mt-6">
          <Vacio icono={Lock}>
            <p>Solo las cuentas de organizador (clubes) pueden crear torneos.</p>
            <Link href="/comunidad/torneos" className="text-cyan-300 hover:underline">
              Ver los torneos abiertos
            </Link>
          </Vacio>
        </div>
      )}
    </div>
  );
}

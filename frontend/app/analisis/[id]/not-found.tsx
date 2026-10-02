import Link from "next/link";
import { SearchX } from "lucide-react";

export default function AnalisisNoEncontrado() {
  return (
    <div className="relative flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_#0b1a33_0%,_#020617_45%,_#000000_100%)]" />
      <div className="relative z-10 max-w-md rounded-2xl border border-white/10 bg-zinc-900 px-6 py-8 text-center shadow-xl">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-cyan-300">
          <SearchX className="h-6 w-6" strokeWidth={1.5} />
        </div>
        <h1 className="font-display text-xl font-semibold">Análisis no encontrado</h1>
        <p className="mt-2 text-sm text-slate-400">
          Este análisis no existe o pertenece a otra cuenta.
        </p>
        <Link
          href="/perfil"
          className="mt-6 inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-cyan-300 via-emerald-300 to-cyan-400 px-5 py-2.5 text-sm font-semibold text-slate-950 shadow-lg transition hover:brightness-105"
        >
          Volver a mi historial
        </Link>
      </div>
    </div>
  );
}

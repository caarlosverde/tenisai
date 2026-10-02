import type { Metadata } from "next";
import Link from "next/link";
import { Compass } from "lucide-react";
import { PAGE_BACKGROUND_CLASS } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Página no encontrada",
};

export default function NotFound() {
  return (
    <div className="relative flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 text-white">
      <div className={PAGE_BACKGROUND_CLASS} />
      <div className="relative z-10 max-w-md text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-cyan-300">
          <Compass className="h-7 w-7" strokeWidth={1.5} aria-hidden />
        </div>
        <p className="font-mono text-sm text-cyan-300/80">Error 404</p>
        <h1 className="mt-2 font-display text-3xl font-semibold">Esta página no existe</h1>
        <p className="mt-3 text-sm text-slate-400">
          Puede que el enlace esté mal escrito o que la página se haya movido.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-cyan-300 via-emerald-300 to-cyan-400 px-5 py-2.5 text-sm font-semibold text-slate-950 shadow-lg transition hover:brightness-105"
          >
            Ir al inicio
          </Link>
          <Link
            href="/perfil"
            className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-5 py-2.5 text-sm text-white transition hover:bg-white/10"
          >
            Mis análisis
          </Link>
        </div>
      </div>
    </div>
  );
}

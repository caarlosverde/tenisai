"use client"; // Los límites de error tienen que ser componentes de cliente

import Link from "next/link";
import { useEffect } from "react";
import { RotateCcw, TriangleAlert } from "lucide-react";
import { PAGE_BACKGROUND_CLASS } from "@/lib/ui";

export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="relative flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 text-white">
      <div className={PAGE_BACKGROUND_CLASS} />
      <div role="alert" className="relative z-10 max-w-md text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-rose-400/25 bg-rose-500/10 text-rose-200">
          <TriangleAlert className="h-7 w-7" strokeWidth={1.5} aria-hidden />
        </div>
        <h1 className="font-display text-3xl font-semibold">Algo ha fallado</h1>
        <p className="mt-3 text-sm text-slate-400">
          Ha ocurrido un error inesperado al cargar esta página. Puedes reintentarlo o volver
          al inicio.
        </p>
        {error.digest ? (
          <p className="mt-2 font-mono text-xs text-slate-500">Referencia: {error.digest}</p>
        ) : null}
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => retry()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-300 via-emerald-300 to-cyan-400 px-5 py-2.5 text-sm font-semibold text-slate-950 shadow-lg transition hover:brightness-105"
          >
            <RotateCcw className="h-4 w-4" strokeWidth={2} />
            Reintentar
          </button>
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-5 py-2.5 text-sm text-white transition hover:bg-white/10"
          >
            Ir al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}

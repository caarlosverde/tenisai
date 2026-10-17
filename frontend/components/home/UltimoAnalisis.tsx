"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, History, TrendingDown, TrendingUp } from "lucide-react";
import { Bloque } from "@/components/Esqueleto";
import type { AnalisisItem } from "@/components/perfil/tipos";
import { fechaCorta } from "@/lib/formato";
import { scoreBadgeClass } from "@/lib/ui";

type Estado = { tipo: "cargando" } | { tipo: "listo"; analisis: AnalisisItem[] } | { tipo: "nada" };

/**
 * Bajo la zona de subida, para quien ya tiene sesión: su último análisis y si ha
 * mejorado respecto al anterior del mismo golpe, para retomar donde lo dejó.
 */
export default function UltimoAnalisis() {
  const [estado, setEstado] = useState<Estado>({ tipo: "cargando" });

  useEffect(() => {
    let cancelado = false;
    fetch("/api/analisis", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ analisis?: AnalisisItem[] }>) : null))
      .then((datos) => {
        if (cancelado) return;
        const lista = datos?.analisis ?? [];
        setEstado(lista.length ? { tipo: "listo", analisis: lista } : { tipo: "nada" });
      })
      .catch(() => {
        if (!cancelado) setEstado({ tipo: "nada" });
      });
    return () => {
      cancelado = true;
    };
  }, []);

  if (estado.tipo === "nada") return null;
  if (estado.tipo === "cargando") {
    return (
      <div aria-hidden className="mx-auto mt-6 w-full max-w-xl">
        <Bloque className="h-[104px] w-full rounded-2xl" />
      </div>
    );
  }

  // El historial llega del más reciente al más antiguo
  const [ultimo, ...anteriores] = estado.analisis;
  const anterior = anteriores.find((a) => a.tipoGolpe === ultimo.tipoGolpe);
  const cambio = anterior ? ultimo.puntuacion - anterior.puntuacion : null;

  return (
    <section
      aria-labelledby="ultimo-analisis-titulo"
      className="mx-auto mt-6 w-full max-w-xl rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-left animate-[fadeUp_0.6s_ease-out_both]"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="ultimo-analisis-titulo" className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-slate-400">
          <History className="h-4 w-4 text-cyan-300/80" strokeWidth={1.75} aria-hidden />
          Tu último análisis
        </h2>
        <Link href="/perfil" className="text-xs text-cyan-300 transition hover:text-cyan-200">
          Ver historial ({estado.analisis.length})
        </Link>
      </div>
      <Link
        href={`/analisis/${ultimo.id}`}
        className="group mt-3 flex items-center gap-4 rounded-xl border border-white/5 bg-black/20 p-3 transition hover:border-cyan-300/30 hover:bg-white/[0.06]"
      >
        <span
          className={[
            "inline-flex shrink-0 items-baseline gap-0.5 rounded-xl border px-3 py-1.5",
            scoreBadgeClass(ultimo.puntuacion),
          ].join(" ")}
        >
          <span className="font-display text-2xl font-semibold">{ultimo.puntuacion}</span>
          <span className="text-[11px] opacity-80">/100</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-white">{ultimo.videoNombre}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400">
            {ultimo.tipoGolpe} · {fechaCorta(ultimo.fecha)}
            {cambio !== null && cambio !== 0 ? (
              <span
                className={`inline-flex items-center gap-1 font-medium ${cambio > 0 ? "text-emerald-300" : "text-rose-300"}`}
              >
                {cambio > 0 ? (
                  <TrendingUp className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                ) : (
                  <TrendingDown className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                )}
                {cambio > 0 ? "+" : ""}
                {cambio} respecto a tu anterior {ultimo.tipoGolpe.toLowerCase()}
              </span>
            ) : null}
          </span>
        </span>
        <ArrowRight
          className="h-4 w-4 shrink-0 text-slate-500 transition group-hover:translate-x-0.5 group-hover:text-cyan-300"
          strokeWidth={1.75}
          aria-hidden
        />
      </Link>
    </section>
  );
}

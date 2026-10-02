"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Hourglass, Loader2, Sparkles } from "lucide-react";
import { motion } from "framer-motion";

const STEPS = [
  "Subiendo vídeo...",
  "Extrayendo esqueleto biomecánico (MediaPipe)...",
  "Calculando fases y ángulos...",
  "Generando resultados...",
] as const;

type AnalyzeLoaderProps = {
  fileName?: string | null;
  progreso?: number;
  framesProcesados?: number;
  framesTotales?: number;
  estado?: string | null;
  /** Análisis que se procesarán antes que este (solo mientras está en cola). */
  porDelante?: number | null;
};

function stepFromProgress(props: AnalyzeLoaderProps): number {
  const estado = props.estado ?? "en_cola";
  const progreso = props.progreso ?? 0;
  const total = props.framesTotales ?? 0;

  if (estado === "completado") return 3;
  if (estado === "en_cola" || progreso <= 0) return 0;
  if (total === 0) return 1;
  if (progreso < 72) return 2;
  return 3;
}

function stepFromElapsed(ms: number): number {
  if (ms < 700) return 0;
  if (ms < 2800) return 1;
  if (ms < 6500) return 2;
  return 3;
}

export default function AnalyzeLoader({
  fileName,
  progreso = 0,
  framesProcesados = 0,
  framesTotales = 0,
  estado = "en_cola",
  porDelante = null,
}: AnalyzeLoaderProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const id = window.setInterval(() => setElapsed(Date.now() - started), 200);
    return () => window.clearInterval(id);
  }, []);

  const esperandoTurno = estado === "en_cola" && (porDelante ?? 0) > 0;

  const activeStep = useMemo(() => {
    // En la cola no se avanza por tiempo: el vídeo aún no se está procesando
    if (estado === "en_cola") return 0;
    return Math.min(
      3,
      Math.max(stepFromProgress({ progreso, framesTotales, estado }), stepFromElapsed(elapsed)),
    );
  }, [elapsed, estado, framesTotales, progreso]);

  const steps = esperandoTurno
    ? [`Esperando turno · ${porDelante} por delante...`, ...STEPS.slice(1)]
    : STEPS;

  const cargandoModelos = framesTotales === 0;
  const barraAncho = cargandoModelos ? null : Math.max(6, Math.min(100, progreso));

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="mx-auto mt-10 w-full max-w-3xl"
    >
      <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-5 shadow-xl backdrop-blur-md sm:p-7">
        <div className="mb-6 flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-cyan-400/25 bg-cyan-400/10 text-cyan-200 shadow-lg">
            {esperandoTurno ? (
              <Hourglass className="h-5 w-5 animate-pulse" strokeWidth={1.75} />
            ) : (
              <Sparkles className="h-5 w-5 animate-pulse" strokeWidth={1.75} />
            )}
          </div>
          <div className="min-w-0">
            <p className="font-display text-lg font-semibold text-white">
              {esperandoTurno ? "Tu vídeo está en la cola" : "Procesando análisis"}
            </p>
            <p className="mt-1 truncate text-sm text-slate-400">
              {fileName ? fileName : "Vídeo en cola"}
              {esperandoTurno
                ? ` · ${porDelante} análisis por delante del tuyo`
                : cargandoModelos
                  ? " · preparando modelos"
                  : ` · frame ${framesProcesados} de ${framesTotales}`}
            </p>
          </div>
        </div>

        <ol className="space-y-3">
          {steps.map((label, index) => {
            const done = index < activeStep;
            const current = index === activeStep;
            return (
              <li
                key={label}
                className={[
                  "flex items-center gap-3 rounded-2xl border px-4 py-3 transition-all duration-300",
                  current
                    ? "border-cyan-400/30 bg-cyan-400/10 shadow-lg"
                    : done
                      ? "border-emerald-400/20 bg-emerald-400/10"
                      : "border-white/10 bg-black/20",
                ].join(" ")}
              >
                <span
                  className={[
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                    current
                      ? "border-cyan-300/40 bg-cyan-400/15 text-cyan-100"
                      : done
                        ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-200"
                        : "border-white/10 bg-white/5 text-slate-500",
                  ].join(" ")}
                >
                  {done ? (
                    <Check className="h-3.5 w-3.5" strokeWidth={2.4} />
                  ) : current ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.2} />
                  ) : (
                    index + 1
                  )}
                </span>
                <span
                  className={[
                    "text-sm",
                    current ? "font-medium text-white" : done ? "text-emerald-100/90" : "text-slate-500",
                  ].join(" ")}
                >
                  {label}
                </span>
              </li>
            );
          })}
        </ol>

        <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
          <div
            className={[
              "h-full rounded-full bg-gradient-to-r from-cyan-300 to-emerald-300",
              barraAncho == null
                ? "w-1/3 animate-pulse opacity-70"
                : "transition-[width] duration-300 ease-out",
            ].join(" ")}
            style={barraAncho == null ? undefined : { width: `${barraAncho}%` }}
          />
        </div>
        {barraAncho != null ? (
          <p className="mt-2 text-right font-mono text-xs text-cyan-200">
            {barraAncho.toFixed(0)}%
          </p>
        ) : (
          <p className="mt-2 text-xs text-slate-500">
            {esperandoTurno
              ? "Empezará automáticamente cuando llegue su turno. No cierres la pestaña."
              : "Esto suele tardar unos segundos. No cierres la pestaña."}
          </p>
        )}
      </div>

      <div className="mt-6 overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-4 shadow-xl backdrop-blur-md sm:p-5">
        <div className="aspect-video w-full animate-pulse rounded-2xl bg-gradient-to-br from-slate-800/80 via-slate-900/70 to-black/60" />
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-9 animate-pulse rounded-full bg-white/10"
              style={{ animationDelay: `${index * 120}ms` }}
            />
          ))}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="rounded-2xl border border-white/10 bg-black/25 p-4 shadow-lg"
          >
            <div className="mb-3 h-4 w-2/5 animate-pulse rounded bg-white/10" />
            <div className="h-3 w-full animate-pulse rounded bg-white/10" />
            <div className="mt-2 h-3 w-4/5 animate-pulse rounded bg-white/10" />
          </div>
        ))}
      </div>
    </motion.div>
  );
}

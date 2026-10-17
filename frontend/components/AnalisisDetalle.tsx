"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import {
  Archive,
  ArrowLeft,
  CalendarDays,
  Loader2,
  RotateCcw,
  ServerOff,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { toast } from "sonner";
import ConfirmDialog from "@/components/ConfirmDialog";
import ResultsPanel, {
  FEEDBACK_STYLES,
  RESULTS_PRIMARY_ACTION_CLASS,
  RESULTS_SECONDARY_ACTION_CLASS,
} from "@/components/ResultsPanel";
import { mensajeResumen } from "@/lib/resumen";
import { API_BASE_URL, type AnalysisProgress, type FeedbackTipo } from "@/lib/api";
import { fechaLarga } from "@/lib/formato";
import { PAGE_BACKGROUND_CLASS, scoreBadgeClass } from "@/lib/ui";

import type { EvaluacionGuardada } from "@/lib/analisisGuardado";

type AnalisisGuardado = {
  id: string;
  jobId: string | null;
  fecha: string;
  videoNombre: string;
  puntuacion: number;
  tipoGolpe: string;
  resumen: string;
  adaptacion: string | null;
  evaluaciones: EvaluacionGuardada[];
};

type Estado =
  | { tipo: "cargando" }
  | { tipo: "listo"; datos: AnalysisProgress }
  | { tipo: "sin_archivos" }
  | { tipo: "sin_conexion" };

function Aviso({
  icono: Icono,
  titulo,
  children,
}: {
  icono: typeof Archive;
  titulo: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-amber-400/25 bg-amber-400/10 px-4 py-3.5 text-sm">
      <Icono className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" strokeWidth={1.75} />
      <div>
        <p className="font-medium text-amber-100">{titulo}</p>
        <div className="mt-1 text-slate-300">{children}</div>
      </div>
    </div>
  );
}

/** Resumen guardado en la base de datos, para cuando no hay vídeos que mostrar. */
function ResumenGuardado({ analisis }: { analisis: AnalisisGuardado }) {
  // Sin la adaptación ni la nota repetidas: la nota ya está en la cabecera
  const { texto } = mensajeResumen({
    mensaje: analisis.resumen ?? "",
    adaptacion: analisis.adaptacion ?? undefined,
  });
  return (
    <section className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-4 shadow-xl backdrop-blur-md sm:p-6">
      <h2 className="mb-4 font-display text-sm font-medium uppercase tracking-[0.2em] text-cyan-300/90">
        Análisis de entrenador
      </h2>
      {texto ? <p className="text-sm leading-relaxed text-slate-300">{texto}</p> : null}
      {analisis.adaptacion ? (
        <p className="mt-2 text-xs text-slate-400">{analisis.adaptacion}.</p>
      ) : null}

      {analisis.evaluaciones.length > 0 ? (
        <ul className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
          {analisis.evaluaciones.map((evaluacion, index) => {
            const estilo =
              FEEDBACK_STYLES[evaluacion.tipo as FeedbackTipo] ?? FEEDBACK_STYLES.mejora;
            const { Icono } = estilo;
            return (
              <li
                key={`${evaluacion.titulo ?? evaluacion.categoria ?? "ev"}-${index}`}
                className={`rounded-2xl border p-4 ${estilo.tarjeta}`}
              >
                <p className={`flex items-center gap-2 text-sm font-semibold ${estilo.titulo}`}>
                  <Icono className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                  {evaluacion.fase_nombre ? (
                    <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-300">
                      {evaluacion.fase_nombre}
                    </span>
                  ) : null}
                  {evaluacion.titulo ?? evaluacion.categoria ?? "Evaluación"}
                </p>
                {evaluacion.mensaje ? (
                  <p className="mt-2 text-sm leading-relaxed text-slate-300">
                    {evaluacion.mensaje}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}

export default function AnalisisDetalle({ analisis }: { analisis: AnalisisGuardado }) {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>(
    analisis.jobId ? { tipo: "cargando" } : { tipo: "sin_archivos" },
  );
  const [intento, setIntento] = useState(0);
  const [confirmarBorrado, setConfirmarBorrado] = useState(false);
  const [borrando, setBorrando] = useState(false);

  async function borrar() {
    if (borrando) return;
    flushSync(() => setBorrando(true));
    try {
      const response = await fetch(`/api/analisis/${analisis.id}`, { method: "DELETE" });
      if (!response.ok && response.status !== 404) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        toast.error(data.error ?? "No se pudo borrar el análisis.");
        return;
      }
      toast.success("Análisis borrado");
      router.replace("/perfil");
    } catch {
      toast.error("No se pudo conectar con el servidor.");
    } finally {
      setBorrando(false);
    }
  }

  useEffect(() => {
    if (!analisis.jobId) return;
    let cancelled = false;

    async function cargar() {
      try {
        const response = await fetch(`${API_BASE_URL}/resultado/${analisis.jobId}`, {
          cache: "no-store",
        });
        if (cancelled) return;
        if (response.status === 404) {
          setEstado({ tipo: "sin_archivos" });
          return;
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const datos = (await response.json()) as AnalysisProgress;
        if (cancelled) return;
        setEstado(
          datos.original_url && datos.processed_url
            ? { tipo: "listo", datos }
            : { tipo: "sin_archivos" },
        );
      } catch {
        if (!cancelled) setEstado({ tipo: "sin_conexion" });
      }
    }

    void cargar();
    return () => {
      cancelled = true;
    };
  }, [analisis.jobId, intento]);

  const acciones = (
    <>
      <Link href="/perfil" className={RESULTS_SECONDARY_ACTION_CLASS}>
        <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
        Volver a mi historial
      </Link>
      <Link href="/" className={RESULTS_PRIMARY_ACTION_CLASS}>
        <UploadCloud className="h-4 w-4" strokeWidth={1.75} />
        Analizar nuevo vídeo
      </Link>
    </>
  );

  const datos = estado.tipo === "listo" ? estado.datos : null;

  return (
    <div className="relative min-h-[calc(100vh-4rem)] overflow-hidden text-white">
      <div className={PAGE_BACKGROUND_CLASS} />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(16,185,129,0.08),transparent_40%)]" />

      <div className="relative z-10 mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6 md:pt-10">
        <Link
          href="/perfil"
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 -ml-2 text-sm text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
          Mi historial
        </Link>

        <header className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="mb-2 font-display text-sm font-medium uppercase tracking-[0.28em] text-cyan-300/80">
              Análisis guardado
            </p>
            <h1 className="truncate font-display text-3xl font-semibold tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-white via-cyan-100 to-emerald-300 sm:text-4xl">
              {analisis.videoNombre}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4 text-cyan-300/80" strokeWidth={1.75} />
                {fechaLarga(analisis.fecha)}
              </span>
              <span className="rounded-lg border border-cyan-400/20 bg-cyan-400/10 px-2 py-0.5 text-xs text-cyan-100">
                {analisis.tipoGolpe}
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setConfirmarBorrado(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-400 transition-colors hover:border-rose-400/40 hover:bg-rose-500/10 hover:text-rose-100"
            >
              <Trash2 className="h-4 w-4" strokeWidth={1.75} />
              Borrar
            </button>
            <span
              className={[
                "inline-flex items-baseline gap-1 rounded-2xl border px-4 py-2",
                scoreBadgeClass(analisis.puntuacion),
              ].join(" ")}
            >
              <span className="font-display text-3xl font-semibold">{analisis.puntuacion}</span>
              <span className="text-xs uppercase tracking-wider opacity-80">/ 100</span>
            </span>
          </div>
        </header>

        <ConfirmDialog
          abierto={confirmarBorrado}
          titulo="¿Borrar este análisis?"
          textoConfirmar="Borrar análisis"
          peligroso
          cargando={borrando}
          onConfirmar={() => void borrar()}
          onCancelar={() => setConfirmarBorrado(false)}
        >
          <p>Se borrarán el análisis y sus vídeos. No se puede deshacer.</p>
        </ConfirmDialog>

        {estado.tipo === "cargando" ? (
          <div className="mt-8 flex min-h-[320px] items-center justify-center rounded-3xl border border-white/10 bg-white/5 text-slate-300">
            <Loader2 className="mr-2 h-5 w-5 animate-spin text-cyan-300" />
            Cargando vídeos y métricas...
          </div>
        ) : null}

        {datos && datos.original_url && datos.processed_url ? (
          <ResultsPanel
            className="mt-8"
            originalUrl={datos.original_url}
            processedUrl={datos.processed_url}
            tracksUrl={datos.tracks_url ?? null}
            feedback={datos.feedback ?? []}
            resumenGeneral={datos.resumen_general ?? null}
            tipoGolpe={datos.tipo_golpe ?? datos.resumen_general?.tipo_golpe ?? analisis.tipoGolpe}
            actions={acciones}
            mostrarNota={false}
          />
        ) : null}

        {estado.tipo === "sin_archivos" || estado.tipo === "sin_conexion" ? (
          <div className="mt-8">
            {estado.tipo === "sin_conexion" ? (
              <Aviso icono={ServerOff} titulo="No se pudo conectar con el motor de análisis">
                <p>
                  Los vídeos y las métricas no están disponibles ahora mismo. Comprueba tu
                  conexión e inténtalo de nuevo en unos segundos.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setEstado({ tipo: "cargando" });
                    setIntento((n) => n + 1);
                  }}
                  className="mt-3 inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-sm text-white transition hover:bg-white/10"
                >
                  <RotateCcw className="h-4 w-4" strokeWidth={1.75} />
                  Reintentar
                </button>
              </Aviso>
            ) : analisis.jobId ? (
              <Aviso icono={Archive} titulo="Los vídeos de este análisis ya no están disponibles">
                Se muestra el resumen que quedó guardado en tu historial.
              </Aviso>
            ) : (
              <Aviso icono={Archive} titulo="Análisis de una versión anterior">
                Se guardó antes de que TenisAI conservara los vídeos de cada análisis, así
                que solo queda el resumen. Los análisis nuevos se guardan completos.
              </Aviso>
            )}

            <ResumenGuardado analisis={analisis} />

            <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              {acciones}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

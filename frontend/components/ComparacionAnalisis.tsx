"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Loader2,
  Minus,
  Pause,
  Play,
  RotateCcw,
  TrendingDown,
  TrendingUp,
  VideoOff,
} from "lucide-react";
import { FEEDBACK_STYLES } from "@/components/ResultsPanel";
import type { EvaluacionGuardada } from "@/lib/analisisGuardado";
import { API_BASE_URL, type AnalysisProgress, type FeedbackTipo } from "@/lib/api";
import { fechaCorta } from "@/lib/formato";
import { PAGE_BACKGROUND_CLASS, scoreBadgeClass } from "@/lib/ui";

type AnalisisComparado = {
  id: string;
  jobId: string | null;
  fecha: string;
  videoNombre: string;
  puntuacion: number;
  tipoGolpe: string;
  evaluaciones: EvaluacionGuardada[];
};

// Cuanto más alto, mejor
const RANGO_TIPO: Record<string, number> = {
  alerta: 0,
  aviso: 1,
  mejora: 1,
  correcto: 2,
  optimo: 2,
};

const ETIQUETA_TIPO: Record<string, string> = {
  alerta: "Alerta",
  aviso: "Aviso",
  mejora: "A mejorar",
  correcto: "Correcto",
  optimo: "Óptimo",
};

type Cambio = "mejora" | "empeora" | "igual" | "sin-dato";

function claveEvaluacion(ev: EvaluacionGuardada): string {
  return `${ev.fase_nombre ?? ""}|${ev.titulo ?? ev.categoria ?? "Evaluación"}`;
}

function compararEvaluaciones(antes: EvaluacionGuardada[], despues: EvaluacionGuardada[]) {
  const mapaAntes = new Map(antes.map((ev) => [claveEvaluacion(ev), ev]));
  const mapaDespues = new Map(despues.map((ev) => [claveEvaluacion(ev), ev]));
  const claves = [...new Set([...mapaAntes.keys(), ...mapaDespues.keys()])];

  return claves.map((clave) => {
    const a = mapaAntes.get(clave);
    const d = mapaDespues.get(clave);
    let cambio: Cambio = "sin-dato";
    if (a?.tipo && d?.tipo && a.tipo in RANGO_TIPO && d.tipo in RANGO_TIPO) {
      const diferencia = RANGO_TIPO[d.tipo] - RANGO_TIPO[a.tipo];
      cambio = diferencia > 0 ? "mejora" : diferencia < 0 ? "empeora" : "igual";
    }
    const ref = d ?? a;
    return {
      clave,
      titulo: ref?.titulo ?? ref?.categoria ?? "Evaluación",
      fase: ref?.fase_nombre,
      antes: a?.tipo,
      despues: d?.tipo,
      cambio,
    };
  });
}

function EstadoEvaluacion({ tipo }: { tipo?: string }) {
  if (!tipo) return <span className="text-xs text-slate-500">—</span>;
  const estilo = FEEDBACK_STYLES[tipo as FeedbackTipo] ?? FEEDBACK_STYLES.mejora;
  const { Icono } = estilo;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${estilo.insignia}`}>
      <Icono className="h-3.5 w-3.5" strokeWidth={1.75} />
      {ETIQUETA_TIPO[tipo] ?? tipo}
    </span>
  );
}

const CAMBIO_UI: Record<Cambio, { texto: string; clase: string; Icono: typeof TrendingUp }> = {
  mejora: { texto: "Mejora", clase: "text-emerald-300", Icono: TrendingUp },
  empeora: { texto: "Empeora", clase: "text-rose-300", Icono: TrendingDown },
  igual: { texto: "Igual", clase: "text-slate-400", Icono: Minus },
  "sin-dato": { texto: "Solo en uno", clase: "text-slate-500", Icono: Minus },
};

/**
 * Vídeo anotado de un análisis, pedido al motor. Se distingue un análisis que no
 * tiene vídeo (antiguo o borrado) de un motor que no responde, que se puede reintentar.
 */
type EstadoVideo =
  | { tipo: "cargando" }
  | { tipo: "listo"; url: string }
  | { tipo: "sin-video" }
  | { tipo: "sin-motor" };

function useVideoProcesado(jobId: string | null, intento: number): EstadoVideo {
  // Cada respuesta guarda a qué intento pertenece: mientras no llega la del intento
  // actual (al abrir la página o al pulsar «Reintentar»), el vídeo está cargando
  const [respuesta, setRespuesta] = useState<{ intento: number; estado: EstadoVideo } | null>(null);
  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    fetch(`${API_BASE_URL}/resultado/${jobId}`, { cache: "no-store" })
      .then(async (r) => {
        if (r.ok) {
          const datos = (await r.json()) as AnalysisProgress;
          return datos.processed_url
            ? ({ tipo: "listo", url: datos.processed_url } as const)
            : ({ tipo: "sin-video" } as const);
        }
        // 404/410: el análisis ya no tiene archivos; 5xx: el motor está caído
        return r.status >= 500 ? ({ tipo: "sin-motor" } as const) : ({ tipo: "sin-video" } as const);
      })
      .catch(() => ({ tipo: "sin-motor" }) as const)
      .then((estado) => {
        if (!cancelled) setRespuesta({ intento, estado });
      });
    return () => {
      cancelled = true;
    };
  }, [jobId, intento]);
  if (!jobId) return { tipo: "sin-video" };
  return respuesta?.intento === intento ? respuesta.estado : { tipo: "cargando" };
}

function TarjetaAnalisis({ etiqueta, analisis }: { etiqueta: string; analisis: AnalisisComparado }) {
  return (
    <Link
      href={`/analisis/${analisis.id}`}
      className="block rounded-2xl border border-white/10 bg-white/5 p-4 transition-colors hover:border-cyan-300/30 hover:bg-white/10"
    >
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-cyan-300/80">{etiqueta}</p>
      <p className="mt-2 truncate font-medium text-white">{analisis.videoNombre}</p>
      <p className="mt-0.5 text-xs text-slate-400">
        {fechaCorta(analisis.fecha)} · {analisis.tipoGolpe}
      </p>
      <span
        className={[
          "mt-3 inline-flex items-baseline gap-1 rounded-xl border px-3 py-1",
          scoreBadgeClass(analisis.puntuacion),
        ].join(" ")}
      >
        <span className="font-display text-2xl font-semibold">{analisis.puntuacion}</span>
        <span className="text-xs opacity-80">/ 100</span>
      </span>
    </Link>
  );
}

function VideoComparado({
  etiqueta,
  estado,
  videoRef,
  onCambioEstado,
}: {
  etiqueta: string;
  estado: EstadoVideo;
  videoRef: RefObject<HTMLVideoElement | null>;
  onCambioEstado: () => void;
}) {
  return (
    <figure className="overflow-hidden rounded-2xl border border-white/10 bg-black/40">
      {estado.tipo === "listo" ? (
        <video
          ref={videoRef}
          src={estado.url}
          muted
          playsInline
          controls
          preload="metadata"
          onPlay={onCambioEstado}
          onPause={onCambioEstado}
          onEnded={onCambioEstado}
          aria-label={`Vídeo anotado: ${etiqueta}`}
          className="aspect-video w-full bg-black object-contain"
        />
      ) : (
        <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 text-sm text-slate-500">
          {estado.tipo === "cargando" ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin text-cyan-300/70" strokeWidth={1.75} />
              Cargando vídeo…
            </>
          ) : (
            <>
              <VideoOff className="h-6 w-6" strokeWidth={1.5} />
              Vídeo no disponible
            </>
          )}
        </div>
      )}
      <figcaption className="px-3 py-2 text-xs text-slate-400">{etiqueta}</figcaption>
    </figure>
  );
}

export default function ComparacionAnalisis({
  antes,
  despues,
}: {
  antes: AnalisisComparado;
  despues: AnalisisComparado;
}) {
  const [intento, setIntento] = useState(0);
  const videoAntes = useVideoProcesado(antes.jobId, intento);
  const videoDespues = useVideoProcesado(despues.jobId, intento);
  const urlAntes = videoAntes.tipo === "listo" ? videoAntes.url : null;
  const urlDespues = videoDespues.tipo === "listo" ? videoDespues.url : null;
  const refAntes = useRef<HTMLVideoElement>(null);
  const refDespues = useRef<HTMLVideoElement>(null);
  const [reproduciendo, setReproduciendo] = useState(false);
  const [velocidad, setVelocidad] = useState(0.5);

  const diferencia = despues.puntuacion - antes.puntuacion;
  const filas = useMemo(
    () => compararEvaluaciones(antes.evaluaciones, despues.evaluaciones),
    [antes.evaluaciones, despues.evaluaciones],
  );
  const resumen = {
    mejoran: filas.filter((f) => f.cambio === "mejora").length,
    empeoran: filas.filter((f) => f.cambio === "empeora").length,
    iguales: filas.filter((f) => f.cambio === "igual").length,
  };
  const ambosVideos = Boolean(urlAntes && urlDespues);
  const sinMotor = videoAntes.tipo === "sin-motor" || videoDespues.tipo === "sin-motor";
  const sinVideo = videoAntes.tipo === "sin-video" || videoDespues.tipo === "sin-video";

  // Sincroniza el botón si se pausa o termina un vídeo desde sus propios controles
  function actualizarReproduciendo() {
    setReproduciendo(
      [refAntes.current, refDespues.current].some((v) => v !== null && !v.paused && !v.ended),
    );
  }

  function reproducirAmbos() {
    const lista = [refAntes.current, refDespues.current].filter(
      (v): v is HTMLVideoElement => v !== null,
    );
    if (reproduciendo) {
      lista.forEach((v) => v.pause());
      setReproduciendo(false);
      return;
    }
    // Desde el principio y a la misma velocidad para que el gesto coincida
    lista.forEach((v) => {
      v.currentTime = 0;
      v.playbackRate = velocidad;
      void v.play().catch(() => undefined);
    });
    setReproduciendo(true);
  }

  useEffect(() => {
    for (const v of [refAntes.current, refDespues.current]) {
      if (v) v.playbackRate = velocidad;
    }
  }, [velocidad, urlAntes, urlDespues]);

  return (
    <div className="relative min-h-[calc(100vh-4rem)] overflow-hidden text-white">
      <div className={PAGE_BACKGROUND_CLASS} />
      <div className="relative z-10 mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6 md:pt-10">
        <Link
          href="/perfil"
          className="-ml-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
          Mi historial
        </Link>

        <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-white via-cyan-100 to-emerald-300 sm:text-4xl">
          Antes y después
        </h1>

        {antes.tipoGolpe !== despues.tipoGolpe ? (
          <p className="mt-4 flex items-start gap-2 rounded-2xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
            Estás comparando golpes distintos ({antes.tipoGolpe} y {despues.tipoGolpe}): las
            evaluaciones no son del todo equivalentes.
          </p>
        ) : null}

        <div className="mt-6 grid grid-cols-1 items-center gap-4 md:grid-cols-[1fr_auto_1fr]">
          <TarjetaAnalisis etiqueta="Antes" analisis={antes} />
          <div className="flex flex-col items-center gap-1 text-center">
            <ArrowRight className="hidden h-5 w-5 text-slate-500 md:block" />
            <span
              className={[
                "font-display text-2xl font-semibold",
                diferencia > 0 ? "text-emerald-300" : diferencia < 0 ? "text-rose-300" : "text-slate-300",
              ].join(" ")}
            >
              {diferencia > 0 ? "+" : ""}
              {diferencia}
            </span>
            <span className="text-xs text-slate-400">puntos</span>
          </div>
          <TarjetaAnalisis etiqueta="Después" analisis={despues} />
        </div>

        <section className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-4 shadow-xl sm:p-6" aria-labelledby="videos-titulo">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 id="videos-titulo" className="font-display text-sm font-medium uppercase tracking-[0.2em] text-cyan-300/90">
              Vídeos anotados
            </h2>
            {ambosVideos ? (
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-xs text-slate-400">
                  Velocidad
                  <select
                    value={velocidad}
                    onChange={(e) => setVelocidad(Number(e.target.value))}
                    className="rounded-lg border border-white/10 bg-zinc-900 px-2 py-1 text-xs text-white"
                  >
                    <option value={0.25}>0,25×</option>
                    <option value={0.5}>0,5×</option>
                    <option value={1}>1×</option>
                  </select>
                </label>
                <button
                  type="button"
                  onClick={reproducirAmbos}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-300 via-emerald-300 to-cyan-400 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:brightness-105"
                >
                  {reproduciendo ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  {reproduciendo ? "Pausar" : "Reproducir a la vez"}
                </button>
              </div>
            ) : null}
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <VideoComparado
              etiqueta={`Antes · ${fechaCorta(antes.fecha)}`}
              estado={videoAntes}
              videoRef={refAntes}
              onCambioEstado={actualizarReproduciendo}
            />
            <VideoComparado
              etiqueta={`Después · ${fechaCorta(despues.fecha)}`}
              estado={videoDespues}
              videoRef={refDespues}
              onCambioEstado={actualizarReproduciendo}
            />
          </div>
          {sinMotor ? (
            <div
              role="status"
              className="mt-3 flex flex-col gap-3 rounded-2xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-100 sm:flex-row sm:items-center sm:justify-between"
            >
              <span>
                No se pudo conectar con el motor de análisis: los vídeos no se pueden mostrar
                ahora. La comparación de aspectos sigue disponible.
              </span>
              <button
                type="button"
                onClick={() => setIntento((n) => n + 1)}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white transition hover:bg-white/10"
              >
                <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.75} />
                Reintentar
              </button>
            </div>
          ) : sinVideo ? (
            <p className="mt-3 text-xs text-slate-500">
              Los análisis anteriores a que TenisAI guardara los vídeos solo conservan el resumen.
            </p>
          ) : null}
        </section>

        <section className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-4 shadow-xl sm:p-6" aria-labelledby="evaluaciones-titulo">
          <h2 id="evaluaciones-titulo" className="font-display text-sm font-medium uppercase tracking-[0.2em] text-cyan-300/90">
            Aspecto por aspecto
          </h2>
          {filas.length === 0 ? (
            <p className="mt-3 text-sm text-slate-400">Estos análisis no tienen evaluaciones guardadas.</p>
          ) : (
            <>
              <p className="mt-2 text-sm text-slate-300">
                {resumen.mejoran} {resumen.mejoran === 1 ? "mejora" : "mejoran"} · {resumen.empeoran}{" "}
                {resumen.empeoran === 1 ? "empeora" : "empeoran"} · {resumen.iguales}{" "}
                {resumen.iguales === 1 ? "se mantiene" : "se mantienen"}
              </p>
              {/* En el móvil, una tarjeta por aspecto: la tabla no cabe y se cortaba */}
              <ul className="mt-4 space-y-2 sm:hidden">
                {filas.map((fila) => {
                  const ui = CAMBIO_UI[fila.cambio];
                  return (
                    <li key={fila.clave} className="rounded-2xl border border-white/10 bg-black/20 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-medium text-white">{fila.titulo}</p>
                        <span className={`inline-flex shrink-0 items-center gap-1 text-xs font-medium ${ui.clase}`}>
                          <ui.Icono className="h-4 w-4" strokeWidth={1.75} />
                          {ui.texto}
                        </span>
                      </div>
                      {fila.fase ? (
                        <p className="mt-0.5 text-[11px] uppercase tracking-wider text-slate-500">{fila.fase}</p>
                      ) : null}
                      <div className="mt-2.5 flex flex-wrap items-center gap-2">
                        <EstadoEvaluacion tipo={fila.antes} />
                        <ArrowRight className="h-3.5 w-3.5 text-slate-500" aria-label="después" />
                        <EstadoEvaluacion tipo={fila.despues} />
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-4 hidden overflow-x-auto rounded-2xl border border-white/10 sm:block">
                <table className="w-full min-w-[34rem] text-left text-sm">
                  <thead className="bg-white/5 text-xs uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="px-4 py-3 font-medium">Aspecto</th>
                      <th className="px-4 py-3 font-medium">Antes</th>
                      <th className="px-4 py-3 font-medium">Después</th>
                      <th className="px-4 py-3 font-medium">Cambio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((fila) => {
                      const ui = CAMBIO_UI[fila.cambio];
                      return (
                        <tr key={fila.clave} className="border-t border-white/10">
                          <td className="px-4 py-3 text-white">
                            {fila.fase ? (
                              <span className="mr-2 rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-300">
                                {fila.fase}
                              </span>
                            ) : null}
                            {fila.titulo}
                          </td>
                          <td className="px-4 py-3">
                            <EstadoEvaluacion tipo={fila.antes} />
                          </td>
                          <td className="px-4 py-3">
                            <EstadoEvaluacion tipo={fila.despues} />
                          </td>
                          <td className={`px-4 py-3 ${ui.clase}`}>
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium">
                              <ui.Icono className="h-4 w-4" strokeWidth={1.75} />
                              {ui.texto}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

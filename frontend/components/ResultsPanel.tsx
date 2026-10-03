"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clapperboard,
  Dumbbell,
  Images,
  Lightbulb,
  Loader2,
  PlayCircle,
} from "lucide-react";
import Papa from "papaparse";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { flushSync } from "react-dom";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import AnalysisPlayer, {
  type AnalysisPlayerHandle,
  type CoachHit,
} from "@/components/AnalysisPlayer";
import FallosCarrusel, {
  diapositivasDeFallos,
  type PosicionCarrusel,
} from "@/components/FallosCarrusel";
import { useSession } from "@/components/SessionProvider";
import type { FeedbackEvent, FeedbackTipo, ResumenGeneral } from "@/lib/api";
import {
  GUIA_POR_CATEGORIA,
  aciertos,
  esFallo,
  etiquetaPrioridad,
  fallosOrdenados,
  medidaLegible,
} from "@/lib/consejos";
import { guardarArchivo } from "@/lib/descargas";
import { NOMBRE_INFORME_PDF, generarInformePdf } from "@/lib/informePdf";

type ChartRow = {
  Timestamp_ms: number;
  Angulo_Codo: number;
  Angulo_Rodilla_Der?: number;
  Angulo_Rodilla_Izq?: number;
};

type Pestana = "video" | "fallos";

const resultsEase = [0.22, 1, 0.36, 1] as const;

export const FEEDBACK_STYLES: Record<
  FeedbackTipo,
  { tarjeta: string; insignia: string; titulo: string; Icono: typeof CheckCircle2 }
> = {
  optimo: {
    tarjeta: "border-emerald-400/25 bg-emerald-400/10",
    insignia: "bg-emerald-400/15 text-emerald-200",
    titulo: "text-emerald-200",
    Icono: CheckCircle2,
  },
  correcto: {
    tarjeta: "border-emerald-400/25 bg-emerald-400/10",
    insignia: "bg-emerald-400/15 text-emerald-200",
    titulo: "text-emerald-200",
    Icono: CheckCircle2,
  },
  mejora: {
    tarjeta: "border-amber-400/25 bg-amber-400/10",
    insignia: "bg-amber-400/15 text-amber-200",
    titulo: "text-amber-200",
    Icono: AlertTriangle,
  },
  aviso: {
    tarjeta: "border-amber-400/25 bg-amber-400/10",
    insignia: "bg-amber-400/15 text-amber-200",
    titulo: "text-amber-200",
    Icono: AlertTriangle,
  },
  alerta: {
    tarjeta: "border-rose-400/25 bg-rose-500/10",
    insignia: "bg-rose-400/15 text-rose-200",
    titulo: "text-rose-200",
    Icono: AlertCircle,
  },
};

function instantesDe(evento: FeedbackEvent): { t: number; fase_corta?: string }[] {
  if (evento.eventos_detalle && evento.eventos_detalle.length > 0) {
    return evento.eventos_detalle.map((detalle) => ({
      t: detalle.t,
      fase_corta: detalle.fase_corta ?? evento.fase_corta,
    }));
  }
  const tiempos: number[] = [];
  if (evento.timestamps && evento.timestamps.length > 0) {
    tiempos.push(...evento.timestamps);
  } else if (typeof evento.timestamp === "number") {
    tiempos.push(evento.timestamp);
  } else if (typeof evento.timestamp_ms === "number") {
    tiempos.push(evento.timestamp_ms / 1000);
  }
  return tiempos.map((t) => ({ t, fase_corta: evento.fase_corta }));
}

function valorLegible(evento: FeedbackEvent): string | null {
  return medidaLegible(evento.categoria, evento.valor, esFallo(evento));
}

/** Tarjeta de un aspecto a corregir dentro del plan de mejora. */
function TarjetaFallo({
  evento,
  numero,
  onVerImagen,
  onVerEnVideo,
}: {
  evento: FeedbackEvent;
  numero: number;
  onVerImagen: () => void;
  onVerEnVideo: (t: number) => void;
}) {
  const prioridad = etiquetaPrioridad(evento.tipo);
  const guia = GUIA_POR_CATEGORIA[evento.categoria ?? ""];
  const valor = valorLegible(evento);
  const instantes = instantesDe(evento);

  return (
    <li className="rounded-2xl border border-white/10 bg-black/25 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span
          className={[
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-display text-sm font-bold",
            evento.tipo === "alerta" ? "bg-rose-500 text-white" : "bg-amber-400 text-slate-950",
          ].join(" ")}
        >
          {numero}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-base font-semibold text-white">{evento.titulo}</h3>
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${prioridad.clase}`}>
              {prioridad.texto}
            </span>
            {evento.fase_nombre ? (
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-slate-300">
                {evento.fase_nombre}
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">{evento.mensaje}</p>

          {valor || evento.objetivo_texto ? (
            <p className="mt-2 text-xs text-slate-400">
              {valor ? (
                <>
                  Tu media: <strong className="font-mono text-rose-100">{valor}</strong>
                </>
              ) : null}
              {valor && evento.objetivo_texto ? " · " : null}
              {evento.objetivo_texto ? (
                <strong className="text-emerald-100">{evento.objetivo_texto}</strong>
              ) : null}
            </p>
          ) : null}

          {evento.consejo_corto ? (
            <p className="mt-3 flex items-start gap-2 rounded-xl bg-cyan-400/5 px-3 py-2 text-sm text-cyan-50">
              <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" strokeWidth={1.75} />
              {evento.consejo_corto}
            </p>
          ) : null}

          {guia ? (
            <details className="group mt-2">
              <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-slate-400 transition hover:text-white [&::-webkit-details-marker]:hidden">
                <Dumbbell className="h-3.5 w-3.5" strokeWidth={1.75} />
                Ejercicios para corregirlo
              </summary>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">
                {guia.ejercicios.map((ejercicio) => (
                  <li key={ejercicio}>{ejercicio}</li>
                ))}
              </ul>
            </details>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onVerImagen}
              className="inline-flex items-center gap-1.5 rounded-full border border-cyan-300/30 bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-100 transition hover:bg-cyan-400/20"
            >
              <Images className="h-3.5 w-3.5" strokeWidth={1.75} />
              Ver imagen
            </button>
            {instantes.map((instante) => (
              <button
                key={`${instante.t}-${instante.fase_corta ?? ""}`}
                type="button"
                onClick={() => onVerEnVideo(instante.t)}
                aria-label={`Ver a cámara lenta el segundo ${instante.t.toFixed(1)}`}
                className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 font-mono text-xs text-slate-200 transition hover:border-cyan-300/50 hover:text-white"
              >
                <PlayCircle className="h-3 w-3" strokeWidth={1.75} />
                {instante.t.toFixed(1)} s{instante.fase_corta ? ` · ${instante.fase_corta}` : ""}
              </button>
            ))}
          </div>
        </div>
      </div>
    </li>
  );
}

type ResultsPanelProps = {
  originalUrl: string;
  processedUrl: string;
  csvUrl: string;
  tracksUrl: string | null;
  feedback: FeedbackEvent[];
  resumenGeneral: ResumenGeneral | null;
  tipoGolpe: string | null;
  /** Botones que se muestran al final, junto a "Descargar métricas CSV". */
  actions?: ReactNode;
  className?: string;
  /** La página de un análisis guardado ya muestra la nota en su cabecera. */
  mostrarNota?: boolean;
};

export default function ResultsPanel({
  originalUrl,
  processedUrl,
  csvUrl,
  tracksUrl,
  feedback,
  resumenGeneral,
  tipoGolpe,
  actions,
  className,
  mostrarNota = true,
}: ResultsPanelProps) {
  const { user } = useSession();
  const isLoggedIn = Boolean(user);
  const [chartData, setChartData] = useState<ChartRow[]>([]);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [usuarioInforme, setUsuarioInforme] = useState<string | null>(null);
  const [pestana, setPestana] = useState<Pestana>("video");
  const [carruselAbierto, setCarruselAbierto] = useState(false);
  const [posicion, setPosicion] = useState<PosicionCarrusel>({ indice: 0, ocurrencia: 0 });
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<AnalysisPlayerHandle>(null);
  const vistasRef = useRef<HTMLDivElement>(null);

  const fallos = useMemo(() => fallosOrdenados(feedback), [feedback]);
  const bien = useMemo(() => aciertos(feedback), [feedback]);
  const diapositivas = useMemo(() => diapositivasDeFallos(feedback), [feedback]);

  const cambiarPestana = useCallback((nueva: Pestana) => {
    if (nueva === "fallos") {
      playerRef.current?.pausar();
      setCarruselAbierto(true);
    }
    setPestana(nueva);
  }, []);

  const verEnVideo = useCallback((t: number) => {
    setPestana("video");
    // Tras mostrar la pestaña, el reproductor ya es visible para desplazarse a él
    requestAnimationFrame(() => playerRef.current?.verMomento(t));
  }, []);

  const verImagen = useCallback(
    (indice: number, ocurrencia = 0) => {
      setPosicion({ indice, ocurrencia });
      cambiarPestana("fallos");
      requestAnimationFrame(() =>
        vistasRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      );
    },
    [cambiarPestana],
  );

  // Desde la cámara lenta: abre la diapositiva y el momento de ese fallo
  const verImagenDeHit = useCallback(
    (hit: CoachHit) => {
      const indice = diapositivas.findIndex((d) => d.evento.titulo === hit.titulo);
      if (indice < 0) return;
      const ocurrencia = Math.max(
        0,
        diapositivas[indice].ocurrencias.findIndex((o) => Math.abs(o.t - hit.t) < 0.05),
      );
      verImagen(indice, ocurrencia);
    },
    [diapositivas, verImagen],
  );

  const capturar = useCallback(
    (hit: CoachHit) => playerRef.current?.capturarFallo(hit) ?? Promise.resolve(null),
    [],
  );

  useEffect(() => {
    if (!isLoggedIn) return;
    let cancelled = false;
    async function loadUsuario() {
      try {
        const response = await fetch("/api/auth/me", { credentials: "include" });
        if (!response.ok) return;
        const data = (await response.json()) as {
          user?: { nombre?: string; apellidos?: string; username?: string };
        };
        if (cancelled || !data.user) return;
        const nombreCompleto = [data.user.nombre, data.user.apellidos]
          .filter(Boolean)
          .join(" ")
          .trim();
        setUsuarioInforme(nombreCompleto || data.user.username || null);
      } catch {
        // Anónimo: el PDF se genera sin nombre de jugador
      }
    }
    void loadUsuario();
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn]);

  const handleDownloadPdf = useCallback(async () => {
    if (generatingPdf) return;
    flushSync(() => setGeneratingPdf(true));
    try {
      const snapshots =
        (await playerRef.current?.capturePhaseSnapshots()) ?? [];
      const pdf = generarInformePdf({
        snapshots,
        resumen: resumenGeneral,
        evaluaciones: feedback,
        usuario: usuarioInforme,
        tipoGolpe,
      });
      await guardarArchivo(pdf, NOMBRE_INFORME_PDF);
      toast.success("Informe PDF generado");
    } catch (err) {
      console.error("No se pudo generar el informe PDF", err);
      toast.error("No se pudo generar el informe PDF.");
    } finally {
      setGeneratingPdf(false);
    }
  }, [feedback, generatingPdf, resumenGeneral, tipoGolpe, usuarioInforme]);

  const descargarCsv = useCallback(async () => {
    try {
      const response = await fetch(csvUrl);
      if (!response.ok) throw new Error(`Error HTTP ${response.status}`);
      await guardarArchivo(await response.blob(), "metricas-golpe.csv");
    } catch (err) {
      console.error("No se pudo descargar el CSV", err);
      toast.error("No se pudieron descargar las métricas.");
    }
  }, [csvUrl]);

  useEffect(() => {
    let cancelled = false;

    async function loadCsv() {
      try {
        const response = await fetch(csvUrl);
        if (!response.ok) {
          throw new Error(`Error HTTP ${response.status}`);
        }
        const texto = await response.text();
        const parsed = Papa.parse<ChartRow>(texto, {
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true,
        });

        if (!cancelled) {
          const rows = (parsed.data ?? []).filter(
            (row) =>
              typeof row.Timestamp_ms === "number" &&
              typeof row.Angulo_Codo === "number",
          );
          setChartData(rows);
        }
      } catch {
        if (!cancelled) {
          setChartData([]);
        }
      }
    }

    void loadCsv();
    return () => {
      cancelled = true;
    };
  }, [csvUrl]);

  const pestanas: { id: Pestana; texto: string; Icono: typeof Clapperboard; extra?: string }[] = [
    { id: "video", texto: "Cámara lenta", Icono: Clapperboard },
    { id: "fallos", texto: "Fallos uno a uno", Icono: Images, extra: String(fallos.length) },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: resultsEase }}
      className={["mx-auto w-full max-w-6xl", className ?? "mt-10"].join(" ")}
    >
      {resumenGeneral ? (
        <section
          aria-label="Resumen del análisis"
          className={[
            "mb-6 flex flex-col gap-4 rounded-3xl border p-5 shadow-xl sm:flex-row sm:items-center sm:justify-between",
            (FEEDBACK_STYLES[resumenGeneral.tipo] ?? FEEDBACK_STYLES.mejora).tarjeta,
          ].join(" ")}
        >
          <div className="min-w-0">
            <p className="font-display text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300/90">
              {tipoGolpe ? `Análisis de tu ${tipoGolpe.toLowerCase()}` : "Resumen"}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-slate-200">{resumenGeneral.mensaje}</p>
            {fallos.length > 0 ? (
              <p className="mt-2 text-sm text-white">
                <strong>Prioridad nº 1:</strong> {fallos[0].titulo}
                {fallos[0].consejo_corto ? ` — ${fallos[0].consejo_corto}` : ""}
              </p>
            ) : null}
          </div>
          {mostrarNota ? (
            <span className="shrink-0 self-start rounded-2xl border border-white/10 bg-black/30 px-5 py-3 text-center sm:self-auto">
              <span className="block font-display text-4xl font-semibold text-white">
                {resumenGeneral.puntuacion}
              </span>
              <span className="text-[11px] uppercase tracking-wider text-slate-400">/ 100</span>
            </span>
          ) : null}
        </section>
      ) : null}

      <article
        ref={vistasRef}
        className="scroll-mt-20 overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-4 shadow-xl backdrop-blur-md sm:p-5"
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div role="tablist" aria-label="Forma de ver el análisis" className="flex rounded-full border border-white/10 bg-black/30 p-1">
            {pestanas.map(({ id, texto, Icono, extra }) => {
              const activa = pestana === id;
              return (
                <button
                  key={id}
                  id={`pestana-${id}`}
                  type="button"
                  role="tab"
                  aria-selected={activa}
                  aria-controls={`panel-${id}`}
                  onClick={() => cambiarPestana(id)}
                  className={[
                    "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-2 text-xs font-medium transition sm:gap-2 sm:px-4 sm:text-sm",
                    activa ? "bg-cyan-400/20 text-cyan-50 shadow" : "text-slate-400 hover:text-white",
                  ].join(" ")}
                >
                  <Icono className="h-4 w-4" strokeWidth={1.75} />
                  {texto}
                  {extra ? (
                    <span className="rounded-full bg-white/10 px-1.5 text-[11px] text-slate-200">{extra}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => void handleDownloadPdf()}
            disabled={generatingPdf}
            className={[
              "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold shadow-lg transition-all duration-300",
              generatingPdf
                ? "cursor-wait border-cyan-400/20 bg-cyan-400/10 text-cyan-100/80"
                : "border-cyan-300/40 bg-gradient-to-r from-cyan-500/90 to-emerald-500/80 text-slate-950 hover:from-cyan-400 hover:to-emerald-400 hover:shadow-cyan-400/30",
            ].join(" ")}
          >
            {generatingPdf ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.2} />
                Procesando...
              </>
            ) : (
              "📄 Descargar Informe PDF"
            )}
          </button>
        </div>

        {/* El reproductor sigue montado al cambiar de pestaña: el carrusel usa su vídeo para las imágenes */}
        <div
          id="panel-video"
          role="tabpanel"
          aria-labelledby="pestana-video"
          hidden={pestana !== "video"}
        >
          <AnalysisPlayer
            ref={playerRef}
            originalUrl={originalUrl}
            processedUrl={processedUrl}
            tracksUrl={tracksUrl}
            videoRef={videoRef}
            feedback={feedback}
            tipoGolpe={tipoGolpe}
            lateralidad={resumenGeneral?.lateralidad ?? null}
            onVerImagenFallo={verImagenDeHit}
          />
        </div>
        <div
          id="panel-fallos"
          role="tabpanel"
          aria-labelledby="pestana-fallos"
          hidden={pestana !== "fallos"}
        >
          {carruselAbierto ? (
            <FallosCarrusel
              feedback={feedback}
              activo={pestana === "fallos"}
              posicion={posicion}
              onPosicion={setPosicion}
              capturar={capturar}
              onVerEnVideo={verEnVideo}
            />
          ) : null}
        </div>
      </article>

      {fallos.length > 0 || bien.length > 0 ? (
        <section className="mt-6 overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-4 shadow-xl backdrop-blur-md sm:p-6">
          <h2 className="font-display text-sm font-medium uppercase tracking-[0.2em] text-cyan-300/90">
            Plan de mejora
          </h2>
          <p className="mb-4 mt-1 text-xs text-slate-400">
            Ordenado por prioridad: empieza por el primero. Pulsa un segundo para verlo a cámara lenta.
          </p>

          {fallos.length > 0 ? (
            <ol className="space-y-3">
              {fallos.map((evento, index) => (
                <TarjetaFallo
                  key={`${evento.categoria ?? evento.titulo}-${index}`}
                  evento={evento}
                  numero={index + 1}
                  onVerImagen={() => verImagen(index)}
                  onVerEnVideo={verEnVideo}
                />
              ))}
            </ol>
          ) : null}

          {bien.length > 0 ? (
            <div className="mt-6">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-emerald-200">
                <CheckCircle2 className="h-4 w-4" strokeWidth={1.75} />
                Lo que ya haces bien
              </h3>
              <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {bien.map((evento, index) => (
                  <li
                    key={`${evento.categoria ?? evento.titulo}-${index}`}
                    className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 px-3 py-2.5"
                  >
                    <p className="flex items-center justify-between gap-2 text-sm font-medium text-white">
                      {evento.titulo}
                      {valorLegible(evento) ? (
                        <span className="font-mono text-xs text-emerald-200">{valorLegible(evento)}</span>
                      ) : null}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-400">{evento.mensaje}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Gráfica biomecánica full-width */}
      <section className="mt-6 overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-4 shadow-xl backdrop-blur-md sm:p-6">
        <h2 className="mb-4 font-display text-sm font-medium uppercase tracking-[0.2em] text-cyan-300/90">
          Evolución Biomecánica: Codo y Rodillas
        </h2>
        <div className="h-[340px] w-full">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartData}
                margin={{ top: 8, right: 12, left: 0, bottom: 8 }}
              >
                <CartesianGrid stroke="rgba(148,163,184,0.2)" strokeDasharray="4 4" />
                <XAxis
                  dataKey="Timestamp_ms"
                  stroke="#94a3b8"
                  tick={{ fill: "#94a3b8", fontSize: 12 }}
                  tickLine={false}
                  axisLine={{ stroke: "rgba(148,163,184,0.35)" }}
                  label={{
                    value: "Timestamp (ms)",
                    position: "insideBottom",
                    offset: -2,
                    fill: "#64748b",
                    fontSize: 12,
                  }}
                />
                <YAxis
                  stroke="#94a3b8"
                  tick={{ fill: "#94a3b8", fontSize: 12 }}
                  tickLine={false}
                  axisLine={{ stroke: "rgba(148,163,184,0.35)" }}
                  label={{
                    value: "Ángulo (°)",
                    angle: -90,
                    position: "insideLeft",
                    fill: "#64748b",
                    fontSize: 12,
                  }}
                />
                <Tooltip
                  contentStyle={{
                    background: "rgba(2,6,23,0.92)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 12,
                    color: "#e2e8f0",
                  }}
                  labelFormatter={(value) => `t = ${value} ms`}
                  formatter={(value, name) => [`${value}°`, String(name)]}
                />
                <Legend
                  verticalAlign="top"
                  height={28}
                  iconType="plainline"
                  wrapperStyle={{ fontSize: 12, color: "#cbd5e1" }}
                />
                <Line
                  type="monotone"
                  dataKey="Angulo_Codo"
                  name="Codo derecho"
                  stroke="#22d3ee"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: "#67e8f9" }}
                />
                <Line
                  type="monotone"
                  dataKey="Angulo_Rodilla_Der"
                  name="Rodilla derecha"
                  stroke="#ff2fd0"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: "#ff8beb" }}
                />
                <Line
                  type="monotone"
                  dataKey="Angulo_Rodilla_Izq"
                  name="Rodilla izquierda"
                  stroke="#ccff00"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: "#e4ff66" }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-slate-400">
              Cargando métricas del golpe...
            </div>
          )}
        </div>
      </section>

      <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
        <button
          type="button"
          onClick={() => void descargarCsv()}
          className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300 shadow-lg transition-all duration-300 hover:border-white/20 hover:bg-white/10 hover:text-white"
        >
          Descargar métricas CSV
        </button>
        {actions}
      </div>
    </motion.div>
  );
}

/** Estilo común de los botones secundarios que se pasan en `actions`. */
export const RESULTS_SECONDARY_ACTION_CLASS =
  "inline-flex items-center gap-2 rounded-xl border border-cyan-300/30 bg-cyan-400/10 px-4 py-3 text-sm font-medium text-cyan-100 shadow-lg transition-all duration-300 hover:border-cyan-300/50 hover:bg-cyan-400/20";

/** Estilo común del botón principal que se pasa en `actions`. */
export const RESULTS_PRIMARY_ACTION_CLASS = [
  "inline-flex items-center justify-center gap-2 rounded-2xl px-6 py-3",
  "bg-gradient-to-r from-cyan-300 via-emerald-300 to-cyan-400",
  "text-sm font-semibold text-slate-950",
  "border border-white/10 shadow-xl",
  "transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_40px_rgba(52,211,153,0.4)]",
].join(" ");

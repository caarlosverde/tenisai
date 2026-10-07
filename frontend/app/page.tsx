"use client";

import {
  useCallback,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { RotateCcw, UserRound } from "lucide-react";
import AnalyzeLoader from "@/components/AnalyzeLoader";
import Dropzone from "@/components/home/Dropzone";
import Hero from "@/components/home/Hero";
import Landing from "@/components/home/Landing";
import ResultsPanel, {
  RESULTS_PRIMARY_ACTION_CLASS,
  RESULTS_SECONDARY_ACTION_CLASS,
} from "@/components/ResultsPanel";
import { useSession } from "@/components/SessionProvider";
import Link from "next/link";
import {
  API_BASE_URL,
  MOTOR_NO_RESPONDE,
  type AnalysisProgress,
  type FeedbackEvent,
  type ResumenGeneral,
} from "@/lib/api";
import {
  ESTILO_DERECHA_DEFAULT,
  ESTILO_REVES_DEFAULT,
  LATERALIDAD_DEFAULT,
  normalizarEstiloDerecha,
  normalizarEstiloReves,
  normalizarLateralidad,
} from "@/lib/estiloJuego";
import { tamanoArchivo } from "@/lib/formato";
import { MAX_VIDEO_BYTES, MAX_VIDEO_MB, formatoVideo, nombreSinExtension } from "@/lib/video";
import { toast } from "sonner";
import { flushSync } from "react-dom";

const API_ANALYZE_URL = `${API_BASE_URL}/analizar-video`;
const POLL_INTERVAL_MS = 700;
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Mensaje de error que devuelve FastAPI en `detail`, o uno genérico. */
async function detalleDeError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { detail?: unknown };
    if (typeof data.detail === "string" && data.detail) return data.detail;
  } catch {
    // Respuesta sin JSON: no es del motor, sino de la web que le reenvía la petición
  }
  // 500-504 sin detalle: la web no pudo reenviar la petición porque el motor no responde
  if (response.status >= 500) return MOTOR_NO_RESPONDE;
  return `Error HTTP ${response.status}`;
}

/** Sondea el estado del análisis hasta que termina, informando de cada avance. */
async function esperarResultado(
  jobId: string,
  onUpdate: (estado: AnalysisProgress) => void,
): Promise<AnalysisProgress> {
  let limite = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < limite) {
    await sleep(POLL_INTERVAL_MS);

    const response = await fetch(`${API_BASE_URL}/progreso/${jobId}`);
    if (!response.ok) {
      throw new Error(await detalleDeError(response));
    }

    const estado = (await response.json()) as AnalysisProgress;
    onUpdate(estado);

    // El tiempo máximo cuenta desde que empieza a procesarse, no mientras espera en la cola
    if (estado.estado === "en_cola") limite = Date.now() + POLL_TIMEOUT_MS;

    if (estado.estado === "completado") return estado;
    if (estado.estado === "error") {
      throw new Error(estado.error ?? "El análisis falló en el servidor.");
    }
  }

  throw new Error("El análisis ha excedido el tiempo máximo de espera.");
}

export default function HomePage() {
  const { user, refresh } = useSession();
  const isLoggedIn = Boolean(user);
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState<AnalysisProgress | null>(null);
  const [feedback, setFeedback] = useState<FeedbackEvent[]>([]);
  const [resumenGeneral, setResumenGeneral] = useState<ResumenGeneral | null>(
    null,
  );
  const [tipoGolpe, setTipoGolpe] = useState<string | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [processedUrl, setProcessedUrl] = useState<string | null>(null);
  const [tracksUrl, setTracksUrl] = useState<string | null>(null);

  const hasResults = Boolean(originalUrl && processedUrl);

  const acceptFile = useCallback((next: File | null) => {
    if (!next) return;

    if (!formatoVideo(next)) {
      setFile(null);
      toast.error("Formato no admitido: elige un vídeo MP4 o MOV (vale el de la cámara del móvil).");
      return;
    }

    if (next.size > MAX_VIDEO_BYTES) {
      setFile(null);
      toast.error(
        `El vídeo supera el límite de ${MAX_VIDEO_MB} MB (${tamanoArchivo(next.size)}). Recórtalo para que solo salga el golpe.`,
      );
      return;
    }

    setFile(next);
  }, []);

  const onDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
  }, []);

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragging(false);
      const dropped = event.dataTransfer.files?.[0] ?? null;
      acceptFile(dropped);
    },
    [acceptFile],
  );

  const onFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      acceptFile(event.target.files?.[0] ?? null);
      event.target.value = "";
    },
    [acceptFile],
  );

  const resetToUpload = useCallback(() => {
    setFile(null);
    setOriginalUrl(null);
    setProcessedUrl(null);
    setTracksUrl(null);
    setIsAnalyzing(false);
    setProgress(null);
    setFeedback([]);
    setResumenGeneral(null);
    setTipoGolpe(null);
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (!file || isAnalyzing) return;

    flushSync(() => {
      setIsAnalyzing(true);
      setProgress({
        estado: "en_cola",
        progreso: 0,
        frames_procesados: 0,
        frames_totales: 0,
      });
    });

    try {
      const formData = new FormData();
      formData.append("file", file);

      let estiloReves = ESTILO_REVES_DEFAULT;
      let estiloDerecha = ESTILO_DERECHA_DEFAULT;
      let lateralidad = LATERALIDAD_DEFAULT;
      try {
        const meRes = isLoggedIn
          ? await fetch("/api/auth/me", { credentials: "include" })
          : null;
        if (meRes?.ok) {
          const meData = (await meRes.json()) as {
            user?: {
              estiloReves?: string;
              estiloDerecha?: string;
              lateralidad?: string;
            };
          };
          estiloReves = normalizarEstiloReves(meData.user?.estiloReves);
          estiloDerecha = normalizarEstiloDerecha(meData.user?.estiloDerecha);
          lateralidad = normalizarLateralidad(meData.user?.lateralidad);
        }
      } catch {
        // Anónimo: el backend aplica los mismos valores por defecto
      }
      formData.append("estilo_reves", estiloReves);
      formData.append("estilo_derecha", estiloDerecha);
      formData.append("lateralidad", lateralidad);

      let response: Response;
      try {
        response = await fetch(API_ANALYZE_URL, {
          method: "POST",
          body: formData,
          // Envía la cookie de sesión: el backend identifica al usuario para sus límites
          credentials: "include",
        });
      } catch {
        throw new Error("no se pudo enviar el vídeo. Comprueba tu conexión a internet.");
      }

      if (!response.ok) {
        // 401: la sesión ya no es válida; se actualiza la barra de navegación
        if (response.status === 401) void refresh();
        throw new Error(await detalleDeError(response));
      }

      const { job_id: jobId, por_delante: porDelante } = (await response.json()) as {
        job_id?: string;
        por_delante?: number;
      };
      if (!jobId) {
        throw new Error("La API no devolvió un identificador de análisis.");
      }
      setProgress((actual) => (actual ? { ...actual, por_delante: porDelante } : actual));

      const data = await esperarResultado(jobId, setProgress);

      if (!data.original_url || !data.processed_url) {
        throw new Error("La API no devolvió las URLs esperadas.");
      }

      // Cada análisis tiene su propia carpeta en el backend: las URLs son únicas
      setOriginalUrl(data.original_url);
      setProcessedUrl(data.processed_url);
      setTracksUrl(data.tracks_url ?? null);
      setFeedback(data.feedback ?? []);
      setResumenGeneral(data.resumen_general ?? null);
      setTipoGolpe(
        data.tipo_golpe
          ?? data.resumen_general?.tipo_golpe
          ?? null,
      );
      if (!isLoggedIn) {
        toast.success("Análisis biomecánico concluido");
        return;
      }

      // Guardar en el historial del usuario. El jobId enlaza la fila con la
      // carpeta del backend y hace el guardado idempotente.
      const videoNombre =
        nombreSinExtension(file.name) || "Análisis biomecánico";
      try {
        const resumen = data.resumen_general;
        const guardado = await fetch("/api/analisis/guardar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            jobId,
            videoNombre,
            puntuacion: resumen?.puntuacion ?? 0,
            tipoGolpe:
              data.tipo_golpe
              ?? resumen?.tipo_golpe
              ?? "Derecha",
            resumen: resumen?.mensaje ?? data.mensaje ?? "",
            // Copia del texto del entrenador: se sigue viendo aunque se borren los vídeos
            detalles: {
              adaptacion: resumen?.adaptacion ?? null,
              lateralidad: resumen?.lateralidad ?? null,
              estilo_reves: resumen?.estilo_reves ?? null,
              estilo_derecha: resumen?.estilo_derecha ?? null,
              evaluaciones: (data.feedback ?? []).map((ev) => ({
                titulo: ev.titulo,
                tipo: ev.tipo,
                categoria: ev.categoria,
                mensaje: ev.mensaje,
                fase_nombre: ev.fase_nombre,
              })),
            },
          }),
        });
        if (!guardado.ok) throw new Error(`HTTP ${guardado.status}`);
        toast.success("Análisis concluido y guardado en tu perfil");
      } catch {
        // Un fallo al guardar no debe interrumpir la visualización del análisis
        toast.warning("Análisis concluido, pero no se pudo guardar en tu perfil.");
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Error desconocido";
      const mensaje = `No se pudo completar el análisis: ${detail}`;
      toast.error(mensaje);
    } finally {
      setIsAnalyzing(false);
      setProgress(null);
    }
  }, [file, isAnalyzing, isLoggedIn, refresh]);

  const zonaSubida = (
    <Dropzone
      file={file}
      isDragging={isDragging}
      isAnalyzing={isAnalyzing}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onBrowse={() => inputRef.current?.click()}
      onFileChange={onFileChange}
      onClear={() => {
        setFile(null);
      }}
      onAnalyze={handleAnalyze}
      inputRef={inputRef}
      isLoggedIn={isLoggedIn}
      mostrarGuia={isLoggedIn}
    />
  );

  return (
    <div className="relative min-h-[calc(100vh-4rem)] overflow-hidden text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_#0b1a33_0%,_#020617_45%,_#000000_100%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(16,185,129,0.08),transparent_40%)]" />
      <div className="pointer-events-none absolute -top-32 left-1/2 h-72 w-[36rem] -translate-x-1/2 rounded-full bg-cyan-500/10 blur-3xl animate-[pulseGlow_6s_ease-in-out_infinite]" />

      <div className="relative z-10 flex flex-1 flex-col items-center px-4 pb-16 pt-10 sm:px-6 md:pt-16">
        {hasResults || isAnalyzing || isLoggedIn ? (
          <Hero compact={hasResults} analyzing={isAnalyzing && !hasResults} />
        ) : null}

        {hasResults && originalUrl && processedUrl ? (
          <ResultsPanel
            originalUrl={originalUrl}
            processedUrl={processedUrl}
            tracksUrl={tracksUrl}
            feedback={feedback}
            resumenGeneral={resumenGeneral}
            tipoGolpe={tipoGolpe}
            actions={
              <>
                {isLoggedIn ? (
                  <Link href="/perfil" className={RESULTS_SECONDARY_ACTION_CLASS}>
                    <UserRound className="h-4 w-4" strokeWidth={1.75} />
                    Ver en mis análisis
                  </Link>
                ) : (
                  <Link href="/registro" className={RESULTS_SECONDARY_ACTION_CLASS}>
                    <UserRound className="h-4 w-4" strokeWidth={1.75} />
                    Crea una cuenta para guardar tus análisis
                  </Link>
                )}
                <button
                  type="button"
                  onClick={resetToUpload}
                  className={RESULTS_PRIMARY_ACTION_CLASS}
                >
                  <RotateCcw className="h-4 w-4" strokeWidth={1.75} />
                  Analizar nuevo vídeo
                </button>
              </>
            }
          />
        ) : isAnalyzing ? (
          <AnalyzeLoader
            // Al salir de la cola se reinicia el cronómetro de los pasos
            key={progress?.estado === "en_cola" ? "en-cola" : "procesando"}
            fileName={file?.name}
            progreso={progress?.progreso}
            framesProcesados={progress?.frames_procesados}
            framesTotales={progress?.frames_totales}
            estado={progress?.estado}
            porDelante={progress?.por_delante}
          />
        ) : isLoggedIn ? (
          zonaSubida
        ) : (
          // Visitante: portada con la zona de subida en la sección "Pruébalo"
          <Landing zonaSubida={zonaSubida} />
        )}
      </div>
    </div>
  );
}

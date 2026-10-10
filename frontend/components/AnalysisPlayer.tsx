"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type RefObject,
} from "react";
import {
  AlertCircle,
  AlertTriangle,
  CircleCheck,
  Images,
  Maximize,
  Minimize,
  Pause,
  PauseCircle,
  Play,
  ScanSearch,
  SlidersHorizontal,
  StepBack,
  StepForward,
} from "lucide-react";
// La lógica pura (tipos, poses, dibujo en canvas...) vive en ./analysis-player/
import {
  type CoachFeedback,
  type CoachHit,
  type Layers,
  type PhaseSnapshot,
  type PlaybackRate,
  type PoseFrame,
  type PoseTracks,
  type ViewMode,
} from "./analysis-player/tipos";
import {
  BANNER_WINDOW,
  FAULT_WINDOW,
  PAUSE_MS,
  PAUSE_PEAK_WINDOW,
  STEPPER_FASES,
} from "./analysis-player/constantes";
import {
  interpolateFrame,
  lookupFase,
  pickPhaseTimestamps,
  tipoGolpeEn,
} from "./analysis-player/pose";
import { contentRect, waitSeeked } from "./analysis-player/video";
import { activeHits, flattenFaults } from "./analysis-player/coach";
import { drawOverlay } from "./analysis-player/dibujo";
import { imagenDeFallo } from "./analysis-player/captura";
import { medidaLegible } from "@/lib/consejos";

// API pública de este módulo (otros archivos importan estos tipos desde aquí)
export type {
  CoachFeedback,
  CoachHit,
  EventoDetalle,
  GolpeFase,
  PhaseSnapshot,
  PoseFrame,
  PoseLandmark,
  PoseTracks,
  ZonaCorporal,
} from "./analysis-player/tipos";
export { pickPhaseTimestamps } from "./analysis-player/pose";

type AnalysisPlayerProps = {
  originalUrl: string;
  processedUrl: string;
  tracksUrl: string | null;
  videoRef: RefObject<HTMLVideoElement | null>;
  feedback?: CoachFeedback[];
  tipoGolpe?: string | null;
  lateralidad?: string | null;
  /** Abre la imagen de un fallo en la vista "Fallos uno a uno". */
  onVerImagenFallo?: (hit: CoachHit) => void;
};

export type AnalysisPlayerHandle = {
  capturePhaseSnapshots: () => Promise<PhaseSnapshot[]>;
  /** Imagen (data URL) del fotograma del fallo, recortada al jugador; null si no se pudo. */
  capturarFallo: (hit: CoachHit) => Promise<string | null>;
  /** Lleva el vídeo poco antes del instante `t` y lo reproduce a cámara lenta. */
  verMomento: (t: number) => void;
  pausar: () => void;
};

const VELOCIDADES: PlaybackRate[] = [0.15, 0.25, 0.5, 1];
const ALTO_MAXIMO_VH = 0.72;
const ZOOM_MAXIMO = 3.2;
// Segundos de "inercia" del zoom al seguir al jugador (más alto = más suave)
const ZOOM_SUAVIDAD_S = 0.35;

function segundos(valor: number): string {
  return `${valor.toFixed(2).replace(".", ",")} s`;
}

const AnalysisPlayer = forwardRef<AnalysisPlayerHandle, AnalysisPlayerProps>(
  function AnalysisPlayer(
    {
      originalUrl,
      processedUrl,
      tracksUrl,
      videoRef,
      feedback = [],
      tipoGolpe = null,
      lateralidad = null,
      onVerImagenFallo,
    },
    ref,
  ) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const captureVideoRef = useRef<HTMLVideoElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const sliderRef = useRef<HTMLDivElement>(null);
  const contenedorRef = useRef<HTMLDivElement>(null);
  const marcoRef = useRef<HTMLDivElement>(null);
  const escenaRef = useRef<HTMLDivElement>(null);
  const tiempoRef = useRef<HTMLSpanElement>(null);
  const [mode, setMode] = useState<ViewMode>("interactive");
  const [rate, setRate] = useState<PlaybackRate>(0.25);
  const [layers, setLayers] = useState<Layers>({
    skeleton: true,
    angles: true,
    bbox: false,
  });
  const [tracks, setTracks] = useState<PoseTracks | null>(null);
  const [tracksError, setTracksError] = useState<string | null>(null);
  const [pauseOnFaults, setPauseOnFaults] = useState(false);
  const [banner, setBanner] = useState<CoachHit | null>(null);
  const [currentFase, setCurrentFase] = useState("recuperacion");
  // Tipo del golpe que se está viendo (null: el del clip)
  const [tipoActual, setTipoActual] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [proporcion, setProporcion] = useState(16 / 9);
  const [tamano, setTamano] = useState<{ w: number; h: number } | null>(null);
  const [seguirJugador, setSeguirJugador] = useState(true);
  const [reproduciendo, setReproduciendo] = useState(false);
  const [pantallaCompleta, setPantallaCompleta] = useState(false);

  const tracksRef = useRef<PoseTracks | null>(null);
  const layersRef = useRef(layers);
  const modeRef = useRef(mode);
  const rateRef = useRef(rate);
  const savedTimeRef = useRef(0);
  const wasPlayingRef = useRef(false);
  const autoplayDoneRef = useRef(false);
  const prevModeRef = useRef(mode);
  const pauseOnFaultsRef = useRef(pauseOnFaults);
  const faultsRef = useRef<CoachHit[]>([]);
  const tipoGolpeRef = useRef<string | null>(tipoGolpe);
  const lateralidadRef = useRef<string | null>(lateralidad);
  const pausedHitsRef = useRef<Set<string>>(new Set());
  const pauseTimerRef = useRef<number | null>(null);
  const lastTimeRef = useRef(0);
  const bannerKeyRef = useRef<string | null>(null);
  const faseKeyRef = useRef<string>("recuperacion");
  const tipoActualRef = useRef<string | null>(null);
  const holdingPauseRef = useRef(false);
  const seguirRef = useRef(seguirJugador);
  const zoomRef = useRef({ s: 1, cx: 0, cy: 0, ultimo: 0 });
  // Las capturas usan el mismo <video> oculto: se hacen de una en una
  const colaCapturasRef = useRef<Promise<unknown>>(Promise.resolve());

  const faults = useMemo(() => flattenFaults(feedback), [feedback]);
  const faultsPorTiempo = useMemo(() => [...faults].sort((a, b) => a.t - b.t), [faults]);
  const golpesFases = tracks?.golpes_fases ?? [];

  function enCola<T>(tarea: () => Promise<T>): Promise<T> {
    const resultado = colaCapturasRef.current.then(tarea, tarea);
    colaCapturasRef.current = resultado.catch(() => undefined);
    return resultado;
  }

  useImperativeHandle(
    ref,
    () => ({
      capturePhaseSnapshots: () =>
        enCola(async () => {
          const capture = captureVideoRef.current;
          if (!capture) return [];
          if (capture.readyState < 1) {
            await new Promise<void>((resolve) => {
              const done = () => resolve();
              capture.addEventListener("loadedmetadata", done, { once: true });
              window.setTimeout(done, 2500);
            });
          }
          capture.pause();
          const data = tracksRef.current;
          const dur = Number.isFinite(capture.duration) ? capture.duration : 0;
          const puntos = data
            ? pickPhaseTimestamps(data)
            : [
                { fase: "preparacion", fase_label: "1. Preparación", t: dur * 0.2 },
                { fase: "carga", fase_label: "2. Carga", t: dur * 0.45 },
                { fase: "impacto", fase_label: "3. Impacto", t: dur * 0.65 },
                { fase: "terminacion", fase_label: "4. Terminación", t: dur * 0.85 },
              ];
          const canvas = document.createElement("canvas");
          const snapshots: PhaseSnapshot[] = [];
          for (const punto of puntos) {
            await waitSeeked(capture, punto.t);
            await new Promise<void>((resolve) => {
              requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
            });
            const w = capture.videoWidth || 1280;
            const h = capture.videoHeight || 720;
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext("2d");
            if (!ctx) continue;
            ctx.drawImage(capture, 0, 0, w, h);
            const frame = data ? interpolateFrame(data, punto.t) : null;
            if (frame) {
              const hits = activeHits(faultsRef.current, punto.t, FAULT_WINDOW);
              drawOverlay(
                ctx,
                capture,
                frame,
                { skeleton: true, angles: true, bbox: false },
                hits,
                {
                  width: w,
                  height: h,
                  clear: false,
                  letterbox: false,
                  phaseLabel: `${punto.fase_label}  ·  ${punto.t.toFixed(2)}s`,
                  tipoGolpe: tipoGolpeEn(data, punto.t, tipoGolpeRef.current),
                  lateralidad: lateralidadRef.current,
                  escala: Math.max(1, h / 720),
                },
              );
            }
            let dataUrl = "";
            try {
              dataUrl = canvas.toDataURL("image/jpeg", 0.9);
            } catch {
              dataUrl = "";
            }
            snapshots.push({
              fase: punto.fase,
              fase_label: punto.fase_label,
              t: punto.t,
              dataUrl,
              angulos: frame?.angulos
                ? {
                    codo_der: frame.angulos.codo_der,
                    rodilla_der: frame.angulos.rodilla_der,
                    rodilla_izq: frame.angulos.rodilla_izq,
                  }
                : null,
            });
          }
          return snapshots;
        }),
      capturarFallo: (hit: CoachHit) =>
        enCola(async () => {
          const capture = captureVideoRef.current;
          if (!capture) return null;
          return imagenDeFallo(capture, tracksRef.current, hit, lateralidadRef.current);
        }),
      verMomento: (t: number) => {
        const video = videoRef.current;
        if (!video) return;
        setRate(0.25);
        video.playbackRate = 0.25;
        // Un poco antes del fallo para ver cómo se llega a él
        video.currentTime = Math.max(0, t - 0.5);
        void video.play().catch(() => undefined);
        marcoRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      },
      pausar: () => {
        videoRef.current?.pause();
      },
    }),
    // enCola usa solo refs: la API es estable durante toda la vida del componente
    [videoRef],
  );

  useEffect(() => {
    tracksRef.current = tracks;
  }, [tracks]);
  useEffect(() => {
    layersRef.current = layers;
  }, [layers]);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  useEffect(() => {
    rateRef.current = rate;
  }, [rate]);
  useEffect(() => {
    pauseOnFaultsRef.current = pauseOnFaults;
  }, [pauseOnFaults]);
  useEffect(() => {
    faultsRef.current = faults;
  }, [faults]);
  useEffect(() => {
    tipoGolpeRef.current = tipoGolpe;
  }, [tipoGolpe]);
  useEffect(() => {
    lateralidadRef.current = lateralidad;
  }, [lateralidad]);

  useEffect(() => {
    autoplayDoneRef.current = false;
  }, [originalUrl]);

  useEffect(() => {
    if (!tracksUrl) {
      setTracks(null);
      return;
    }
    let cancelled = false;
    setTracksError(null);
    void fetch(tracksUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<PoseTracks>;
      })
      .then((data) => {
        if (!cancelled) setTracks(data);
      })
      .catch(() => {
        if (!cancelled) {
          setTracks(null);
          setTracksError("No se pudieron cargar los datos de la pose: se muestra el vídeo sin esqueleto.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [tracksUrl]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = rate;
  }, [rate, videoRef]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.loop = true;
    const boot = () => {
      video.loop = true;
      video.playbackRate = rateRef.current;
      if (video.videoWidth && video.videoHeight) {
        setProporcion(video.videoWidth / video.videoHeight);
      }
      if (video.duration && Number.isFinite(video.duration)) {
        setDuration(video.duration);
      }
      if (!autoplayDoneRef.current) {
        autoplayDoneRef.current = true;
        video.playbackRate = 0.25;
        if (rateRef.current !== 0.25) setRate(0.25);
        void video.play().catch(() => undefined);
      }
    };
    const onPlay = () => setReproduciendo(true);
    const onPause = () => setReproduciendo(false);
    if (video.readyState >= 1) boot();
    video.addEventListener("loadedmetadata", boot);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    return () => {
      video.removeEventListener("loadedmetadata", boot);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
    };
  }, [originalUrl, videoRef]);

  // Tamaño del marco: la proporción real del vídeo (vertical u horizontal),
  // sin pasar del 72 % del alto de la ventana
  useEffect(() => {
    const contenedor = contenedorRef.current;
    if (!contenedor) return;
    const medir = () => {
      const ancho = contenedor.clientWidth;
      const altoMaximo = Math.min(window.innerHeight * ALTO_MAXIMO_VH, 880);
      let w = ancho;
      let h = w / proporcion;
      if (h > altoMaximo) {
        h = altoMaximo;
        w = h * proporcion;
      }
      setTamano({ w: Math.round(w), h: Math.round(h) });
    };
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(contenedor);
    window.addEventListener("resize", medir);
    return () => {
      observador.disconnect();
      window.removeEventListener("resize", medir);
    };
  }, [proporcion]);

  useEffect(() => {
    const cambio = () => setPantallaCompleta(document.fullscreenElement === marcoRef.current);
    document.addEventListener("fullscreenchange", cambio);
    return () => document.removeEventListener("fullscreenchange", cambio);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (prevModeRef.current === mode) return;
    prevModeRef.current = mode;
    const keepTime = savedTimeRef.current;
    const wasPlaying = wasPlayingRef.current;
    const restore = () => {
      try {
        video.currentTime = keepTime;
      } catch {
        /* ignore */
      }
      video.loop = true;
      video.playbackRate = rateRef.current;
      if (wasPlaying) void video.play().catch(() => undefined);
    };
    if (video.readyState >= 1) restore();
    video.addEventListener("loadedmetadata", restore, { once: true });
    return () => video.removeEventListener("loadedmetadata", restore);
  }, [mode, videoRef]);

  const seekTo = useCallback(
    (seconds: number) => {
      const video = videoRef.current;
      if (!video) return;
      if (pauseTimerRef.current) {
        window.clearTimeout(pauseTimerRef.current);
        pauseTimerRef.current = null;
        holdingPauseRef.current = false;
      }
      video.currentTime = seconds;
      void video.play().catch(() => undefined);
    },
    [videoRef],
  );

  /** Zoom que sigue al jugador: escala y centra la escena en su recuadro. */
  const aplicarZoom = useCallback(
    (frame: PoseFrame | null) => {
      const video = videoRef.current;
      const escena = escenaRef.current;
      if (!video || !escena) return;
      const W = video.clientWidth;
      const H = video.clientHeight;
      if (!W || !H) return;

      let objetivo = { s: 1, cx: W / 2, cy: H / 2 };
      if (seguirRef.current && frame?.bbox) {
        const area = contentRect(video);
        const [x1, y1, x2, y2] = frame.bbox;
        const altoJugador = Math.max(1, (y2 - y1) * area.h);
        const anchoJugador = Math.max(1, (x2 - x1) * area.w);
        const s = Math.min(ZOOM_MAXIMO, Math.max(1, Math.min((0.8 * H) / altoJugador, (0.9 * W) / anchoJugador)));
        objetivo = {
          s,
          cx: area.x + ((x1 + x2) / 2) * area.w,
          cy: area.y + ((y1 + y2) / 2) * area.h,
        };
      }

      // Suavizado dependiente del tiempo real: igual de fluido a 0,15x que a 1x
      const z = zoomRef.current;
      const ahora = performance.now();
      const dt = z.ultimo ? (ahora - z.ultimo) / 1000 : 1;
      z.ultimo = ahora;
      const alfa = video.paused ? 1 : 1 - Math.exp(-dt / ZOOM_SUAVIDAD_S);
      z.s += (objetivo.s - z.s) * alfa;
      z.cx += (objetivo.cx - z.cx) * alfa;
      z.cy += (objetivo.cy - z.cy) * alfa;

      const tx = Math.min(0, Math.max(W - z.s * W, W / 2 - z.s * z.cx));
      const ty = Math.min(0, Math.max(H - z.s * H, H / 2 - z.s * z.cy));
      escena.style.transform = `translate(${tx}px, ${ty}px) scale(${z.s})`;
    },
    [videoRef],
  );

  const paint = useCallback(
    (mediaTime?: number) => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const data = tracksRef.current;
      const time =
        typeof mediaTime === "number" && Number.isFinite(mediaTime)
          ? mediaTime
          : (video?.currentTime ?? 0);
      if (video) savedTimeRef.current = time;

      if (video?.duration && playheadRef.current) {
        const pct = Math.min(100, Math.max(0, (time / video.duration) * 100));
        playheadRef.current.style.left = `${pct}%`;
        // Valor accesible del slider y reloj, sin re-renderizar en cada fotograma
        sliderRef.current?.setAttribute("aria-valuenow", time.toFixed(1));
        sliderRef.current?.setAttribute(
          "aria-valuetext",
          `${time.toFixed(1)} de ${video.duration.toFixed(1)} segundos`,
        );
        if (tiempoRef.current) {
          tiempoRef.current.textContent = `${segundos(time)} / ${segundos(video.duration)}`;
        }
      }

      const nearBanner = activeHits(faultsRef.current, time, BANNER_WINDOW)[0] ?? null;
      const bannerKey = nearBanner ? `${nearBanner.zona}-${nearBanner.t}` : null;
      if (bannerKey !== bannerKeyRef.current) {
        bannerKeyRef.current = bannerKey;
        setBanner(nearBanner);
      }

      const faseAhora = lookupFase(tracksRef.current, time);
      if (faseAhora.fase !== faseKeyRef.current) {
        faseKeyRef.current = faseAhora.fase;
        setCurrentFase(faseAhora.fase);
      }

      const tipoAhora = tipoGolpeEn(tracksRef.current, time, null);
      if (tipoAhora !== tipoActualRef.current) {
        tipoActualRef.current = tipoAhora;
        setTipoActual(tipoAhora);
      }

      if (
        pauseOnFaultsRef.current &&
        video &&
        !video.paused &&
        !holdingPauseRef.current
      ) {
        if (time + 0.2 < lastTimeRef.current) {
          pausedHitsRef.current.clear();
        }
        lastTimeRef.current = time;
        for (const hit of faultsRef.current) {
          const key = `${hit.zona}-${hit.t.toFixed(2)}`;
          if (pausedHitsRef.current.has(key)) continue;
          if (Math.abs(time - hit.t) <= PAUSE_PEAK_WINDOW) {
            pausedHitsRef.current.add(key);
            holdingPauseRef.current = true;
            video.pause();
            pauseTimerRef.current = window.setTimeout(() => {
              pauseTimerRef.current = null;
              holdingPauseRef.current = false;
              video.playbackRate = rateRef.current;
              void video.play().catch(() => undefined);
            }, PAUSE_MS);
            break;
          }
        }
      } else {
        lastTimeRef.current = time;
      }

      const frame = data ? interpolateFrame(data, time) : null;
      aplicarZoom(frame);

      if (!video || !canvas || !data || modeRef.current !== "interactive") return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      if (!frame) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
      }
      const hits = activeHits(faultsRef.current, time, FAULT_WINDOW);
      drawOverlay(ctx, video, frame, layersRef.current, hits, {
        tipoGolpe: tipoGolpeEn(data, time, tipoGolpeRef.current),
        lateralidad: lateralidadRef.current,
        // El zoom amplía también el canvas: se compensa para que líneas y textos
        // se vean siempre del mismo tamaño en pantalla
        escala: 1 / zoomRef.current.s,
        // Más píxeles con zoom, por escalones de 0,5 (sin reasignar el canvas en cada
        // fotograma) y con tope para no disparar la memoria en pantallas de alta densidad
        supermuestreo: Math.max(
          1,
          Math.min(Math.ceil(zoomRef.current.s * 2) / 2, 3 / (window.devicePixelRatio || 1)),
        ),
      });
    },
    [aplicarZoom, videoRef],
  );

  useEffect(() => {
    seguirRef.current = seguirJugador;
    paint();
  }, [seguirJugador, paint]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    type FrameMeta = { mediaTime: number };
    type VideoRVFC = HTMLVideoElement & {
      requestVideoFrameCallback: (
        cb: (now: number, metadata: FrameMeta) => void,
      ) => number;
      cancelVideoFrameCallback: (handle: number) => void;
    };
    const supportsRVFC =
      "requestVideoFrameCallback" in HTMLVideoElement.prototype &&
      typeof (video as VideoRVFC).requestVideoFrameCallback === "function";
    const rvfcVideo = video as VideoRVFC;

    let raf = 0;
    let rvfc = 0;

    const stopLoop = () => {
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      if (rvfc && supportsRVFC) {
        rvfcVideo.cancelVideoFrameCallback(rvfc);
        rvfc = 0;
      }
    };

    const tickRaf = () => {
      paint();
      raf = requestAnimationFrame(tickRaf);
    };
    const tickRvfc = (_now: number, metadata: FrameMeta) => {
      paint(metadata.mediaTime);
      rvfc = rvfcVideo.requestVideoFrameCallback(tickRvfc);
    };

    const startLoop = () => {
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      if (supportsRVFC) {
        if (!rvfc) rvfc = rvfcVideo.requestVideoFrameCallback(tickRvfc);
        return;
      }
      if (!raf) raf = requestAnimationFrame(tickRaf);
    };

    const onSeek = () => {
      if (rvfc) return;
      paint();
    };
    const onPlay = () => startLoop();
    const onPause = () => {
      if (holdingPauseRef.current) {
        if (!raf) raf = requestAnimationFrame(tickRaf);
        return;
      }
      stopLoop();
      paint();
    };

    video.addEventListener("play", onPlay);
    video.addEventListener("playing", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("ended", onPause);
    video.addEventListener("seeked", onSeek);
    video.addEventListener("timeupdate", onSeek);
    video.addEventListener("loadeddata", onSeek);
    if (!video.paused && !video.ended) startLoop();
    else paint();

    const observer = new ResizeObserver(() => paint());
    observer.observe(video);

    return () => {
      stopLoop();
      video.removeEventListener("play", onPlay);
      video.removeEventListener("playing", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("ended", onPause);
      video.removeEventListener("seeked", onSeek);
      video.removeEventListener("timeupdate", onSeek);
      video.removeEventListener("loadeddata", onSeek);
      observer.disconnect();
    };
  }, [paint, videoRef, tracks, mode]);

  useEffect(() => {
    return () => {
      if (pauseTimerRef.current) window.clearTimeout(pauseTimerRef.current);
    };
  }, []);

  const toggleLayer = (key: keyof Layers) => {
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const changeMode = (next: ViewMode) => {
    const video = videoRef.current;
    if (video) {
      savedTimeRef.current = video.currentTime;
      wasPlayingRef.current = !video.paused;
    }
    setMode(next);
  };

  const alternarReproduccion = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play().catch(() => undefined);
    else video.pause();
  };

  /** Avanza o retrocede un fotograma (pausando el vídeo). */
  const pasoFotograma = (direccion: 1 | -1) => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    const fps = tracksRef.current?.fps || 30;
    const destino = video.currentTime + direccion / fps;
    video.currentTime = Math.min(video.duration || destino, Math.max(0, destino));
  };

  const alternarPantallaCompleta = () => {
    const marco = marcoRef.current;
    if (!marco) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void marco.requestFullscreen?.().catch(() => undefined);
  };

  // Atajos con el vídeo enfocado: espacio reproduce/pausa, flechas = fotograma a fotograma
  const onMarcoKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === " " || event.key === "k") {
      event.preventDefault();
      alternarReproduccion();
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      pasoFotograma(1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      pasoFotograma(-1);
    } else if (event.key === "f") {
      alternarPantallaCompleta();
    }
  };

  const onTimelineClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!duration) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    seekTo(ratio * duration);
  };

  // Teclado: flechas +/-0,5 s, Re Pág/Av Pág +/-2 s, Inicio/Fin (sin reanudar la reproducción)
  const onTimelineKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    if (!video || !duration) return;
    const pasos: Record<string, number> = {
      ArrowRight: 0.5,
      ArrowUp: 0.5,
      ArrowLeft: -0.5,
      ArrowDown: -0.5,
      PageUp: 2,
      PageDown: -2,
    };
    let destino: number | null = null;
    if (event.key in pasos) destino = video.currentTime + pasos[event.key];
    else if (event.key === "Home") destino = 0;
    else if (event.key === "End") destino = duration;
    if (destino === null) return;
    event.preventDefault();
    video.currentTime = Math.min(duration, Math.max(0, destino));
  };

  const showCanvas = mode === "interactive";
  const BannerIcon = banner?.tipo === "alerta" ? AlertCircle : AlertTriangle;
  const faseActual = STEPPER_FASES.find((paso) => paso.id === currentFase);

  return (
    <div>
      {/* Fases del golpe, encima del vídeo para no tapar al jugador */}
      <ol aria-label="Fases del golpe" className="mb-3 grid grid-cols-4 gap-1.5 sm:gap-2">
        {STEPPER_FASES.map((paso) => {
          const activa = currentFase === paso.id;
          return (
            <li
              key={paso.id}
              aria-current={activa ? "step" : undefined}
              className={[
                "truncate rounded-full border px-2 py-1.5 text-center text-[11px] font-semibold tracking-wide transition-colors duration-300 sm:text-xs",
                activa ? paso.classActive : "border-white/10 bg-black/30 text-slate-400",
              ].join(" ")}
            >
              {paso.label}
            </li>
          );
        })}
      </ol>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div ref={contenedorRef} className="min-w-0">
          <div className="flex justify-center overflow-hidden rounded-2xl border border-white/10 bg-black shadow-xl">
            <div
              ref={marcoRef}
              role="group"
              aria-label="Vídeo del análisis a cámara lenta. Espacio: reproducir o pausar; flechas: fotograma a fotograma; F: pantalla completa."
              tabIndex={0}
              onKeyDown={onMarcoKeyDown}
              className="relative overflow-hidden bg-black [&:fullscreen]:!h-screen [&:fullscreen]:!w-screen"
              style={tamano && !pantallaCompleta ? { width: tamano.w, height: tamano.h } : undefined}
            >
              <div
                ref={escenaRef}
                className="absolute inset-0 origin-top-left will-change-transform"
              >
                <video
                  ref={videoRef}
                  crossOrigin="anonymous"
                  src={mode === "interactive" ? originalUrl : processedUrl}
                  playsInline
                  muted
                  loop
                  onClick={alternarReproduccion}
                  className="h-full w-full cursor-pointer bg-black object-contain"
                />
                <canvas
                  ref={canvasRef}
                  className="pointer-events-none absolute inset-0 h-full w-full"
                  style={{ display: showCanvas ? "block" : "none" }}
                />
              </div>
              {tipoActual ?? tipoGolpe ? (
                <span className="pointer-events-none absolute left-3 top-3 rounded-full border border-amber-300/50 bg-black/60 px-3 py-1 text-[11px] font-semibold text-amber-100 backdrop-blur">
                  🎾 {tipoActual ?? tipoGolpe}
                </span>
              ) : null}
              {!reproduciendo ? (
                <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-[11px] text-slate-200 backdrop-blur">
                  En pausa
                </span>
              ) : null}
            </div>
          </div>

          {/* Controles propios: los nativos no sirven con el zoom de la escena */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1">
              <button
                type="button"
                onClick={() => pasoFotograma(-1)}
                aria-label="Fotograma anterior"
                title="Fotograma anterior (←)"
                className="rounded-full p-1.5 text-slate-300 transition hover:bg-white/10 hover:text-white"
              >
                <StepBack className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={alternarReproduccion}
                aria-label={reproduciendo ? "Pausar" : "Reproducir"}
                title={reproduciendo ? "Pausar (espacio)" : "Reproducir (espacio)"}
                className="rounded-full bg-cyan-400/20 p-2 text-cyan-100 transition hover:bg-cyan-400/30"
              >
                {reproduciendo ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={() => pasoFotograma(1)}
                aria-label="Fotograma siguiente"
                title="Fotograma siguiente (→)"
                className="rounded-full p-1.5 text-slate-300 transition hover:bg-white/10 hover:text-white"
              >
                <StepForward className="h-4 w-4" />
              </button>
            </div>
            <span ref={tiempoRef} className="min-w-[8.5rem] font-mono text-xs text-slate-400" aria-hidden>
              0,00 s / 0,00 s
            </span>

            <div role="group" aria-label="Velocidad" className="flex items-center gap-1">
              {VELOCIDADES.map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={rate === value}
                  onClick={() => setRate(value)}
                  className={chipClass(rate === value)}
                >
                  {String(value).replace(".", ",")}×
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-1 sm:ml-auto">
              <button
                type="button"
                aria-pressed={seguirJugador}
                onClick={() => setSeguirJugador((prev) => !prev)}
                className={chipClass(seguirJugador)}
                title="Acerca la imagen al jugador y lo sigue durante el golpe"
              >
                <span className="inline-flex items-center gap-1">
                  <ScanSearch className="h-3.5 w-3.5" strokeWidth={1.75} />
                  Seguir al jugador
                </span>
              </button>
              <button
                type="button"
                aria-pressed={pauseOnFaults}
                onClick={() => setPauseOnFaults((prev) => !prev)}
                className={chipClass(pauseOnFaults)}
                title="Detiene el vídeo un momento en cada fallo"
              >
                <span className="inline-flex items-center gap-1">
                  <PauseCircle className="h-3.5 w-3.5" strokeWidth={1.75} />
                  Pausar en fallos
                </span>
              </button>
              <button
                type="button"
                onClick={alternarPantallaCompleta}
                aria-label={pantallaCompleta ? "Salir de pantalla completa" : "Pantalla completa"}
                title="Pantalla completa (F)"
                className={chipClass(false)}
              >
                {pantallaCompleta ? <Minimize className="h-3.5 w-3.5" /> : <Maximize className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>

          <div className="mt-3">
            <div
              ref={sliderRef}
              role="slider"
              aria-label="Línea de tiempo de fases y errores"
              aria-valuemin={0}
              aria-valuemax={duration || 0}
              aria-valuenow={0}
              tabIndex={0}
              onClick={onTimelineClick}
              onKeyDown={onTimelineKeyDown}
              className="relative h-8 cursor-pointer rounded-full border border-white/10 bg-white/5 transition-all duration-300 hover:border-cyan-400/30 hover:bg-white/[0.07]"
            >
              <div className="absolute inset-x-3 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-slate-700/80">
                {duration > 0
                  ? golpesFases
                      .filter((golpe) => golpe.fase !== "recuperacion")
                      .map((golpe, index) => {
                        const estilo = STEPPER_FASES.find((p) => p.id === golpe.fase);
                        const left = (golpe.t_inicio / duration) * 100;
                        const width = Math.max(
                          0.6,
                          ((golpe.t_fin - golpe.t_inicio) / duration) * 100,
                        );
                        return (
                          <div
                            key={`${golpe.fase}-${golpe.t_inicio}-${index}`}
                            title={`${golpe.fase_label} (${golpe.t_inicio.toFixed(1)}s–${golpe.t_fin.toFixed(1)}s)`}
                            className={`absolute inset-y-0 ${estilo?.band ?? "bg-slate-400/40"}`}
                            style={{ left: `${left}%`, width: `${width}%` }}
                          />
                        );
                      })
                  : null}
              </div>
              <div
                ref={playheadRef}
                className="pointer-events-none absolute top-1/2 z-10 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-cyan-200 bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.7)]"
                style={{ left: "0%" }}
              />
              {duration > 0
                ? faults.map((hit, index) => (
                    <button
                      key={`${hit.zona}-${hit.t}-${index}`}
                      type="button"
                      title={`${hit.fase_corta ? `${hit.fase_corta} · ` : ""}${hit.titulo} · ${hit.t.toFixed(1)}s`}
                      aria-label={`Ir al fallo «${hit.titulo}» en el segundo ${hit.t.toFixed(1)}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        seekTo(hit.t);
                      }}
                      className={[
                        "absolute top-1/2 z-20 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full",
                        "border border-black/40 shadow-[0_0_8px_rgba(251,113,133,0.8)]",
                        "transition-all duration-300 hover:scale-150",
                        hit.tipo === "alerta" ? "bg-rose-400" : "bg-amber-400",
                      ].join(" ")}
                      style={{ left: `${Math.min(98, Math.max(2, (hit.t / duration) * 100))}%` }}
                    />
                  ))
                : null}
            </div>
            <p className="mt-1.5 text-[11px] text-slate-500">
              Bandas de color: fases del golpe. Puntos: fallos (clic para saltar).
            </p>
          </div>

          <details className="group mt-3 rounded-2xl border border-white/10 bg-white/[0.03]">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs text-slate-400 transition hover:text-white [&::-webkit-details-marker]:hidden">
              <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={1.75} />
              Opciones de vista
            </summary>
            <div className="flex flex-col gap-2 px-3 pb-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Capas</span>
                <button type="button" disabled={!showCanvas} onClick={() => toggleLayer("skeleton")} className={chipClass(layers.skeleton && showCanvas, !showCanvas)}>
                  Esqueleto
                </button>
                <button type="button" disabled={!showCanvas} onClick={() => toggleLayer("angles")} className={chipClass(layers.angles && showCanvas, !showCanvas)}>
                  Ángulos
                </button>
                <button type="button" disabled={!showCanvas} onClick={() => toggleLayer("bbox")} className={chipClass(layers.bbox && showCanvas, !showCanvas)}>
                  Recuadro del jugador
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Vídeo</span>
                <button type="button" onClick={() => changeMode("interactive")} className={chipClass(mode === "interactive")}>
                  Original + esqueleto en alta resolución
                </button>
                <button type="button" onClick={() => changeMode("processed")} className={chipClass(mode === "processed")}>
                  Vídeo anotado por el motor
                </button>
              </div>
            </div>
          </details>
          {tracksError && showCanvas ? (
            <p className="mt-2 text-xs text-amber-300">{tracksError}</p>
          ) : null}
        </div>

        {/* Panel del entrenador: qué está pasando en cada instante */}
        <aside aria-label="Panel del entrenador" className="flex flex-col gap-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Fase actual</p>
            <p className="mt-1 font-display text-lg font-semibold text-white">
              {faseActual?.label ?? "Entre golpes"}
            </p>
          </div>

          <div
            aria-live="polite"
            className={[
              "rounded-2xl border p-4 transition-colors duration-300",
              banner
                ? banner.tipo === "alerta"
                  ? "border-rose-400/40 bg-rose-500/10"
                  : "border-amber-400/40 bg-amber-400/10"
                : "border-white/10 bg-white/5",
            ].join(" ")}
          >
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">En este momento</p>
            {banner ? (
              <div className="mt-2">
                <p className="flex items-start gap-2 font-display text-base font-semibold text-white">
                  <BannerIcon
                    className={`mt-0.5 h-4 w-4 shrink-0 ${banner.tipo === "alerta" ? "text-rose-300" : "text-amber-300"}`}
                    strokeWidth={1.8}
                  />
                  {banner.titulo}
                </p>
                {banner.fase_nombre ? (
                  <p className="mt-1 text-xs text-slate-400">{banner.fase_nombre}</p>
                ) : null}
                <dl className="mt-3 grid grid-cols-2 gap-2 text-center">
                  <div className="rounded-xl bg-black/30 px-2 py-2">
                    <dt className="text-[10px] uppercase tracking-wider text-slate-500">Tu medida</dt>
                    <dd className="font-mono text-sm font-semibold text-rose-100">
                      {medidaLegible(banner.categoria, banner.valor_medido) ?? "—"}
                    </dd>
                  </div>
                  <div className="rounded-xl bg-black/30 px-2 py-2">
                    <dt className="text-[10px] uppercase tracking-wider text-slate-500">Objetivo</dt>
                    <dd className="text-xs font-semibold text-emerald-100">
                      {banner.objetivo.replace(/^Objetivo:\s*/, "") || "—"}
                    </dd>
                  </div>
                </dl>
                <p className="mt-3 text-sm leading-relaxed text-slate-200">{banner.consejo}</p>
                {onVerImagenFallo ? (
                  <button
                    type="button"
                    onClick={() => onVerImagenFallo(banner)}
                    className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-cyan-300 underline-offset-4 hover:underline"
                  >
                    <Images className="h-3.5 w-3.5" strokeWidth={1.75} />
                    Ver la imagen del fallo
                  </button>
                ) : null}
              </div>
            ) : (
              <p className="mt-2 flex items-start gap-2 text-sm text-slate-300">
                <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" strokeWidth={1.8} />
                Sin fallos en este instante. Los puntos rojos y ámbar de la línea de tiempo marcan
                dónde aparecen.
              </p>
            )}
          </div>

          {faultsPorTiempo.length > 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                Momentos clave ({faultsPorTiempo.length})
              </p>
              <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto pr-1">
                {faultsPorTiempo.map((hit, index) => (
                  <li key={`${hit.zona}-${hit.t}-${index}`}>
                    <button
                      type="button"
                      onClick={() => seekTo(Math.max(0, hit.t - 0.4))}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-slate-300 transition hover:bg-white/10 hover:text-white"
                    >
                      <span
                        aria-hidden
                        className={`h-2 w-2 shrink-0 rounded-full ${hit.tipo === "alerta" ? "bg-rose-400" : "bg-amber-400"}`}
                      />
                      <span className="font-mono text-slate-500">{hit.t.toFixed(1)} s</span>
                      <span className="truncate">{hit.titulo}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </aside>
      </div>

      <video
        ref={captureVideoRef}
        crossOrigin="anonymous"
        src={originalUrl}
        muted
        playsInline
        preload="auto"
        aria-hidden
        tabIndex={-1}
        className="pointer-events-none fixed -left-[200vw] top-0 h-[180px] w-[320px] opacity-0"
      />
    </div>
  );
});

AnalysisPlayer.displayName = "AnalysisPlayer";

export default AnalysisPlayer;

function chipClass(active: boolean, disabled = false): string {
  return [
    "rounded-full border px-3 py-1 text-xs font-medium transition-all duration-300",
    disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer hover:scale-[1.02]",
    active
      ? "border-cyan-300/50 bg-cyan-400/15 text-cyan-100 shadow-lg"
      : "border-white/10 bg-white/5 text-slate-300 hover:border-white/20 hover:text-white",
  ].join(" ");
}

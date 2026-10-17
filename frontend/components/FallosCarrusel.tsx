"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Dumbbell,
  ImageOff,
  Lightbulb,
  Loader2,
  Target,
} from "lucide-react";
import { flattenFaults } from "@/components/analysis-player/coach";
import type { CoachHit } from "@/components/AnalysisPlayer";
import type { FeedbackEvent } from "@/lib/api";
import {
  GUIA_POR_CATEGORIA,
  etiquetaPrioridad,
  fallosOrdenados,
  medidaLegible,
} from "@/lib/consejos";

export type PosicionCarrusel = { indice: number; ocurrencia: number };

type Diapositiva = {
  evento: FeedbackEvent;
  /** Cada vez que aparece el fallo en el vídeo (uno por golpe, normalmente). */
  ocurrencias: CoachHit[];
};

type Imagen = string | null | "cargando";

/** Diapositivas del carrusel, en el mismo orden que el plan de mejora. */
export function diapositivasDeFallos(feedback: FeedbackEvent[]): Diapositiva[] {
  return fallosOrdenados(feedback).map((evento) => ({
    evento,
    ocurrencias: flattenFaults([evento]).sort((a, b) => a.t - b.t),
  }));
}

function clave(indice: number, ocurrencia: number): string {
  return `${indice}-${ocurrencia}`;
}

export default function FallosCarrusel({
  feedback,
  activo,
  posicion,
  onPosicion,
  capturar,
  onVerEnVideo,
}: {
  feedback: FeedbackEvent[];
  /** Solo se generan imágenes mientras la vista está visible. */
  activo: boolean;
  posicion: PosicionCarrusel;
  onPosicion: (posicion: PosicionCarrusel) => void;
  capturar: (hit: CoachHit) => Promise<string | null>;
  onVerEnVideo: (t: number) => void;
}) {
  const diapositivas = useMemo(() => diapositivasDeFallos(feedback), [feedback]);
  const [imagenes, setImagenes] = useState<Record<string, Imagen>>({});
  const enCursoRef = useRef<Set<string>>(new Set());
  const inicioGestoRef = useRef<number | null>(null);

  const total = diapositivas.length;
  const indice = Math.min(posicion.indice, Math.max(0, total - 1));
  const actual = diapositivas[indice];
  const ocurrencia = actual ? Math.min(posicion.ocurrencia, Math.max(0, actual.ocurrencias.length - 1)) : 0;
  const hit = actual?.ocurrencias[ocurrencia];

  // Genera primero la imagen que se está viendo y después la primera de cada fallo
  useEffect(() => {
    if (!activo || total === 0) return;
    let cancelado = false;
    const orden: [number, number][] = [[indice, ocurrencia]];
    diapositivas.forEach((d, i) => {
      if (d.ocurrencias.length > 0) orden.push([i, 0]);
    });

    void (async () => {
      for (const [i, o] of orden) {
        if (cancelado) return;
        const k = clave(i, o);
        const objetivo = diapositivas[i]?.ocurrencias[o];
        if (!objetivo || enCursoRef.current.has(k)) continue;
        enCursoRef.current.add(k);
        setImagenes((prev) => (k in prev ? prev : { ...prev, [k]: "cargando" }));
        const url = await capturar(objetivo);
        // Se guarda aunque el usuario haya cambiado de fallo: sirve igual más tarde
        setImagenes((prev) => ({ ...prev, [k]: url }));
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [activo, indice, ocurrencia, diapositivas, total, capturar]);

  if (total === 0) {
    return (
      <div className="flex min-h-[260px] flex-col items-center justify-center rounded-2xl border border-emerald-400/25 bg-emerald-400/10 p-8 text-center">
        <p className="font-display text-xl font-semibold text-emerald-100">Sin fallos destacados</p>
        <p className="mt-2 max-w-md text-sm text-slate-300">
          El entrenador no ha encontrado aspectos que corregir en este golpe. Revisa la cámara
          lenta para ver tu técnica fotograma a fotograma.
        </p>
      </div>
    );
  }

  const ir = (nuevo: number) => {
    const destino = (nuevo + total) % total;
    onPosicion({ indice: destino, ocurrencia: 0 });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      ir(indice + 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      ir(indice - 1);
    }
  };

  // Deslizar con el dedo (o arrastrar con el ratón) sobre la imagen
  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    inicioGestoRef.current = event.clientX;
  };
  const onPointerUp = (event: PointerEvent<HTMLElement>) => {
    if (inicioGestoRef.current === null) return;
    const dx = event.clientX - inicioGestoRef.current;
    inicioGestoRef.current = null;
    if (Math.abs(dx) > 50) ir(dx < 0 ? indice + 1 : indice - 1);
  };

  const evento = actual.evento;
  const guia = GUIA_POR_CATEGORIA[evento.categoria ?? ""];
  const prioridad = etiquetaPrioridad(evento.tipo);
  const IconoTipo = evento.tipo === "alerta" ? AlertCircle : AlertTriangle;
  const imagen = imagenes[clave(indice, ocurrencia)];
  const medida = medidaLegible(evento.categoria, hit?.valor_medido || evento.valor);
  const objetivo = (hit?.objetivo || evento.objetivo_texto || "").replace(/^Objetivo:\s*/, "");

  return (
    <div
      role="region"
      aria-roledescription="carrusel"
      aria-label="Fallos uno a uno"
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="rounded-2xl outline-none"
    >
      <div
        role="group"
        aria-roledescription="diapositiva"
        aria-label={`Fallo ${indice + 1} de ${total}: ${evento.titulo ?? ""}`}
        className="grid gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]"
      >
        <figure className="min-w-0">
          <div
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            className="relative flex min-h-[320px] touch-pan-y select-none items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-black"
          >
            {imagen && imagen !== "cargando" ? (
              // eslint-disable-next-line @next/next/no-img-element -- imagen generada en el navegador (data URL)
              <img
                src={imagen}
                alt={`${evento.titulo ?? "Fallo"} en el segundo ${hit?.t.toFixed(1) ?? ""}: esqueleto con la zona del fallo marcada`}
                draggable={false}
                className="max-h-[70vh] w-full object-contain animate-[fadeIn_0.3s_ease-out]"
              />
            ) : imagen === null || !hit ? (
              <p className="flex flex-col items-center gap-2 p-6 text-center text-sm text-slate-400">
                <ImageOff className="h-6 w-6" strokeWidth={1.5} />
                No se pudo generar la imagen de este fallo. Puedes verlo en la cámara lenta.
              </p>
            ) : (
              <p role="status" className="flex items-center gap-2 text-sm text-slate-400">
                <Loader2 className="h-5 w-5 animate-spin text-cyan-300" />
                Preparando la imagen…
              </p>
            )}
            <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/70 px-3 py-1 text-xs font-semibold text-white backdrop-blur">
              Fallo {indice + 1} de {total}
            </span>
          </div>

          {actual.ocurrencias.length > 1 ? (
            <figcaption className="mt-3">
              <p className="text-xs text-slate-400">
                Se repite en {actual.ocurrencias.length} momentos del vídeo:
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {actual.ocurrencias.map((o, i) => (
                  <button
                    key={`${o.t}-${i}`}
                    type="button"
                    aria-pressed={i === ocurrencia}
                    onClick={() => onPosicion({ indice, ocurrencia: i })}
                    className={[
                      "rounded-full border px-3 py-1 font-mono text-xs transition-colors",
                      i === ocurrencia
                        ? "border-cyan-300/50 bg-cyan-400/15 text-cyan-100"
                        : "border-white/10 bg-white/5 text-slate-300 hover:text-white",
                    ].join(" ")}
                  >
                    {o.t.toFixed(1)} s{o.fase_corta ? ` · ${o.fase_corta}` : ""}
                  </button>
                ))}
              </div>
            </figcaption>
          ) : null}
        </figure>

        <div className="flex min-w-0 flex-col gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${prioridad.clase}`}>
                <IconoTipo className="h-3.5 w-3.5" strokeWidth={1.8} />
                {prioridad.texto}
              </span>
              {hit?.fase_nombre || evento.fase_nombre ? (
                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-300">
                  {hit?.fase_nombre || evento.fase_nombre}
                </span>
              ) : null}
            </div>
            <h3 className="mt-3 font-display text-2xl font-semibold text-white">{evento.titulo}</h3>
            {hit?.nota_corta ? <p className="mt-1 text-sm text-rose-100">{hit.nota_corta}</p> : null}
          </div>

          <dl className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-rose-400/25 bg-rose-500/10 p-3">
              <dt className="text-[11px] uppercase tracking-wider text-rose-200/80">Tu medida</dt>
              <dd className="mt-1 font-display text-2xl font-semibold text-white">{medida || "—"}</dd>
            </div>
            <div className="rounded-2xl border border-emerald-400/25 bg-emerald-400/10 p-3">
              <dt className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wider text-emerald-200/80">
                <Target className="h-3 w-3" /> Objetivo
              </dt>
              <dd className="mt-1 text-sm font-semibold text-white">{objetivo || "—"}</dd>
            </div>
          </dl>

          <div className="space-y-3 text-sm leading-relaxed text-slate-300">
            <p>{evento.mensaje}</p>
            {guia ? (
              <p className="text-slate-400">
                <strong className="text-slate-200">Por qué importa: </strong>
                {guia.porQue}
              </p>
            ) : null}
          </div>

          <div className="rounded-2xl border border-cyan-300/20 bg-cyan-400/5 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-cyan-100">
              <Lightbulb className="h-4 w-4" strokeWidth={1.75} />
              Cómo corregirlo
            </p>
            <p className="mt-2 text-sm text-slate-200">{hit?.consejo || evento.consejo_corto || evento.mensaje}</p>
            {guia ? (
              <>
                <p className="mt-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  <Dumbbell className="h-3.5 w-3.5" strokeWidth={1.75} />
                  Ejercicios
                </p>
                <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-slate-300">
                  {guia.ejercicios.map((ejercicio) => (
                    <li key={ejercicio}>{ejercicio}</li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>

          {hit ? (
            <button
              type="button"
              onClick={() => onVerEnVideo(hit.t)}
              className="inline-flex items-center justify-center gap-2 self-start rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-white transition hover:bg-white/10"
            >
              <Clapperboard className="h-4 w-4" strokeWidth={1.75} />
              Ver este momento a cámara lenta
            </button>
          ) : null}
        </div>
      </div>

      {/* Navegación: flechas y miniaturas */}
      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          onClick={() => ir(indice - 1)}
          aria-label="Fallo anterior"
          className="shrink-0 rounded-full border border-white/15 bg-white/5 p-2.5 text-white transition hover:bg-white/10"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <ol className="flex min-w-0 flex-1 gap-2 overflow-x-auto py-1" aria-label="Lista de fallos">
          {diapositivas.map((d, i) => {
            const miniatura = imagenes[clave(i, 0)];
            const activa = i === indice;
            return (
              <li key={`${d.evento.titulo}-${i}`} className="shrink-0">
                <button
                  type="button"
                  onClick={() => onPosicion({ indice: i, ocurrencia: 0 })}
                  aria-label={`Fallo ${i + 1}: ${d.evento.titulo ?? ""}`}
                  aria-current={activa ? "true" : undefined}
                  className={[
                    "relative flex h-16 w-14 items-center justify-center overflow-hidden rounded-xl border-2 bg-black transition",
                    activa ? "border-cyan-300" : "border-white/10 opacity-70 hover:opacity-100",
                  ].join(" ")}
                >
                  {miniatura && miniatura !== "cargando" ? (
                    // eslint-disable-next-line @next/next/no-img-element -- miniatura generada en el navegador
                    <img src={miniatura} alt="" className="h-full w-full object-cover" />
                  ) : null}
                  <span
                    className={[
                      "absolute bottom-1 right-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold",
                      d.evento.tipo === "alerta" ? "bg-rose-500 text-white" : "bg-amber-400 text-slate-950",
                    ].join(" ")}
                  >
                    {i + 1}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        <button
          type="button"
          onClick={() => ir(indice + 1)}
          aria-label="Fallo siguiente"
          className="shrink-0 rounded-full bg-gradient-to-r from-cyan-300 via-emerald-300 to-cyan-400 p-2.5 text-slate-950 transition hover:brightness-105"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
      <p className="mt-2 text-center text-xs text-slate-400">
        Desliza la imagen o usa las flechas del teclado para pasar de un fallo a otro.
      </p>
    </div>
  );
}

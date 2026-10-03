"use client";

import Link from "next/link";
import { useRef, type ChangeEvent, type DragEvent, type RefObject } from "react";
import { Camera, FileVideo, Info, Loader2, Sparkles, UploadCloud } from "lucide-react";
import GuiaGrabacion from "@/components/home/GuiaGrabacion";
import { tamanoArchivo } from "@/lib/formato";
import { ACCEPT_VIDEO, MAX_VIDEO_MB, formatoVideo } from "@/lib/video";

type DropzoneProps = {
  file: File | null;
  isDragging: boolean;
  isAnalyzing: boolean;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDragLeave: (event: DragEvent<HTMLDivElement>) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  onBrowse: () => void;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
  onAnalyze: () => void;
  inputRef: RefObject<HTMLInputElement | null>;
  isLoggedIn: boolean;
  /** Guía de grabación plegable bajo la zona (la portada ya la muestra completa). */
  mostrarGuia?: boolean;
};

/** Zona para arrastrar o elegir el vídeo y lanzar el análisis. */
export default function Dropzone({
  file,
  isDragging,
  isAnalyzing,
  onDragOver,
  onDragLeave,
  onDrop,
  onBrowse,
  onFileChange,
  onClear,
  onAnalyze,
  inputRef,
  isLoggedIn,
  mostrarGuia = true,
}: DropzoneProps) {
  // En el móvil, capture abre directamente la cámara trasera para grabar el golpe
  const camaraRef = useRef<HTMLInputElement>(null);

  return (
    <div className="mx-auto mt-10 w-full max-w-xl">
      <div
        role={file ? undefined : "button"}
        tabIndex={file ? undefined : 0}
        aria-label={file ? undefined : "Seleccionar un vídeo para analizar"}
        onClick={file || isAnalyzing ? undefined : onBrowse}
        onKeyDown={(event) => {
          if (!file && !isAnalyzing && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            onBrowse();
          }
        }}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={[
          "group relative w-full overflow-hidden rounded-3xl",
          "border backdrop-blur-md transition-all duration-300 ease-out",
          "bg-white/5 shadow-[0_20px_60px_rgba(0,0,0,0.35)]",
          "animate-[fadeUp_0.85s_ease-out_0.22s_both]",
          isDragging
            ? "border-cyan-400/80 shadow-[0_0_40px_rgba(34,211,238,0.35)] scale-[1.01]"
            : "border-white/10 hover:border-white/20 hover:bg-white/[0.07]",
          file ? "cursor-default p-7 sm:p-8" : "cursor-pointer p-10 sm:p-12",
        ].join(" ")}
      >
        <div
          className={[
            "pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300",
            "bg-[radial-gradient(circle_at_50%_0%,rgba(34,211,238,0.18),transparent_55%)]",
            isDragging || file ? "opacity-100" : "group-hover:opacity-70",
          ].join(" ")}
        />

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_VIDEO}
          className="hidden"
          onChange={onFileChange}
          disabled={isAnalyzing}
          aria-hidden
          tabIndex={-1}
        />
        <input
          ref={camaraRef}
          type="file"
          accept="video/*"
          capture="environment"
          className="hidden"
          onChange={onFileChange}
          disabled={isAnalyzing}
          aria-hidden
          tabIndex={-1}
        />

        {!file ? (
          <div className="relative z-10 flex flex-col items-center text-center">
            <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-cyan-300 transition-transform duration-300 group-hover:-translate-y-0.5">
              <UploadCloud className="h-8 w-8" strokeWidth={1.5} aria-hidden />
            </div>
            <p className="font-display text-lg font-medium text-white sm:text-xl">
              <span className="pointer-coarse:hidden">Arrastra tu vídeo aquí</span>
              <span className="hidden pointer-coarse:inline">Elige un vídeo de tu galería</span>
            </p>
            <p className="mt-2 text-sm text-slate-400">
              <span className="pointer-coarse:hidden">o haz clic para seleccionar un archivo </span>
              <span className="text-cyan-300/90">MP4 o MOV</span>
              {" · "}máx. {MAX_VIDEO_MB} MB
            </p>
          </div>
        ) : (
          <div className="relative z-10 flex flex-col items-stretch gap-6 animate-[fadeIn_0.35s_ease-out]">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-400/10 text-emerald-300">
                <FileVideo className="h-6 w-6" strokeWidth={1.5} aria-hidden />
              </div>
              <div className="min-w-0 flex-1 text-left">
                <p className="truncate font-medium text-white">{file.name}</p>
                <p className="mt-1 text-sm text-slate-400">
                  {tamanoArchivo(file.size)} · {formatoVideo(file) ?? "Vídeo"}
                </p>
              </div>
              <button
                type="button"
                disabled={isAnalyzing}
                onClick={(event) => {
                  event.stopPropagation();
                  onClear();
                }}
                className="shrink-0 rounded-lg px-2 py-1 text-xs text-slate-400 transition hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                Cambiar
              </button>
            </div>

            <button
              type="button"
              disabled={isAnalyzing}
              onClick={(event) => {
                event.stopPropagation();
                void onAnalyze();
              }}
              className={[
                "relative inline-flex items-center justify-center gap-2 overflow-hidden",
                "rounded-2xl px-6 py-4 text-base font-semibold text-slate-950",
                "bg-gradient-to-r from-cyan-300 via-emerald-300 to-cyan-400",
                "border border-white/10 shadow-xl",
                "transition-all duration-300",
                isAnalyzing
                  ? "cursor-wait opacity-90"
                  : "hover:scale-[1.02] hover:shadow-[0_0_48px_rgba(52,211,153,0.45)] active:scale-[0.99]",
                "disabled:cursor-wait",
              ].join(" ")}
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" strokeWidth={1.75} />
                  Procesando...
                </>
              ) : (
                <>
                  <Sparkles className="h-5 w-5" strokeWidth={1.75} />
                  Iniciar Análisis Biomecánico
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {!file ? (
        // Solo en pantallas táctiles: en el ordenador abriría el selector de archivos
        <button
          type="button"
          disabled={isAnalyzing}
          onClick={() => camaraRef.current?.click()}
          className="mt-3 hidden w-full items-center justify-center gap-2 rounded-2xl border border-cyan-400/30 bg-cyan-400/10 px-6 py-4 text-base font-semibold text-cyan-100 transition active:scale-[0.99] pointer-coarse:inline-flex"
        >
          <Camera className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          Grabar el golpe con la cámara
        </button>
      ) : null}

      {!isLoggedIn ? (
        <p className="mt-4 flex items-start justify-center gap-2 text-center text-sm text-slate-400 animate-[fadeUp_0.85s_ease-out_0.3s_both]">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300/80" strokeWidth={1.75} aria-hidden />
          <span>
            Sin cuenta el análisis no se guarda y se borra a las 24 horas.{" "}
            <Link
              href="/login"
              className="font-medium text-cyan-300 underline-offset-4 transition hover:text-cyan-200 hover:underline"
            >
              Inicia sesión
            </Link>{" "}
            o{" "}
            <Link
              href="/registro"
              className="font-medium text-cyan-300 underline-offset-4 transition hover:text-cyan-200 hover:underline"
            >
              regístrate
            </Link>{" "}
            para guardar tu historial.
          </span>
        </p>
      ) : null}

      {mostrarGuia ? <GuiaGrabacion plegable /> : null}
    </div>
  );
}

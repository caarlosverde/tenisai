"use client";

import { useEffect, useRef, type FormEvent, type ReactNode } from "react";
import { Loader2 } from "lucide-react";

type ConfirmDialogProps = {
  abierto: boolean;
  titulo: string;
  /** Explicación y, si hace falta, campos extra (p. ej. la contraseña). */
  children?: ReactNode;
  textoConfirmar: string;
  peligroso?: boolean;
  cargando?: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
};

/**
 * Diálogo modal sobre <dialog> nativo: atrapa el foco, se cierra con Esc y
 * devuelve el foco al elemento que lo abrió.
 */
export default function ConfirmDialog({
  abierto,
  titulo,
  children,
  textoConfirmar,
  peligroso = false,
  cargando = false,
  onConfirmar,
  onCancelar,
}: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialogo = ref.current;
    if (!dialogo) return;
    if (abierto && !dialogo.open) dialogo.showModal();
    if (!abierto && dialogo.open) dialogo.close();
  }, [abierto]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cargando) onConfirmar();
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby="confirm-dialog-titulo"
      onCancel={(event) => {
        event.preventDefault();
        if (!cargando) onCancelar();
      }}
      onClick={(event) => {
        // Clic en el fondo (fuera del contenido) cierra el diálogo
        if (event.target === ref.current && !cargando) onCancelar();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-white/10 bg-zinc-900 p-0 text-white shadow-2xl backdrop:bg-black/70 backdrop:backdrop-blur-sm"
    >
      <form onSubmit={onSubmit} className="p-6">
        <h2 id="confirm-dialog-titulo" className="font-display text-lg font-semibold">
          {titulo}
        </h2>
        {children ? <div className="mt-2 text-sm text-slate-300">{children}</div> : null}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancelar}
            disabled={cargando}
            className="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-white transition hover:bg-white/10 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={cargando}
            className={[
              "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-wait disabled:opacity-70",
              peligroso
                ? "bg-rose-500 text-white hover:bg-rose-400"
                : "bg-gradient-to-r from-cyan-300 via-emerald-300 to-cyan-400 text-slate-950 hover:brightness-105",
            ].join(" ")}
          >
            {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {textoConfirmar}
          </button>
        </div>
      </form>
    </dialog>
  );
}

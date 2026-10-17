"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { flushSync } from "react-dom";
import { CheckCircle2, ClipboardPen } from "lucide-react";
import { toast } from "sonner";
import ConfirmDialog from "@/components/ConfirmDialog";
import EntradaSets, { setsEscritos, type FilaSet } from "@/components/comunidad/EntradaSets";
import { peticion } from "@/lib/comunidad/cliente";
import { textoMarcador, validarMarcador } from "@/lib/comunidad/marcador";

type Modo = "marcador" | "incomparecencia";

/** El organizador anota el resultado de un cruce: marcador o pase por incomparecencia. */
export default function ResultadoCruce({
  torneoId,
  cruceId,
  ladoA,
  ladoB,
}: {
  torneoId: string;
  cruceId: string;
  /** Nombres de cada lado; null si ese lado quedó vacío (p. ej. cuenta borrada). */
  ladoA: string | null;
  ladoB: string | null;
}) {
  const router = useRouter();
  const ambos = Boolean(ladoA && ladoB);
  const [abierto, setAbierto] = useState(false);
  const [modo, setModo] = useState<Modo>(ambos ? "marcador" : "incomparecencia");
  const [filas, setFilas] = useState<FilaSet[]>([["", ""], ["", ""]]);
  const [noPresentado, setNoPresentado] = useState<"a" | "b" | null>(ambos ? null : ladoA ? "b" : "a");
  const [cargando, setCargando] = useState(false);
  // Ya anotado: el botón desaparece sin esperar a que la página se refresque
  const [anotado, setAnotado] = useState(false);

  const nombreA = ladoA ?? "Vacío";
  const nombreB = ladoB ?? "Vacío";
  const { sets, incompleto } = setsEscritos(filas);
  const marcador = sets.length > 0 && !incompleto ? validarMarcador(sets) : null;

  async function guardar() {
    if (cargando) return;
    if (modo === "marcador" && !marcador?.ok) {
      toast.error(marcador?.error ?? "Escribe el resultado de cada set.");
      return;
    }
    if (modo === "incomparecencia" && !noPresentado) {
      toast.error("Indica quién no se presentó.");
      return;
    }
    flushSync(() => setCargando(true));
    const respuesta = await peticion<{ finalizado: boolean }>(
      `/api/comunidad/torneos/${torneoId}/cruces/${cruceId}`,
      {
        method: "POST",
        body: modo === "marcador" && marcador?.ok ? { sets: marcador.sets } : { noPresentado },
      },
    );
    setCargando(false);
    if (!respuesta.ok) {
      toast.error(respuesta.error);
      return;
    }
    setAbierto(false);
    setAnotado(true);
    toast.success(respuesta.data.finalizado ? "¡Torneo terminado! Ya hay campeón." : "Resultado anotado");
    router.refresh();
  }

  if (anotado) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-amber-300/30 bg-amber-300/10 px-2 py-1.5 text-xs font-medium text-amber-100 transition hover:bg-amber-300/20"
        aria-label={`Anotar resultado: ${nombreA} contra ${nombreB}`}
      >
        <ClipboardPen className="h-3.5 w-3.5" />
        Anotar resultado
      </button>
      <ConfirmDialog
        abierto={abierto}
        titulo={`${nombreA} contra ${nombreB}`}
        textoConfirmar="Guardar resultado"
        cargando={cargando}
        onConfirmar={() => void guardar()}
        onCancelar={() => setAbierto(false)}
      >
        {ambos ? (
          <div className="mb-4 inline-flex rounded-xl border border-white/10 bg-black/20 p-1">
            {(
              [
                ["marcador", "Marcador"],
                ["incomparecencia", "No se presentó"],
              ] as const
            ).map(([valor, texto]) => (
              <button
                key={valor}
                type="button"
                aria-pressed={modo === valor}
                onClick={() => setModo(valor)}
                className={[
                  "rounded-lg px-3 py-1.5 text-sm transition",
                  modo === valor ? "bg-white/10 font-medium text-white" : "text-slate-400 hover:text-white",
                ].join(" ")}
              >
                {texto}
              </button>
            ))}
          </div>
        ) : null}

        {modo === "marcador" ? (
          <>
            <EntradaSets
              filas={filas}
              onCambio={setFilas}
              columnas={[nombreA, nombreB]}
              etiquetas={[(n) => `Set ${n}: juegos de ${nombreA}`, (n) => `Set ${n}: juegos de ${nombreB}`]}
            />
            <p aria-live="polite" className="mt-3 min-h-5 text-sm">
              {marcador?.ok ? (
                <span className="inline-flex items-center gap-2 text-emerald-200">
                  <CheckCircle2 className="h-4 w-4" />
                  Gana {marcador.ganador === 1 ? nombreA : nombreB}{" "}
                  <span className="font-mono">{textoMarcador(marcador.sets)}</span>
                </span>
              ) : marcador ? (
                <span className="text-amber-200">{marcador.error}</span>
              ) : null}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              El resultado cuenta para el ranking de los jugadores.
            </p>
          </>
        ) : ambos ? (
          <fieldset>
            <legend className="mb-2 text-sm text-slate-300">
              ¿Quién no se presentó? Pasa el otro, sin cambios en el ranking.
            </legend>
            <div className="space-y-2">
              {(["a", "b"] as const).map((lado) => (
                <label key={lado} className="flex cursor-pointer items-center gap-2 text-sm text-white">
                  <input
                    type="radio"
                    name={`no-presentado-${cruceId}`}
                    checked={noPresentado === lado}
                    onChange={() => setNoPresentado(lado)}
                  />
                  No se presentó {lado === "a" ? nombreA : nombreB}
                </label>
              ))}
            </div>
          </fieldset>
        ) : (
          <p className="text-sm text-slate-300">
            Uno de los lados quedó vacío (por ejemplo, porque borró su cuenta): pasa{" "}
            <strong className="text-white">{ladoA ?? ladoB}</strong> a la siguiente ronda, sin
            cambios en el ranking.
          </p>
        )}
      </ConfirmDialog>
    </>
  );
}

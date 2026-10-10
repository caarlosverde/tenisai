"use client";

import { useState } from "react";
import { flushSync } from "react-dom";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  type CodoDerecha,
  type EstiloDerecha,
  type EstiloReves,
  type Lateralidad,
  normalizarCodoDerecha,
  normalizarEstiloDerecha,
  normalizarEstiloReves,
  normalizarLateralidad,
} from "@/lib/estiloJuego";
import { CARD_CLASS, PRIMARY_BUTTON_CLASS } from "@/lib/ui";
import type { ProfileUser } from "@/components/perfil/tipos";

type Estilo = {
  lateralidad: Lateralidad;
  estiloReves: EstiloReves;
  estiloDerecha: EstiloDerecha;
  codoDerecha: CodoDerecha;
};

type Opcion<V extends string> = { value: V; title: string; desc: string };

const PREGUNTAS: {
  [K in keyof Estilo]: { titulo: string; opciones: Opcion<Estilo[K]>[] };
} = {
  lateralidad: {
    titulo: "Lateralidad",
    opciones: [
      {
        value: "diestro",
        title: "Diestro",
        desc: "Brazo dominante derecho. El revés se juega a la izquierda.",
      },
      {
        value: "zurdo",
        title: "Zurdo",
        desc: "Brazo dominante izquierdo. Toda la biomecánica se invierte.",
      },
    ],
  },
  estiloReves: {
    titulo: "Revés",
    opciones: [
      {
        value: "2_manos",
        title: "A dos manos",
        desc: "Grip con ambas manos. Se permite un spacing más corto.",
      },
      {
        value: "1_mano",
        title: "A una mano",
        desc: "Solo la mano dominante en el grip. Desempata si hay oclusión.",
      },
    ],
  },
  estiloDerecha: {
    titulo: "Terminación de derecha",
    opciones: [
      {
        value: "tradicional",
        title: "Clásica cruzada",
        desc: "La muñeca debe cruzar hacia el hombro izquierdo.",
      },
      {
        value: "nadal",
        title: 'Lazo / "Buggy Whip"',
        desc: "Terminación alta sobre el hombro derecho, tipo Nadal. No se penaliza el lazo.",
      },
    ],
  },
  codoDerecha: {
    titulo: "Brazo en la derecha",
    opciones: [
      {
        value: "recto",
        title: "Brazo recto",
        desc: "El brazo llega casi estirado al impacto (Federer, Nadal). Se pide pasar de 155°.",
      },
      {
        value: "flexionado",
        title: "Codo flexionado (doble flexión)",
        desc: "El codo va doblado al golpear (Djokovic, Sinner). Solo se avisa si el brazo va encogido.",
      },
    ],
  },
};

function estiloDe(user: ProfileUser): Estilo {
  return {
    lateralidad: normalizarLateralidad(user.lateralidad),
    estiloReves: normalizarEstiloReves(user.estiloReves),
    estiloDerecha: normalizarEstiloDerecha(user.estiloDerecha),
    codoDerecha: normalizarCodoDerecha(user.codoDerecha),
  };
}

export default function EstiloJuegoCard({
  user,
  onGuardado,
}: {
  user: ProfileUser;
  onGuardado: (user: ProfileUser) => void;
}) {
  const [estilo, setEstilo] = useState<Estilo>(() => estiloDe(user));
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    if (guardando) return;
    flushSync(() => setGuardando(true));
    try {
      const response = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(estilo),
      });
      const data = (await response.json()) as { error?: string; user?: ProfileUser };
      if (!response.ok || !data.user) {
        toast.error(data.error ?? "No se pudieron guardar las preferencias.");
        return;
      }
      setEstilo(estiloDe(data.user));
      onGuardado(data.user);
      toast.success("Estilo de juego guardado");
    } catch {
      toast.error("No se pudo conectar con el servidor.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className={CARD_CLASS} aria-labelledby="estilo-juego-titulo">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-amber-400/20 bg-amber-400/10 text-amber-200">
          <Sparkles className="h-5 w-5" strokeWidth={1.75} />
        </div>
        <div>
          <h2 id="estilo-juego-titulo" className="font-display text-lg font-semibold text-white">
            Estilo de juego
          </h2>
          <p className="text-xs text-slate-400">Adapta las reglas biomecánicas del entrenador</p>
        </div>
      </div>

      {(Object.keys(PREGUNTAS) as (keyof Estilo)[]).map((clave) => {
        const pregunta = PREGUNTAS[clave];
        return (
          <fieldset key={clave} className="mb-5">
            <legend className="mb-2 text-sm font-medium text-slate-200">{pregunta.titulo}</legend>
            <div className="grid grid-cols-1 gap-2">
              {pregunta.opciones.map((opcion) => {
                const activa = estilo[clave] === opcion.value;
                return (
                  <label
                    key={opcion.value}
                    className={[
                      "cursor-pointer rounded-2xl border px-4 py-3 transition-colors duration-200",
                      "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-cyan-300",
                      activa
                        ? "border-amber-300/40 bg-amber-400/10"
                        : "border-white/10 bg-black/20 hover:border-white/20",
                    ].join(" ")}
                  >
                    <input
                      type="radio"
                      name={clave}
                      value={opcion.value}
                      checked={activa}
                      onChange={() => setEstilo((prev) => ({ ...prev, [clave]: opcion.value }))}
                      className="sr-only"
                    />
                    <span className="block text-sm font-medium text-white">{opcion.title}</span>
                    <span className="mt-0.5 block text-xs text-slate-400">{opcion.desc}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        );
      })}

      <button
        type="button"
        onClick={() => void guardar()}
        disabled={guardando}
        className={PRIMARY_BUTTON_CLASS}
      >
        {guardando ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Guardando...
          </>
        ) : (
          "Guardar estilo"
        )}
      </button>
    </section>
  );
}

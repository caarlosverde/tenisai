"use client";

import { Minus, Plus } from "lucide-react";
import { MAX_SETS } from "@/lib/comunidad/marcador";

/** Lo que se ha escrito en cada set: juegos del lado izquierdo y del derecho. */
export type FilaSet = [string, string];

const INPUT_JUEGOS =
  "h-12 w-16 rounded-lg bg-zinc-800 text-center font-mono text-lg tabular-nums text-white outline-none ring-1 ring-white/10 transition focus:ring-2 focus:ring-cyan-400/70";

/** Sets escritos -> números; las filas vacías del final no cuentan. */
export function setsEscritos(filas: FilaSet[]): { sets: [number, number][]; incompleto: boolean } {
  const usadas = [...filas];
  while (usadas.length > 0 && usadas[usadas.length - 1].every((v) => v.trim() === "")) usadas.pop();
  const incompleto = usadas.some(([a, b]) => a.trim() === "" || b.trim() === "");
  return { sets: usadas.map(([a, b]) => [Number(a), Number(b)]), incompleto };
}

/**
 * Tabla para escribir el marcador set a set. La comparten el registro de partidos y los
 * resultados de los torneos.
 */
export default function EntradaSets({
  filas,
  onCambio,
  columnas,
  etiquetas,
}: {
  filas: FilaSet[];
  onCambio: (filas: FilaSet[]) => void;
  /** Cabeceras visibles de las dos columnas ("Tú" / "Rival"). */
  columnas: [string, string];
  /** Nombre accesible de cada casilla: etiquetas[0](1) -> "Set 1: tus juegos". */
  etiquetas: [(set: number) => string, (set: number) => string];
}) {
  function cambiarJuegos(fila: number, columna: 0 | 1, valor: string) {
    const limpio = valor.replace(/\D/g, "").slice(0, 2);
    onCambio(filas.map((f, i) => (i === fila ? (columna === 0 ? [limpio, f[1]] : [f[0], limpio]) : f)));
  }

  return (
    <div>
      <div className="inline-block rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="mb-2 grid grid-cols-[4rem_4rem_1rem_4rem] items-center gap-2 text-center text-xs text-slate-400">
          <span />
          <span className="truncate">{columnas[0]}</span>
          <span />
          <span className="truncate">{columnas[1]}</span>
        </div>
        <div className="space-y-2">
          {filas.map(([a, b], i) => (
            <div key={i} className="grid grid-cols-[4rem_4rem_1rem_4rem] items-center gap-2">
              <span className="text-sm text-slate-400">Set {i + 1}</span>
              <input
                inputMode="numeric"
                value={a}
                onChange={(e) => cambiarJuegos(i, 0, e.target.value)}
                aria-label={etiquetas[0](i + 1)}
                className={INPUT_JUEGOS}
              />
              <span className="text-center text-slate-400">–</span>
              <input
                inputMode="numeric"
                value={b}
                onChange={(e) => cambiarJuegos(i, 1, e.target.value)}
                aria-label={etiquetas[1](i + 1)}
                className={INPUT_JUEGOS}
              />
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            disabled={filas.length >= MAX_SETS}
            onClick={() => onCambio([...filas, ["", ""]])}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-cyan-300 transition hover:bg-white/5 disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" /> Añadir set
          </button>
          <button
            type="button"
            disabled={filas.length <= 1}
            onClick={() => onCambio(filas.slice(0, -1))}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-400 transition hover:bg-white/5 disabled:opacity-40"
          >
            <Minus className="h-3.5 w-3.5" /> Quitar set
          </button>
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-400">
        Sets a 6 juegos (7-5 o 7-6 con tie-break). El set decisivo puede ser un super tie-break a 10
        puntos (por ejemplo 10-8).
      </p>
    </div>
  );
}

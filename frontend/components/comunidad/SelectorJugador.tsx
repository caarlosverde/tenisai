"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import Avatar from "@/components/comunidad/Avatar";
import { peticion } from "@/lib/comunidad/cliente";
import type { JugadorEncontrado } from "@/lib/comunidad/tipos";
import { FIELD_LABEL_CLASS } from "@/lib/ui";

/**
 * Elige a un jugador para un partido: sin escribir sugiere a tus amigos; al escribir
 * busca entre amigos y perfiles públicos. Navegable con flechas, Intro y Esc.
 */
export default function SelectorJugador({
  etiqueta,
  valor,
  onCambio,
  excluir,
  convocatoriaId,
}: {
  etiqueta: string;
  valor: JugadorEncontrado | null;
  onCambio: (jugador: JugadorEncontrado | null) => void;
  /** Jugadores ya elegidos en otros puestos del partido. */
  excluir: string[];
  /** Al registrar una convocatoria, sus jugadores aceptados también se pueden elegir. */
  convocatoriaId?: string;
}) {
  const id = useId();
  const [q, setQ] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [resultados, setResultados] = useState<{ q: string; jugadores: JugadorEncontrado[] } | null>(null);
  const [activo, setActivo] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const texto = q.trim();
  const consulta = texto.length >= 2 ? texto : "";

  useEffect(() => {
    if (!abierto || valor) return;
    let cancelado = false;
    const temporizador = setTimeout(
      async () => {
        const respuesta = await peticion<{ jugadores: JugadorEncontrado[] }>(
          `/api/comunidad/jugadores?para=partido&q=${encodeURIComponent(consulta)}` +
            (convocatoriaId ? `&convocatoria=${encodeURIComponent(convocatoriaId)}` : ""),
        );
        if (!cancelado) {
          setResultados({ q: consulta, jugadores: respuesta.ok ? respuesta.data.jugadores : [] });
          setActivo(0);
        }
      },
      consulta ? 250 : 0,
    );
    return () => {
      cancelado = true;
      clearTimeout(temporizador);
    };
  }, [abierto, consulta, valor, convocatoriaId]);

  const cargando = abierto && resultados?.q !== consulta;
  const opciones = (resultados?.jugadores ?? []).filter((j) => !excluir.includes(j.username));

  function elegir(jugador: JugadorEncontrado) {
    onCambio(jugador);
    setQ("");
    setAbierto(false);
  }

  if (valor) {
    return (
      <div>
        <span className={FIELD_LABEL_CLASS}>{etiqueta}</span>
        <div className="flex items-center gap-3 rounded-lg bg-zinc-800 px-3 py-2 ring-1 ring-cyan-400/40">
          <Avatar nombre={valor.nombre} semilla={valor.username} tamano="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{valor.nombre}</p>
            <p className="truncate text-xs text-slate-400">@{valor.username}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              onCambio(null);
              requestAnimationFrame(() => inputRef.current?.focus());
            }}
            aria-label={`Quitar a ${valor.nombre} (${etiqueta})`}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <label htmlFor={`${id}-input`} className={FIELD_LABEL_CLASS}>
        {etiqueta}
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          ref={inputRef}
          id={`${id}-input`}
          role="combobox"
          aria-expanded={abierto}
          aria-controls={`${id}-lista`}
          aria-autocomplete="list"
          aria-activedescendant={abierto && opciones[activo] ? `${id}-op-${activo}` : undefined}
          autoComplete="off"
          value={q}
          placeholder="Busca por nombre o usuario"
          onChange={(e) => {
            setQ(e.target.value);
            setAbierto(true);
          }}
          onFocus={() => setAbierto(true)}
          onBlur={() => setTimeout(() => setAbierto(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setAbierto(true);
              setActivo((a) => Math.min(a + 1, opciones.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActivo((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && abierto && opciones[activo]) {
              e.preventDefault();
              elegir(opciones[activo]);
            } else if (e.key === "Escape") {
              setAbierto(false);
            }
          }}
          className="w-full rounded-lg bg-zinc-800 p-3 pl-9 text-white outline-none ring-1 ring-white/10 transition placeholder:text-slate-500 focus:ring-2 focus:ring-cyan-400/70"
        />
        {cargando ? (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-cyan-300" />
        ) : null}
      </div>

      {abierto ? (
        <ul
          id={`${id}-lista`}
          role="listbox"
          aria-label={etiqueta}
          className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-white/10 bg-zinc-900 p-1 shadow-2xl"
        >
          {!cargando && opciones.length === 0 ? (
            <li className="px-3 py-2.5 text-sm text-slate-400">
              {consulta
                ? "Nadie coincide. Solo puedes apuntar a amigos o a jugadores con perfil público."
                : "Escribe para buscar jugadores."}
            </li>
          ) : null}
          {!consulta && opciones.length > 0 ? (
            <li className="px-3 pb-1 pt-2 text-[11px] uppercase tracking-wider text-slate-400">
              {convocatoriaId ? "Jugadores del partido y amigos" : "Tus amigos"}
            </li>
          ) : null}
          {opciones.map((j, i) => (
            <li
              key={j.username}
              id={`${id}-op-${i}`}
              role="option"
              aria-selected={i === activo}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => elegir(j)}
              onMouseEnter={() => setActivo(i)}
              className={[
                "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2",
                i === activo ? "bg-white/10" : "",
              ].join(" ")}
            >
              <Avatar nombre={j.nombre} semilla={j.username} tamano="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-white">{j.nombre}</span>
                <span className="block truncate text-xs text-slate-400">
                  @{j.username}
                  {j.ciudad ? ` · ${j.ciudad}` : ""}
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

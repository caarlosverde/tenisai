"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Loader2, Lock, Search } from "lucide-react";
import Avatar from "@/components/comunidad/Avatar";
import BotonAmistad from "@/components/comunidad/BotonAmistad";
import { peticion } from "@/lib/comunidad/cliente";
import { etiquetaNivel } from "@/lib/comunidad/perfil";
import type { JugadorEncontrado } from "@/lib/comunidad/tipos";

type Estado =
  | { tipo: "inicio" }
  | { tipo: "buscando" }
  | { tipo: "resultados"; q: string; jugadores: JugadorEncontrado[] }
  | { tipo: "error"; mensaje: string };

export default function BuscadorJugadores() {
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState<Estado>({ tipo: "inicio" });
  const texto = q.trim();

  useEffect(() => {
    if (texto.length < 2) return;
    let cancelado = false;
    // Espera a que se deje de escribir antes de buscar
    const temporizador = setTimeout(async () => {
      setEstado({ tipo: "buscando" });
      const respuesta = await peticion<{ jugadores: JugadorEncontrado[] }>(
        `/api/comunidad/jugadores?q=${encodeURIComponent(texto)}`,
      );
      if (cancelado) return;
      setEstado(
        respuesta.ok
          ? { tipo: "resultados", q: texto, jugadores: respuesta.data.jugadores }
          : { tipo: "error", mensaje: respuesta.error },
      );
    }, 300);
    return () => {
      cancelado = true;
      clearTimeout(temporizador);
    };
  }, [texto]);

  const mostrar = texto.length >= 2 ? estado : { tipo: "inicio" as const };

  return (
    <div>
      <label className="relative block">
        <span className="sr-only">Buscar jugadores</span>
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Nombre, usuario, ciudad o club"
          autoComplete="off"
          maxLength={60}
          className="w-full rounded-xl bg-zinc-800 py-3 pl-10 pr-10 text-white outline-none ring-1 ring-white/10 transition placeholder:text-slate-500 focus:ring-2 focus:ring-cyan-400/70"
        />
        {mostrar.tipo === "buscando" ? (
          <Loader2 className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-cyan-300" />
        ) : null}
      </label>

      <div aria-live="polite" className="mt-3">
        {mostrar.tipo === "inicio" ? (
          <p className="text-xs text-slate-400">
            Los perfiles privados solo aparecen si escribes su nombre de usuario exacto.
          </p>
        ) : null}
        {mostrar.tipo === "error" ? <p className="text-sm text-rose-200">{mostrar.mensaje}</p> : null}
        {mostrar.tipo === "resultados" && mostrar.jugadores.length === 0 ? (
          <p className="text-sm text-slate-400">No hay jugadores que coincidan con «{mostrar.q}».</p>
        ) : null}
        {mostrar.tipo === "resultados" && mostrar.jugadores.length > 0 ? (
          <ul className="divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/10">
            {mostrar.jugadores.map((j) => {
              const visible = j.perfilPublico || j.relacion === "amigos";
              const detalles = [j.ciudad, etiquetaNivel(j.nivel)].filter(Boolean).join(" · ");
              return (
                <li key={j.username} className="flex flex-wrap items-center gap-3 bg-black/20 px-4 py-3">
                  <Avatar nombre={j.nombre} semilla={j.username} />
                  <div className="min-w-0 flex-1">
                    {visible ? (
                      <Link
                        href={`/jugador/${j.username}`}
                        className="block truncate font-medium text-white hover:text-cyan-200"
                      >
                        {j.nombre}
                      </Link>
                    ) : (
                      <p className="truncate font-medium text-white">{j.nombre}</p>
                    )}
                    <p className="truncate text-xs text-slate-400">
                      @{j.username}
                      {detalles ? ` · ${detalles}` : ""}
                      {!visible ? (
                        <span className="ml-1.5 inline-flex items-center gap-1 text-slate-400">
                          <Lock className="h-3 w-3" /> Perfil privado
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <BotonAmistad username={j.username} nombre={j.nombre} relacion={j.relacion} />
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type MouseEvent } from "react";
import { flushSync } from "react-dom";
import {
  ChevronRight,
  Film,
  GitCompareArrows,
  Trash2,
  TrendingUp,
  UploadCloud,
  X,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import ConfirmDialog from "@/components/ConfirmDialog";
import type { AnalisisItem } from "@/components/perfil/tipos";
import { fechaCorta, fechaEje } from "@/lib/formato";
import { CARD_CLASS, scoreBadgeClass } from "@/lib/ui";

const TODOS = "Todos";

function media(valores: number[]): number {
  return valores.reduce((suma, v) => suma + v, 0) / valores.length;
}

function Estadistica({ etiqueta, valor, detalle }: { etiqueta: string; valor: string; detalle?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
      <p className="text-xs uppercase tracking-wider text-slate-400">{etiqueta}</p>
      <p className="mt-1 font-display text-xl font-semibold text-white">{valor}</p>
      {detalle ? <p className="text-xs text-slate-500">{detalle}</p> : null}
    </div>
  );
}

export default function HistorialAnalisis({
  analisis,
  onBorrado,
}: {
  analisis: AnalisisItem[];
  onBorrado: (id: string) => void;
}) {
  const router = useRouter();
  const [filtro, setFiltro] = useState<string>(TODOS);
  const [seleccion, setSeleccion] = useState<string[]>([]);
  const [aBorrar, setABorrar] = useState<AnalisisItem | null>(null);
  const [borrando, setBorrando] = useState(false);

  const tipos = useMemo(() => {
    const conteo = new Map<string, number>();
    for (const item of analisis) conteo.set(item.tipoGolpe, (conteo.get(item.tipoGolpe) ?? 0) + 1);
    return [...conteo.entries()].sort((a, b) => b[1] - a[1]);
  }, [analisis]);

  // Si se borra el último análisis de un tipo, el filtro vuelve a "Todos"
  const filtroActivo = filtro === TODOS || tipos.some(([tipo]) => tipo === filtro) ? filtro : TODOS;

  const filtrados = useMemo(
    () => (filtroActivo === TODOS ? analisis : analisis.filter((a) => a.tipoGolpe === filtroActivo)),
    [analisis, filtroActivo],
  );

  // Cronológico (el historial llega del más reciente al más antiguo)
  const cronologicos = useMemo(() => [...filtrados].reverse(), [filtrados]);
  // Un punto por análisis, en orden. Con varios el mismo día el eje solo pone la
  // fecha en el primero (si no, salía "06 oct" repetido); la hora va en el tooltip
  const chartData = cronologicos.map((item, indice) => {
    const dia = fechaEje(item.fecha);
    return {
      n: indice,
      etiqueta: indice > 0 && fechaEje(cronologicos[indice - 1].fecha) === dia ? "" : dia,
      fechaCompleta: fechaCorta(item.fecha),
      puntuacion: item.puntuacion,
      tipoGolpe: item.tipoGolpe,
    };
  });

  const puntuaciones = cronologicos.map((a) => a.puntuacion);
  const cambio =
    puntuaciones.length >= 2 ? puntuaciones[puntuaciones.length - 1] - puntuaciones[0] : null;

  function alternarSeleccion(id: string) {
    setSeleccion((actual) => {
      if (actual.includes(id)) return actual.filter((x) => x !== id);
      // Máximo dos: el más antiguo de la selección deja sitio al nuevo
      return actual.length < 2 ? [...actual, id] : [actual[1], id];
    });
  }

  async function confirmarBorrado() {
    if (!aBorrar || borrando) return;
    flushSync(() => setBorrando(true));
    try {
      const response = await fetch(`/api/analisis/${aBorrar.id}`, { method: "DELETE" });
      if (!response.ok && response.status !== 404) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        toast.error(data.error ?? "No se pudo borrar el análisis.");
        return;
      }
      setSeleccion((actual) => actual.filter((x) => x !== aBorrar.id));
      onBorrado(aBorrar.id);
      toast.success("Análisis borrado");
      setABorrar(null);
    } catch {
      toast.error("No se pudo conectar con el servidor.");
    } finally {
      setBorrando(false);
    }
  }

  function pedirBorrado(event: MouseEvent, item: AnalisisItem) {
    event.stopPropagation();
    setABorrar(item);
  }

  return (
    <section className={`${CARD_CLASS} lg:col-span-2`} aria-labelledby="historial-titulo">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-400/10 text-emerald-300">
          <TrendingUp className="h-5 w-5" strokeWidth={1.75} />
        </div>
        <div>
          <h2 id="historial-titulo" className="font-display text-lg font-semibold text-white">
            Evolución y historial
          </h2>
          <p className="text-xs text-slate-400">
            {analisis.length === 1 ? "1 análisis guardado" : `${analisis.length} análisis guardados`}
          </p>
        </div>
      </div>

      {analisis.length === 0 ? (
        <div className="flex min-h-[280px] flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 bg-black/20 px-6 text-center">
          <UploadCloud className="mb-3 h-10 w-10 text-cyan-300/70" strokeWidth={1.25} />
          <p className="font-medium text-slate-200">Aún no hay análisis en tu perfil</p>
          <p className="mt-1 max-w-sm text-sm text-slate-400">
            Sube tu primer vídeo para empezar a medir tu progreso.
          </p>
          <Link
            href="/"
            className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-300 via-emerald-300 to-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-[0_0_24px_rgba(34,211,238,0.25)] transition hover:brightness-105"
          >
            <UploadCloud className="h-4 w-4" strokeWidth={2} />
            Subir un vídeo
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Filtro por tipo de golpe */}
          <div role="group" aria-label="Filtrar por tipo de golpe" className="flex flex-wrap gap-2">
            {[[TODOS, analisis.length] as [string, number], ...tipos].map(([tipo, total]) => {
              const activo = filtroActivo === tipo;
              return (
                <button
                  key={tipo}
                  type="button"
                  aria-pressed={activo}
                  onClick={() => setFiltro(tipo)}
                  className={[
                    "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    activo
                      ? "border-cyan-300/50 bg-cyan-400/15 text-cyan-100"
                      : "border-white/10 bg-white/5 text-slate-300 hover:border-white/20 hover:text-white",
                  ].join(" ")}
                >
                  {tipo} <span className="opacity-60">· {total}</span>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Estadistica etiqueta="Análisis" valor={String(puntuaciones.length)} />
            <Estadistica etiqueta="Media" valor={media(puntuaciones).toFixed(1)} detalle="sobre 100" />
            <Estadistica etiqueta="Mejor" valor={String(Math.max(...puntuaciones))} detalle="sobre 100" />
            <Estadistica
              etiqueta="Progreso"
              valor={cambio === null ? "—" : `${cambio > 0 ? "+" : ""}${cambio}`}
              detalle={cambio === null ? "necesita 2 análisis" : "del primero al último"}
            />
          </div>

          {chartData.length >= 2 ? (
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <div className="mb-3 flex items-center gap-2">
                <Film className="h-4 w-4 text-cyan-300" strokeWidth={1.75} />
                <h3 className="text-sm font-medium text-white">
                  Evolución {filtroActivo === TODOS ? "de todos los golpes" : `· ${filtroActivo}`}
                </h3>
              </div>
              <div
                className="h-64 w-full"
                role="img"
                aria-label={`Gráfica de puntuaciones: ${puntuaciones.join(", ")} sobre 100`}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="rgba(148,163,184,0.18)" strokeDasharray="3 3" />
                    <XAxis
                      dataKey="n"
                      type="number"
                      domain={["dataMin", "dataMax"]}
                      ticks={chartData.map((punto) => punto.n)}
                      tickFormatter={(n: number) => chartData[n]?.etiqueta ?? ""}
                      padding={{ left: 12, right: 12 }}
                      tick={{ fill: "#94a3b8", fontSize: 12 }}
                      axisLine={{ stroke: "rgba(148,163,184,0.25)" }}
                      tickLine={false}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tick={{ fill: "#94a3b8", fontSize: 12 }}
                      axisLine={{ stroke: "rgba(148,163,184,0.25)" }}
                      tickLine={false}
                      width={36}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "rgba(2,6,23,0.95)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: 12,
                        color: "#e2e8f0",
                      }}
                      labelFormatter={(n) => chartData[Number(n)]?.fechaCompleta ?? ""}
                      formatter={(value, _name, item) => {
                        const tipo = (item?.payload as { tipoGolpe?: string } | undefined)?.tipoGolpe;
                        const nota = typeof value === "number" ? `${value} / 100` : String(value);
                        return [nota, tipo ? `Puntuación · ${tipo}` : "Puntuación"];
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="puntuacion"
                      name="Puntuación"
                      stroke="#67e8f9"
                      strokeWidth={2.5}
                      dot={{ r: 4, fill: "#34d399", stroke: "#67e8f9" }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <p className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-400">
              {filtroActivo === TODOS
                ? "Analiza un segundo vídeo para ver tu gráfica de evolución."
                : `Analiza otro golpe de tipo «${filtroActivo}» para ver su evolución.`}
            </p>
          )}

          <div>
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-medium text-white">Historial de análisis</h3>
              <p className="text-xs text-slate-400">Marca dos análisis para compararlos.</p>
            </div>

            {seleccion.length > 0 ? (
              <div
                role="status"
                className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-cyan-300/30 bg-cyan-400/10 px-4 py-3 text-sm"
              >
                <span className="text-cyan-100">
                  {seleccion.length === 1
                    ? "1 análisis seleccionado: marca otro para comparar."
                    : "2 análisis seleccionados."}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSeleccion([])}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-300 transition hover:bg-white/10 hover:text-white"
                  >
                    <X className="h-3.5 w-3.5" /> Quitar selección
                  </button>
                  {seleccion.length === 2 ? (
                    <Link
                      href={`/analisis/comparar?a=${seleccion[0]}&b=${seleccion[1]}`}
                      className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-300 via-emerald-300 to-cyan-400 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:brightness-105"
                    >
                      <GitCompareArrows className="h-4 w-4" strokeWidth={2} />
                      Comparar
                    </Link>
                  ) : null}
                </div>
              </div>
            ) : null}

            {/* Escritorio: tabla */}
            <div className="hidden overflow-hidden rounded-2xl border border-white/10 md:block">
              <table className="w-full text-left text-sm">
                <thead className="bg-white/5 text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="w-12 px-4 py-3 font-medium">
                      <span className="sr-only">Comparar</span>
                    </th>
                    <th className="px-2 py-3 font-medium">Fecha</th>
                    <th className="px-4 py-3 font-medium">Vídeo</th>
                    <th className="px-4 py-3 font-medium">Tipo de golpe</th>
                    <th className="px-4 py-3 text-right font-medium">Puntuación</th>
                    <th className="w-24 px-2 py-3">
                      <span className="sr-only">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map((item) => (
                    <tr
                      key={item.id}
                      onClick={() => router.push(`/analisis/${item.id}`)}
                      className="group cursor-pointer border-t border-white/10 bg-black/15 transition-colors duration-200 hover:bg-white/5"
                    >
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={seleccion.includes(item.id)}
                          onChange={() => alternarSeleccion(item.id)}
                          aria-label={`Comparar ${item.videoNombre} del ${fechaCorta(item.fecha)}`}
                          className="h-4 w-4 cursor-pointer accent-cyan-400"
                        />
                      </td>
                      <td className="whitespace-nowrap px-2 py-3 text-slate-300">{fechaCorta(item.fecha)}</td>
                      <td className="max-w-[12rem] truncate px-4 py-3">
                        {/* Enlace real para teclado y lectores de pantalla */}
                        <Link
                          href={`/analisis/${item.id}`}
                          onClick={(event) => event.stopPropagation()}
                          className="text-white underline-offset-4 hover:underline"
                        >
                          {item.videoNombre}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-lg border border-cyan-400/20 bg-cyan-400/10 px-2 py-1 text-xs text-cyan-100">
                          {item.tipoGolpe}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className={[
                            "inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold",
                            scoreBadgeClass(item.puntuacion),
                          ].join(" ")}
                        >
                          {item.puntuacion} / 100
                        </span>
                      </td>
                      <td className="px-2 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={(event) => pedirBorrado(event, item)}
                            aria-label={`Borrar el análisis ${item.videoNombre} del ${fechaCorta(item.fecha)}`}
                            className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-rose-500/15 hover:text-rose-200"
                          >
                            <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                          </button>
                          <ChevronRight
                            aria-hidden
                            className="h-4 w-4 text-slate-500 transition-colors group-hover:text-cyan-300"
                            strokeWidth={1.75}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Móvil: tarjetas */}
            <ul className="space-y-3 md:hidden">
              {filtrados.map((item) => (
                <li key={item.id} className="rounded-2xl border border-white/10 bg-black/25">
                  <Link
                    href={`/analisis/${item.id}`}
                    className="block rounded-t-2xl p-4 transition-colors hover:bg-white/5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-white">{item.videoNombre}</p>
                        <p className="mt-1 text-xs text-slate-400">{fechaCorta(item.fecha)}</p>
                      </div>
                      <span
                        className={[
                          "shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold",
                          scoreBadgeClass(item.puntuacion),
                        ].join(" ")}
                      >
                        {item.puntuacion} / 100
                      </span>
                    </div>
                    <p className="mt-3 flex items-center justify-between">
                      <span className="rounded-lg border border-cyan-400/20 bg-cyan-400/10 px-2 py-1 text-xs text-cyan-100">
                        {item.tipoGolpe}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                        Ver análisis
                        <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.75} />
                      </span>
                    </p>
                  </Link>
                  <div className="flex items-center justify-between border-t border-white/10 px-4 py-2">
                    <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-slate-300">
                      <input
                        type="checkbox"
                        checked={seleccion.includes(item.id)}
                        onChange={() => alternarSeleccion(item.id)}
                        className="h-4 w-4 accent-cyan-400"
                      />
                      Comparar
                    </label>
                    <button
                      type="button"
                      onClick={(event) => pedirBorrado(event, item)}
                      className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-slate-400 transition-colors hover:bg-rose-500/15 hover:text-rose-200"
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                      Borrar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <ConfirmDialog
        abierto={aBorrar !== null}
        titulo="¿Borrar este análisis?"
        textoConfirmar="Borrar análisis"
        peligroso
        cargando={borrando}
        onConfirmar={() => void confirmarBorrado()}
        onCancelar={() => setABorrar(null)}
      >
        {aBorrar ? (
          <p>
            Se borrarán el análisis <strong className="text-white">{aBorrar.videoNombre}</strong> del{" "}
            {fechaCorta(aBorrar.fecha)} y sus vídeos. No se puede deshacer.
          </p>
        ) : null}
      </ConfirmDialog>
    </section>
  );
}

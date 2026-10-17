import Link from "next/link";
import { Medal } from "lucide-react";
import Avatar from "@/components/comunidad/Avatar";
import { porcentajeVictorias } from "@/lib/comunidad/formato";
import type { FilaRanking } from "@/lib/comunidad/tipos";

const MEDALLAS = ["text-amber-300", "text-slate-300", "text-orange-400"];

function Fila({ fila, separada = false }: { fila: FilaRanking; separada?: boolean }) {
  const derrotas = fila.partidos - fila.victorias;
  return (
    <tr
      className={[
        fila.esYo ? "bg-cyan-400/[0.07]" : "",
        separada ? "border-t-2 border-dashed border-white/10" : "",
      ].join(" ")}
    >
      <td className="whitespace-nowrap px-2 py-3 text-center font-mono tabular-nums text-slate-300 sm:px-4">
        {fila.posicion <= 3 ? (
          <span className="inline-flex items-center gap-1">
            <Medal className={`h-4 w-4 ${MEDALLAS[fila.posicion - 1]}`} strokeWidth={2} />
            <span className="sr-only">Puesto</span> {fila.posicion}
          </span>
        ) : (
          fila.posicion
        )}
      </td>
      {/* w-full + max-w-0: la celda ocupa lo que sobra y el nombre se recorta con "…"
          en vez de empujar las demás columnas fuera de la tabla en el móvil */}
      <td className="w-full max-w-0 px-2 py-3 sm:px-4">
        <div className="flex items-center gap-2.5 sm:gap-3">
          <Avatar nombre={fila.nombre} semilla={fila.username} tamano="sm" />
          <div className="min-w-0">
            {fila.enlace && !fila.esYo ? (
              <Link href={`/jugador/${fila.username}`} className="block truncate font-medium text-white hover:text-cyan-200">
                {fila.nombre}
              </Link>
            ) : (
              <span className="block truncate font-medium text-white">
                {fila.nombre}
                {fila.esYo ? <span className="ml-1.5 text-xs font-normal text-cyan-300">(tú)</span> : null}
              </span>
            )}
            <span className="block truncate text-xs text-slate-500">{fila.ciudad ?? `@${fila.username}`}</span>
          </div>
        </div>
      </td>
      <td className="whitespace-nowrap px-2 py-3 text-right sm:px-4">
        <span className="font-mono text-base font-semibold tabular-nums text-white">{fila.puntos}</span>
        {fila.provisional ? (
          <span
            title="Menos de 5 partidos: la puntuación aún se está ajustando"
            className="ml-1.5 rounded border border-amber-400/30 px-1 text-[10px] uppercase text-amber-200"
          >
            Prov.
          </span>
        ) : null}
      </td>
      <td className="hidden px-3 py-3 text-right font-mono tabular-nums text-slate-300 sm:table-cell sm:px-4">
        {fila.partidos}
      </td>
      <td className="whitespace-nowrap px-2 py-3 text-right font-mono tabular-nums text-slate-300 sm:px-4">
        {fila.victorias}-{derrotas}
      </td>
      <td className="hidden px-3 py-3 text-right font-mono tabular-nums text-slate-400 md:table-cell md:px-4">
        {porcentajeVictorias(fila.victorias, fila.partidos)}
      </td>
    </tr>
  );
}

export default function TablaRanking({
  filas,
  miFila,
  titulo,
}: {
  filas: FilaRanking[];
  miFila: FilaRanking | null;
  titulo: string;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10">
      <table className="w-full text-sm">
        <caption className="sr-only">{titulo}</caption>
        <thead className="bg-white/[0.03] text-xs uppercase tracking-wider text-slate-400">
          <tr>
            <th scope="col" className="w-12 px-2 py-3 text-center font-medium sm:w-14 sm:px-4">#</th>
            <th scope="col" className="px-2 py-3 text-left font-medium sm:px-4">Jugador</th>
            <th scope="col" className="px-2 py-3 text-right font-medium sm:px-4">Puntos</th>
            <th scope="col" className="hidden px-3 py-3 text-right font-medium sm:table-cell sm:px-4">PJ</th>
            <th scope="col" className="px-2 py-3 text-right font-medium sm:px-4">
              <abbr title="Victorias y derrotas" className="no-underline">V-D</abbr>
            </th>
            <th scope="col" className="hidden px-3 py-3 text-right font-medium md:table-cell md:px-4">% V</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {filas.map((fila) => (
            <Fila key={fila.username} fila={fila} />
          ))}
          {miFila ? <Fila fila={miFila} separada={filas.length > 0} /> : null}
        </tbody>
      </table>
    </div>
  );
}

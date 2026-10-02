import Link from "next/link";
import type { ReactNode } from "react";
import { CheckCircle2, Clock, MapPin, Trophy, XCircle } from "lucide-react";
import { formatearFechaCorta } from "@/lib/comunidad/formato";
import type { JugadorResumen, PartidoVista } from "@/lib/comunidad/tipos";

const ESTADOS = {
  pendiente: {
    texto: "Pendiente de confirmar",
    icono: Clock,
    clase: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  },
  confirmado: {
    texto: "Confirmado",
    icono: CheckCircle2,
    clase: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  },
  rechazado: {
    texto: "Rechazado por el rival",
    icono: XCircle,
    clase: "border-rose-400/30 bg-rose-500/10 text-rose-200",
  },
} as const;

function Nombre({ jugador }: { jugador: JugadorResumen }) {
  const texto = jugador.esYo ? `${jugador.nombre} (tú)` : jugador.nombre;
  if (jugador.enlace && jugador.username && !jugador.esYo) {
    return (
      <Link href={`/jugador/${jugador.username}`} className="hover:text-cyan-200 hover:underline">
        {texto}
      </Link>
    );
  }
  return <span className={jugador.username ? undefined : "italic text-slate-500"}>{texto}</span>;
}

function FilaEquipo({
  jugadores,
  juegos,
  gana,
}: {
  jugadores: JugadorResumen[];
  juegos: { propios: number; rivales: number; superTieBreak: boolean }[];
  gana: boolean;
}) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <div className={["min-w-0 flex-1 text-sm", gana ? "font-semibold text-white" : "text-slate-300"].join(" ")}>
        {jugadores.map((j, i) => (
          <span key={j.username ?? `borrado-${i}`}>
            {i > 0 ? <span className="text-slate-500"> / </span> : null}
            <Nombre jugador={j} />
          </span>
        ))}
      </div>
      <div className="flex shrink-0 items-center gap-1 font-mono tabular-nums">
        {juegos.map((set, i) => (
          <span
            key={i}
            className={[
              "flex h-7 min-w-7 items-center justify-center rounded-md px-1 text-sm",
              set.propios > set.rivales ? "bg-white/10 font-semibold text-white" : "text-slate-400",
              set.superTieBreak ? "text-xs" : "",
            ].join(" ")}
          >
            {set.propios}
          </span>
        ))}
        <span className="flex w-6 justify-center" aria-label={gana ? "Ganador" : undefined}>
          {gana ? <Trophy className="h-4 w-4 text-amber-300" strokeWidth={2} /> : null}
        </span>
      </div>
    </div>
  );
}

/** Partido con marcador tipo televisión. Las acciones (si las hay) van debajo. */
export default function TarjetaPartido({
  partido,
  children,
}: {
  partido: PartidoVista;
  children?: ReactNode;
}) {
  const estado = ESTADOS[partido.estado];
  const IconoEstado = estado.icono;
  const juegos = (equipo: 1 | 2) =>
    partido.sets.map(([a, b]) => ({
      propios: equipo === 1 ? a : b,
      rivales: equipo === 1 ? b : a,
      superTieBreak: Math.max(a, b) >= 10,
    }));
  const resultado =
    partido.miEquipo === null ? null : partido.ganador === partido.miEquipo ? "Victoria" : "Derrota";

  return (
    <article className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <header className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-400">
        <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 font-medium uppercase tracking-wider text-slate-300">
          {partido.modalidad === "dobles" ? "Dobles" : "Individual"}
        </span>
        <time dateTime={partido.jugadoEn}>{formatearFechaCorta(partido.jugadoEn)}</time>
        {partido.lugar ? (
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" /> {partido.lugar}
          </span>
        ) : null}
        <span className={`ml-auto inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${estado.clase}`}>
          <IconoEstado className="h-3.5 w-3.5" strokeWidth={2} />
          {estado.texto}
        </span>
      </header>

      <div className="divide-y divide-white/5">
        <FilaEquipo jugadores={partido.equipo1} juegos={juegos(1)} gana={partido.ganador === 1} />
        <FilaEquipo jugadores={partido.equipo2} juegos={juegos(2)} gana={partido.ganador === 2} />
      </div>

      {resultado || children ? (
        <footer className="mt-3 flex flex-wrap items-center gap-3">
          {resultado && partido.estado === "confirmado" ? (
            <span
              className={[
                "text-sm font-medium",
                resultado === "Victoria" ? "text-emerald-300" : "text-rose-300",
              ].join(" ")}
            >
              {resultado}
              {partido.cambioPuntos !== null ? (
                <span className="ml-2 font-mono tabular-nums">
                  {partido.cambioPuntos >= 0 ? "+" : ""}
                  {partido.cambioPuntos} puntos
                </span>
              ) : null}
            </span>
          ) : null}
          {children ? <div className="ml-auto flex flex-wrap gap-2">{children}</div> : null}
        </footer>
      ) : null}
    </article>
  );
}

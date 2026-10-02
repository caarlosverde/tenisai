import Link from "next/link";
import { CheckCircle2, Crown, MapPin, Medal, TrendingUp, Users, XCircle } from "lucide-react";
import { diaYHora, formatearFechaCorta } from "@/lib/comunidad/formato";
import { etiquetaNivel } from "@/lib/comunidad/perfil";
import type { TorneoResumen } from "@/lib/comunidad/tipos";

const MESES = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", timeZone: "UTC" });

function Estado({ t }: { t: TorneoResumen }) {
  const base = "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs";
  if (t.estado === "cancelado") {
    return (
      <span className={`${base} border-rose-400/30 bg-rose-500/10 text-rose-200`}>
        <XCircle className="h-3.5 w-3.5" /> Cancelado
      </span>
    );
  }
  if (t.estado === "finalizado") {
    return (
      <span className={`${base} border-amber-400/30 bg-amber-400/10 text-amber-200`}>
        <Crown className="h-3.5 w-3.5" /> {t.campeon ? `Campeón: ${t.campeon}` : "Terminado"}
      </span>
    );
  }
  if (t.estado === "en_curso") {
    return <span className={`${base} border-emerald-400/30 bg-emerald-400/10 text-emerald-200`}>En juego</span>;
  }
  if (!t.inscripcionAbierta) {
    return <span className={`${base} border-white/15 bg-white/5 text-slate-300`}>Inscripción cerrada</span>;
  }
  const { dia, hora } = diaYHora(t.cierreInscripcion);
  return (
    <span className={`${base} border-cyan-400/30 bg-cyan-400/10 text-cyan-200`}>
      Inscripción hasta {dia.toLowerCase()} {hora}
    </span>
  );
}

/** Torneo en una lista: toda la tarjeta lleva al detalle. */
export default function TarjetaTorneo({ torneo: t }: { torneo: TorneoResumen }) {
  const nivel = etiquetaNivel(t.nivel);
  const [dia, mes] = MESES.format(new Date(t.inicio)).split(" ");
  return (
    <Link
      href={`/comunidad/torneos/${t.id}`}
      className={[
        "group flex gap-4 rounded-2xl border border-white/10 bg-black/20 p-4 transition hover:border-amber-300/30 hover:bg-white/[0.03]",
        t.estado === "cancelado" ? "opacity-60" : "",
      ].join(" ")}
    >
      <div
        className="flex w-16 shrink-0 flex-col items-center justify-center rounded-xl border border-amber-300/20 bg-amber-300/[0.06] py-2 text-center"
        title={`Empieza el ${formatearFechaCorta(t.inicio)}`}
      >
        <Medal className="mb-0.5 h-4 w-4 text-amber-300" strokeWidth={1.75} />
        <span className="font-display text-xl font-semibold leading-none text-white">{dia}</span>
        <span className="text-xs uppercase tracking-wide text-slate-400">{mes}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-xs font-medium uppercase tracking-wider text-slate-300">
            {t.modalidad === "dobles" ? "Dobles" : "Individual"}
          </span>
          <Estado t={t} />
          {t.participo ? (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-300">
              <CheckCircle2 className="h-3.5 w-3.5" /> Tienes plaza
            </span>
          ) : null}
          {t.esOrganizador ? <span className="text-xs text-cyan-300">Lo organizas tú</span> : null}
        </div>
        <p className="mt-1.5 truncate font-medium text-white group-hover:text-amber-100">{t.nombre}</p>
        <p className="truncate text-xs text-slate-400">Organiza {t.organizacion}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" /> {t.lugar} · {t.ciudad}
          </span>
          {nivel ? (
            <span className="inline-flex items-center gap-1">
              <TrendingUp className="h-3.5 w-3.5" /> {nivel}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1">
            <Users className="h-3.5 w-3.5" /> {t.inscritos}/{t.plazas} {t.modalidad === "dobles" ? "parejas" : "jugadores"}
          </span>
        </div>
      </div>
    </Link>
  );
}

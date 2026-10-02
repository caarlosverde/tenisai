import Link from "next/link";
import { CheckCircle2, Clock, MapPin, TrendingUp, Users, XCircle } from "lucide-react";
import Avatar from "@/components/comunidad/Avatar";
import { diaYHora } from "@/lib/comunidad/formato";
import { etiquetaNivel } from "@/lib/comunidad/perfil";
import { textoPlazas } from "@/lib/comunidad/reglasConvocatoria";
import type { ConvocatoriaVista } from "@/lib/comunidad/tipos";

/** Cómo está el usuario respecto a la convocatoria. */
function Situacion({ c }: { c: ConvocatoriaVista }) {
  const base = "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs";
  if (c.estado === "cancelada") {
    return (
      <span className={`${base} border-rose-400/30 bg-rose-500/10 text-rose-200`}>
        <XCircle className="h-3.5 w-3.5" /> Cancelado
      </span>
    );
  }
  if (c.esMia) {
    return <span className={`${base} border-cyan-400/30 bg-cyan-400/10 text-cyan-200`}>Lo has publicado tú</span>;
  }
  if (c.miSolicitud === "aceptada") {
    return (
      <span className={`${base} border-emerald-400/30 bg-emerald-400/10 text-emerald-200`}>
        <CheckCircle2 className="h-3.5 w-3.5" /> Juegas
      </span>
    );
  }
  if (c.miSolicitud === "pendiente") {
    return (
      <span className={`${base} border-amber-400/30 bg-amber-400/10 text-amber-200`}>
        <Clock className="h-3.5 w-3.5" /> Solicitud enviada
      </span>
    );
  }
  return null;
}

/** Convocatoria de «Buscar partido» en una lista: toda la tarjeta lleva al detalle. */
export default function TarjetaConvocatoria({ convocatoria: c }: { convocatoria: ConvocatoriaVista }) {
  const { dia, hora } = diaYHora(c.fechaHora);
  const nivel = etiquetaNivel(c.nivel);
  const cancelada = c.estado === "cancelada";

  return (
    <Link
      href={`/comunidad/convocatorias/${c.id}`}
      className={[
        "group flex gap-4 rounded-2xl border border-white/10 bg-black/20 p-4 transition hover:border-cyan-400/30 hover:bg-white/[0.03]",
        cancelada ? "opacity-60" : "",
      ].join(" ")}
    >
      <div className="flex w-20 shrink-0 flex-col items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] py-2 text-center">
        <span className="text-xs font-medium uppercase tracking-wide text-emerald-300">{dia}</span>
        <span className="font-display text-xl font-semibold tabular-nums text-white">{hora}</span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-xs font-medium uppercase tracking-wider text-slate-300">
            {c.modalidad === "dobles" ? "Dobles" : "Individual"}
          </span>
          {nivel ? (
            <span className="inline-flex items-center gap-1 text-xs text-slate-400">
              <TrendingUp className="h-3.5 w-3.5" /> {nivel}
            </span>
          ) : null}
          <Situacion c={c} />
        </div>
        <p className="mt-1.5 flex items-center gap-1.5 truncate text-sm text-white">
          <MapPin className="h-4 w-4 shrink-0 text-slate-500" />
          <span className="truncate">
            {c.lugar} · <span className="text-slate-400">{c.ciudad}</span>
          </span>
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
          <span className="inline-flex items-center gap-1.5">
            <Avatar nombre={c.creador.nombre} semilla={c.creador.username ?? "?"} tamano="sm" />
            {c.esMia ? "Tú" : c.creador.nombre}
            <span className="font-mono text-slate-500">· {c.creador.puntos} pts</span>
          </span>
          {!cancelada ? (
            <span
              className={[
                "inline-flex items-center gap-1",
                c.libres === 0 ? "text-emerald-300" : "text-amber-200",
              ].join(" ")}
            >
              <Users className="h-3.5 w-3.5" /> {textoPlazas(c.libres)}
            </span>
          ) : null}
        </div>
        {c.comentario ? <p className="mt-2 line-clamp-2 text-xs text-slate-400">«{c.comentario}»</p> : null}
      </div>
    </Link>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache, type ReactNode } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Inbox,
  MapPin,
  TrendingUp,
  UserPlus,
  Users,
  XCircle,
} from "lucide-react";
import AccionesConvocatoria from "@/components/comunidad/AccionesConvocatoria";
import Avatar from "@/components/comunidad/Avatar";
import RespuestaSolicitud from "@/components/comunidad/RespuestaSolicitud";
import { Seccion, Vacio } from "@/components/comunidad/Seccion";
import { cargarConvocatoria } from "@/lib/comunidad/convocatorias";
import { diaYHora, fechaLargaEspana, mayusculaInicial } from "@/lib/comunidad/formato";
import { etiquetaNivel } from "@/lib/comunidad/perfil";
import { textoPlazas } from "@/lib/comunidad/reglasConvocatoria";
import { exigirUsuario } from "@/lib/comunidad/sesion";
import type { JugadorResumen } from "@/lib/comunidad/tipos";

type Props = PageProps<"/comunidad/convocatorias/[id]">;

const cargar = cache(async (id: string) => {
  const yo = await exigirUsuario(`/comunidad/convocatorias/${id}`);
  return cargarConvocatoria(yo.id, id);
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const c = await cargar(id);
  if (!c) return { title: "Partido no encontrado" };
  const { dia, hora } = diaYHora(c.fechaHora);
  return { title: `${c.modalidad === "dobles" ? "Dobles" : "Individual"} · ${dia} ${hora}` };
}

function NombreJugador({ jugador }: { jugador: JugadorResumen }) {
  const texto = jugador.esYo ? `${jugador.nombre} (tú)` : jugador.nombre;
  return jugador.enlace && jugador.username && !jugador.esYo ? (
    <Link href={`/jugador/${jugador.username}`} className="font-medium text-white hover:text-cyan-200">
      {texto}
    </Link>
  ) : (
    <span className="font-medium text-white">{texto}</span>
  );
}

function Aviso({
  tono,
  icono: Icono,
  children,
}: {
  tono: "rosa" | "verde" | "gris";
  icono: typeof Clock;
  children: ReactNode;
}) {
  const clases = {
    rosa: "border-rose-400/30 bg-rose-500/10 text-rose-100",
    verde: "border-emerald-400/30 bg-emerald-400/10 text-emerald-100",
    gris: "border-white/10 bg-white/[0.03] text-slate-300",
  }[tono];
  return (
    <p className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${clases}`}>
      <Icono className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
      <span>{children}</span>
    </p>
  );
}

export default async function ConvocatoriaPage({ params }: Props) {
  const { id } = await params;
  const c = await cargar(id);
  if (!c) notFound();

  const { hora } = diaYHora(c.fechaHora);
  const nivel = etiquetaNivel(c.nivel);
  const total = c.plazas + 1;
  const cubiertas = total - c.libres;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/comunidad/convocatorias"
        className="-ml-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
        Buscar partido
      </Link>

      {c.estado === "cancelada" ? (
        <Aviso tono="rosa" icono={XCircle}>Este partido se ha cancelado.</Aviso>
      ) : c.partidoId ? (
        <Aviso tono="verde" icono={CheckCircle2}>
          Resultado registrado.{" "}
          <Link href="/comunidad/partidos" className="underline underline-offset-4">
            Verlo en tus partidos
          </Link>
        </Aviso>
      ) : c.pasada ? (
        <Aviso tono="gris" icono={Clock}>
          Este partido ya se ha jugado
          {c.esMia && c.estado === "completa" ? ": registra el resultado para que cuente en el ranking." : "."}
        </Aviso>
      ) : c.estado === "completa" ? (
        <Aviso tono="verde" icono={CheckCircle2}>¡Partido completo! Ya estáis todos.</Aviso>
      ) : null}

      <section className="rounded-2xl border border-white/10 bg-gradient-to-br from-zinc-900 to-zinc-950 p-6">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 font-medium uppercase tracking-wider text-slate-300">
            {c.modalidad === "dobles" ? "Dobles" : "Individual"}
          </span>
          {nivel ? (
            <span className="inline-flex items-center gap-1 text-slate-400">
              <TrendingUp className="h-3.5 w-3.5" /> Busca nivel {nivel.toLowerCase()}
            </span>
          ) : (
            <span className="text-slate-400">Cualquier nivel</span>
          )}
        </div>
        <h2 className="mt-3 font-display text-2xl font-semibold text-white sm:text-3xl">
          {mayusculaInicial(fechaLargaEspana(c.fechaHora))} · {hora}
        </h2>
        <p className="mt-2 flex items-center gap-2 text-slate-300">
          <MapPin className="h-4 w-4 shrink-0 text-emerald-300" />
          {c.lugar} · {c.ciudad}
        </p>
        {c.comentario ? (
          <p className="mt-4 whitespace-pre-line rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-300">
            {c.comentario}
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-5">
          <div className="flex items-center gap-3">
            <Avatar nombre={c.creador.nombre} semilla={c.creador.username ?? "?"} />
            <div className="text-sm">
              <p className="text-slate-400">Lo publica</p>
              <p>
                <NombreJugador jugador={c.creador} />{" "}
                <span className="font-mono text-xs text-slate-400">{c.creador.puntos} pts</span>
              </p>
            </div>
          </div>
          <p
            className={[
              "inline-flex items-center gap-1.5 text-sm",
              c.libres === 0 ? "text-emerald-300" : "text-amber-200",
            ].join(" ")}
          >
            <Users className="h-4 w-4" />
            {cubiertas} de {total} jugadores · {textoPlazas(c.libres)}
          </p>
        </div>

        <div className="mt-5">
          <AccionesConvocatoria convocatoria={c} />
        </div>
        {c.miSolicitud === "pendiente" ? (
          <p className="mt-3 text-xs text-slate-400">
            Has pedido plaza. {c.creador.nombre} todavía no ha respondido.
          </p>
        ) : null}
        {c.miSolicitud === "rechazada" ? (
          <p className="mt-3 text-xs text-slate-400">No hay plaza para ti en este partido.</p>
        ) : null}
      </section>

      {c.jugadores ? (
        <Seccion id="jugadores" titulo="Jugadores" descripcion="Solo lo ven quienes juegan este partido.">
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {c.jugadores.map((j) => (
              <li key={j.username ?? j.nombre} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <Avatar nombre={j.nombre} semilla={j.username ?? "?"} />
                <NombreJugador jugador={j} />
              </li>
            ))}
            {Array.from({ length: c.libres }, (_, i) => (
              <li
                key={`libre-${i}`}
                className="flex items-center gap-3 rounded-2xl border border-dashed border-white/10 px-4 py-3 text-sm text-slate-400"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full border border-dashed border-white/15">
                  <UserPlus className="h-4 w-4" />
                </span>
                Plaza libre
              </li>
            ))}
          </ul>
        </Seccion>
      ) : null}

      {c.pendientes ? (
        <Seccion
          id="piden-plaza"
          titulo={`Piden plaza${c.pendientes.length ? ` (${c.pendientes.length})` : ""}`}
          descripcion="Tú decides a quién das plaza. Al cubrir todas, el partido queda completo."
        >
          {c.pendientes.length === 0 ? (
            <Vacio icono={Inbox}>
              <p>Aún nadie ha pedido plaza.</p>
            </Vacio>
          ) : (
            <ul className="space-y-3">
              {c.pendientes.map((s) => (
                <li
                  key={s.username ?? s.nombre}
                  className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3"
                >
                  <Avatar nombre={s.nombre} semilla={s.username ?? "?"} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      <NombreJugador jugador={s} />
                    </p>
                    <p className="text-xs text-slate-400">
                      {[etiquetaNivel(s.nivel), s.ciudad, `${s.puntos} pts (${s.partidos} partidos)`]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {s.mensaje ? <p className="mt-1.5 text-sm text-slate-300">«{s.mensaje}»</p> : null}
                  </div>
                  {c.estado === "abierta" && !c.pasada && s.username ? (
                    <RespuestaSolicitud convocatoriaId={c.id} username={s.username} nombre={s.nombre} />
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Seccion>
      ) : null}
    </div>
  );
}

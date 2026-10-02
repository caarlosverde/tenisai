import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ArrowLeft, CalendarDays, Clock, Crown, MapPin, TrendingUp, Users, XCircle } from "lucide-react";
import AccionesTorneo from "@/components/comunidad/AccionesTorneo";
import CuadroTorneo from "@/components/comunidad/CuadroTorneo";
import { Seccion, Vacio } from "@/components/comunidad/Seccion";
import { diaYHora, formatearFechaCorta } from "@/lib/comunidad/formato";
import { etiquetaNivel } from "@/lib/comunidad/perfil";
import { exigirUsuario } from "@/lib/comunidad/sesion";
import { cargarTorneo } from "@/lib/comunidad/torneos";
import type { JugadorResumen } from "@/lib/comunidad/tipos";

type Props = PageProps<"/comunidad/torneos/[id]">;

const cargar = cache(async (id: string) => {
  const yo = await exigirUsuario(`/comunidad/torneos/${id}`);
  return cargarTorneo(yo.id, id);
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const t = await cargar(id);
  return { title: t ? t.nombre : "Torneo no encontrado" };
}

function Nombre({ jugador }: { jugador: JugadorResumen }) {
  const texto = jugador.esYo ? `${jugador.nombre} (tú)` : jugador.nombre;
  return jugador.enlace && jugador.username && !jugador.esYo ? (
    <Link href={`/jugador/${jugador.username}`} className="hover:text-cyan-200">
      {texto}
    </Link>
  ) : (
    <span>{texto}</span>
  );
}

const ESTADOS = {
  inscripcion: "Inscripción abierta",
  en_curso: "En juego",
  finalizado: "Terminado",
  cancelado: "Cancelado",
} as const;

export default async function TorneoPage({ params }: Props) {
  const { id } = await params;
  const t = await cargar(id);
  if (!t) notFound();

  const nivel = etiquetaNivel(t.nivel);
  const cierre = diaYHora(t.cierreInscripcion);
  const unidad = t.modalidad === "dobles" ? "parejas" : "jugadores";
  const hayCuadro = t.cruces.length > 0;

  return (
    <div className="space-y-6">
      <Link
        href="/comunidad/torneos"
        className="-ml-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
        Torneos
      </Link>

      {t.estado === "cancelado" ? (
        <p className="flex items-center gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          <XCircle className="h-4 w-4" /> El organizador ha cancelado este torneo.
        </p>
      ) : null}

      {t.campeon ? (
        <div className="flex items-center gap-4 rounded-2xl border border-amber-300/40 bg-gradient-to-r from-amber-300/15 to-transparent px-5 py-4">
          <Crown className="h-8 w-8 shrink-0 text-amber-300" strokeWidth={1.75} />
          <div>
            <p className="text-xs uppercase tracking-wider text-amber-200/80">
              {t.modalidad === "dobles" ? "Pareja campeona" : "Campeón del torneo"}
            </p>
            <p className="font-display text-xl font-semibold text-white">
              {t.campeon.jugadores.map((j, i) => (
                <span key={j.username ?? i}>
                  {i > 0 ? " / " : ""}
                  <Nombre jugador={j} />
                </span>
              ))}
            </p>
          </div>
        </div>
      ) : null}

      <section className="rounded-2xl border border-white/10 bg-gradient-to-br from-zinc-900 to-zinc-950 p-6">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 font-medium uppercase tracking-wider text-slate-300">
            {t.modalidad === "dobles" ? "Dobles" : "Individual"}
          </span>
          <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-2 py-0.5 text-amber-100">
            {ESTADOS[t.estado]}
          </span>
          {nivel ? (
            <span className="inline-flex items-center gap-1 text-slate-400">
              <TrendingUp className="h-3.5 w-3.5" /> Nivel {nivel.toLowerCase()}
            </span>
          ) : null}
        </div>
        <h2 className="mt-3 font-display text-2xl font-semibold text-white sm:text-3xl">{t.nombre}</h2>
        <p className="mt-1 text-sm text-slate-400">
          Organiza {t.organizador.organizacion ?? t.organizador.nombre}
        </p>

        <ul className="mt-4 grid grid-cols-1 gap-2 text-sm text-slate-300 sm:grid-cols-2">
          <li className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 shrink-0 text-amber-300" /> Empieza el {formatearFechaCorta(t.inicio)}
          </li>
          <li className="flex items-center gap-2">
            <Clock className="h-4 w-4 shrink-0 text-amber-300" /> Inscripción hasta {cierre.dia.toLowerCase()} a las{" "}
            {cierre.hora}
          </li>
          <li className="flex items-center gap-2">
            <MapPin className="h-4 w-4 shrink-0 text-amber-300" /> {t.lugar} · {t.ciudad}
          </li>
          <li className="flex items-center gap-2">
            <Users className="h-4 w-4 shrink-0 text-amber-300" /> {t.confirmados} de {t.plazas} {unidad}
          </li>
        </ul>

        {t.descripcion ? (
          <p className="mt-4 whitespace-pre-line rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-relaxed text-slate-300">
            {t.descripcion}
          </p>
        ) : null}

        <div className="mt-5 border-t border-white/10 pt-5">
          <AccionesTorneo torneo={t} />
          {t.esOrganizador && t.estado === "en_curso" ? (
            <p className="mt-3 text-xs text-slate-500">
              Anota cada resultado desde el cuadro: el ganador pasa solo a la siguiente ronda y el
              partido cuenta para el ranking.
            </p>
          ) : null}
        </div>
      </section>

      {hayCuadro ? (
        <Seccion id="cuadro" titulo="Cuadro" descripcion="Cabezas de serie según los puntos al sortear.">
          <CuadroTorneo
            cruces={t.cruces}
            rondas={t.rondas}
            torneoId={t.id}
            esOrganizador={t.esOrganizador && t.estado === "en_curso"}
            campeon={t.campeon}
          />
        </Seccion>
      ) : null}

      <Seccion id="inscritos" titulo={`Inscritos (${t.confirmados}/${t.plazas})`}>
        {t.inscritos.length === 0 ? (
          <Vacio icono={Users}>
            <p>Todavía no hay {unidad} inscritos.</p>
          </Vacio>
        ) : (
          <ol className="divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/10">
            {t.inscritos.map((i) => (
              <li
                key={i.id}
                className={["flex items-center gap-3 px-4 py-3 text-sm", i.esMia ? "bg-cyan-400/[0.06]" : "bg-black/20"].join(" ")}
              >
                <span className="w-6 shrink-0 text-right font-mono text-xs text-slate-500">{i.semilla ?? ""}</span>
                <span className="min-w-0 flex-1 truncate text-white">
                  {i.jugadores.map((j, n) => (
                    <span key={j.username ?? n}>
                      {n > 0 ? " / " : ""}
                      <Nombre jugador={j} />
                    </span>
                  ))}
                </span>
                {i.pendiente ? (
                  <span className="shrink-0 rounded-full border border-amber-400/30 px-2 py-0.5 text-xs text-amber-200">
                    Falta que acepte la pareja
                  </span>
                ) : (
                  <span className="shrink-0 font-mono text-xs text-slate-400">{i.puntos} pts</span>
                )}
              </li>
            ))}
          </ol>
        )}
      </Seccion>
    </div>
  );
}

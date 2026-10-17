import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache, type ReactNode } from "react";
import {
  CalendarDays,
  Clock,
  Crown,
  Medal,
  Hand,
  Lock,
  MapPin,
  Pencil,
  Shield,
  Swords,
  TrendingUp,
} from "lucide-react";
import Avatar from "@/components/comunidad/Avatar";
import BotonAmistad from "@/components/comunidad/BotonAmistad";
import GraficaPuntos, { type PuntoEvolucion } from "@/components/comunidad/GraficaPuntos";
import MenuJugador from "@/components/comunidad/MenuJugador";
import { Seccion, Vacio } from "@/components/comunidad/Seccion";
import TarjetaPartido from "@/components/comunidad/TarjetaPartido";
import { esProvisional } from "@/lib/comunidad/elo";
import { cantidad, formatearFechaCorta, porcentajeVictorias } from "@/lib/comunidad/formato";
import { cargarPartidos, enfrentamientos } from "@/lib/comunidad/partidos";
import { titulosDe } from "@/lib/comunidad/torneos";
import { etiquetaNivel, nombreVisible, type Modalidad } from "@/lib/comunidad/perfil";
import { puestoGeneral } from "@/lib/comunidad/ranking";
import {
  cargarRelaciones,
  hayBloqueo,
  puedeJugarCon,
  puedeVerPerfil,
} from "@/lib/comunidad/relaciones";
import { exigirUsuario } from "@/lib/comunidad/sesion";
import { prisma } from "@/lib/prisma";
import { PAGE_BACKGROUND_CLASS } from "@/lib/ui";

type Props = PageProps<"/jugador/[username]">;

// La página y generateMetadata comparten la consulta
const cargarJugador = cache(async (username: string) => {
  const yo = await exigirUsuario(`/jugador/${username}`);
  const jugador = await prisma.user.findUnique({
    where: { username },
    select: {
      id: true,
      username: true,
      nombre: true,
      apellidos: true,
      lateralidad: true,
      estiloReves: true,
      createdAt: true,
      perfilPublico: true,
      ciudad: true,
      club: true,
      nivel: true,
      disponibilidad: true,
      bio: true,
      puntosIndividual: true,
      partidosIndividual: true,
      victoriasIndividual: true,
      puntosDobles: true,
      partidosDobles: true,
      victoriasDobles: true,
      rol: true,
      organizacion: true,
    },
  });
  if (!jugador) return null;
  const relacion = (await cargarRelaciones(yo.id)).estado(jugador.id);
  // Con un bloqueo, en cualquier sentido, el perfil no existe para el otro
  if (hayBloqueo(relacion) && relacion !== "bloqueado") return null;
  return { yo, jugador, relacion };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const datos = await cargarJugador(username);
  if (!datos) return { title: "Jugador no encontrado", robots: { index: false } };
  const completo = datos.relacion === "yo" || datos.relacion === "amigos";
  return {
    title: nombreVisible(datos.jugador, completo),
    robots: { index: false, follow: false },
  };
}

function Dato({ icono: Icono, children }: { icono: typeof MapPin; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs text-slate-300">
      <Icono className="h-3.5 w-3.5 text-slate-500" strokeWidth={1.75} />
      {children}
    </span>
  );
}

export default async function JugadorPage({ params }: Props) {
  const { username } = await params;
  const datos = await cargarJugador(username);
  if (!datos) notFound();
  const { yo, jugador, relacion } = datos;

  const esYo = relacion === "yo";
  const completo = esYo || relacion === "amigos";
  const nombre = nombreVisible(jugador, completo);
  const visible = puedeVerPerfil(relacion, jugador.perfilPublico);

  const cabecera = (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
      <Avatar nombre={nombre} semilla={jugador.username} tamano="lg" />
      <div className="min-w-0 flex-1">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl">{nombre}</h1>
        <p className="mt-1 text-sm text-slate-400">
          @{jugador.username}
          {jugador.rol === "organizador" ? (
            <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-amber-300/30 bg-amber-300/10 px-2 py-0.5 text-xs text-amber-100">
              <Medal className="h-3 w-3" /> Organizador{jugador.organizacion ? ` · ${jugador.organizacion}` : ""}
            </span>
          ) : null}
          {esYo ? (
            <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-white/10 px-2 py-0.5 text-xs">
              {jugador.perfilPublico ? "Perfil público" : (
                <>
                  <Lock className="h-3 w-3" /> Perfil privado
                </>
              )}
            </span>
          ) : null}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {esYo ? (
          <Link
            href="/perfil/ajustes#perfil-jugador"
            className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm text-white transition hover:bg-white/10"
          >
            <Pencil className="h-4 w-4" strokeWidth={1.75} />
            Editar perfil
          </Link>
        ) : (
          <>
            {visible && puedeJugarCon(relacion, jugador.perfilPublico) ? (
              <Link
                href={`/comunidad/partidos/nuevo?rival=${jugador.username}`}
                className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white transition hover:bg-white/10"
              >
                <Swords className="h-4 w-4" strokeWidth={1.75} />
                Registrar partido
              </Link>
            ) : null}
            <BotonAmistad username={jugador.username} nombre={nombre} relacion={relacion} />
            <MenuJugador username={jugador.username} nombre={nombre} bloqueado={relacion === "bloqueado"} />
          </>
        )}
      </div>
    </div>
  );

  if (!visible) {
    return (
      <Marco>
        {cabecera}
        <div className="mt-10">
          <Vacio icono={Lock}>
            {relacion === "bloqueado" ? (
              <p>Has bloqueado a este jugador. Desbloquéalo para volver a ver su perfil.</p>
            ) : (
              <p>
                Este perfil es privado. Solo sus amigos ven sus datos y partidos.
                {relacion === "ninguna" ? " Envíale una solicitud de amistad." : ""}
              </p>
            )}
          </Vacio>
        </div>
      </Marco>
    );
  }

  const modalidades: { modalidad: Modalidad; titulo: string; puntos: number; partidos: number; victorias: number }[] = [
    { modalidad: "individual", titulo: "Individual", puntos: jugador.puntosIndividual, partidos: jugador.partidosIndividual, victorias: jugador.victoriasIndividual },
    { modalidad: "dobles", titulo: "Dobles", puntos: jugador.puntosDobles, partidos: jugador.partidosDobles, victorias: jugador.victoriasDobles },
  ];

  const [puestos, partidos, historialPuntos, entreNosotros, titulos] = await Promise.all([
    Promise.all(
      modalidades.map((m) => puestoGeneral({ perfilPublico: jugador.perfilPublico, ...m }, m.modalidad)),
    ),
    cargarPartidos(
      yo.id,
      { estado: "confirmado", jugadores: { some: { userId: jugador.id } } },
      10,
      jugador.id,
    ),
    prisma.jugadorPartido.findMany({
      where: { userId: jugador.id, puntosDespues: { not: null }, partido: { estado: "confirmado" } },
      orderBy: { partido: { confirmadoEn: "asc" } },
      select: { puntosDespues: true, partido: { select: { modalidad: true, jugadoEn: true } } },
      take: 200,
    }),
    esYo
      ? Promise.resolve([])
      : cargarPartidos(yo.id, {
          estado: "confirmado",
          AND: [
            { jugadores: { some: { userId: yo.id } } },
            { jugadores: { some: { userId: jugador.id } } },
          ],
        }, 200),
    titulosDe(jugador.id),
  ]);

  const evolucion = historialPuntos.map((h): PuntoEvolucion => {
    const fecha = h.partido.jugadoEn.toISOString();
    const puntos = h.puntosDespues ?? undefined;
    return h.partido.modalidad === "dobles" ? { fecha, dobles: puntos } : { fecha, individual: puntos };
  });
  const cara = esYo ? null : enfrentamientos(entreNosotros, jugador.username);
  const nivel = etiquetaNivel(jugador.nivel);

  return (
    <Marco>
      {cabecera}

      <div className="mt-5 flex flex-wrap gap-2">
        {jugador.ciudad ? <Dato icono={MapPin}>{jugador.ciudad}</Dato> : null}
        {jugador.club ? <Dato icono={Shield}>{jugador.club}</Dato> : null}
        {nivel ? <Dato icono={TrendingUp}>Nivel {nivel.toLowerCase()}</Dato> : null}
        <Dato icono={Hand}>
          Mano {jugador.lateralidad === "zurdo" ? "izquierda" : "derecha"} · revés a{" "}
          {jugador.estiloReves === "1_mano" ? "una mano" : "dos manos"}
        </Dato>
        <Dato icono={CalendarDays}>En TenisAI desde {formatearFechaCorta(jugador.createdAt)}</Dato>
      </div>

      {titulos.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2" aria-label="Títulos">
          {titulos.map((t) => (
            <Link
              key={t.id}
              href={`/comunidad/torneos/${t.id}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300/30 bg-amber-300/10 px-2.5 py-1 text-xs text-amber-100 transition hover:bg-amber-300/20"
            >
              <Crown className="h-3.5 w-3.5 text-amber-300" />
              Campeón{t.modalidad === "dobles" ? " de dobles" : ""} · {t.nombre} ({formatearFechaCorta(t.inicio)})
            </Link>
          ))}
        </div>
      ) : null}

      {jugador.bio || jugador.disponibilidad ? (
        <div className="mt-5 space-y-2 text-sm text-slate-300">
          {jugador.bio ? <p className="whitespace-pre-line leading-relaxed">{jugador.bio}</p> : null}
          {jugador.disponibilidad ? (
            <p className="flex items-center gap-2 text-slate-400">
              <Clock className="h-4 w-4 text-emerald-300" strokeWidth={1.75} />
              Suele jugar: {jugador.disponibilidad}
            </p>
          ) : null}
        </div>
      ) : null}

      {esYo && !jugador.perfilPublico ? (
        <p className="mt-5 flex items-start gap-2 rounded-xl border border-cyan-400/20 bg-cyan-400/[0.06] px-4 py-3 text-sm text-slate-300">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
          Así ven tu perfil tus amigos. Como es privado, el resto solo ve tu nombre con la inicial del
          apellido y tu usuario.
        </p>
      ) : null}

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {modalidades.map((m, i) => (
          <div key={m.modalidad} className="rounded-2xl border border-white/10 bg-gradient-to-br from-zinc-900 to-zinc-950 p-5">
            <p className="text-xs uppercase tracking-wider text-slate-400">{m.titulo}</p>
            <div className="mt-2 flex items-end justify-between gap-3">
              <p>
                <span className="font-display text-4xl font-semibold tabular-nums text-white">{m.puntos}</span>
                <span className="ml-1.5 text-sm text-slate-400">puntos</span>
              </p>
              {puestos[i] ? (
                <p className="text-right text-sm text-slate-400">
                  <span className="block font-display text-2xl font-semibold text-emerald-300">{puestos[i]}.º</span>
                  en el ranking
                </p>
              ) : null}
            </div>
            <p className="mt-3 text-xs text-slate-400">
              {m.partidos === 0
                ? "Sin partidos confirmados"
                : `${cantidad(m.partidos, "partido", "partidos")} · ${m.victorias}-${m.partidos - m.victorias} · ${porcentajeVictorias(m.victorias, m.partidos)} de victorias${esProvisional(m.partidos) ? " · provisional" : ""}`}
            </p>
          </div>
        ))}
      </div>

      {cara && cara.ganados + cara.perdidos > 0 ? (
        <p className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-300">
          Vuestros enfrentamientos:{" "}
          <strong className="font-mono text-white">
            tú {cara.ganados} – {cara.perdidos}
          </strong>{" "}
          {nombre}
        </p>
      ) : null}

      <div className="mt-8 space-y-6">
        {evolucion.length > 0 ? (
          <Seccion id="evolucion" titulo="Evolución de los puntos">
            <GraficaPuntos datos={evolucion} />
          </Seccion>
        ) : null}

        <Seccion id="partidos" titulo="Últimos partidos">
          {partidos.length === 0 ? (
            <Vacio icono={Swords}>
              <p>{esYo ? "Aún no tienes partidos confirmados." : "Todavía no tiene partidos confirmados."}</p>
            </Vacio>
          ) : (
            <div className="space-y-3">
              {partidos.map((p) => (
                <TarjetaPartido key={p.id} partido={p} />
              ))}
            </div>
          )}
        </Seccion>
      </div>
    </Marco>
  );
}

function Marco({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-[calc(100vh-4rem)] overflow-hidden text-white">
      <div className={PAGE_BACKGROUND_CLASS} />
      <div className="pointer-events-none absolute -top-32 left-1/2 h-72 w-[36rem] -translate-x-1/2 rounded-full bg-cyan-500/10 blur-3xl" />
      <div className="relative z-10 mx-auto max-w-5xl px-4 pb-16 pt-10 sm:px-6 md:px-10">{children}</div>
    </div>
  );
}

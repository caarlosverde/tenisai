import Link from "next/link";
import {
  CalendarSearch,
  CheckCircle2,
  ClipboardCheck,
  Lock,
  Medal,
  Plus,
  Search,
  Swords,
  UserRound,
} from "lucide-react";
import AccionesPartido from "@/components/comunidad/AccionesPartido";
import Avatar from "@/components/comunidad/Avatar";
import BotonAmistad from "@/components/comunidad/BotonAmistad";
import { Seccion, Vacio } from "@/components/comunidad/Seccion";
import TarjetaConvocatoria from "@/components/comunidad/TarjetaConvocatoria";
import TarjetaPartido from "@/components/comunidad/TarjetaPartido";
import { misConvocatorias } from "@/lib/comunidad/convocatorias";
import { esProvisional } from "@/lib/comunidad/elo";
import { cantidad, diaYHora, porcentajeVictorias } from "@/lib/comunidad/formato";
import { cargarPartidos } from "@/lib/comunidad/partidos";
import { nombreVisible, type Modalidad } from "@/lib/comunidad/perfil";
import { puestoGeneral } from "@/lib/comunidad/ranking";
import { exigirUsuario } from "@/lib/comunidad/sesion";
import { prisma } from "@/lib/prisma";

export default async function ComunidadPage() {
  const sesion = await exigirUsuario("/comunidad");
  const yo = await prisma.user.findUniqueOrThrow({
    where: { id: sesion.id },
    select: {
      username: true,
      perfilPublico: true,
      puntosIndividual: true,
      partidosIndividual: true,
      victoriasIndividual: true,
      puntosDobles: true,
      partidosDobles: true,
      victoriasDobles: true,
    },
  });

  const modalidades: { modalidad: Modalidad; titulo: string; puntos: number; partidos: number; victorias: number }[] = [
    { modalidad: "individual", titulo: "Individual", puntos: yo.puntosIndividual, partidos: yo.partidosIndividual, victorias: yo.victoriasIndividual },
    { modalidad: "dobles", titulo: "Dobles", puntos: yo.puntosDobles, partidos: yo.partidosDobles, victorias: yo.victoriasDobles },
  ];

  const [puestos, solicitudes, porConfirmar, recientes, convocatorias, invitaciones] = await Promise.all([
    Promise.all(
      modalidades.map((m) => puestoGeneral({ perfilPublico: yo.perfilPublico, ...m }, m.modalidad)),
    ),
    prisma.amistad.findMany({
      where: { receptorId: sesion.id, estado: "pendiente" },
      orderBy: { creadaEn: "desc" },
      select: {
        solicitante: { select: { username: true, nombre: true, apellidos: true, ciudad: true } },
      },
    }),
    cargarPartidos(sesion.id, {
      estado: "pendiente",
      jugadores: { some: { userId: sesion.id, equipo: 2 } },
    }),
    cargarPartidos(sesion.id, { estado: "confirmado", jugadores: { some: { userId: sesion.id } } }, 3),
    misConvocatorias(sesion.id),
    // Invitaciones para jugar un torneo de dobles en pareja
    prisma.inscripcionTorneo.findMany({
      where: { companeroId: sesion.id, estado: "pendiente_companero", torneo: { estado: "inscripcion" } },
      select: {
        torneo: { select: { id: true, nombre: true } },
        user: { select: { nombre: true, apellidos: true } },
      },
    }),
  ]);

  // Mis convocatorias en las que alguien espera respuesta
  const conSolicitudes = convocatorias.proximas.filter(
    (c) => c.esMia && c.estado === "abierta" && (c.pendientes?.length ?? 0) > 0,
  );
  const proximas = convocatorias.proximas.filter((c) => c.estado !== "cancelada").slice(0, 3);
  const nadaPendiente =
    solicitudes.length === 0 &&
    porConfirmar.length === 0 &&
    conSolicitudes.length === 0 &&
    convocatorias.porRegistrar.length === 0 &&
    invitaciones.length === 0;

  return (
    <div className="space-y-6">
      {!yo.perfilPublico ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.06] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-3 text-sm text-slate-300">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" strokeWidth={1.75} />
            <span>
              Tu perfil de jugador es <strong className="text-white">privado</strong>: solo tus
              amigos lo ven y no apareces en el ranking general. Hazlo público para que otros
              jugadores te encuentren.
            </span>
          </p>
          <Link
            href="/perfil/ajustes#perfil-jugador"
            className="shrink-0 rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-center text-sm text-white transition hover:bg-white/10"
          >
            Configurar perfil
          </Link>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {modalidades.map((m, i) => (
          <Link
            key={m.modalidad}
            href={`/comunidad/ranking?modalidad=${m.modalidad}`}
            className="group rounded-2xl border border-white/10 bg-gradient-to-br from-zinc-900 to-zinc-950 p-5 transition hover:border-cyan-400/30"
          >
            <p className="text-xs uppercase tracking-wider text-slate-400">{m.titulo}</p>
            <div className="mt-2 flex items-end justify-between gap-3">
              <p>
                <span className="font-display text-4xl font-semibold tabular-nums text-white">{m.puntos}</span>
                <span className="ml-1.5 text-sm text-slate-400">puntos</span>
              </p>
              <p className="text-right text-sm text-slate-400">
                {puestos[i] ? (
                  <>
                    <span className="block font-display text-2xl font-semibold text-emerald-300">
                      {puestos[i]}.º
                    </span>
                    en el ranking
                  </>
                ) : m.partidos === 0 ? (
                  "Sin partidos aún"
                ) : (
                  "Fuera del ranking general"
                )}
              </p>
            </div>
            <p className="mt-3 text-xs text-slate-500">
              {m.partidos === 0
                ? "Registra tu primer partido para entrar en el ranking."
                : `${cantidad(m.partidos, "partido", "partidos")} · ${m.victorias}-${m.partidos - m.victorias} · ${porcentajeVictorias(m.victorias, m.partidos)} de victorias${esProvisional(m.partidos) ? " · puntuación provisional" : ""}`}
            </p>
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href="/comunidad/partidos/nuevo"
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-300 via-emerald-300 to-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:brightness-105"
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} />
          Registrar partido
        </Link>
        <Link
          href="/comunidad/amigos"
          className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-white transition hover:bg-white/10"
        >
          <Search className="h-4 w-4" strokeWidth={1.75} />
          Buscar jugadores
        </Link>
        <Link
          href={`/jugador/${yo.username}`}
          className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-white transition hover:bg-white/10"
        >
          <UserRound className="h-4 w-4" strokeWidth={1.75} />
          Ver mi perfil de jugador
        </Link>
      </div>

      <Seccion
        id="pendiente"
        titulo="Pendiente de ti"
        descripcion="Solicitudes, partidos por confirmar y jugadores que quieren unirse a tus partidos."
      >
        {nadaPendiente ? (
          <Vacio icono={CheckCircle2}>Estás al día: no tienes nada pendiente.</Vacio>
        ) : (
          <div className="space-y-3">
            {solicitudes.map(({ solicitante: s }) => {
              const nombre = nombreVisible(s, false);
              return (
                <div
                  key={s.username}
                  className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3"
                >
                  <Avatar nombre={nombre} semilla={s.username} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white">
                      <Link href={`/jugador/${s.username}`} className="font-medium hover:text-cyan-200">
                        {nombre}
                      </Link>{" "}
                      te ha enviado una solicitud de amistad
                    </p>
                    <p className="text-xs text-slate-400">
                      @{s.username}
                      {s.ciudad ? ` · ${s.ciudad}` : ""}
                    </p>
                  </div>
                  <BotonAmistad username={s.username} nombre={nombre} relacion="recibida" />
                </div>
              );
            })}
            {porConfirmar.map((partido) => (
              <TarjetaPartido key={partido.id} partido={partido}>
                <AccionesPartido
                  partidoId={partido.id}
                  puedeResponder={partido.puedeResponder}
                  puedeRetirar={partido.puedeRetirar}
                />
              </TarjetaPartido>
            ))}
            {conSolicitudes.map((c) => {
              const { dia, hora } = diaYHora(c.fechaHora);
              const n = c.pendientes?.length ?? 0;
              return (
                <div
                  key={c.id}
                  className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3"
                >
                  <CalendarSearch className="h-5 w-5 shrink-0 text-emerald-300" strokeWidth={1.75} />
                  <p className="min-w-0 flex-1 text-sm text-white">
                    {n === 1 ? "1 jugador pide" : `${n} jugadores piden`} plaza en tu partido de{" "}
                    {c.modalidad === "dobles" ? "dobles" : "individual"} ({dia.toLowerCase()}, {hora})
                  </p>
                  <Link
                    href={`/comunidad/convocatorias/${c.id}`}
                    className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white transition hover:bg-white/10"
                  >
                    Ver solicitudes
                  </Link>
                </div>
              );
            })}
            {invitaciones.map(({ torneo, user }) => (
              <div
                key={torneo.id}
                className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3"
              >
                <Medal className="h-5 w-5 shrink-0 text-amber-300" strokeWidth={1.75} />
                <p className="min-w-0 flex-1 text-sm text-white">
                  {nombreVisible(user, false)} te invita a jugar en pareja el torneo «{torneo.nombre}»
                </p>
                <Link
                  href={`/comunidad/torneos/${torneo.id}`}
                  className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white transition hover:bg-white/10"
                >
                  Responder
                </Link>
              </div>
            ))}
            {convocatorias.porRegistrar.map((c) => {
              const { dia, hora } = diaYHora(c.fechaHora);
              return (
                <div
                  key={c.id}
                  className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3"
                >
                  <ClipboardCheck className="h-5 w-5 shrink-0 text-cyan-300" strokeWidth={1.75} />
                  <p className="min-w-0 flex-1 text-sm text-white">
                    Registra el resultado de tu partido ({dia.toLowerCase()}, {hora}) en {c.lugar}
                  </p>
                  <Link
                    href={`/comunidad/partidos/nuevo?convocatoria=${c.id}`}
                    className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white transition hover:bg-white/10"
                  >
                    Registrar resultado
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </Seccion>

      {proximas.length > 0 ? (
        <Seccion
          id="proximos"
          titulo="Tus próximos partidos"
          accion={
            <Link href="/comunidad/convocatorias" className="text-sm text-cyan-300 hover:underline">
              Buscar partido
            </Link>
          }
        >
          <div className="space-y-3">
            {proximas.map((c) => (
              <TarjetaConvocatoria key={c.id} convocatoria={c} />
            ))}
          </div>
        </Seccion>
      ) : null}

      <Seccion
        id="ultimos"
        titulo="Tus últimos partidos"
        accion={
          recientes.length > 0 ? (
            <Link href="/comunidad/partidos" className="text-sm text-cyan-300 hover:underline">
              Ver todos
            </Link>
          ) : null
        }
      >
        {recientes.length === 0 ? (
          <Vacio icono={Swords}>
            <p>Aún no tienes partidos confirmados.</p>
            <Link href="/comunidad/partidos/nuevo" className="text-cyan-300 hover:underline">
              Registra el primero
            </Link>
          </Vacio>
        ) : (
          <div className="space-y-3">
            {recientes.map((partido) => (
              <TarjetaPartido key={partido.id} partido={partido} />
            ))}
          </div>
        )}
      </Seccion>
    </div>
  );
}

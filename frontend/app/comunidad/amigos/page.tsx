import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Swords, Users } from "lucide-react";
import Avatar from "@/components/comunidad/Avatar";
import BotonAmistad from "@/components/comunidad/BotonAmistad";
import BuscadorJugadores from "@/components/comunidad/BuscadorJugadores";
import { Seccion, Vacio } from "@/components/comunidad/Seccion";
import { etiquetaNivel, nombreVisible } from "@/lib/comunidad/perfil";
import { exigirUsuario } from "@/lib/comunidad/sesion";
import type { EstadoRelacion } from "@/lib/comunidad/tipos";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Amigos" };

const SELECT_PERSONA = {
  username: true,
  nombre: true,
  apellidos: true,
  ciudad: true,
  nivel: true,
  perfilPublico: true,
  puntosIndividual: true,
  puntosDobles: true,
} as const;

type Persona = {
  username: string;
  nombre: string;
  apellidos: string;
  ciudad: string | null;
  nivel: string | null;
  perfilPublico: boolean;
  puntosIndividual: number;
  puntosDobles: number;
};

function FilaPersona({
  persona,
  relacion,
  completo,
  extra,
}: {
  persona: Persona;
  relacion: EstadoRelacion;
  /** Amigos: nombre completo y enlace aunque el perfil sea privado. */
  completo: boolean;
  extra?: ReactNode;
}) {
  const nombre = nombreVisible(persona, completo);
  const enlace = completo || (persona.perfilPublico && relacion !== "bloqueado");
  const detalles = [persona.ciudad, etiquetaNivel(persona.nivel)].filter(Boolean).join(" · ");
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
      <Avatar nombre={nombre} semilla={persona.username} />
      <div className="min-w-0 flex-1">
        {enlace ? (
          <Link href={`/jugador/${persona.username}`} className="block truncate font-medium text-white hover:text-cyan-200">
            {nombre}
          </Link>
        ) : (
          <p className="truncate font-medium text-white">{nombre}</p>
        )}
        <p className="truncate text-xs text-slate-400">
          @{persona.username}
          {detalles && relacion !== "bloqueado" ? ` · ${detalles}` : ""}
        </p>
        {extra}
      </div>
      <BotonAmistad username={persona.username} nombre={nombre} relacion={relacion} />
    </li>
  );
}

export default async function AmigosPage() {
  const yo = await exigirUsuario("/comunidad/amigos");

  const [enviadasPorMi, recibidas, bloqueos] = await Promise.all([
    prisma.amistad.findMany({
      where: { solicitanteId: yo.id },
      orderBy: { creadaEn: "desc" },
      select: { estado: true, receptor: { select: SELECT_PERSONA } },
    }),
    prisma.amistad.findMany({
      where: { receptorId: yo.id },
      orderBy: { creadaEn: "desc" },
      select: { estado: true, solicitante: { select: SELECT_PERSONA } },
    }),
    prisma.bloqueo.findMany({
      where: { autorId: yo.id },
      orderBy: { creadoEn: "desc" },
      select: { bloqueado: { select: SELECT_PERSONA } },
    }),
  ]);

  const amigos = [
    ...enviadasPorMi.filter((a) => a.estado === "aceptada").map((a) => a.receptor),
    ...recibidas.filter((a) => a.estado === "aceptada").map((a) => a.solicitante),
  ].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  const pendientesRecibidas = recibidas.filter((a) => a.estado === "pendiente").map((a) => a.solicitante);
  const pendientesEnviadas = enviadasPorMi.filter((a) => a.estado === "pendiente").map((a) => a.receptor);

  return (
    <div className="space-y-6">
      <Seccion
        id="buscar"
        titulo="Buscar jugadores"
        descripcion="Encuentra a gente con la que juegas y añádela para registrar vuestros partidos."
      >
        <BuscadorJugadores />
      </Seccion>

      {pendientesRecibidas.length > 0 ? (
        <Seccion id="recibidas" titulo={`Solicitudes recibidas (${pendientesRecibidas.length})`}>
          <ul className="space-y-3">
            {pendientesRecibidas.map((p) => (
              <FilaPersona key={p.username} persona={p} relacion="recibida" completo={false} />
            ))}
          </ul>
        </Seccion>
      ) : null}

      <Seccion id="mis-amigos" titulo={`Tus amigos (${amigos.length})`}>
        {amigos.length === 0 ? (
          <Vacio icono={Users}>
            <p>Todavía no tienes amigos en TenisAI. Búscalos arriba por su nombre o usuario.</p>
          </Vacio>
        ) : (
          <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {amigos.map((p) => (
              <FilaPersona
                key={p.username}
                persona={p}
                relacion="amigos"
                completo
                extra={
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                    <span>
                      Individual <span className="font-mono text-slate-300">{p.puntosIndividual}</span>
                    </span>
                    <span>
                      Dobles <span className="font-mono text-slate-300">{p.puntosDobles}</span>
                    </span>
                    <Link
                      href={`/comunidad/partidos/nuevo?rival=${p.username}`}
                      className="inline-flex items-center gap-1 text-cyan-300 hover:underline"
                    >
                      <Swords className="h-3 w-3" /> Registrar partido
                    </Link>
                  </p>
                }
              />
            ))}
          </ul>
        )}
      </Seccion>

      {pendientesEnviadas.length > 0 ? (
        <Seccion
          id="enviadas"
          titulo={`Solicitudes enviadas (${pendientesEnviadas.length})`}
          descripcion="Esperando respuesta."
        >
          <ul className="space-y-3">
            {pendientesEnviadas.map((p) => (
              <FilaPersona key={p.username} persona={p} relacion="enviada" completo={false} />
            ))}
          </ul>
        </Seccion>
      ) : null}

      {bloqueos.length > 0 ? (
        <Seccion
          id="bloqueados"
          titulo={`Bloqueados (${bloqueos.length})`}
          descripcion="No ven tu perfil ni pueden enviarte solicitudes o apuntarte en partidos."
        >
          <ul className="space-y-3">
            {bloqueos.map(({ bloqueado }) => (
              <FilaPersona key={bloqueado.username} persona={bloqueado} relacion="bloqueado" completo={false} />
            ))}
          </ul>
        </Seccion>
      ) : null}
    </div>
  );
}

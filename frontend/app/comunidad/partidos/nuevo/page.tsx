import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CalendarCheck } from "lucide-react";
import FormularioPartido, { type InicialPartido } from "@/components/comunidad/FormularioPartido";
import { jugadoresParaResultado } from "@/lib/comunidad/convocatorias";
import { fechaLargaEspana } from "@/lib/comunidad/formato";
import { nombreVisible } from "@/lib/comunidad/perfil";
import { diaEnEspana } from "@/lib/comunidad/reglasConvocatoria";
import { cargarRelaciones, puedeJugarCon, puedeVerPerfil, type Relaciones } from "@/lib/comunidad/relaciones";
import { exigirUsuario } from "@/lib/comunidad/sesion";
import type { JugadorEncontrado } from "@/lib/comunidad/tipos";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Registrar partido" };

const SELECT_JUGADOR = {
  id: true,
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
  id: string;
  username: string;
  nombre: string;
  apellidos: string;
  ciudad: string | null;
  nivel: string | null;
  perfilPublico: boolean;
  puntosIndividual: number;
  puntosDobles: number;
};

function encontrado(u: Persona, relaciones: Relaciones): JugadorEncontrado {
  const relacion = relaciones.estado(u.id);
  const visible = puedeVerPerfil(relacion, u.perfilPublico);
  return {
    username: u.username,
    nombre: nombreVisible(u, relacion === "amigos"),
    ciudad: visible ? u.ciudad : null,
    nivel: visible ? u.nivel : null,
    perfilPublico: u.perfilPublico,
    relacion,
    puntosIndividual: u.puntosIndividual,
    puntosDobles: u.puntosDobles,
  };
}

export default async function NuevoPartidoPage({ searchParams }: PageProps<"/comunidad/partidos/nuevo">) {
  const yo = await exigirUsuario("/comunidad/partidos/nuevo");
  const { rival, convocatoria } = await searchParams;
  const relaciones = await cargarRelaciones(yo.id);

  let inicial: InicialPartido = {};
  let origen: string | null = null;

  if (typeof convocatoria === "string" && convocatoria) {
    // Resultado de un partido de «Buscar partido»: jugadores, fecha y lugar ya puestos
    const datos = await jugadoresParaResultado(yo.id, convocatoria);
    if (datos) {
      const jugadores = datos.jugadores.map((j) => encontrado(j, relaciones));
      const dobles = datos.modalidad === "dobles";
      // En dobles con los tres aceptados, el primero va de compañero; se puede cambiar
      const [companero, rival1, rival2] =
        dobles && jugadores.length === 3 ? jugadores : [null, ...jugadores];
      inicial = {
        modalidad: datos.modalidad,
        fecha: diaEnEspana(datos.fechaHora),
        lugar: datos.lugar,
        companero: dobles ? companero : null,
        rival1: rival1 ?? null,
        rival2: dobles ? (rival2 ?? null) : null,
        convocatoriaId: convocatoria,
      };
      origen = `Resultado del partido del ${fechaLargaEspana(datos.fechaHora.toISOString())} en ${datos.lugar}.`;
    }
  } else if (typeof rival === "string" && rival) {
    // ?rival=usuario (desde un perfil o la lista de amigos) deja el rival ya elegido
    const usuario = await prisma.user.findUnique({ where: { username: rival }, select: SELECT_JUGADOR });
    if (usuario && puedeJugarCon(relaciones.estado(usuario.id), usuario.perfilPublico)) {
      inicial = { rival1: encontrado(usuario, relaciones) };
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href={inicial.convocatoriaId ? `/comunidad/convocatorias/${inicial.convocatoriaId}` : "/comunidad/partidos"}
        className="-ml-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
        {inicial.convocatoriaId ? "Volver al partido" : "Partidos"}
      </Link>
      <h2 className="mb-1 mt-3 font-display text-2xl font-semibold text-white">Registrar partido</h2>
      <p className="mb-6 text-sm text-slate-400">
        Apunta un partido que ya has jugado. Tú vas en el primer equipo.
      </p>
      {origen ? (
        <p className="mb-4 flex items-start gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] px-4 py-3 text-sm text-slate-300">
          <CalendarCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
          {origen} Revisa quién iba con quién y escribe el marcador.
        </p>
      ) : null}
      <FormularioPartido inicial={inicial} />
    </div>
  );
}

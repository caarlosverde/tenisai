import type { Metadata } from "next";
import Link from "next/link";
import { CalendarSearch, Megaphone } from "lucide-react";
import { Seccion, Vacio } from "@/components/comunidad/Seccion";
import Selector from "@/components/comunidad/Selector";
import TarjetaConvocatoria from "@/components/comunidad/TarjetaConvocatoria";
import { listarAbiertas, misConvocatorias } from "@/lib/comunidad/convocatorias";
import { esModalidad, type Modalidad } from "@/lib/comunidad/perfil";
import { exigirUsuario } from "@/lib/comunidad/sesion";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Buscar partido" };

type FiltroModalidad = Modalidad | "todas";
type FiltroCiudad = "mia" | "todas";

const PUBLICAR_CLASE =
  "inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-300 via-emerald-300 to-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:brightness-105";

export default async function ConvocatoriasPage({ searchParams }: PageProps<"/comunidad/convocatorias">) {
  const sesion = await exigirUsuario("/comunidad/convocatorias");
  const params = await searchParams;
  const yo = await prisma.user.findUniqueOrThrow({ where: { id: sesion.id }, select: { ciudad: true } });

  const modalidad: FiltroModalidad = esModalidad(params.modalidad) ? params.modalidad : "todas";
  // Por defecto, la ciudad del perfil si la tiene
  const ciudadFiltro: FiltroCiudad = params.ciudad === "todas" || !yo.ciudad ? "todas" : "mia";

  const [abiertas, mias] = await Promise.all([
    listarAbiertas(sesion.id, {
      modalidad: modalidad === "todas" ? null : modalidad,
      ciudad: ciudadFiltro === "mia" ? yo.ciudad : null,
    }),
    misConvocatorias(sesion.id),
  ]);
  const url = (m: FiltroModalidad, c: FiltroCiudad) => `/comunidad/convocatorias?modalidad=${m}&ciudad=${c}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-display text-2xl font-semibold text-white">Buscar partido</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            Publica cuándo y dónde quieres jugar, o apúntate a un partido de otro jugador. Después
            podréis registrar el resultado para el ranking.
          </p>
        </div>
        <Link href="/comunidad/convocatorias/nueva" className={`${PUBLICAR_CLASE} shrink-0`}>
          <Megaphone className="h-4 w-4" strokeWidth={2} />
          Publicar partido
        </Link>
      </div>

      {mias.porRegistrar.length > 0 ? (
        <Seccion
          id="por-registrar"
          titulo="Registra el resultado"
          descripcion="Ya habéis jugado: apunta el resultado para que cuente en el ranking."
        >
          <div className="space-y-3">
            {mias.porRegistrar.map((c) => (
              <TarjetaConvocatoria key={c.id} convocatoria={c} />
            ))}
          </div>
        </Seccion>
      ) : null}

      {mias.proximas.length > 0 ? (
        <Seccion id="mis-proximos" titulo="Tus próximos partidos" descripcion="Los que has publicado y en los que has pedido plaza.">
          <div className="space-y-3">
            {mias.proximas.map((c) => (
              <TarjetaConvocatoria key={c.id} convocatoria={c} />
            ))}
          </div>
        </Seccion>
      ) : null}

      <Seccion id="buscan-jugadores" titulo="Partidos que buscan jugadores">
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <Selector
            etiqueta="Modalidad"
            opciones={[
              { valor: "todas" as FiltroModalidad, etiqueta: "Todos" },
              { valor: "individual" as FiltroModalidad, etiqueta: "Individual" },
              { valor: "dobles" as FiltroModalidad, etiqueta: "Dobles" },
            ]}
            actual={modalidad}
            href={(m) => url(m, ciudadFiltro)}
          />
          {yo.ciudad ? (
            <Selector
              etiqueta="Ciudad"
              opciones={[
                { valor: "mia" as FiltroCiudad, etiqueta: yo.ciudad },
                { valor: "todas" as FiltroCiudad, etiqueta: "Todas las ciudades" },
              ]}
              actual={ciudadFiltro}
              href={(c) => url(modalidad, c)}
            />
          ) : (
            <p className="text-xs text-slate-500">
              <Link href="/perfil/ajustes#perfil-jugador" className="text-cyan-300 hover:underline">
                Añade tu ciudad
              </Link>{" "}
              para ver primero los partidos de tu zona.
            </p>
          )}
        </div>
        {abiertas.length === 0 ? (
          <Vacio icono={CalendarSearch}>
            <p>
              {ciudadFiltro === "mia"
                ? `Ahora mismo nadie busca jugadores en ${yo.ciudad}.`
                : "Ahora mismo nadie busca jugadores."}
            </p>
            <Link href="/comunidad/convocatorias/nueva" className="text-cyan-300 hover:underline">
              Publica tú el primero
            </Link>
          </Vacio>
        ) : (
          <div className="space-y-3">
            {abiertas.map((c) => (
              <TarjetaConvocatoria key={c.id} convocatoria={c} />
            ))}
          </div>
        )}
      </Seccion>
    </div>
  );
}

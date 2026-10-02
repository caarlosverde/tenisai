import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Swords } from "lucide-react";
import AccionesPartido from "@/components/comunidad/AccionesPartido";
import { Seccion, Vacio } from "@/components/comunidad/Seccion";
import TarjetaPartido from "@/components/comunidad/TarjetaPartido";
import { cargarPartidos } from "@/lib/comunidad/partidos";
import { exigirUsuario } from "@/lib/comunidad/sesion";
import type { PartidoVista } from "@/lib/comunidad/tipos";

export const metadata: Metadata = { title: "Partidos" };

function Lista({ partidos }: { partidos: PartidoVista[] }) {
  return (
    <div className="space-y-3">
      {partidos.map((partido) => (
        <TarjetaPartido key={partido.id} partido={partido}>
          {partido.puedeResponder || partido.puedeRetirar ? (
            <AccionesPartido
              partidoId={partido.id}
              puedeResponder={partido.puedeResponder}
              puedeRetirar={partido.puedeRetirar}
            />
          ) : null}
        </TarjetaPartido>
      ))}
    </div>
  );
}

export default async function PartidosPage() {
  const yo = await exigirUsuario("/comunidad/partidos");

  const [porConfirmar, esperando, historial] = await Promise.all([
    cargarPartidos(yo.id, {
      estado: "pendiente",
      jugadores: { some: { userId: yo.id, equipo: 2 } },
    }),
    // Los que he registrado yo (o mi pareja) y aún no cuentan
    cargarPartidos(yo.id, {
      estado: { in: ["pendiente", "rechazado"] },
      jugadores: { some: { userId: yo.id, equipo: 1 } },
    }),
    cargarPartidos(yo.id, { estado: "confirmado", jugadores: { some: { userId: yo.id } } }),
  ]);

  const registrar = (
    <Link
      href="/comunidad/partidos/nuevo"
      className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-300 via-emerald-300 to-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:brightness-105"
    >
      <Plus className="h-4 w-4" strokeWidth={2.5} />
      Registrar partido
    </Link>
  );

  return (
    <div className="space-y-6">
      {porConfirmar.length > 0 ? (
        <Seccion
          id="por-confirmar"
          titulo={`Por confirmar (${porConfirmar.length})`}
          descripcion="Te han apuntado como rival. Si el resultado es correcto, confírmalo para que cuente en el ranking."
        >
          <Lista partidos={porConfirmar} />
        </Seccion>
      ) : null}

      {esperando.length > 0 ? (
        <Seccion
          id="esperando"
          titulo="Esperando a los rivales"
          descripcion="Partidos que habéis registrado y todavía no cuentan."
          accion={porConfirmar.length > 0 ? null : registrar}
        >
          <Lista partidos={esperando} />
        </Seccion>
      ) : null}

      <Seccion
        id="historial"
        titulo="Historial"
        descripcion="Partidos confirmados, del más reciente al más antiguo."
        accion={porConfirmar.length > 0 || esperando.length > 0 ? null : registrar}
      >
        {historial.length === 0 ? (
          <Vacio icono={Swords}>
            <p>Aún no tienes partidos confirmados.</p>
            <p className="max-w-md text-xs text-slate-500">
              Registra un partido con un amigo o con un jugador de perfil público. Cuando tu rival
              confirme el resultado, sumará puntos en el ranking.
            </p>
            {registrar}
          </Vacio>
        ) : (
          <Lista partidos={historial} />
        )}
      </Seccion>
    </div>
  );
}

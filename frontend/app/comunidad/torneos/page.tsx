import type { Metadata } from "next";
import Link from "next/link";
import { Info, Medal, Plus } from "lucide-react";
import { Seccion, Vacio } from "@/components/comunidad/Seccion";
import TarjetaTorneo from "@/components/comunidad/TarjetaTorneo";
import { exigirUsuario } from "@/lib/comunidad/sesion";
import { esOrganizador, listarTorneos } from "@/lib/comunidad/torneos";
import type { TorneoResumen } from "@/lib/comunidad/tipos";

export const metadata: Metadata = { title: "Torneos" };

function Lista({ torneos }: { torneos: TorneoResumen[] }) {
  return (
    <div className="space-y-3">
      {torneos.map((t) => (
        <TarjetaTorneo key={t.id} torneo={t} />
      ))}
    </div>
  );
}

export default async function TorneosPage() {
  const yo = await exigirUsuario("/comunidad/torneos");
  const [organizador, { abiertos, enJuego, terminados, mios }] = await Promise.all([
    esOrganizador(yo.id),
    listarTorneos(yo.id),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-display text-2xl font-semibold text-white">Torneos</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            Torneos de eliminatoria organizados por clubes. Inscríbete, sigue el cuadro ronda a ronda
            y suma puntos para el ranking.
          </p>
        </div>
        {organizador ? (
          <Link
            href="/comunidad/torneos/nuevo"
            className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-gradient-to-r from-amber-200 via-amber-300 to-orange-300 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:brightness-105"
          >
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            Crear torneo
          </Link>
        ) : null}
      </div>

      {mios.length > 0 ? (
        <Seccion id="mis-torneos" titulo="Tus torneos" descripcion="En los que juegas o que organizas.">
          <Lista torneos={mios} />
        </Seccion>
      ) : null}

      <Seccion id="inscripcion-abierta" titulo="Inscripción abierta">
        {abiertos.length === 0 ? (
          <Vacio icono={Medal}>
            <p>Ahora mismo no hay torneos con la inscripción abierta.</p>
          </Vacio>
        ) : (
          <Lista torneos={abiertos} />
        )}
      </Seccion>

      {enJuego.length > 0 ? (
        <Seccion id="en-juego" titulo="En juego">
          <Lista torneos={enJuego} />
        </Seccion>
      ) : null}

      {terminados.length > 0 ? (
        <Seccion id="terminados" titulo="Terminados" descripcion="Los del último año.">
          <Lista torneos={terminados} />
        </Seccion>
      ) : null}

      {!organizador ? (
        <p className="flex items-start gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-400">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" strokeWidth={1.75} />
          <span>
            ¿Organizas torneos en tu club? Los torneos solo los pueden crear cuentas de organizador,
            que activa el responsable de TenisAI (sus datos de contacto están en el{" "}
            <Link href="/aviso-legal" className="text-cyan-300 hover:underline">
              aviso legal
            </Link>
            ).
          </span>
        </p>
      ) : null}
    </div>
  );
}

import Link from "next/link";
import { Crown, Trophy } from "lucide-react";
import ResultadoCruce from "@/components/comunidad/ResultadoCruce";
import { nombreRonda } from "@/lib/comunidad/cuadro";
import type { CruceVista, InscritoVista } from "@/lib/comunidad/tipos";

function nombreInscrito(i: InscritoVista): string {
  return i.jugadores.map((j) => j.nombre).join(" / ");
}

function Lado({
  inscrito,
  gana,
  pierde,
  vacio,
}: {
  inscrito: InscritoVista | null;
  gana: boolean;
  pierde: boolean;
  vacio: string;
}) {
  if (!inscrito) {
    return <div className="truncate px-3 py-2 text-xs italic text-slate-400">{vacio}</div>;
  }
  return (
    <div
      className={[
        "flex items-center gap-2 px-3 py-2 text-sm",
        gana ? "font-semibold text-white" : pierde ? "text-slate-400 line-through decoration-slate-600" : "text-slate-200",
        inscrito.esMia ? "bg-cyan-400/[0.07]" : "",
      ].join(" ")}
    >
      {inscrito.semilla ? (
        <span className="w-5 shrink-0 text-right font-mono text-[11px] text-slate-400">{inscrito.semilla}</span>
      ) : null}
      <span className="min-w-0 flex-1 truncate">
        {inscrito.jugadores.map((j, i) => (
          <span key={j.username ?? i}>
            {i > 0 ? " / " : ""}
            {j.enlace && j.username && !j.esYo ? (
              <Link href={`/jugador/${j.username}`} className="hover:text-cyan-200 hover:no-underline">
                {j.nombre}
              </Link>
            ) : (
              j.nombre
            )}
          </span>
        ))}
      </span>
      {gana ? <Trophy className="h-3.5 w-3.5 shrink-0 text-amber-300" /> : null}
    </div>
  );
}

function Cruce({
  cruce,
  torneoId,
  esOrganizador,
}: {
  cruce: CruceVista;
  torneoId: string;
  esOrganizador: boolean;
}) {
  const bye = cruce.tipo === "bye";
  const porDecidir = cruce.ronda > 1 ? "Por decidir" : "—";
  return (
    <div>
      <div className="overflow-hidden rounded-xl border border-white/10 bg-zinc-900">
        <Lado
          inscrito={cruce.a}
          gana={cruce.ganador === "a"}
          pierde={cruce.ganador === "b" && !bye}
          vacio={bye ? "Sin rival" : porDecidir}
        />
        <div className="border-t border-white/5" />
        <Lado
          inscrito={cruce.b}
          gana={cruce.ganador === "b"}
          pierde={cruce.ganador === "a" && !bye}
          vacio={bye ? "Sin rival" : porDecidir}
        />
      </div>
      {cruce.marcador || bye || cruce.tipo === "incomparecencia" ? (
        <p className="mt-1 px-1 text-[11px] text-slate-400">
          {bye
            ? "Pasa directamente"
            : cruce.tipo === "incomparecencia"
              ? "Pasa por incomparecencia"
              : <span className="font-mono">{cruce.marcador}</span>}
        </p>
      ) : null}
      {esOrganizador && cruce.pendienteDeResultado ? (
        <ResultadoCruce
          torneoId={torneoId}
          cruceId={cruce.id}
          ladoA={cruce.a ? nombreInscrito(cruce.a) : null}
          ladoB={cruce.b ? nombreInscrito(cruce.b) : null}
        />
      ) : null}
    </div>
  );
}

/** Cuadro de eliminatoria: una columna por ronda, de la primera a la final. */
export default function CuadroTorneo({
  cruces,
  rondas,
  torneoId,
  esOrganizador,
  campeon,
}: {
  cruces: CruceVista[];
  rondas: number;
  torneoId: string;
  esOrganizador: boolean;
  campeon: InscritoVista | null;
}) {
  const columnas = Array.from({ length: rondas }, (_, i) => cruces.filter((c) => c.ronda === i + 1));
  return (
    <div className="-mx-6 overflow-x-auto px-6 pb-2">
      <div className="flex min-w-max gap-6">
        {columnas.map((columna, i) => (
          <section key={i} aria-label={nombreRonda(i + 1, rondas)} className="flex w-56 flex-col">
            <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-slate-400">
              {nombreRonda(i + 1, rondas)}
            </h3>
            <div className="flex flex-1 flex-col justify-around gap-4">
              {columna.map((cruce) => (
                <Cruce key={cruce.id} cruce={cruce} torneoId={torneoId} esOrganizador={esOrganizador} />
              ))}
            </div>
          </section>
        ))}
        <section aria-label="Campeón" className="flex w-48 flex-col">
          <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-amber-300/80">Campeón</h3>
          <div className="flex flex-1 flex-col justify-around">
            <div
              className={[
                "rounded-xl border px-3 py-3 text-center",
                campeon ? "border-amber-300/40 bg-amber-300/10" : "border-dashed border-white/10",
              ].join(" ")}
            >
              <Crown className={`mx-auto mb-1 h-5 w-5 ${campeon ? "text-amber-300" : "text-slate-600"}`} />
              <p className={campeon ? "text-sm font-semibold text-white" : "text-xs text-slate-400"}>
                {campeon ? nombreInscrito(campeon) : "Por decidir"}
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { Info, Trophy } from "lucide-react";
import { Vacio } from "@/components/comunidad/Seccion";
import Selector from "@/components/comunidad/Selector";
import TablaRanking from "@/components/comunidad/TablaRanking";
import { PARTIDOS_PROVISIONALES, PUNTOS_INICIALES } from "@/lib/comunidad/elo";
import { esModalidad, type Modalidad } from "@/lib/comunidad/perfil";
import { cargarRanking } from "@/lib/comunidad/ranking";
import { exigirUsuario } from "@/lib/comunidad/sesion";
import type { AmbitoRanking } from "@/lib/comunidad/tipos";
import { CARD_CLASS } from "@/lib/ui";

export const metadata: Metadata = { title: "Ranking" };

const AMBITOS: { valor: AmbitoRanking; etiqueta: string }[] = [
  { valor: "general", etiqueta: "General" },
  { valor: "amigos", etiqueta: "Amigos" },
  { valor: "ciudad", etiqueta: "Mi ciudad" },
];


export default async function RankingPage({ searchParams }: PageProps<"/comunidad/ranking">) {
  const yo = await exigirUsuario("/comunidad/ranking");
  const params = await searchParams;
  const modalidad: Modalidad = esModalidad(params.modalidad) ? params.modalidad : "individual";
  const ambito: AmbitoRanking = AMBITOS.some((a) => a.valor === params.ambito)
    ? (params.ambito as AmbitoRanking)
    : "general";

  const { filas, miFila, aviso, miCiudad } = await cargarRanking(yo.id, modalidad, ambito);
  const url = (m: Modalidad, a: AmbitoRanking) => `/comunidad/ranking?modalidad=${m}&ambito=${a}`;
  const titulo = `Ranking ${modalidad === "dobles" ? "de dobles" : "individual"}${
    ambito === "amigos" ? " entre amigos" : ambito === "ciudad" && miCiudad ? ` en ${miCiudad}` : ""
  }`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Selector
          etiqueta="Modalidad"
          opciones={[
            { valor: "individual" as Modalidad, etiqueta: "Individual" },
            { valor: "dobles" as Modalidad, etiqueta: "Dobles" },
          ]}
          actual={modalidad}
          href={(m) => url(m, ambito)}
        />
        <Selector etiqueta="Ámbito" opciones={AMBITOS} actual={ambito} href={(a) => url(modalidad, a)} />
      </div>

      <h2 className="font-display text-xl font-semibold text-white">{titulo}</h2>

      {aviso ? (
        <p className="flex items-start gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-300">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" strokeWidth={1.75} />
          {aviso}
        </p>
      ) : null}

      {filas.length === 0 && !miFila ? (
        <Vacio icono={Trophy}>
          <p>
            {ambito === "amigos"
              ? "Ni tú ni tus amigos tenéis partidos confirmados en esta modalidad."
              : "Todavía no hay jugadores en este ranking."}
          </p>
          <Link href="/comunidad/partidos/nuevo" className="text-cyan-300 hover:underline">
            Registra un partido
          </Link>
        </Vacio>
      ) : (
        <TablaRanking filas={filas} miFila={miFila} titulo={titulo} />
      )}

      <details className={`${CARD_CLASS} group`}>
        <summary className="flex cursor-pointer list-none items-center gap-2 font-medium text-white">
          <Info className="h-4 w-4 text-cyan-300" strokeWidth={1.75} />
          ¿Cómo funcionan los puntos?
        </summary>
        <div className="mt-4 space-y-3 text-sm leading-relaxed text-slate-300">
          <p>
            TenisAI usa el sistema <strong className="text-white">Elo</strong>, el de los rankings de
            ajedrez. Todo el mundo empieza con {PUNTOS_INICIALES} puntos en individual y otros{" "}
            {PUNTOS_INICIALES} en dobles: son rankings separados.
          </p>
          <p>
            Antes de cada partido se calcula quién debería ganar según los puntos de cada uno. Si gana
            el favorito, sube poco; si gana el que tenía menos puntos, sube mucho más. Por lo general,
            lo que gana un jugador lo pierde su rival.
          </p>
          <p>
            En dobles cada pareja juega con la media de sus dos jugadores. Durante los primeros{" "}
            {PARTIDOS_PROVISIONALES} partidos la puntuación es <em>provisional</em> y se mueve más deprisa
            para encontrar antes tu nivel real.
          </p>
          <p>
            Un partido solo cuenta cuando un rival confirma el resultado, y el ranking general solo
            muestra perfiles públicos.
          </p>
        </div>
      </details>
    </div>
  );
}

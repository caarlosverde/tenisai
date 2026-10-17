import { AvisoCarga, Bloque, FilaEsqueleto, TarjetaEsqueleto } from "@/components/Esqueleto";

// Se ve bajo la cabecera y las pestañas de la comunidad (que no cambian) mientras
// llega la sección elegida
export default function CargandoComunidad() {
  return (
    <div>
      <AvisoCarga texto="Cargando la comunidad…" />
      <div className="grid gap-4 sm:grid-cols-2">
        <TarjetaEsqueleto lineas={2} />
        <TarjetaEsqueleto lineas={2} />
      </div>
      <div className="mt-6 rounded-2xl border border-white/5 bg-zinc-900/80 p-5">
        <Bloque className="h-5 w-48" />
        <div className="mt-5 space-y-3">
          <FilaEsqueleto />
          <FilaEsqueleto />
          <FilaEsqueleto />
        </div>
      </div>
    </div>
  );
}

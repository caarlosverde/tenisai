import { AvisoCarga, Bloque, TarjetaEsqueleto } from "@/components/Esqueleto";
import { PAGE_BACKGROUND_CLASS } from "@/lib/ui";

// Misma forma que ComparacionAnalisis: los dos análisis, los vídeos y la tabla
export default function CargandoComparacion() {
  return (
    <div className="relative min-h-[calc(100vh-4rem)] overflow-hidden text-white">
      <div className={PAGE_BACKGROUND_CLASS} />
      <div className="relative z-10 mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6 md:pt-10">
        <AvisoCarga texto="Cargando la comparación…" />
        <Bloque className="h-5 w-28" />
        <Bloque className="mt-6 h-9 w-64" />
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <TarjetaEsqueleto lineas={2} />
          <TarjetaEsqueleto lineas={2} />
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Bloque className="aspect-video w-full rounded-2xl" />
          <Bloque className="aspect-video w-full rounded-2xl" />
        </div>
        <TarjetaEsqueleto lineas={6} className="mt-6" />
      </div>
    </div>
  );
}

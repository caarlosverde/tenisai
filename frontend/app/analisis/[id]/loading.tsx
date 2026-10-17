import { AvisoCarga, Bloque, TarjetaEsqueleto } from "@/components/Esqueleto";
import { PAGE_BACKGROUND_CLASS } from "@/lib/ui";

// Misma forma que AnalisisDetalle: cabecera con la nota, reproductor y plan de mejora
export default function CargandoAnalisis() {
  return (
    <div className="relative min-h-[calc(100vh-4rem)] overflow-hidden text-white">
      <div className={PAGE_BACKGROUND_CLASS} />
      <div className="relative z-10 mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6 md:pt-10">
        <AvisoCarga texto="Cargando el análisis…" />
        <Bloque className="h-5 w-28" />
        <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-3">
            <Bloque className="h-3.5 w-36" />
            <Bloque className="h-9 w-72 max-w-full" />
            <Bloque className="h-4 w-56" />
          </div>
          <Bloque className="h-14 w-28 rounded-2xl" />
        </div>
        <div className="mt-8 rounded-3xl border border-white/5 bg-zinc-900/80 p-4 sm:p-5">
          <div className="flex justify-between gap-3">
            <Bloque className="h-9 w-64 rounded-full" />
            <Bloque className="hidden h-9 w-44 rounded-full sm:block" />
          </div>
          <Bloque className="mt-4 aspect-video w-full rounded-2xl" />
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <TarjetaEsqueleto />
          <TarjetaEsqueleto />
        </div>
      </div>
    </div>
  );
}

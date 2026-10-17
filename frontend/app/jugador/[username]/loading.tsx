import { AvisoCarga, Bloque, TarjetaEsqueleto } from "@/components/Esqueleto";
import { PAGE_BACKGROUND_CLASS } from "@/lib/ui";

// Misma forma que el perfil público: avatar y nombre, puntos y últimos partidos
export default function CargandoJugador() {
  return (
    <div className="relative min-h-[calc(100vh-4rem)] overflow-hidden text-white">
      <div className={PAGE_BACKGROUND_CLASS} />
      <div className="relative z-10 mx-auto max-w-5xl px-4 pb-16 pt-10 sm:px-6 md:px-10">
        <AvisoCarga texto="Cargando el perfil del jugador…" />
        <div className="flex items-center gap-4">
          <Bloque className="h-16 w-16 shrink-0 rounded-full" />
          <div className="space-y-2.5">
            <Bloque className="h-8 w-56 max-w-full" />
            <Bloque className="h-3.5 w-40" />
          </div>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <TarjetaEsqueleto lineas={2} />
          <TarjetaEsqueleto lineas={2} />
        </div>
        <TarjetaEsqueleto lineas={4} className="mt-6" />
      </div>
    </div>
  );
}

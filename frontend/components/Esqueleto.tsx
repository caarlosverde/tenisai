// Siluetas de carga (skeletons): mientras llega una página se ve su forma, no una
// pantalla quieta. Imitan las tarjetas reales para que el cambio no salte.

type ConClase = { className?: string };

/** Bloque gris que late suavemente (sin animación si el sistema pide menos movimiento). */
export function Bloque({ className = "" }: ConClase) {
  return <div aria-hidden className={`animate-pulse rounded-lg bg-white/[0.07] ${className}`} />;
}

/** Tarjeta con título y unas líneas de texto. */
export function TarjetaEsqueleto({ lineas = 3, className = "" }: ConClase & { lineas?: number }) {
  return (
    <div aria-hidden className={`rounded-2xl border border-white/5 bg-zinc-900/80 p-5 ${className}`}>
      <Bloque className="h-5 w-40" />
      <div className="mt-4 space-y-2.5">
        {Array.from({ length: lineas }, (_, i) => (
          <Bloque key={i} className={`h-3.5 ${i === lineas - 1 ? "w-2/3" : "w-full"}`} />
        ))}
      </div>
    </div>
  );
}

/** Fila de una lista (avatar, dos líneas y una acción). */
export function FilaEsqueleto() {
  return (
    <div aria-hidden className="flex items-center gap-3 rounded-xl border border-white/5 bg-black/20 p-3">
      <Bloque className="h-9 w-9 shrink-0 rounded-full" />
      <div className="flex-1 space-y-2">
        <Bloque className="h-3.5 w-1/3" />
        <Bloque className="h-3 w-1/2" />
      </div>
      <Bloque className="hidden h-8 w-24 rounded-xl sm:block" />
    </div>
  );
}

/** Anuncio para lectores de pantalla: la página está cargando. */
export function AvisoCarga({ texto = "Cargando…" }: { texto?: string }) {
  return (
    <p role="status" className="sr-only">
      {texto}
    </p>
  );
}

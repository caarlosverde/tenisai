import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { CARD_CLASS } from "@/lib/ui";

/** Tarjeta de sección con título, descripción opcional y una acción a la derecha. */
export function Seccion({
  id,
  titulo,
  descripcion,
  accion,
  children,
}: {
  id: string;
  titulo: string;
  descripcion?: ReactNode;
  accion?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={CARD_CLASS} aria-labelledby={id}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id={id} className="font-display text-lg font-semibold text-white">
            {titulo}
          </h2>
          {descripcion ? <p className="mt-1 text-sm text-slate-400">{descripcion}</p> : null}
        </div>
        {accion}
      </div>
      {children}
    </section>
  );
}

/** Mensaje para una lista vacía. */
export function Vacio({
  icono: Icono,
  children,
}: {
  icono: LucideIcon;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-white/10 px-6 py-8 text-center text-sm text-slate-400">
      <Icono className="h-8 w-8 text-slate-600" strokeWidth={1.5} />
      {children}
    </div>
  );
}

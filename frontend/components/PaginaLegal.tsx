import type { ReactNode } from "react";
import { ULTIMA_ACTUALIZACION } from "@/lib/legal";
import { PAGE_BACKGROUND_CLASS } from "@/lib/ui";

/** Maquetación común de las páginas legales (texto largo y legible). */
export default function PaginaLegal({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="relative min-h-[calc(100vh-4rem)] overflow-hidden text-white">
      <div className={PAGE_BACKGROUND_CLASS} />
      <article
        className={[
          "relative z-10 mx-auto max-w-3xl px-4 pb-20 pt-10 sm:px-6",
          "text-[15px] leading-relaxed text-slate-300",
          "[&_h2]:mt-10 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-white",
          "[&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5",
          "[&_a]:text-cyan-300 [&_a]:underline-offset-4 hover:[&_a]:underline [&_strong]:text-white",
        ].join(" ")}
      >
        <h1 className="font-display text-3xl font-semibold tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-white via-cyan-100 to-emerald-300 sm:text-4xl">
          {titulo}
        </h1>
        <p className="!mt-2 text-sm text-slate-400">Última actualización: {ULTIMA_ACTUALIZACION}</p>
        {children}
      </article>
    </div>
  );
}

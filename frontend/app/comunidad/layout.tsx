import type { Metadata } from "next";
import ComunidadTabs from "@/components/comunidad/ComunidadTabs";
import { PAGE_BACKGROUND_CLASS } from "@/lib/ui";

export const metadata: Metadata = {
  title: { default: "Comunidad", template: "%s · Comunidad — TenisAI" },
  // Área privada: no debe aparecer en buscadores
  robots: { index: false, follow: false },
};

export default function ComunidadLayout({ children }: LayoutProps<"/comunidad">) {
  return (
    <div className="relative min-h-[calc(100vh-4rem)] overflow-hidden text-white">
      <div className={PAGE_BACKGROUND_CLASS} />
      <div className="pointer-events-none absolute -top-32 left-1/2 h-72 w-[36rem] -translate-x-1/2 rounded-full bg-emerald-500/10 blur-3xl" />
      <div className="relative z-10 mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-6 md:px-10">
        <p className="mb-3 font-display text-sm font-medium uppercase tracking-[0.28em] text-emerald-300/80">
          Comunidad
        </p>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-white via-cyan-100 to-emerald-300 sm:text-4xl">
          Juega, registra y sube en el ranking
        </h1>
        <div className="mt-6">
          <ComunidadTabs />
        </div>
        <div className="mt-8">{children}</div>
      </div>
    </div>
  );
}

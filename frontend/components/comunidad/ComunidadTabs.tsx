"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { CalendarSearch, LayoutDashboard, Medal, Swords, Trophy, Users } from "lucide-react";
import { useSession } from "@/components/SessionProvider";

const PESTANAS = [
  { href: "/comunidad", label: "Resumen", icon: LayoutDashboard },
  { href: "/comunidad/convocatorias", label: "Buscar partido", icon: CalendarSearch },
  { href: "/comunidad/torneos", label: "Torneos", icon: Medal },
  { href: "/comunidad/partidos", label: "Partidos", icon: Swords },
  { href: "/comunidad/amigos", label: "Amigos", icon: Users },
  { href: "/comunidad/ranking", label: "Ranking", icon: Trophy },
] as const;

export default function ComunidadTabs() {
  const pathname = usePathname();
  const { pendientes } = useSession();
  const navRef = useRef<HTMLElement>(null);

  // En móvil, la pestaña activa queda centrada aunque esté al final de la barra. Se
  // recalcula si la barra cambia de tamaño (llegan los avisos o termina de cargar la fuente)
  useEffect(() => {
    const nav = navRef.current;
    const lista = nav?.querySelector("ul");
    if (!nav || !lista) return;
    const centrar = () => {
      const activa = nav.querySelector<HTMLElement>('[aria-current="page"]');
      if (!activa) return;
      nav.scrollTo({ left: Math.max(0, activa.offsetLeft - nav.clientWidth / 2 + activa.offsetWidth / 2) });
    };
    centrar();
    const observador = new ResizeObserver(centrar);
    observador.observe(lista);
    return () => observador.disconnect();
  }, [pathname]);
  const avisos: Record<string, number> = {
    "/comunidad/amigos": pendientes.solicitudes,
    "/comunidad/partidos": pendientes.partidos,
    "/comunidad/convocatorias": pendientes.convocatorias,
    "/comunidad/torneos": pendientes.torneos,
  };

  return (
    <nav
      ref={navRef}
      aria-label="Secciones de la comunidad"
      // En móvil las pestañas se desplazan: el borde derecho se difumina para que se note
      className="relative -mx-4 overflow-x-auto px-4 [mask-image:linear-gradient(to_right,black_calc(100%-28px),transparent)] sm:mx-0 sm:px-0 sm:[mask-image:none]"
    >
      <ul className="flex w-max gap-1 rounded-2xl border border-white/10 bg-white/[0.03] p-1 sm:w-auto">
        {PESTANAS.map(({ href, label, icon: Icon }) => {
          const activa =
            href === "/comunidad" ? pathname === href : pathname.startsWith(href);
          const aviso = avisos[href] ?? 0;
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={activa ? "page" : undefined}
                className={[
                  "inline-flex items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-sm transition-colors sm:px-3.5",
                  activa
                    ? "bg-white/10 text-white"
                    : "text-slate-400 hover:bg-white/5 hover:text-white",
                ].join(" ")}
              >
                {/* Sin iconos en móvil: así caben las cuatro pestañas */}
                <Icon
                  className={["hidden h-4 w-4 sm:block", activa ? "text-cyan-300" : ""].join(" ")}
                  strokeWidth={1.75}
                />
                {label}
                {aviso > 0 ? (
                  <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[11px] font-semibold leading-5 text-white">
                    {aviso > 9 ? "9+" : aviso}
                    <span className="sr-only"> pendientes</span>
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { History, UserRound, Users, Video } from "lucide-react";
import { useSession } from "@/components/SessionProvider";

/**
 * Barra de navegación inferior en el móvil (como en las apps nativas), con la sesión
 * iniciada. Respeta la zona del gesto de inicio del iPhone (safe-area-inset-bottom).
 */
export default function BarraInferior() {
  const pathname = usePathname();
  const { user, pendientes } = useSession();
  if (!user) return null;

  const miPerfil = `/jugador/${user.username}`;
  const avisos = pendientes.solicitudes + pendientes.partidos + pendientes.convocatorias + pendientes.torneos;
  const pestanas = [
    { href: "/", texto: "Analizar", icono: Video, activa: pathname === "/" },
    {
      href: "/perfil",
      texto: "Análisis",
      icono: History,
      activa: pathname === "/perfil" || pathname.startsWith("/analisis"),
    },
    {
      href: "/comunidad",
      texto: "Comunidad",
      icono: Users,
      activa: pathname.startsWith("/comunidad") || (pathname.startsWith("/jugador/") && pathname !== miPerfil),
      aviso: avisos,
    },
    {
      href: miPerfil,
      texto: "Perfil",
      icono: UserRound,
      activa: pathname === miPerfil || pathname.startsWith("/perfil/"),
    },
  ];

  return (
    <>
      {/* Hueco para que el final de la página no quede debajo de la barra */}
      <div aria-hidden className="h-[calc(4rem+env(safe-area-inset-bottom))] md:hidden" />
      <nav
        aria-label="Navegación principal"
        className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-black/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
      >
        <ul className="grid h-16 grid-cols-4">
          {pestanas.map(({ href, texto, icono: Icono, activa, aviso }) => (
            <li key={href}>
              <Link
                href={href}
                aria-current={activa ? "page" : undefined}
                className={[
                  "relative flex h-full flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
                  activa ? "text-cyan-300" : "text-slate-400 active:text-white",
                ].join(" ")}
              >
                <span className="relative">
                  <Icono className="h-6 w-6" strokeWidth={activa ? 2 : 1.75} aria-hidden />
                  {aviso ? (
                    <span className="absolute -right-2.5 -top-1.5 inline-flex min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold leading-[18px] text-white ring-2 ring-black">
                      {aviso > 9 ? "9+" : aviso}
                    </span>
                  ) : null}
                </span>
                {texto}
                {aviso ? <span className="sr-only">, {aviso} avisos pendientes</span> : null}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}

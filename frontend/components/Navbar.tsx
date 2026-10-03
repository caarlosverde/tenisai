"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  ChevronDown,
  History,
  Loader2,
  LogIn,
  LogOut,
  Settings,
  UserPlus,
  UserRound,
  Users,
  Video,
} from "lucide-react";
import { toast } from "sonner";
import { useSession } from "@/components/SessionProvider";

const NAV_LINKS = [
  { href: "/", label: "Analizar vídeo", icon: Video },
  { href: "/perfil", label: "Mis análisis", icon: History },
  { href: "/comunidad", label: "Comunidad", icon: Users },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  if (href === "/perfil") return pathname === "/perfil";
  if (href === "/comunidad") return pathname.startsWith("/comunidad") || pathname.startsWith("/jugador");
  return pathname.startsWith(href);
}

function Aviso({ total }: { total: number }) {
  if (total === 0) return null;
  return (
    <span className="ml-0.5 inline-flex min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[11px] font-semibold leading-5 text-white">
      {total > 9 ? "9+" : total}
    </span>
  );
}

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, setUser, pendientes, refrescarPendientes } = useSession();
  const avisos =
    pendientes.solicitudes + pendientes.partidos + pendientes.convocatorias + pendientes.torneos;

  // Avisos de la comunidad al cambiar de página y al volver a la pestaña
  useEffect(() => {
    void refrescarPendientes();
  }, [pathname, refrescarPendientes]);
  useEffect(() => {
    const alVolver = () => {
      if (document.visibilityState === "visible") void refrescarPendientes();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => document.removeEventListener("visibilitychange", alVolver);
  }, [refrescarPendientes]);
  // El menú se guarda junto a la ruta en la que se abrió: al navegar se cierra solo
  const [menuOpenAt, setMenuOpenAt] = useState<string | null>(null);
  const menuOpen = menuOpenAt === pathname;
  const setMenuOpen = useCallback(
    (open: boolean | ((prev: boolean) => boolean)) => {
      setMenuOpenAt((prevPath) => {
        const prevOpen = prevPath === pathname;
        const nextOpen = typeof open === "function" ? open(prevOpen) : open;
        return nextOpen ? pathname : null;
      });
    },
    [pathname],
  );
  const [loggingOut, setLoggingOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;

    function onPointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen, setMenuOpen]);

  async function handleLogout() {
    if (loggingOut) return;
    flushSync(() => setLoggingOut(true));
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setUser(null);
      setMenuOpen(false);
      toast.success("Sesión cerrada");
      router.push("/");
      router.refresh();
    } catch {
      toast.error("No se pudo cerrar la sesión.");
    } finally {
      setLoggingOut(false);
    }
  }

  const inicial = (user?.nombre || user?.username || "U").charAt(0).toUpperCase();

  // Tras iniciar sesión se vuelve a la página en la que estaba el usuario
  const loginHref =
    pathname === "/" || pathname === "/login" || pathname === "/registro"
      ? "/login"
      : `/login?next=${encodeURIComponent(pathname)}`;

  return (
    <nav className="fixed top-0 z-50 w-full border-b border-white/10 bg-black/50 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 md:px-10">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-3 transition-opacity hover:opacity-90"
        >
          <Image
            src="/logo.webp"
            alt=""
            width={36}
            height={36}
            className="h-9 w-9 rounded-full object-cover ring-1 ring-white/15"
            priority
          />
          <span className="font-display text-lg font-semibold tracking-tight text-white md:text-xl">
            TenisAI
          </span>
        </Link>

        <div className="flex min-h-9 items-center gap-2 sm:gap-3">
          {user ? (
            <>
              <ul className="hidden items-center gap-1 md:flex">
                {NAV_LINKS.map(({ href, label, icon: Icon }) => {
                  const active = isActive(pathname, href);
                  return (
                    <li key={href}>
                      <Link
                        href={href}
                        aria-current={active ? "page" : undefined}
                        className={[
                          "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors",
                          active
                            ? "bg-white/10 text-white"
                            : "text-slate-300 hover:bg-white/5 hover:text-white",
                        ].join(" ")}
                      >
                        <Icon
                          className={active ? "h-4 w-4 text-cyan-300" : "h-4 w-4"}
                          strokeWidth={1.75}
                        />
                        {label}
                        {href === "/comunidad" ? <Aviso total={avisos} /> : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>

              <div className="relative" ref={menuRef}>
                <button
                  type="button"
                  aria-expanded={menuOpen}
                  aria-haspopup="menu"
                  aria-label="Abrir menú de usuario"
                  onClick={() => setMenuOpen((open) => !open)}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-white transition-colors hover:border-cyan-400/30 hover:bg-white/10 sm:px-3"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-cyan-300 to-emerald-300 text-sm font-semibold text-slate-950">
                    {inicial}
                  </span>
                  <span className="hidden max-w-[8rem] truncate sm:inline">
                    {user.nombre || user.username}
                  </span>
                  <ChevronDown
                    className={[
                      "h-4 w-4 text-slate-300 transition-transform duration-200",
                      menuOpen ? "rotate-180" : "",
                    ].join(" ")}
                  />
                </button>

                {menuOpen ? (
                  <div
                    role="menu"
                    className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/95 p-1.5 shadow-xl backdrop-blur-md animate-[fadeIn_0.15s_ease-out]"
                  >
                    <div className="border-b border-white/10 px-3 pb-2.5 pt-2">
                      <p className="truncate text-sm font-medium text-white">
                        {user.nombre}
                      </p>
                      <p className="truncate text-xs text-slate-400">@{user.username}</p>
                    </div>
                    <div className="py-1">
                      {NAV_LINKS.map(({ href, label, icon: Icon }) => (
                        <Link
                          key={href}
                          href={href}
                          role="menuitem"
                          onClick={() => setMenuOpen(false)}
                          className={[
                            "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm transition-colors hover:bg-white/10 hover:text-white",
                            isActive(pathname, href) ? "text-white" : "text-slate-200",
                          ].join(" ")}
                        >
                          <Icon className="h-4 w-4 text-cyan-300" strokeWidth={1.75} />
                          {label}
                          {href === "/comunidad" ? <Aviso total={avisos} /> : null}
                        </Link>
                      ))}
                    </div>
                    <div className="border-t border-white/10 py-1">
                      {[
                        { href: `/jugador/${user.username}`, label: "Mi perfil de jugador", icon: UserRound },
                        { href: "/perfil/ajustes", label: "Ajustes de la cuenta", icon: Settings },
                      ].map(({ href, label, icon: Icon }) => (
                        <Link
                          key={href}
                          href={href}
                          role="menuitem"
                          onClick={() => setMenuOpen(false)}
                          className={[
                            "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm transition-colors hover:bg-white/10 hover:text-white",
                            pathname === href ? "text-white" : "text-slate-200",
                          ].join(" ")}
                        >
                          <Icon className="h-4 w-4 text-slate-400" strokeWidth={1.75} />
                          {label}
                        </Link>
                      ))}
                    </div>
                    <div className="border-t border-white/10 pt-1">
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => void handleLogout()}
                        disabled={loggingOut}
                        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm text-rose-200 transition-colors hover:bg-rose-500/15 disabled:cursor-wait disabled:opacity-70"
                      >
                        {loggingOut ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <LogOut className="h-4 w-4" strokeWidth={1.75} />
                        )}
                        {loggingOut ? "Cerrando sesión..." : "Cerrar sesión"}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <>
              <Link
                href={loginHref}
                aria-current={pathname === "/login" ? "page" : undefined}
                className={[
                  "inline-flex items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-sm transition-colors sm:px-4",
                  pathname === "/login"
                    ? "bg-white/10 text-white"
                    : "text-slate-300 hover:bg-white/5 hover:text-white",
                ].join(" ")}
              >
                <LogIn className="hidden h-4 w-4 sm:block" strokeWidth={1.75} />
                Iniciar sesión
              </Link>
              <Link
                href="/registro"
                aria-current={pathname === "/registro" ? "page" : undefined}
                className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl bg-gradient-to-r from-cyan-300 via-emerald-300 to-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950 shadow-lg transition-all duration-300 hover:shadow-cyan-400/30 hover:brightness-105 sm:px-4"
              >
                <UserPlus className="hidden h-4 w-4 sm:block" strokeWidth={2} />
                Registrarse
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}

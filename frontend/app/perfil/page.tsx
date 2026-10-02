"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  CalendarDays,
  Loader2,
  Pencil,
  Ruler,
  Scale,
  Settings,
  UploadCloud,
  UserRound,
} from "lucide-react";
import EstiloJuegoCard from "@/components/perfil/EstiloJuegoCard";
import HistorialAnalisis from "@/components/perfil/HistorialAnalisis";
import type { AnalisisItem, ProfileUser } from "@/components/perfil/tipos";
import { CARD_CLASS, PAGE_BACKGROUND_CLASS } from "@/lib/ui";

export default function PerfilPage() {
  const router = useRouter();
  const [user, setUser] = useState<ProfileUser | null>(null);
  const [analisis, setAnalisis] = useState<AnalisisItem[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function cargar() {
      try {
        const [meRes, analisisRes] = await Promise.all([
          fetch("/api/auth/me", { cache: "no-store" }),
          fetch("/api/analisis", { cache: "no-store" }),
        ]);
        if (!meRes.ok) throw new Error(`HTTP ${meRes.status}`);

        const meData = (await meRes.json()) as { user?: ProfileUser | null };
        if (!meData.user) {
          router.replace("/login?next=/perfil");
          return;
        }
        const analisisData = analisisRes.ok
          ? ((await analisisRes.json()) as { analisis?: AnalisisItem[] })
          : { analisis: [] };

        if (!cancelled) {
          setUser(meData.user);
          setAnalisis(analisisData.analisis ?? []);
        }
      } catch {
        if (!cancelled) setLoadError(true);
      }
    }

    void cargar();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (loadError) {
    return (
      <div className="relative flex min-h-[60vh] items-center justify-center px-4 text-white">
        <div className={PAGE_BACKGROUND_CLASS} />
        <div className="relative z-10 max-w-sm rounded-2xl border border-rose-400/30 bg-rose-500/10 px-6 py-5 text-center">
          <p className="font-medium text-rose-100">No se pudo cargar tu perfil.</p>
          <p className="mt-1 text-sm text-slate-400">Comprueba tu conexión y vuelve a intentarlo.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm text-white transition hover:bg-white/10"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  if (!user || !analisis) {
    return (
      <div className="relative flex min-h-[60vh] items-center justify-center text-white">
        <div className={PAGE_BACKGROUND_CLASS} />
        <div
          role="status"
          className="relative z-10 inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-slate-300 backdrop-blur-md"
        >
          <Loader2 className="h-5 w-5 animate-spin text-cyan-300" />
          Cargando perfil...
        </div>
      </div>
    );
  }

  const metrics = [
    { label: "Edad", value: `${user.edad} años`, icon: CalendarDays },
    { label: "Altura", value: `${user.altura} cm`, icon: Ruler },
    { label: "Peso", value: `${user.peso} kg`, icon: Scale },
  ];

  return (
    <div className="relative min-h-[calc(100vh-4rem)] overflow-hidden text-white">
      <div className={PAGE_BACKGROUND_CLASS} />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(16,185,129,0.08),transparent_40%)]" />
      <div className="pointer-events-none absolute -top-32 left-1/2 h-72 w-[36rem] -translate-x-1/2 rounded-full bg-cyan-500/10 blur-3xl" />

      <div className="relative z-10 mx-auto max-w-7xl px-4 pb-16 pt-10 sm:px-6 md:px-10">
        <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-3 font-display text-sm font-medium uppercase tracking-[0.28em] text-cyan-300/80">
              Área privada
            </p>
            <h1 className="font-display text-3xl font-semibold tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-white via-cyan-100 to-emerald-300 sm:text-4xl">
              Hola, {user.nombre}
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              {user.nombre} {user.apellidos} · @{user.username}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/perfil/ajustes"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white transition hover:bg-white/10"
            >
              <Settings className="h-4 w-4" strokeWidth={1.75} />
              Ajustes de la cuenta
            </Link>
            <Link
              href="/"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-300 via-emerald-300 to-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 shadow-lg transition-all duration-300 hover:shadow-cyan-400/25 hover:brightness-105"
            >
              <UploadCloud className="h-4 w-4" strokeWidth={2} />
              Analizar nuevo vídeo
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-1">
            <section className={CARD_CLASS} aria-labelledby="datos-titulo">
              <div className="mb-5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-300">
                    <UserRound className="h-5 w-5" strokeWidth={1.75} />
                  </div>
                  <div>
                    <h2 id="datos-titulo" className="font-display text-lg font-semibold text-white">
                      Datos biomecánicos
                    </h2>
                    <p className="text-xs text-slate-400">Perfil corporal del atleta</p>
                  </div>
                </div>
                <Link
                  href="/perfil/ajustes"
                  aria-label="Editar datos personales"
                  className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-slate-400 transition hover:bg-white/10 hover:text-white"
                >
                  <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
                  Editar
                </Link>
              </div>

              <ul className="space-y-3">
                {metrics.map(({ label, value, icon: Icon }) => (
                  <li
                    key={label}
                    className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-3"
                  >
                    <span className="inline-flex items-center gap-2 text-sm text-slate-300">
                      <Icon className="h-4 w-4 text-cyan-300/80" strokeWidth={1.75} />
                      {label}
                    </span>
                    <span className="font-medium text-white">{value}</span>
                  </li>
                ))}
              </ul>
            </section>

            <EstiloJuegoCard user={user} onGuardado={setUser} />
          </div>

          <HistorialAnalisis
            analisis={analisis}
            onBorrado={(id) => setAnalisis((actual) => (actual ?? []).filter((a) => a.id !== id))}
          />
        </div>
      </div>
    </div>
  );
}

export const AUTH_CARD_CLASS =
  "mx-auto w-full rounded-2xl border border-white/5 bg-zinc-900 p-6 shadow-xl sm:p-8";

/** Tarjeta de sección del área privada (perfil, ajustes). */
export const CARD_CLASS = "rounded-2xl border border-white/5 bg-zinc-900 p-6 shadow-xl";

/** Fondo común de las páginas (degradado oscuro). */
export const PAGE_BACKGROUND_CLASS =
  "pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_#0b1a33_0%,_#020617_45%,_#000000_100%)]";

export const FIELD_LABEL_CLASS =
  "mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-400";

export const AUTH_INPUT_CLASS =
  [
    "w-full rounded-lg p-3 outline-none transition-all",
    "ring-1 ring-white/10 bg-zinc-800",
    "text-white placeholder:text-slate-500",
    "focus:ring-2 focus:ring-cyan-400/70",
    "aria-[invalid=true]:ring-rose-400/70",
  ].join(" ");

export const PRIMARY_BUTTON_CLASS =
  [
    "inline-flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3.5",
    "bg-gradient-to-r from-cyan-300 via-emerald-300 to-cyan-400",
    "text-sm font-semibold text-slate-950 shadow-lg",
    "transition-all duration-300 hover:brightness-105 hover:shadow-cyan-400/25",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900",
    "disabled:cursor-wait disabled:opacity-70",
  ].join(" ");

/** Color de la insignia de puntuación según la nota (0-100). */
export function scoreBadgeClass(puntuacion: number): string {
  if (puntuacion >= 85) {
    return "border-emerald-400/40 bg-emerald-400/15 text-emerald-200";
  }
  if (puntuacion >= 65) {
    return "border-amber-400/40 bg-amber-400/15 text-amber-200";
  }
  return "border-rose-400/40 bg-rose-400/15 text-rose-200";
}

export const FORM_ERROR_CLASS =
  "mb-5 flex items-start gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3.5 py-3 text-sm text-rose-100";

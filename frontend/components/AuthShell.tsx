import type { ReactNode } from "react";

/** Fondo y cabecera comunes de las páginas de acceso (login / registro). */
export default function AuthShell({
  eyebrow,
  title,
  subtitle,
  maxWidth = "max-w-md",
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  maxWidth?: string;
  children: ReactNode;
}) {
  return (
    <div className="relative flex min-h-[calc(100vh-4rem)] items-center overflow-hidden text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_#0b1a33_0%,_#020617_45%,_#000000_100%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(16,185,129,0.08),transparent_40%)]" />

      <div className={`relative z-10 mx-auto w-full ${maxWidth} px-4 py-10 sm:px-6 sm:py-12`}>
        <div className="mb-8 text-center">
          <p className="mb-3 font-display text-sm font-medium uppercase tracking-[0.28em] text-cyan-300/80">
            {eyebrow}
          </p>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-white via-cyan-100 to-emerald-300 sm:text-4xl">
            {title}
          </h1>
          <p className="mt-3 text-sm text-slate-400">{subtitle}</p>
        </div>
        {children}
      </div>
    </div>
  );
}

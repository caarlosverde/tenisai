import Link from "next/link";

const ENLACES = [
  { href: "/privacidad", texto: "Política de privacidad" },
  { href: "/aviso-legal", texto: "Aviso legal" },
] as const;

export default function Footer() {
  return (
    <footer className="border-t border-white/10 bg-black/60">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-6 text-xs text-slate-500 sm:flex-row sm:px-6 md:px-10">
        <p>© {new Date().getFullYear()} TenisAI · Trabajo Fin de Grado</p>
        <nav aria-label="Información legal">
          <ul className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            {ENLACES.map(({ href, texto }) => (
              <li key={href}>
                <Link href={href} className="transition-colors hover:text-slate-200">
                  {texto}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}

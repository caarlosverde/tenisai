import Image from "next/image";
import Link from "next/link";

const GRUPOS = [
  {
    titulo: "Explorar",
    enlaces: [
      { href: "/", texto: "Analizar un vídeo" },
      { href: "/perfil", texto: "Mis análisis" },
      { href: "/comunidad", texto: "Comunidad" },
      { href: "/comunidad/ranking", texto: "Ranking" },
    ],
  },
  {
    titulo: "Información",
    enlaces: [
      { href: "/privacidad", texto: "Política de privacidad" },
      { href: "/aviso-legal", texto: "Aviso legal" },
    ],
  },
] as const;

export default function Footer() {
  return (
    <footer className="border-t border-white/10 bg-black/60">
      <div className="mx-auto max-w-7xl px-4 pb-6 pt-10 sm:px-6 md:px-10">
        <div className="grid gap-8 sm:grid-cols-[minmax(0,1.6fr)_repeat(2,minmax(0,1fr))]">
          <div className="max-w-xs">
            <Link
              href="/"
              className="inline-flex items-center gap-2.5 transition-opacity hover:opacity-90"
            >
              <Image
                src="/logo.webp"
                alt=""
                width={28}
                height={28}
                className="h-7 w-7 rounded-full object-cover ring-1 ring-white/15"
              />
              <span className="font-display font-semibold tracking-tight text-white">TenisAI</span>
            </Link>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              Análisis biomecánico del golpe de tenis con visión artificial, a partir de un vídeo
              grabado con el móvil.
            </p>
          </div>

          {/* En el móvil los dos grupos van en paralelo para que el pie no sea tan largo */}
          <div className="grid grid-cols-2 gap-8 sm:contents">
            {GRUPOS.map((grupo) => (
              <nav key={grupo.titulo} aria-label={grupo.titulo}>
                <h2 className="text-xs font-medium uppercase tracking-wider text-slate-300">
                  {grupo.titulo}
                </h2>
                <ul className="mt-3 space-y-2 text-sm">
                  {grupo.enlaces.map(({ href, texto }) => (
                    <li key={href}>
                      <Link href={href} className="text-slate-400 transition-colors hover:text-white">
                        {texto}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>

        <p className="mt-10 border-t border-white/5 pt-5 text-xs text-slate-400">
          © {new Date().getFullYear()} TenisAI · Trabajo Fin de Grado
        </p>
      </div>
    </footer>
  );
}

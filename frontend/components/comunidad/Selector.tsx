import Link from "next/link";

/** Grupo de enlaces que actúa como selector (filtros en la URL: se pueden compartir y recargar). */
export default function Selector<T extends string>({
  etiqueta,
  opciones,
  actual,
  href,
}: {
  etiqueta: string;
  opciones: { valor: T; etiqueta: string }[];
  actual: T;
  href: (valor: T) => string;
}) {
  return (
    <nav aria-label={etiqueta} className="inline-flex rounded-xl border border-white/10 bg-black/20 p-1">
      {opciones.map((o) => (
        <Link
          key={o.valor}
          href={href(o.valor)}
          aria-current={o.valor === actual ? "page" : undefined}
          className={[
            "rounded-lg px-3.5 py-1.5 text-sm transition",
            o.valor === actual ? "bg-white/10 font-medium text-white" : "text-slate-400 hover:text-white",
          ].join(" ")}
        >
          {o.etiqueta}
        </Link>
      ))}
    </nav>
  );
}

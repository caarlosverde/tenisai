// Avatar con las iniciales y un color estable por usuario (sin fotos: no se suben imágenes).

const DEGRADADOS = [
  "from-cyan-300 to-emerald-300",
  "from-violet-300 to-fuchsia-300",
  "from-amber-200 to-orange-300",
  "from-sky-300 to-indigo-300",
  "from-emerald-300 to-lime-200",
  "from-rose-300 to-pink-300",
];

const TAMANOS = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-20 w-20 text-2xl",
} as const;

function indiceColor(semilla: string): number {
  let hash = 0;
  for (const caracter of semilla) hash = (hash * 31 + caracter.charCodeAt(0)) >>> 0;
  return hash % DEGRADADOS.length;
}

function iniciales(nombre: string): string {
  const partes = nombre.replace(/\./g, "").split(/\s+/).filter(Boolean);
  return ((partes[0]?.[0] ?? "?") + (partes[1]?.[0] ?? "")).toUpperCase();
}

export default function Avatar({
  nombre,
  semilla,
  tamano = "md",
}: {
  nombre: string;
  /** Normalmente el nombre de usuario: el color no cambia aunque cambie el nombre. */
  semilla: string;
  tamano?: keyof typeof TAMANOS;
}) {
  return (
    <span
      aria-hidden="true"
      className={[
        "flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-semibold text-slate-950",
        DEGRADADOS[indiceColor(semilla)],
        TAMANOS[tamano],
      ].join(" ")}
    >
      {iniciales(nombre)}
    </span>
  );
}

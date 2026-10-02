import Link from "next/link";
import type { ReactNode } from "react";
import {
  Activity,
  ArrowDown,
  CheckCircle2,
  FileText,
  Footprints,
  GitCompareArrows,
  Ruler,
  Smartphone,
  Sparkles,
  TrendingUp,
  AlertTriangle,
  UploadCloud,
  UserPlus,
} from "lucide-react";
import GuiaGrabacion from "@/components/home/GuiaGrabacion";

const PASOS = [
  {
    Icono: Smartphone,
    titulo: "Graba tu golpe",
    texto: "Con el móvil, de lado y con el cuerpo entero en el encuadre.",
  },
  {
    Icono: UploadCloud,
    titulo: "Súbelo",
    texto: "TenisAI detecta tu esqueleto fotograma a fotograma y reconoce el tipo de golpe.",
  },
  {
    Icono: TrendingUp,
    titulo: "Mejora",
    texto: "Recibe una nota, consejos por fase del golpe y un informe PDF. Con cuenta, sigue tu evolución.",
  },
] as const;

const METRICAS = [
  { Icono: Activity, titulo: "Codo y hombro", texto: "Ángulo del brazo en la preparación, el impacto y la terminación." },
  { Icono: Footprints, titulo: "Piernas y base", texto: "Flexión de rodillas y amplitud de la base de apoyo." },
  { Icono: Ruler, titulo: "Distancia al golpe", texto: "Separación entre la muñeca y el cuerpo (spacing) en el impacto." },
  { Icono: Sparkles, titulo: "Fases del golpe", texto: "Preparación, carga, impacto y terminación, cada una con su valoración." },
  { Icono: GitCompareArrows, titulo: "Antes y después", texto: "Compara dos análisis y mira qué aspectos han mejorado." },
  { Icono: FileText, titulo: "Informe PDF", texto: "Un resumen con capturas de cada fase para compartir con tu entrenador." },
] as const;

/** Ilustración de un jugador en el impacto de una derecha, con dos ángulos medidos. */
function EsqueletoIlustrado() {
  const huesos: [number, number, number, number][] = [
    [80, 70, 122, 72], // hombros
    [80, 70, 88, 140],
    [122, 72, 114, 140],
    [88, 140, 114, 140], // cadera
    [122, 72, 150, 96], // brazo del golpe
    [150, 96, 178, 90],
    [80, 70, 62, 96], // brazo libre
    [62, 96, 72, 120],
    [88, 140, 70, 186], // pierna izquierda
    [70, 186, 58, 234],
    [114, 140, 134, 184], // pierna derecha
    [134, 184, 148, 234],
  ];
  const articulaciones: [number, number][] = [
    [80, 70], [122, 72], [150, 96], [178, 90], [62, 96], [72, 120],
    [88, 140], [114, 140], [70, 186], [58, 234], [134, 184], [148, 234],
  ];

  return (
    <svg
      viewBox="0 0 240 260"
      role="img"
      aria-label="Ilustración: esqueleto de un jugador en el impacto de una derecha, con el ángulo del codo (142 grados) y de la rodilla (128 grados) marcados"
      className="h-full w-full"
    >
      <defs>
        <radialGradient id="halo" cx="50%" cy="45%" r="60%">
          <stop offset="0%" stopColor="rgba(34,211,238,0.18)" />
          <stop offset="100%" stopColor="rgba(34,211,238,0)" />
        </radialGradient>
      </defs>
      <rect width="240" height="260" fill="url(#halo)" />
      <line x1="10" y1="240" x2="230" y2="240" stroke="rgba(148,163,184,0.25)" strokeDasharray="4 6" />
      {/* Raqueta y pelota */}
      <line x1="178" y1="90" x2="206" y2="64" stroke="#e2e8f0" strokeWidth="3" strokeLinecap="round" />
      <ellipse cx="212" cy="58" rx="11" ry="8" fill="none" stroke="#e2e8f0" strokeWidth="2.5" transform="rotate(-40 212 58)" />
      <circle cx="226" cy="44" r="5" fill="#d9f99d" />
      {/* Cabeza */}
      <circle cx="101" cy="44" r="15" fill="none" stroke="#67e8f9" strokeWidth="3" />
      {huesos.map(([x1, y1, x2, y2], i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#67e8f9" strokeWidth="4" strokeLinecap="round" />
      ))}
      {articulaciones.map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="4.5" fill="#6ee7b7" stroke="#020617" strokeWidth="1.5" />
      ))}
      {/* Ángulo del codo */}
      <path d="M 138 86 A 16 16 0 0 1 166 93" fill="none" stroke="#fbbf24" strokeWidth="2.5" />
      <rect x="130" y="104" width="52" height="20" rx="6" fill="rgba(2,6,23,0.85)" stroke="rgba(251,191,36,0.5)" />
      <text x="156" y="118" textAnchor="middle" fontSize="11" fill="#fde68a" fontFamily="ui-monospace, monospace">
        142°
      </text>
      {/* Ángulo de la rodilla */}
      <path d="M 79 170 A 17 17 0 0 0 65 199" fill="none" stroke="#fbbf24" strokeWidth="2.5" />
      <rect x="14" y="176" width="46" height="20" rx="6" fill="rgba(2,6,23,0.85)" stroke="rgba(251,191,36,0.5)" />
      <text x="37" y="190" textAnchor="middle" fontSize="11" fill="#fde68a" fontFamily="ui-monospace, monospace">
        128°
      </text>
    </svg>
  );
}

function EjemploResultado() {
  const consejos = [
    { Icono: CheckCircle2, clase: "border-emerald-400/25 bg-emerald-400/10 text-emerald-200", titulo: "Base de apoyo estable", fase: "Impacto" },
    { Icono: AlertTriangle, clase: "border-amber-400/25 bg-amber-400/10 text-amber-200", titulo: "Flexiona más las rodillas", fase: "Carga" },
    { Icono: CheckCircle2, clase: "border-emerald-400/25 bg-emerald-400/10 text-emerald-200", titulo: "Buena distancia al golpe", fase: "Impacto" },
  ];
  return (
    <div className="grid grid-cols-1 overflow-hidden rounded-3xl border border-white/10 bg-white/5 shadow-2xl backdrop-blur-md md:grid-cols-2">
      <div className="relative aspect-square max-h-[22rem] w-full border-b border-white/10 bg-black/40 md:max-h-none md:border-b-0 md:border-r">
        <EsqueletoIlustrado />
        <span className="absolute left-3 top-3 rounded-full border border-amber-300/40 bg-amber-400/15 px-2.5 py-1 text-[11px] font-semibold text-amber-100">
          🎾 Derecha
        </span>
      </div>
      <div className="flex flex-col gap-4 p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-cyan-300/80">Nota del golpe</p>
            <p className="mt-1 text-sm text-slate-400">Diestro · revés a dos manos</p>
          </div>
          <span className="rounded-2xl border border-amber-400/40 bg-amber-400/15 px-4 py-2 text-center text-amber-100">
            <span className="block font-display text-3xl font-semibold">76</span>
            <span className="text-[11px] uppercase tracking-wider opacity-80">/ 100</span>
          </span>
        </div>
        <ol className="flex flex-wrap gap-1.5 text-[11px] text-slate-300" aria-label="Fases del golpe">
          {["Preparación", "Carga", "Impacto", "Terminación"].map((fase, i) => (
            <li key={fase} className="rounded-full border border-white/10 bg-black/30 px-2.5 py-1">
              {i + 1}. {fase}
            </li>
          ))}
        </ol>
        <ul className="space-y-2">
          {consejos.map(({ Icono, clase, titulo, fase }) => (
            <li key={titulo} className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${clase}`}>
              <Icono className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
              <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-300">
                {fase}
              </span>
              {titulo}
            </li>
          ))}
        </ul>
        <p className="text-xs text-slate-500">Ejemplo ilustrativo del tipo de resultado que obtendrás.</p>
      </div>
    </div>
  );
}

function Seccion({
  id,
  eyebrow,
  titulo,
  children,
}: {
  id?: string;
  eyebrow: string;
  titulo: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id ?? eyebrow}-titulo`} className="mx-auto mt-24 w-full max-w-5xl scroll-mt-24">
      <p className="text-center font-display text-sm font-medium uppercase tracking-[0.28em] text-cyan-300/80">
        {eyebrow}
      </p>
      <h2
        id={`${id ?? eyebrow}-titulo`}
        className="mt-3 text-center font-display text-2xl font-semibold tracking-tight text-white sm:text-3xl"
      >
        {titulo}
      </h2>
      <div className="mt-10">{children}</div>
    </section>
  );
}

/** Portada para visitantes sin sesión. La zona de subida se inserta en la sección "Pruébalo". */
export default function Landing({ zonaSubida }: { zonaSubida: ReactNode }) {
  return (
    <div className="w-full">
      <div className="mx-auto max-w-3xl text-center">
        <p className="mb-4 font-display text-sm font-medium uppercase tracking-[0.28em] text-cyan-300/80 animate-[fadeUp_0.7s_ease-out_both]">
          Computer Vision · Biomecánica
        </p>
        <h1 className="font-display text-4xl font-semibold leading-[1.1] tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-white via-cyan-100 to-emerald-300 animate-[fadeUp_0.8s_ease-out_0.08s_both] sm:text-5xl md:text-6xl">
          Tu técnica de tenis, medida con visión artificial
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-slate-300/85 animate-[fadeUp_0.8s_ease-out_0.16s_both] sm:text-lg">
          Sube un vídeo de tu golpe y TenisAI detecta tu postura, mide los ángulos de brazos y
          piernas en cada fase y te dice qué corregir.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 animate-[fadeUp_0.8s_ease-out_0.22s_both] sm:flex-row">
          <a
            href="#analizar"
            className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-300 via-emerald-300 to-cyan-400 px-6 py-3.5 text-sm font-semibold text-slate-950 shadow-xl transition hover:shadow-[0_0_40px_rgba(52,211,153,0.4)] hover:brightness-105"
          >
            <ArrowDown className="h-4 w-4" strokeWidth={2} />
            Analizar un vídeo gratis
          </a>
          <Link
            href="/registro"
            className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-6 py-3.5 text-sm font-medium text-white transition hover:bg-white/10"
          >
            <UserPlus className="h-4 w-4" strokeWidth={1.75} />
            Crear cuenta
          </Link>
        </div>
        <p className="mt-4 text-xs text-slate-500">Sin instalar nada · Resultado en menos de 2 minutos · Informe PDF</p>
      </div>

      <div className="mx-auto mt-16 max-w-4xl animate-[fadeUp_0.9s_ease-out_0.3s_both]">
        <EjemploResultado />
      </div>

      <Seccion eyebrow="Cómo funciona" titulo="Tres pasos, sin sensores ni laboratorio">
        <ol className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {PASOS.map(({ Icono, titulo, texto }, i) => (
            <li key={titulo} className="rounded-3xl border border-white/10 bg-white/5 p-6">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-400/25 bg-cyan-400/10 text-cyan-200">
                  <Icono className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                </span>
                <span className="font-mono text-xs text-slate-500">Paso {i + 1}</span>
              </div>
              <p className="mt-4 font-display text-lg font-semibold text-white">{titulo}</p>
              <p className="mt-1 text-sm leading-relaxed text-slate-400">{texto}</p>
            </li>
          ))}
        </ol>
      </Seccion>

      <Seccion eyebrow="Qué analiza" titulo="Las claves biomecánicas de cada golpe">
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {METRICAS.map(({ Icono, titulo, texto }) => (
            <li key={titulo} className="rounded-2xl border border-white/10 bg-black/20 p-5">
              <Icono className="h-5 w-5 text-emerald-300" strokeWidth={1.75} aria-hidden />
              <p className="mt-3 font-medium text-white">{titulo}</p>
              <p className="mt-1 text-sm leading-relaxed text-slate-400">{texto}</p>
            </li>
          ))}
        </ul>
      </Seccion>

      <Seccion id="analizar" eyebrow="Pruébalo" titulo="Analiza tu primer golpe">
        <div className="-mt-10">{zonaSubida}</div>
      </Seccion>

      <Seccion eyebrow="Antes de grabar" titulo="Cómo conseguir un buen análisis">
        <GuiaGrabacion />
      </Seccion>

      <section className="mx-auto mt-24 w-full max-w-3xl rounded-3xl border border-cyan-300/20 bg-gradient-to-br from-cyan-400/10 to-emerald-400/10 p-8 text-center">
        <h2 className="font-display text-2xl font-semibold text-white">Guarda tu evolución</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-300">
          Con una cuenta gratuita cada análisis queda en tu historial: compara el antes y el
          después y mira tu progreso por tipo de golpe.
        </p>
        <Link
          href="/registro"
          className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-300 via-emerald-300 to-cyan-400 px-6 py-3 text-sm font-semibold text-slate-950 shadow-xl transition hover:brightness-105"
        >
          <UserPlus className="h-4 w-4" strokeWidth={2} />
          Crear cuenta gratis
        </Link>
      </section>
    </div>
  );
}

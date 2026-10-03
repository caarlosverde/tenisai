import { Camera, Clock3, FileVideo, PersonStanding, Sun, UserRound } from "lucide-react";
import { MAX_VIDEO_MB } from "@/lib/video";

export const CONSEJOS_GRABACION = [
  {
    Icono: Camera,
    titulo: "De lado o en diagonal por detrás",
    texto: "Con la cámara quieta (trípode o apoyada) a la altura de la cintura y a unos 4–6 metros.",
  },
  {
    Icono: PersonStanding,
    titulo: "El cuerpo entero en el encuadre",
    texto: "De la cabeza a los pies durante todo el golpe: si se corta un pie o la raqueta, el análisis pierde precisión.",
  },
  {
    Icono: UserRound,
    titulo: "Un solo jugador",
    texto: "Evita que otras personas crucen por delante: el motor sigue a una única persona.",
  },
  {
    Icono: Sun,
    titulo: "Buena luz, sin contraluz",
    texto: "Mejor de día o en pista bien iluminada, con el sol a tu espalda y no de frente a la cámara.",
  },
  {
    Icono: Clock3,
    titulo: "Vídeos cortos, un tipo de golpe",
    texto: "De 3 a 10 segundos con golpes del mismo tipo (por ejemplo, solo derechas).",
  },
  {
    Icono: FileVideo,
    titulo: `MP4 o MOV de hasta ${MAX_VIDEO_MB} MB`,
    texto:
      "Vale el vídeo tal cual sale del móvil. Si tu móvil lo permite, graba a 60 fps: los golpes rápidos se ven con más detalle.",
  },
] as const;

function ListaConsejos() {
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {CONSEJOS_GRABACION.map(({ Icono, titulo, texto }) => (
        <li key={titulo} className="flex gap-3 rounded-2xl border border-white/10 bg-black/20 p-4">
          <Icono className="mt-0.5 h-5 w-5 shrink-0 text-cyan-300" strokeWidth={1.75} aria-hidden />
          <div>
            <p className="text-sm font-medium text-white">{titulo}</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-400">{texto}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Guía de grabación: plegable junto a la zona de subida o como sección completa. */
export default function GuiaGrabacion({ plegable = false }: { plegable?: boolean }) {
  if (plegable) {
    return (
      <details className="group mt-4 rounded-2xl border border-white/10 bg-white/5 text-left">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm font-medium text-slate-200 transition-colors hover:bg-white/5 [&::-webkit-details-marker]:hidden">
          <span className="inline-flex items-center gap-2">
            <Camera className="h-4 w-4 text-cyan-300" strokeWidth={1.75} aria-hidden />
            Cómo grabar el vídeo para un buen análisis
          </span>
          <span aria-hidden className="text-slate-500 transition-transform group-open:rotate-45">
            +
          </span>
        </summary>
        <div className="px-4 pb-4">
          <ListaConsejos />
        </div>
      </details>
    );
  }

  return <ListaConsejos />;
}

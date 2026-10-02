// Constantes visuales y de temporización del reproductor.

import { type PoseFrame, type ZonaCorporal } from "./tipos";

export const SKELETON_EDGES: [string, string][] = [
  ["nariz", "hombro_izq"],
  ["nariz", "hombro_der"],
  ["hombro_izq", "hombro_der"],
  ["hombro_izq", "codo_izq"],
  ["codo_izq", "muneca_izq"],
  ["hombro_der", "codo_der"],
  ["codo_der", "muneca_der"],
  ["hombro_izq", "cadera_izq"],
  ["hombro_der", "cadera_der"],
  ["cadera_izq", "cadera_der"],
  ["cadera_izq", "rodilla_izq"],
  ["rodilla_izq", "tobillo_izq"],
  ["cadera_der", "rodilla_der"],
  ["rodilla_der", "tobillo_der"],
];

export const HIGHLIGHT_EDGES: Record<ZonaCorporal, [string, string][]> = {
  piernas: [
    ["cadera_izq", "rodilla_izq"],
    ["rodilla_izq", "tobillo_izq"],
    ["cadera_der", "rodilla_der"],
    ["rodilla_der", "tobillo_der"],
  ],
  brazo_der: [
    ["hombro_der", "codo_der"],
    ["codo_der", "muneca_der"],
  ],
  brazo_izq: [
    ["hombro_izq", "codo_izq"],
    ["codo_izq", "muneca_izq"],
  ],
  spacing: [],
  backswing: [
    ["cadera_der", "hombro_der"],
    ["hombro_der", "codo_der"],
    ["cadera_der", "codo_der"],
  ],
  base_tronco: [],
};

export const ANGLE_LABELS: { key: keyof NonNullable<PoseFrame["angulos"]>; landmark: string }[] =
  [
    { key: "codo_der", landmark: "codo_der" },
    { key: "codo_izq", landmark: "codo_izq" },
    { key: "rodilla_der", landmark: "rodilla_der" },
    { key: "rodilla_izq", landmark: "rodilla_izq" },
  ];

export const STEPPER_FASES: { id: string; label: string; classActive: string; band: string }[] = [
  {
    id: "preparacion",
    label: "1. Preparación",
    classActive: "border-blue-300/70 bg-blue-500/25 text-blue-100",
    band: "bg-blue-400/55",
  },
  {
    id: "carga",
    label: "2. Carga",
    classActive: "border-violet-300/70 bg-violet-500/25 text-violet-100",
    band: "bg-violet-400/55",
  },
  {
    id: "impacto",
    label: "3. Impacto",
    classActive: "border-amber-300/80 bg-amber-500/30 text-amber-50",
    band: "bg-amber-400/70",
  },
  {
    id: "terminacion",
    label: "4. Terminación",
    classActive: "border-emerald-300/70 bg-emerald-500/25 text-emerald-100",
    band: "bg-emerald-400/55",
  },
];

export const COLOR_OK = "rgba(34, 211, 238, 0.9)";

export const COLOR_FAULT = "rgba(251, 113, 133, 0.98)";

export const COLOR_AMBER = "rgba(251, 191, 36, 0.95)";

export const FAULT_WINDOW = 0.35;

export const BANNER_WINDOW = 0.4;

export const PAUSE_PEAK_WINDOW = 0.09;

export const PAUSE_MS = 2200;

export const FASES_INFORME: { id: string; label: string }[] = [
  { id: "preparacion", label: "1. Preparación" },
  { id: "carga", label: "2. Carga" },
  { id: "impacto", label: "3. Impacto" },
  { id: "terminacion", label: "4. Terminación" },
];

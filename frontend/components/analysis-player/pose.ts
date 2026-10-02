// Interpolación de las poses entre fotogramas, ángulos y fases del golpe.

import { type PoseLandmark, type PoseFrame, type GolpeFase, type PoseTracks } from "./tipos";
import { FASES_INFORME } from "./constantes";

export function lerp(a: number, b: number, u: number): number {
  return a + (b - a) * u;
}

export function findSpan(frames: PoseFrame[], time: number): [PoseFrame, PoseFrame, number] {
  if (frames.length === 1) {
    return [frames[0], frames[0], 0];
  }
  if (time <= frames[0].t) {
    return [frames[0], frames[0], 0];
  }
  const last = frames[frames.length - 1];
  if (time >= last.t) {
    return [last, last, 0];
  }

  let lo = 0;
  let hi = frames.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].t <= time) lo = mid;
    else hi = mid;
  }
  const a = frames[lo];
  const b = frames[hi];
  const span = b.t - a.t;
  const u = span > 1e-6 ? (time - a.t) / span : 0;
  return [a, b, Math.min(1, Math.max(0, u))];
}

export function interpolateFrame(tracks: PoseTracks, time: number): PoseFrame | null {
  const frames = tracks.frames;
  if (!frames.length) return null;
  const [a, b, u] = findSpan(frames, time);

  const landmarks: Record<string, PoseLandmark> | null =
    a.landmarks && b.landmarks
      ? Object.fromEntries(
          Object.keys(a.landmarks).map((key) => {
            const pa = a.landmarks![key];
            const pb = b.landmarks![key] ?? pa;
            return [
              key,
              [lerp(pa[0], pb[0], u), lerp(pa[1], pb[1], u), lerp(pa[2], pb[2], u)],
            ];
          }),
        )
      : (a.landmarks ?? b.landmarks);

  const lerpBox = (
    ba: [number, number, number, number] | null | undefined,
    bb: [number, number, number, number] | null | undefined,
  ) => {
    if (ba && bb) {
      return [
        lerp(ba[0], bb[0], u),
        lerp(ba[1], bb[1], u),
        lerp(ba[2], bb[2], u),
        lerp(ba[3], bb[3], u),
      ] as [number, number, number, number];
    }
    return ba ?? bb ?? null;
  };

  const angulos =
    a.angulos && b.angulos
      ? {
          codo_der: lerp(a.angulos.codo_der, b.angulos.codo_der, u),
          codo_izq: lerp(a.angulos.codo_izq, b.angulos.codo_izq, u),
          rodilla_der: lerp(a.angulos.rodilla_der, b.angulos.rodilla_der, u),
          rodilla_izq: lerp(a.angulos.rodilla_izq, b.angulos.rodilla_izq, u),
        }
      : (a.angulos ?? b.angulos);

  return {
    t: lerp(a.t, b.t, u),
    bbox: lerpBox(a.bbox, b.bbox),
    bbox_yolo: lerpBox(a.bbox_yolo, b.bbox_yolo),
    landmarks,
    angulos,
    fase: (u < 0.5 ? a : b).fase,
    fase_label: (u < 0.5 ? a : b).fase_label,
  };
}

export function lookupFase(
  tracks: PoseTracks | null,
  time: number,
): { fase: string; fase_label: string } {
  const golpes = tracks?.golpes_fases ?? [];
  for (const id of ["impacto", "carga", "preparacion", "terminacion"]) {
    for (const golpe of golpes) {
      if (golpe.fase === id && time >= golpe.t_inicio && time <= golpe.t_fin) {
        return { fase: golpe.fase, fase_label: golpe.fase_label };
      }
    }
  }
  return { fase: "recuperacion", fase_label: "Desplazamiento" };
}

export function angleDeg(p1: PoseLandmark, p2: PoseLandmark, p3: PoseLandmark): number {
  const rad =
    Math.atan2(p3[1] - p2[1], p3[0] - p2[0]) -
    Math.atan2(p1[1] - p2[1], p1[0] - p2[0]);
  let deg = Math.abs((rad * 180) / Math.PI);
  if (deg > 180) deg = 360 - deg;
  return deg;
}

export function aperturaHombro(frame: PoseFrame): number | null {
  const lm = frame.landmarks;
  if (!lm?.cadera_der || !lm?.hombro_der || !lm?.codo_der) return null;
  if (lm.cadera_der[2] < 0.25 || lm.hombro_der[2] < 0.25 || lm.codo_der[2] < 0.25) {
    return null;
  }
  return angleDeg(lm.cadera_der, lm.hombro_der, lm.codo_der);
}

export function flexionRodillas(frame: PoseFrame): number | null {
  if (!frame.angulos) return null;
  return Math.min(frame.angulos.rodilla_der, frame.angulos.rodilla_izq);
}

export function pickPhaseTimestamps(tracks: PoseTracks | null): {
  fase: string;
  fase_label: string;
  t: number;
}[] {
  const frames = tracks?.frames ?? [];
  const duration = frames.length ? frames[frames.length - 1].t : 0;
  const fallback = [
    { fase: "preparacion", fase_label: "1. Preparación", t: duration * 0.2 },
    { fase: "carga", fase_label: "2. Carga", t: duration * 0.45 },
    { fase: "impacto", fase_label: "3. Impacto", t: duration * 0.65 },
    { fase: "terminacion", fase_label: "4. Terminación", t: duration * 0.85 },
  ];
  const golpes = tracks?.golpes_fases ?? [];
  const impactos = golpes.filter((g) => g.fase === "impacto");
  if (!impactos.length || duration <= 0) return fallback;

  const principal = impactos[0];
  const tImp = principal.t_impacto ?? (principal.t_inicio + principal.t_fin) / 2;
  const sameSwing = (g: GolpeFase) =>
    principal.t_impacto != null
      ? g.t_impacto === principal.t_impacto
      : Math.abs((g.t_impacto ?? tImp) - tImp) < 0.05 ||
        (g.t_inicio <= tImp && g.t_fin >= tImp - 0.7);

  return FASES_INFORME.map((paso) => {
    const ventana =
      golpes.find((g) => g.fase === paso.id && sameSwing(g)) ??
      golpes.find((g) => g.fase === paso.id);
    if (!ventana) {
      return fallback.find((f) => f.fase === paso.id)!;
    }
    const inWin = frames.filter(
      (fr) =>
        fr.t >= ventana.t_inicio - 1e-3 &&
        fr.t <= ventana.t_fin + 1e-3 &&
        fr.landmarks,
    );
    let t = (ventana.t_inicio + ventana.t_fin) / 2;
    if (paso.id === "preparacion" && inWin.length) {
      t = inWin.reduce((best, fr) =>
        (aperturaHombro(fr) ?? -1) > (aperturaHombro(best) ?? -1) ? fr : best,
      ).t;
    } else if (paso.id === "carga" && inWin.length) {
      t = inWin.reduce((best, fr) =>
        (flexionRodillas(fr) ?? 999) < (flexionRodillas(best) ?? 999) ? fr : best,
      ).t;
    } else if (paso.id === "impacto") {
      t = ventana.t_impacto ?? t;
    }
    return { fase: paso.id, fase_label: paso.label, t };
  });
}

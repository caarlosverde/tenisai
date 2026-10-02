// Dibujo del esqueleto, los ángulos y los avisos del entrenador en el canvas.
// Todos los tamaños se multiplican por `k` (escala): 1 en el reproductor y más
// en las imágenes a resolución completa, para que se lean igual de bien.

import { type PoseLandmark, type PoseFrame, type CoachHit, type Layers, type Point, type OverlayOptions } from "./tipos";
import { SKELETON_EDGES, HIGHLIGHT_EDGES, ANGLE_LABELS, COLOR_OK, COLOR_FAULT, COLOR_AMBER } from "./constantes";
import { contentRect } from "./video";
import { ladoDom, highlightedEdgeSet } from "./coach";

export function landmarkPoint(
  landmarks: Record<string, PoseLandmark>,
  name: string,
  toX: (n: number) => number,
  toY: (n: number) => number,
): Point | null {
  const lm = landmarks[name];
  if (!lm || lm[2] < 0.25) return null;
  return { x: toX(lm[0]), y: toY(lm[1]) };
}

function rectanguloRedondeado(
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(left, top, w, h, r);
  else ctx.rect(left, top, w, h);
}

export function drawRoundedLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  accent = "rgba(34, 211, 238, 0.35)",
  fill = "rgba(2, 6, 23, 0.72)",
  k = 1,
  /** Lado del punto donde va la etiqueta: separar izquierda y derecha evita solapes. */
  lado: "derecha" | "izquierda" = "derecha",
) {
  ctx.font = `600 ${12 * k}px ui-sans-serif, system-ui, sans-serif`;
  const padX = 6 * k;
  const padY = 3 * k;
  const metrics = ctx.measureText(text);
  const w = metrics.width + padX * 2;
  const h = 18 * k;
  const left = lado === "derecha" ? x + 8 * k : x - 8 * k - w;
  const top = y - 22 * k;
  ctx.fillStyle = fill;
  ctx.strokeStyle = accent;
  ctx.lineWidth = k;
  rectanguloRedondeado(ctx, left, top, w, h, 6 * k);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#e2e8f0";
  ctx.fillText(text, left + padX, top + h - padY - 2 * k);
}

export function drawCoachLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  k = 1,
) {
  ctx.font = `700 ${13 * k}px ui-sans-serif, system-ui, sans-serif`;
  const padX = 8 * k;
  const metrics = ctx.measureText(text);
  const w = Math.min(metrics.width + padX * 2, 280 * k);
  const h = 22 * k;
  const left = Math.max(8 * k, x - w / 2);
  const top = y - 28 * k;
  ctx.fillStyle = "rgba(127, 29, 29, 0.82)";
  ctx.strokeStyle = COLOR_AMBER;
  ctx.lineWidth = 1.4 * k;
  rectanguloRedondeado(ctx, left, top, w, h, 7 * k);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#fef3c7";
  ctx.fillText(text, left + padX, top + 15 * k);
}

export function drawBone(
  ctx: CanvasRenderingContext2D,
  a: Point,
  b: Point,
  color: string,
  width: number,
  glow: number,
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.shadowColor = color;
  ctx.shadowBlur = glow;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.shadowBlur = 0;
}

export function drawAngleArc(
  ctx: CanvasRenderingContext2D,
  p1: Point,
  vertex: Point,
  p3: Point,
  radius: number,
  color: string,
  k = 1,
) {
  const a1 = Math.atan2(p1.y - vertex.y, p1.x - vertex.x);
  const a3 = Math.atan2(p3.y - vertex.y, p3.x - vertex.x);
  let delta = a3 - a1;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.4 * k;
  ctx.beginPath();
  ctx.arc(vertex.x, vertex.y, radius, a1, a1 + delta, delta < 0);
  ctx.stroke();
}

export function drawPulseJoint(
  ctx: CanvasRenderingContext2D,
  point: Point,
  pulse: number,
  k = 1,
) {
  ctx.beginPath();
  ctx.fillStyle = `rgba(251, 113, 133, ${0.18 + pulse * 0.25})`;
  ctx.arc(point.x, point.y, (10 + pulse * 8) * k, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.fillStyle = COLOR_FAULT;
  ctx.arc(point.x, point.y, 4.5 * k, 0, Math.PI * 2);
  ctx.fill();
}

export function drawCoachOverlays(
  ctx: CanvasRenderingContext2D,
  landmarks: Record<string, PoseLandmark>,
  angulos: PoseFrame["angulos"],
  hits: CoachHit[],
  toX: (n: number) => number,
  toY: (n: number) => number,
  pulse: number,
  lateralidad?: string | null,
  k = 1,
) {
  const pt = (name: string) => landmarkPoint(landmarks, name, toX, toY);
  const zonas = new Set(hits.map((h) => h.zona));
  const L = ladoDom(
    zonas.has("brazo_izq") ? "zurdo" : lateralidad,
  );

  if (zonas.has("piernas")) {
    const cadena: [string, string][] = HIGHLIGHT_EDGES.piernas;
    for (const [a, b] of cadena) {
      const pa = pt(a);
      const pb = pt(b);
      if (pa && pb) drawBone(ctx, pa, pb, COLOR_FAULT, 4.2 * k, 14 * k);
    }
    for (const lado of ["izq", "der"] as const) {
      const cadera = pt(`cadera_${lado}`);
      const rodilla = pt(`rodilla_${lado}`);
      const tobillo = pt(`tobillo_${lado}`);
      if (rodilla) drawPulseJoint(ctx, rodilla, pulse, k);
      if (cadera && rodilla && tobillo) {
        drawAngleArc(ctx, cadera, rodilla, tobillo, 22 * k, COLOR_AMBER, k);
      }
    }
    // El motor mide la rodilla más flexionada (mínimo de las dos): se muestra esa
    const rodDer = angulos?.rodilla_der;
    const rodIzq = angulos?.rodilla_izq;
    const medida =
      rodDer != null && rodIzq != null
        ? Math.min(rodDer, rodIzq)
        : (rodDer ?? rodIzq);
    const ladoMedido = rodIzq != null && (rodDer == null || rodIzq < rodDer) ? "izq" : "der";
    const ancla = pt(`rodilla_${ladoMedido}`) ?? pt("rodilla_der") ?? pt("rodilla_izq");
    if (ancla && medida != null) {
      drawCoachLabel(ctx, `Rodilla: ${medida.toFixed(0)}° (Baja a ~120°)`, ancla.x, ancla.y - 8 * k, k);
    }
  }

  if (zonas.has("brazo_der") || zonas.has("brazo_izq")) {
    const categorias = new Set(hits.map((h) => h.categoria));
    const hombro = pt(L.hombro);
    const codo = pt(L.codo);
    const muneca = pt(L.muneca);

    // Terminación: lo que importa es el recorrido del antebrazo y la muñeca
    if (categorias.has("terminacion") && !categorias.has("codo")) {
      if (codo && muneca) drawBone(ctx, codo, muneca, COLOR_FAULT, 4.2 * k, 14 * k);
      if (muneca) {
        drawPulseJoint(ctx, muneca, pulse, k);
        drawCoachLabel(ctx, "Termina cruzando el cuerpo", muneca.x, muneca.y - 10 * k, k);
      }
    } else {
      const edges: [string, string][] = [
        [L.hombro, L.codo],
        [L.codo, L.muneca],
      ];
      for (const [a, b] of edges) {
        const pa = pt(a);
        const pb = pt(b);
        if (pa && pb) drawBone(ctx, pa, pb, COLOR_FAULT, 4.2 * k, 14 * k);
      }
      if (codo) drawPulseJoint(ctx, codo, pulse, k);
      if (hombro && codo && muneca) {
        drawAngleArc(ctx, hombro, codo, muneca, 22 * k, COLOR_AMBER, k);
      }
      const angCodo = angulos?.[L.angCodo];
      if (codo && angCodo != null) {
        drawCoachLabel(
          ctx,
          `Codo: ${angCodo.toFixed(0)}° (Estira >155°)`,
          codo.x,
          codo.y - 8 * k,
          k,
        );
      }
    }
  }

  if (zonas.has("spacing")) {
    const caderaIzq = pt("cadera_izq");
    const caderaDer = pt("cadera_der");
    const muneca = pt(L.muneca);
    if (caderaIzq && caderaDer && muneca) {
      const centro = {
        x: (caderaIzq.x + caderaDer.x) / 2,
        y: (caderaIzq.y + caderaDer.y) / 2,
      };
      ctx.setLineDash([7 * k, 5 * k]);
      drawBone(ctx, centro, muneca, COLOR_AMBER, 3.2 * k, 10 * k);
      ctx.setLineDash([]);
      drawCoachLabel(
        ctx,
        "¡Separar más del cuerpo!",
        (centro.x + muneca.x) / 2,
        Math.min(centro.y, muneca.y) - 4 * k,
        k,
      );
    }
  }

  if (zonas.has("backswing")) {
    const cadera = pt(L.cadera);
    const hombro = pt(L.hombro);
    const codo = pt(L.codo);
    if (cadera && hombro && codo) {
      ctx.beginPath();
      ctx.fillStyle = `rgba(251, 113, 133, ${0.18 + pulse * 0.12})`;
      ctx.moveTo(cadera.x, cadera.y);
      ctx.lineTo(hombro.x, hombro.y);
      ctx.lineTo(codo.x, codo.y);
      ctx.closePath();
      ctx.fill();
      for (const [a, b] of HIGHLIGHT_EDGES.backswing) {
        const pa = pt(a);
        const pb = pt(b);
        if (pa && pb) drawBone(ctx, pa, pb, COLOR_FAULT, 3.6 * k, 12 * k);
      }
      drawCoachLabel(ctx, "Abrir más el arco", hombro.x, hombro.y - 6 * k, k);
    }
  }

  if (zonas.has("base_tronco")) {
    const tobIzq = pt("tobillo_izq");
    const tobDer = pt("tobillo_der");
    const caderaIzq = pt("cadera_izq");
    const caderaDer = pt("cadera_der");
    const hombroIzq = pt("hombro_izq");
    const hombroDer = pt("hombro_der");
    if (tobIzq && tobDer) {
      ctx.setLineDash([6 * k, 4 * k]);
      drawBone(ctx, tobIzq, tobDer, COLOR_AMBER, 3.4 * k, 10 * k);
      ctx.setLineDash([]);
      drawCoachLabel(
        ctx,
        "Ancho de base",
        (tobIzq.x + tobDer.x) / 2,
        Math.max(tobIzq.y, tobDer.y) + 24 * k,
        k,
      );
    }
    if (caderaIzq && caderaDer && hombroIzq && hombroDer) {
      const cadera = {
        x: (caderaIzq.x + caderaDer.x) / 2,
        y: (caderaIzq.y + caderaDer.y) / 2,
      };
      const hombros = {
        x: (hombroIzq.x + hombroDer.x) / 2,
        y: (hombroIzq.y + hombroDer.y) / 2,
      };
      drawBone(ctx, cadera, hombros, COLOR_FAULT, 3.2 * k, 10 * k);
      const vertical: Point = { x: cadera.x, y: hombros.y };
      ctx.setLineDash([4 * k, 4 * k]);
      drawBone(ctx, cadera, vertical, "rgba(226, 232, 240, 0.55)", 1.6 * k, 0);
      ctx.setLineDash([]);
    }
  }
}

export function drawOverlay(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  frame: PoseFrame,
  layers: Layers,
  hits: CoachHit[],
  opts?: OverlayOptions,
) {
  const k = opts?.escala ?? 1;
  const cssW = opts?.width ?? video.clientWidth;
  const cssH = opts?.height ?? video.clientHeight;
  const dpr = opts?.width ? 1 : (window.devicePixelRatio || 1) * (opts?.supermuestreo ?? 1);
  if (
    opts?.clear !== false &&
    (ctx.canvas.width !== Math.round(cssW * dpr) ||
      ctx.canvas.height !== Math.round(cssH * dpr))
  ) {
    ctx.canvas.width = Math.round(cssW * dpr);
    ctx.canvas.height = Math.round(cssH * dpr);
    ctx.canvas.style.width = `${cssW}px`;
    ctx.canvas.style.height = `${cssH}px`;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (opts?.clear !== false) {
    ctx.clearRect(0, 0, cssW, cssH);
  }

  const area =
    opts?.letterbox === false
      ? { x: 0, y: 0, w: cssW, h: cssH }
      : contentRect(video);
  const toX = (nx: number) => area.x + nx * area.w;
  const toY = (ny: number) => area.y + ny * area.h;
  const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 180);

  if (layers.bbox) {
    if (frame.bbox) {
      const [x1, y1, x2, y2] = frame.bbox;
      ctx.strokeStyle = "rgba(52, 211, 153, 0.85)";
      ctx.lineWidth = 2 * k;
      ctx.setLineDash([6 * k, 4 * k]);
      ctx.strokeRect(toX(x1), toY(y1), toX(x2) - toX(x1), toY(y2) - toY(y1));
      ctx.setLineDash([]);
    }
    if (frame.bbox_yolo) {
      const [x1, y1, x2, y2] = frame.bbox_yolo;
      ctx.strokeStyle = "rgba(251, 146, 60, 0.95)";
      ctx.lineWidth = 2 * k;
      ctx.strokeRect(toX(x1), toY(y1), toX(x2) - toX(x1), toY(y2) - toY(y1));
    }
  }

  if (!frame.landmarks) return;

  const zonasActivas = hits.map((h) => h.zona);
  const resaltados = highlightedEdgeSet(zonasActivas);

  if (layers.skeleton) {
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = COLOR_OK;
    ctx.lineWidth = 2.4 * k;
    ctx.shadowColor = "rgba(34, 211, 238, 0.35)";
    ctx.shadowBlur = 8 * k;
    for (const [a, b] of SKELETON_EDGES) {
      if (resaltados.has(`${a}|${b}`)) continue;
      const pa = frame.landmarks[a];
      const pb = frame.landmarks[b];
      if (!pa || !pb || pa[2] < 0.25 || pb[2] < 0.25) continue;
      ctx.beginPath();
      ctx.moveTo(toX(pa[0]), toY(pa[1]));
      ctx.lineTo(toX(pb[0]), toY(pb[1]));
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    for (const [nombre, punto] of Object.entries(frame.landmarks)) {
      if (punto[2] < 0.25) continue;
      const esFallo =
        (zonasActivas.includes("piernas") && nombre.startsWith("rodilla")) ||
        (zonasActivas.includes("brazo_der") && nombre === "codo_der") ||
        (zonasActivas.includes("brazo_izq") && nombre === "codo_izq");
      if (esFallo) continue;
      ctx.beginPath();
      ctx.fillStyle = "#67e8f9";
      ctx.arc(toX(punto[0]), toY(punto[1]), 3.4 * k, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (hits.length > 0) {
    drawCoachOverlays(
      ctx,
      frame.landmarks,
      frame.angulos,
      hits,
      toX,
      toY,
      pulse,
      opts?.lateralidad,
      k,
    );
  }

  if (layers.angles && frame.angulos) {
    for (const etiqueta of ANGLE_LABELS) {
      const ocupada =
        (etiqueta.key.startsWith("rodilla") && zonasActivas.includes("piernas")) ||
        (etiqueta.key === "codo_der" && zonasActivas.includes("brazo_der")) ||
        (etiqueta.key === "codo_izq" && zonasActivas.includes("brazo_izq"));
      if (ocupada) continue;
      const lm = frame.landmarks[etiqueta.landmark];
      if (!lm || lm[2] < 0.25) continue;
      // Cada etiqueta hacia fuera de su pareja según salen en la imagen: con el jugador
      // de frente la rodilla izquierda queda a la derecha del vídeo y chocarían
      const pareja = frame.landmarks[
        etiqueta.landmark.endsWith("_izq")
          ? etiqueta.landmark.replace(/_izq$/, "_der")
          : etiqueta.landmark.replace(/_der$/, "_izq")
      ];
      drawRoundedLabel(
        ctx,
        `${frame.angulos[etiqueta.key].toFixed(0)}°`,
        toX(lm[0]),
        toY(lm[1]),
        undefined,
        undefined,
        k,
        pareja && pareja[0] > lm[0] ? "izquierda" : "derecha",
      );
    }
  }

  if (opts?.phaseLabel) {
    ctx.font = `700 ${18 * k}px ui-sans-serif, system-ui, sans-serif`;
    const padX = 12 * k;
    const text = opts.phaseLabel;
    const w = ctx.measureText(text).width + padX * 2;
    const h = 28 * k;
    const left = 16 * k;
    const top = 16 * k;
    ctx.fillStyle = "rgba(2, 6, 23, 0.78)";
    ctx.strokeStyle = "rgba(34, 211, 238, 0.45)";
    ctx.lineWidth = 1.2 * k;
    rectanguloRedondeado(ctx, left, top, w, h, 8 * k);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#e2e8f0";
    ctx.fillText(text, left + padX, top + 19 * k);
  }

  if (opts?.tipoGolpe) {
    ctx.font = `700 ${15 * k}px ui-sans-serif, system-ui, sans-serif`;
    const padX = 10 * k;
    const label = `Golpe: ${opts.tipoGolpe}`;
    const w = ctx.measureText(label).width + padX * 2;
    const h = 24 * k;
    const left = Math.max(16 * k, cssW - w - 16 * k);
    const top = 16 * k;
    ctx.fillStyle = "rgba(15, 23, 42, 0.82)";
    ctx.strokeStyle = "rgba(251, 191, 36, 0.55)";
    ctx.lineWidth = 1.2 * k;
    rectanguloRedondeado(ctx, left, top, w, h, 8 * k);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#fde68a";
    ctx.fillText(label, left + padX, top + 16 * k);
  }
}

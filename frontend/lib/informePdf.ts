import { jsPDF } from "jspdf";
import type { CoachFeedback, PhaseSnapshot } from "@/components/AnalysisPlayer";

export type InformePdfInput = {
  snapshots: PhaseSnapshot[];
  resumen: {
    puntuacion?: number;
    tipo?: string;
    titulo?: string;
    mensaje?: string;
    puntos_fuertes?: string[];
    aspecto_principal?: string;
    tipo_golpe?: string;
    lateralidad?: string;
    estilo_reves?: string;
    estilo_derecha?: string;
    adaptacion?: string;
  } | null;
  evaluaciones: CoachFeedback[];
  usuario?: string | null;
  tipoGolpe?: string | null;
};

const FASE_RGB: Record<string, [number, number, number]> = {
  preparacion: [37, 99, 235],
  carga: [139, 92, 246],
  impacto: [217, 119, 6],
  terminacion: [5, 150, 105],
};

function scoreRgb(puntuacion: number): [number, number, number] {
  if (puntuacion >= 85) return [16, 185, 129];
  if (puntuacion >= 65) return [245, 158, 11];
  return [244, 63, 94];
}

function nivelLabel(tipo: string): string {
  if (tipo === "optimo" || tipo === "correcto") return "Optimo";
  if (tipo === "alerta" || tipo === "aviso") return "Alerta";
  return "Mejora";
}

const TIPO_JUSTIFICACION: Record<string, string> = {
  Derecha:
    "Se aplican las reglas de derecha: flexion de rodillas, extension de codo, spacing y terminacion alta.",
  Saque:
    "Se evalua la carga profunda de piernas y la extension vertical del brazo. No se mide el spacing horizontal.",
  Remate:
    "Se evalua la extension vertical del brazo, sin spacing horizontal. La carga de rodillas es menos extrema que en el saque.",
  "Revés (2 Manos)":
    "Se permite un spacing mas corto (contacto mas pegado). El codo izquierdo puede ir flexionado.",
  "Revés (1 Mano)":
    "Contacto a la izquierda del torso con un solo brazo. Spacing y extension se miden como en una derecha invertida.",
  Volea:
    "El armado corto no se penaliza. Se exige un spacing firme por delante del cuerpo.",
  Cortado:
    "No se exige que la terminacion suba por encima del hombro (trayectoria descendente).",
};

function pdfSafe(text: string): string {
  return text
    .replace(/[–—]/g, "-")
    .replace(/[×✕]/g, "x")
    .replace(/[“”«»]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/…/g, "...")
    .replace(/[^\u0000-\u00FF]/g, "");
}

function wrap(doc: jsPDF, text: string, width: number): string[] {
  return doc.splitTextToSize(pdfSafe(text).replace(/\s+/g, " ").trim(), width) as string[];
}

function ensureY(doc: jsPDF, y: number, needed: number): number {
  if (y + needed <= 277) return y;
  doc.addPage();
  return 18;
}

export const NOMBRE_INFORME_PDF = "informe-biomecanico-tenis.pdf";

/** Genera el informe y lo devuelve como PDF (se guarda con `guardarArchivo`). */
export function generarInformePdf(input: InformePdfInput): Blob {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = 210;
  const margin = 14;
  const innerW = pageW - margin * 2;
  const fecha = new Intl.DateTimeFormat("es-ES", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date());
  const puntuacion = input.resumen?.puntuacion ?? 0;
  const scoreColor = scoreRgb(puntuacion);

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageW, 32, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("TenisAI  |  Informe de Analisis Biomecanico", margin, 13);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(148, 163, 184);
  const sub = input.usuario
    ? pdfSafe(`${fecha}  ·  Jugador: ${input.usuario}`)
    : fecha;
  doc.text(sub, margin, 21);

  doc.setFillColor(...scoreColor);
  doc.roundedRect(pageW - margin - 28, 7, 28, 18, 3, 3, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(String(puntuacion), pageW - margin - 14, 16, { align: "center" });
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.text("/ 100", pageW - margin - 14, 22, { align: "center" });

  let y = 38;
  const tipoGolpe = input.tipoGolpe || input.resumen?.tipo_golpe || "";
  const adaptacion = input.resumen?.adaptacion
    ? pdfSafe(input.resumen.adaptacion)
    : "";
  if (tipoGolpe) {
    const justificacion =
      TIPO_JUSTIFICACION[tipoGolpe] ||
      "Las reglas biomecanicas se han adaptado al patron detectado.";
    const extraLine = adaptacion || "";
    const justLines = wrap(doc, justificacion, innerW - 8);
    const extraLines = extraLine ? wrap(doc, extraLine, innerW - 8) : [];
    const boxH = 16 + (justLines.length + extraLines.length) * 4;
    doc.setFillColor(15, 23, 42);
    doc.roundedRect(margin, y, innerW, boxH, 3, 3, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(253, 224, 71);
    doc.text(pdfSafe(`Tipo de golpe analizado: ${tipoGolpe}`), margin + 4, y + 8);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(203, 213, 225);
    let jy = y + 14;
    for (const line of extraLines) {
      doc.setTextColor(253, 224, 71);
      doc.text(line, margin + 4, jy);
      jy += 4;
    }
    doc.setTextColor(203, 213, 225);
    for (const line of justLines) {
      doc.text(line, margin + 4, jy);
      jy += 4;
    }
    y += boxH + 6;
  } else if (adaptacion) {
    doc.setFillColor(15, 23, 42);
    doc.roundedRect(margin, y, innerW, 12, 3, 3, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(253, 224, 71);
    doc.text(adaptacion, margin + 4, y + 8);
    y += 18;
  } else {
    y = 42;
  }
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("1. Valoracion general del entrenador", margin, y);
  y += 5;

  doc.setFillColor(241, 245, 249);
  const resumenLines = wrap(
    doc,
    input.resumen?.mensaje || "No hay un resumen general disponible.",
    innerW - 8,
  );
  const fuertes = input.resumen?.puntos_fuertes?.length
    ? `Puntos fuertes: ${input.resumen.puntos_fuertes.join(" · ")}`
    : "";
  const prioridad = input.resumen?.aspecto_principal
    ? `Prioridad de mejora: ${input.resumen.aspecto_principal}`
    : "";
  const extraLines = [
    ...wrap(doc, fuertes, innerW - 8),
    ...wrap(doc, prioridad, innerW - 8),
  ].filter((line) => line.trim());
  const boxH = 10 + resumenLines.length * 4.2 + extraLines.length * 4.2;
  doc.roundedRect(margin, y, innerW, boxH, 3, 3, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);
  let ty = y + 6;
  for (const line of resumenLines) {
    doc.text(line, margin + 4, ty);
    ty += 4.2;
  }
  if (extraLines.length) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    for (const line of extraLines) {
      doc.text(line, margin + 4, ty);
      ty += 4.2;
    }
  }
  y += boxH + 10;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text("2. Secuencia cinematica por fases", margin, y);
  y += 6;

  const colW = (innerW - 4) / 2;
  const imgH = 48;
  const captionH = 14;
  input.snapshots.slice(0, 4).forEach((snap, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = margin + col * (colW + 4);
    const cellY = y + row * (imgH + captionH + 8);
    const rgb = FASE_RGB[snap.fase] ?? [100, 116, 139];
    doc.setDrawColor(...rgb);
    doc.setLineWidth(1.1);
    doc.roundedRect(x, cellY, colW, imgH, 2, 2, "S");
    if (snap.dataUrl) {
      try {
        doc.addImage(snap.dataUrl, "JPEG", x + 1.2, cellY + 1.2, colW - 2.4, imgH - 2.4);
      } catch {
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text("Captura no disponible", x + colW / 2, cellY + imgH / 2, {
          align: "center",
        });
      }
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...rgb);
    doc.text(pdfSafe(`${snap.fase_label}  ·  ${snap.t.toFixed(2)}s`), x, cellY + imgH + 5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(71, 85, 105);
    const ang = snap.angulos;
    const pie = ang
      ? `Codo der ${ang.codo_der?.toFixed(0) ?? "-"}°  ·  Rod. der ${ang.rodilla_der?.toFixed(0) ?? "-"}°  ·  Rod. izq ${ang.rodilla_izq?.toFixed(0) ?? "-"}°  ·  ${snap.fase_label}`
      : `Sin angulos  ·  ${snap.fase_label}`;
    const pieLines = wrap(doc, pie, colW);
    doc.text(pieLines, x, cellY + imgH + 10);
  });

  y += 2 * (imgH + captionH + 8) + 4;
  y = ensureY(doc, y, 24);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text("3. Diagnostico detallado y recomendaciones por fase", margin, y);
  y += 8;

  for (const ev of input.evaluaciones) {
    const mensaje = wrap(doc, ev.mensaje || "", innerW - 8);
    const ts =
      ev.eventos_detalle?.map((d) => `${d.t.toFixed(1)}s`).join(", ") ||
      ev.timestamps?.map((t) => `${t.toFixed(1)}s`).join(", ");
    const needed =
      16 +
      (ev.objetivo_texto ? 5 : 0) +
      mensaje.length * 4.1 +
      (ts ? 4 : 0);
    y = ensureY(doc, y, needed);
    const tipo = ev.tipo || "mejora";
    const accent =
      tipo === "optimo" || tipo === "correcto"
        ? ([16, 185, 129] as [number, number, number])
        : tipo === "alerta" || tipo === "aviso"
          ? ([244, 63, 94] as [number, number, number])
          : ([245, 158, 11] as [number, number, number]);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(...accent);
    doc.setLineWidth(0.6);
    doc.roundedRect(margin, y, innerW, needed - 2, 2, 2, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...accent);
    const faseTag = ev.fase_nombre ? `[${ev.fase_nombre.toUpperCase()}] ` : "";
    doc.text(
      pdfSafe(`${faseTag}${ev.titulo ?? "Evaluacion"}  ·  ${nivelLabel(tipo)}`),
      margin + 4,
      y + 5,
    );
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    if (ev.objetivo_texto) {
      doc.text(pdfSafe(`Objetivo: ${ev.objetivo_texto}`), margin + 4, y + 10);
    }
    let my = y + (ev.objetivo_texto ? 14 : 10);
    doc.setFontSize(8);
    for (const line of mensaje) {
      doc.text(line, margin + 4, my);
      my += 4.1;
    }
    if (ts) {
      doc.setTextColor(100, 116, 139);
      doc.setFontSize(7);
      doc.text(`Instantes: ${ts}`, margin + 4, my);
    }
    y += needed + 3;
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i += 1) {
    doc.setPage(i);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(margin, 284, pageW - margin, 284);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(
      "Generado automaticamente por el motor de vision artificial YOLOv8 + MediaPipe Pose",
      margin,
      289,
    );
    doc.text(`${i} / ${pages}`, pageW - margin, 289, { align: "right" });
  }

  return doc.output("blob");
}

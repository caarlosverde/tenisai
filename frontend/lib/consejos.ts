// Explicaciones y ejercicios por aspecto técnico. Complementan el feedback del
// motor (biomecanica.py), que dice QUÉ falla, con el POR QUÉ y el CÓMO entrenarlo.

import type { FeedbackEvent } from "@/lib/api";

export type GuiaAspecto = {
  /** Qué mide la regla, en lenguaje de pista. */
  queMide: string;
  /** Por qué importa para el golpe. */
  porQue: string;
  /** Ejercicios concretos para corregirlo. */
  ejercicios: string[];
};

export const GUIA_POR_CATEGORIA: Record<string, GuiaAspecto> = {
  rodilla: {
    queMide: "Cuánto doblas las rodillas en la fase de carga, justo antes de golpear.",
    porQue:
      "Con las piernas flexionadas bajas el centro de gravedad y el golpe nace del suelo: más potencia y menos esfuerzo para el brazo.",
    ejercicios: [
      "Sombra de golpes congelando la carga: 10 swings deteniéndote antes del impacto y comprobando que la rodilla queda doblada (unos 120°).",
      "Pide que te lancen bolas bajas, a la altura de la rodilla: te obligan a bajar con las piernas y no con la espalda.",
    ],
  },
  codo: {
    queMide: "El ángulo del codo del brazo que golpea en el momento del impacto.",
    porQue:
      "Un brazo casi estirado al golpear hace de palanca larga: más velocidad de raqueta y un contacto más estable.",
    ejercicios: [
      "Sombra con pausa en el impacto: congela el brazo en el punto de contacto y comprueba que está casi recto.",
      "Golpea bolas lanzadas con la mano, buscando el contacto por delante del pie adelantado y con el brazo extendido.",
    ],
  },
  spacing: {
    queMide: "La distancia entre la muñeca y el cuerpo en el impacto.",
    porQue:
      "Si la bola te llega pegada al cuerpo, el brazo se encoge y el swing se frena. Con espacio, puedes acelerar la raqueta libremente.",
    ejercicios: [
      "Coloca un cono a la distancia de un brazo y la raqueta: es tu zona de impacto; ajusta los pies para golpear siempre ahí.",
      "Haz pasos pequeños de ajuste justo antes de golpear (después del split-step) en lugar de estirarte o encogerte.",
    ],
  },
  apertura: {
    queMide: "Cuánto separas el brazo del tronco al preparar el golpe (el armado del hombro).",
    porQue:
      "Una preparación amplia carga el hombro y te da recorrido para acelerar; si es corta, el golpe sale sin potencia.",
    ejercicios: [
      "Prepara pronto: gira los hombros en cuanto sepas hacia dónde va la bola, con la mano libre señalándola.",
      "Sombra delante de un espejo comprobando que, al terminar la preparación, la espalda queda casi de cara a la red.",
    ],
  },
  base: {
    queMide: "La separación de los pies respecto al ancho de los hombros en la carga.",
    porQue:
      "Una base ancha te da equilibrio y permite transferir el peso del pie de atrás al de delante al golpear.",
    ejercicios: [
      "Pega dos tiras de cinta en el suelo algo más separadas que tus hombros y golpea con un pie sobre cada una.",
      "Golpea cargando el peso en el pie de atrás y terminando sobre el de delante: notarás la transferencia.",
    ],
  },
  tronco: {
    queMide: "La inclinación del tronco respecto a la vertical en el impacto.",
    porQue:
      "Con el tronco erguido mantienes el equilibrio y la cabeza quieta: el contacto es más limpio y el golpe más repetible.",
    ejercicios: [
      "Golpea con la cabeza quieta y el pecho alto: después del impacto, mantén la mirada en el punto de contacto un segundo.",
      "Termina cada golpe y aguanta la postura dos segundos sin perder el equilibrio.",
    ],
  },
  terminacion: {
    queMide: "El recorrido de la muñeca después del impacto (la terminación del golpe).",
    porQue:
      "Acompañar la bola hasta el final da control y efecto; frenar el swing justo después del impacto resta profundidad y aumenta la carga en el brazo.",
    ejercicios: [
      "Termina con la raqueta sobre el hombro contrario (o por encima del mismo hombro si juegas con terminación en lazo).",
      "Swings lentos exagerando la terminación y aguantando la postura final antes de volver a la posición de espera.",
    ],
  },
};

const CATEGORIAS_ANGULO = new Set(["codo", "rodilla", "apertura", "tronco"]);
const CATEGORIAS_PROPORCION = new Set(["spacing", "base"]);

/**
 * Valor medido en un formato que entienda un jugador: grados para ángulos,
 * "×" para proporciones respecto al cuerpo y, en la terminación (un recorrido
 * normalizado sin unidad intuitiva), una palabra en lugar del número.
 */
export function medidaLegible(
  categoria: string | undefined,
  valor: number | string | undefined,
  esUnFallo = true,
): string | null {
  if (categoria === "terminacion") return esUnFallo ? "Corta" : "Completa";
  if (valor === undefined || valor === "") return null;
  if (typeof valor === "string") return valor;
  if (CATEGORIAS_ANGULO.has(categoria ?? "")) return `${valor.toFixed(0)}°`;
  if (CATEGORIAS_PROPORCION.has(categoria ?? "")) return `${valor.toFixed(2)}×`;
  return valor.toFixed(2);
}

const RANGO: Record<string, number> = { alerta: 0, mejora: 1, aviso: 1 };

export function esFallo(evento: FeedbackEvent): boolean {
  return evento.tipo !== "optimo" && evento.tipo !== "correcto";
}

/** Primer instante (s) en que aparece un fallo, para ordenarlos en el tiempo. */
function primerInstante(evento: FeedbackEvent): number {
  const tiempos = [
    ...(evento.eventos_detalle ?? []).map((d) => d.t),
    ...(evento.timestamps ?? []),
  ];
  return tiempos.length > 0 ? Math.min(...tiempos) : Number.POSITIVE_INFINITY;
}

/** Fallos ordenados por prioridad (alertas primero) y después por momento del vídeo. */
export function fallosOrdenados(feedback: FeedbackEvent[]): FeedbackEvent[] {
  return feedback
    .filter(esFallo)
    .sort(
      (a, b) =>
        (RANGO[a.tipo] ?? 1) - (RANGO[b.tipo] ?? 1) || primerInstante(a) - primerInstante(b),
    );
}

export function aciertos(feedback: FeedbackEvent[]): FeedbackEvent[] {
  return feedback.filter((evento) => !esFallo(evento));
}

export function etiquetaPrioridad(tipo: string): { texto: string; clase: string } {
  return tipo === "alerta"
    ? { texto: "Prioridad alta", clase: "border-rose-400/40 bg-rose-500/15 text-rose-100" }
    : { texto: "A mejorar", clase: "border-amber-400/40 bg-amber-400/15 text-amber-100" };
}

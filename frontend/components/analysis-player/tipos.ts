// Tipos de datos del reproductor: poses, fases del golpe y feedback del entrenador.

export type PoseLandmark = [number, number, number];

export type PoseFrame = {
  t: number;
  bbox: [number, number, number, number] | null;
  bbox_yolo?: [number, number, number, number] | null;
  landmarks: Record<string, PoseLandmark> | null;
  angulos: {
    codo_der: number;
    codo_izq: number;
    rodilla_der: number;
    rodilla_izq: number;
  } | null;
  fase?: string;
  fase_label?: string;
};

export type GolpeFase = {
  t_inicio: number;
  t_fin: number;
  fase: string;
  fase_label: string;
  t_impacto?: number;
};

export type PoseTracks = {
  fps: number;
  width: number;
  height: number;
  total_frames: number;
  golpes_fases?: GolpeFase[];
  frames: PoseFrame[];
};

export type ZonaCorporal =
  | "piernas"
  | "brazo_der"
  | "brazo_izq"
  | "spacing"
  | "backswing"
  | "base_tronco";

export type EventoDetalle = {
  t: number;
  valor_medido: string;
  nota_corta: string;
  fase?: string;
  fase_nombre?: string;
  fase_corta?: string;
};

export type CoachFeedback = {
  tipo: "alerta" | "mejora" | "optimo" | "correcto" | "aviso" | string;
  titulo?: string;
  mensaje: string;
  categoria?: string;
  zona_corporal?: ZonaCorporal | string;
  objetivo_texto?: string;
  consejo_corto?: string;
  eventos_detalle?: EventoDetalle[];
  timestamps?: number[];
  fase?: string;
  fase_nombre?: string;
  fase_corta?: string;
};

export type CoachHit = {
  t: number;
  zona: ZonaCorporal;
  /** Regla del motor (codo, terminacion, rodilla...): decide qué se dibuja en la zona. */
  categoria?: string;
  titulo: string;
  valor_medido: string;
  nota_corta: string;
  objetivo: string;
  consejo: string;
  tipo: string;
  fase?: string;
  fase_nombre?: string;
  fase_corta?: string;
};

export type ViewMode = "interactive" | "processed";

export type PlaybackRate = 0.15 | 0.25 | 0.5 | 1;

export type Layers = {
  skeleton: boolean;
  angles: boolean;
  bbox: boolean;
};

export type Point = { x: number; y: number };

export type OverlayOptions = {
  width?: number;
  height?: number;
  clear?: boolean;
  letterbox?: boolean;
  phaseLabel?: string;
  tipoGolpe?: string | null;
  lateralidad?: string | null;
  /** Multiplica grosores y tamaños de texto (imágenes a resolución completa). */
  escala?: number;
  /** Resolución extra del canvas cuando se amplía con zoom (para que no se vea borroso). */
  supermuestreo?: number;
};

export type PhaseSnapshot = {
  fase: string;
  fase_label: string;
  t: number;
  dataUrl: string;
  angulos: {
    codo_der?: number;
    rodilla_der?: number;
    rodilla_izq?: number;
  } | null;
};

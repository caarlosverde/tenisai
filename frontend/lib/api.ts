// Motor de análisis (FastAPI en Docker, publicado en el 8001 del host).
// Configurable con NEXT_PUBLIC_API_URL para cuando se despliegue fuera de local.
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8001";

export type FeedbackTipo = "alerta" | "mejora" | "optimo" | "correcto" | "aviso";

export type FeedbackEvent = {
  categoria?: string;
  titulo?: string;
  regla?: string;
  tipo: FeedbackTipo;
  valor?: number;
  mensaje: string;
  timestamps?: number[];
  timestamp?: number;
  timestamp_ms?: number;
  zona_corporal?: "piernas" | "brazo_der" | "spacing" | "backswing" | "base_tronco" | string;
  objetivo_texto?: string;
  consejo_corto?: string;
  eventos_detalle?: {
    t: number;
    valor_medido: string;
    nota_corta: string;
    fase?: string;
    fase_nombre?: string;
    fase_corta?: string;
  }[];
  fase?: string;
  fase_nombre?: string;
  fase_corta?: string;
};

export type ResumenGeneral = {
  puntuacion: number;
  tipo: FeedbackTipo;
  titulo: string;
  mensaje: string;
  puntos_fuertes?: string[];
  aspecto_principal?: string;
  tipo_golpe?: string;
  lateralidad?: string;
  estilo_reves?: string;
  estilo_derecha?: string;
  adaptacion?: string;
};

/** Respuesta de /progreso/{job_id} y, ya completado, de /resultado/{job_id}. */
export type AnalysisProgress = {
  estado: "en_cola" | "procesando" | "completado" | "error";
  progreso: number;
  frames_procesados: number;
  frames_totales: number;
  /** Solo mientras está en cola: análisis que se procesarán antes que este. */
  por_delante?: number;
  mensaje?: string;
  error?: string;
  original_url?: string;
  processed_url?: string;
  csv_url?: string;
  tracks_url?: string;
  feedback?: FeedbackEvent[];
  resumen_general?: ResumenGeneral | null;
  tipo_golpe?: string | null;
};

// Motivos de denuncia, compartidos por el formulario y la API.
export const MOTIVOS_DENUNCIA = [
  { valor: "resultado_falso", etiqueta: "Registra resultados falsos" },
  { valor: "acoso", etiqueta: "Acoso o mensajes ofensivos" },
  { valor: "suplantacion", etiqueta: "Se hace pasar por otra persona" },
  { valor: "contenido", etiqueta: "Contenido inapropiado en el perfil" },
  { valor: "otro", etiqueta: "Otro motivo" },
] as const;

export const DETALLE_DENUNCIA_MAX = 500;

export function esMotivoDenuncia(valor: unknown): boolean {
  return MOTIVOS_DENUNCIA.some((m) => m.valor === valor);
}

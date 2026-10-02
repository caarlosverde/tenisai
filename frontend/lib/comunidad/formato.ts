// Formato de fechas y números de la comunidad (en español).
import { ZONA_HORARIA, diaEnEspana } from "@/lib/comunidad/reglasConvocatoria";

const DIA_SEMANA = new Intl.DateTimeFormat("es-ES", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: ZONA_HORARIA,
});
const HORA = new Intl.DateTimeFormat("es-ES", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: ZONA_HORARIA,
});
const FECHA_LARGA = new Intl.DateTimeFormat("es-ES", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: ZONA_HORARIA,
});

/** Día ("Hoy", "Mañana", "sáb, 4 oct") y hora de un partido, en hora de España. */
export function diaYHora(iso: string): { dia: string; hora: string } {
  const fecha = new Date(iso);
  const hoy = new Date();
  const manana = new Date(hoy.getTime() + 86_400_000);
  const dia =
    diaEnEspana(fecha) === diaEnEspana(hoy)
      ? "Hoy"
      : diaEnEspana(fecha) === diaEnEspana(manana)
        ? "Mañana"
        : DIA_SEMANA.format(fecha);
  return { dia, hora: HORA.format(fecha) };
}

/** Solo la primera letra en mayúscula (el `capitalize` de CSS las pone en todas las palabras). */
export function mayusculaInicial(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** "sábado, 4 de octubre" en hora de España. */
export function fechaLargaEspana(iso: string): string {
  return FECHA_LARGA.format(new Date(iso));
}

const FECHA_CORTA = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** "12 sept 2026". Las fechas de partido se guardan a mediodía UTC: se leen en UTC. */
export function formatearFechaCorta(iso: string | Date): string {
  return FECHA_CORTA.format(typeof iso === "string" ? new Date(iso) : iso);
}

/** Fecha de hoy en formato AAAA-MM-DD según el reloj del navegador. */
export function hoyIso(): string {
  const ahora = new Date();
  const local = new Date(ahora.getTime() - ahora.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

/** "1 partido", "3 partidos". */
export function cantidad(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

export function porcentajeVictorias(victorias: number, partidos: number): string {
  return partidos === 0 ? "—" : `${Math.round((victorias / partidos) * 100)} %`;
}

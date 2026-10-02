"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PUNTOS_INICIALES } from "@/lib/comunidad/elo";
import { formatearFechaCorta } from "@/lib/comunidad/formato";

export type PuntoEvolucion = {
  fecha: string;
  individual?: number;
  dobles?: number;
};

/** Evolución de los puntos tras cada partido confirmado (una línea por modalidad). */
export default function GraficaPuntos({ datos }: { datos: PuntoEvolucion[] }) {
  const hayIndividual = datos.some((d) => d.individual !== undefined);
  const hayDobles = datos.some((d) => d.dobles !== undefined);
  // Punto de partida: todos empiezan con los puntos iniciales
  const serie: PuntoEvolucion[] = [
    {
      fecha: "",
      individual: hayIndividual ? PUNTOS_INICIALES : undefined,
      dobles: hayDobles ? PUNTOS_INICIALES : undefined,
    },
    ...datos,
  ];

  return (
    <div className="h-56 w-full" role="img" aria-label="Gráfica de la evolución de tus puntos">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={serie} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis
            dataKey="fecha"
            tickFormatter={(f: string) => (f ? formatearFechaCorta(f).replace(/ \d{4}$/, "") : "Inicio")}
            stroke="#64748b"
            fontSize={11}
            tickLine={false}
          />
          <YAxis stroke="#64748b" fontSize={11} tickLine={false} domain={["dataMin - 20", "dataMax + 20"]} />
          <Tooltip
            contentStyle={{ background: "#18181b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12 }}
            labelFormatter={(f) => (f ? formatearFechaCorta(String(f)) : "Puntos iniciales")}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {hayIndividual ? (
            <Line
              type="monotone"
              dataKey="individual"
              name="Individual"
              stroke="#67e8f9"
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls
            />
          ) : null}
          {hayDobles ? (
            <Line
              type="monotone"
              dataKey="dobles"
              name="Dobles"
              stroke="#6ee7b7"
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls
            />
          ) : null}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

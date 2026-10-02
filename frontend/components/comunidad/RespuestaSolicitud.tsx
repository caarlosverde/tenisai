"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { flushSync } from "react-dom";
import { Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "@/components/SessionProvider";
import { peticion } from "@/lib/comunidad/cliente";

/** Aceptar o rechazar a un jugador que ha pedido plaza en tu convocatoria. */
export default function RespuestaSolicitud({
  convocatoriaId,
  username,
  nombre,
}: {
  convocatoriaId: string;
  username: string;
  nombre: string;
}) {
  const router = useRouter();
  const { refrescarPendientes } = useSession();
  const [cargando, setCargando] = useState<"aceptar" | "rechazar" | null>(null);

  async function responder(accion: "aceptar" | "rechazar") {
    if (cargando) return;
    flushSync(() => setCargando(accion));
    const respuesta = await peticion<{ estadoConvocatoria: string }>(
      `/api/comunidad/convocatorias/${convocatoriaId}/solicitudes/${encodeURIComponent(username)}`,
      { method: "PATCH", body: { accion } },
    );
    setCargando(null);
    if (!respuesta.ok) {
      toast.error(respuesta.error);
      return;
    }
    toast.success(
      accion === "rechazar"
        ? "Solicitud rechazada"
        : respuesta.data.estadoConvocatoria === "completa"
          ? `${nombre} tiene plaza. ¡Partido completo!`
          : `${nombre} tiene plaza`,
    );
    void refrescarPendientes();
    router.refresh();
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        disabled={cargando !== null}
        onClick={() => void responder("aceptar")}
        aria-label={`Dar plaza a ${nombre}`}
        className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-cyan-300 via-emerald-300 to-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950 transition hover:brightness-105 disabled:cursor-wait disabled:opacity-60"
      >
        {cargando === "aceptar" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" strokeWidth={2.5} />}
        Aceptar
      </button>
      <button
        type="button"
        disabled={cargando !== null}
        onClick={() => void responder("rechazar")}
        aria-label={`Rechazar a ${nombre}`}
        className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white transition hover:bg-white/10 disabled:opacity-60"
      >
        {cargando === "rechazar" ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
        Rechazar
      </button>
    </div>
  );
}

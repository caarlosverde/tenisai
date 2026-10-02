"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { flushSync } from "react-dom";
import { Check, Loader2, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useSession } from "@/components/SessionProvider";
import { peticion } from "@/lib/comunidad/cliente";

type Accion = "confirmar" | "rechazar" | "retirar";

const MENSAJES: Record<Accion, string> = {
  confirmar: "Resultado confirmado: ya cuenta para el ranking",
  rechazar: "Has rechazado el resultado",
  retirar: "Partido retirado",
};

export default function AccionesPartido({
  partidoId,
  puedeResponder,
  puedeRetirar,
}: {
  partidoId: string;
  puedeResponder: boolean;
  puedeRetirar: boolean;
}) {
  const router = useRouter();
  const { refrescarPendientes } = useSession();
  const [cargando, setCargando] = useState<Accion | null>(null);
  const [dialogo, setDialogo] = useState<"rechazar" | "retirar" | null>(null);

  async function ejecutar(accion: Accion) {
    if (cargando) return;
    flushSync(() => setCargando(accion));
    const url = `/api/comunidad/partidos/${partidoId}`;
    const respuesta =
      accion === "retirar"
        ? await peticion(url, { method: "DELETE" })
        : await peticion(url, { method: "PATCH", body: { accion } });
    setCargando(null);
    if (!respuesta.ok) {
      toast.error(respuesta.error);
      return;
    }
    setDialogo(null);
    toast.success(MENSAJES[accion]);
    void refrescarPendientes();
    router.refresh();
  }

  return (
    <>
      {puedeResponder ? (
        <>
          <button
            type="button"
            disabled={cargando !== null}
            onClick={() => setDialogo("rechazar")}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white transition hover:bg-white/10 disabled:opacity-60"
          >
            <X className="h-4 w-4" strokeWidth={2} />
            No es correcto
          </button>
          <button
            type="button"
            disabled={cargando !== null}
            onClick={() => void ejecutar("confirmar")}
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-cyan-300 via-emerald-300 to-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950 transition hover:brightness-105 disabled:cursor-wait disabled:opacity-60"
          >
            {cargando === "confirmar" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" strokeWidth={2.5} />
            )}
            Confirmar resultado
          </button>
        </>
      ) : null}
      {puedeRetirar ? (
        <button
          type="button"
          disabled={cargando !== null}
          onClick={() => setDialogo("retirar")}
          className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm text-slate-400 transition hover:bg-rose-500/10 hover:text-rose-200 disabled:opacity-60"
        >
          <Trash2 className="h-4 w-4" strokeWidth={1.75} />
          Retirar
        </button>
      ) : null}

      <ConfirmDialog
        abierto={dialogo === "rechazar"}
        titulo="¿El resultado no es correcto?"
        textoConfirmar="Rechazar resultado"
        peligroso
        cargando={cargando === "rechazar"}
        onConfirmar={() => void ejecutar("rechazar")}
        onCancelar={() => setDialogo(null)}
      >
        <p>
          El partido no contará para el ranking. Quien lo registró verá que lo has rechazado y
          podrá registrarlo de nuevo con el resultado bueno.
        </p>
      </ConfirmDialog>
      <ConfirmDialog
        abierto={dialogo === "retirar"}
        titulo="¿Retirar este partido?"
        textoConfirmar="Retirar partido"
        peligroso
        cargando={cargando === "retirar"}
        onConfirmar={() => void ejecutar("retirar")}
        onCancelar={() => setDialogo(null)}
      >
        <p>Se borra el partido para todos los jugadores. Como aún no estaba confirmado, no cambia ningún punto.</p>
      </ConfirmDialog>
    </>
  );
}

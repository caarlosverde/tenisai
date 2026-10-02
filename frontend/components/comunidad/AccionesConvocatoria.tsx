"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { CalendarX, ClipboardCheck, Hand, Loader2, LogOut, Undo2 } from "lucide-react";
import { toast } from "sonner";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useSession } from "@/components/SessionProvider";
import { peticion } from "@/lib/comunidad/cliente";
import { MENSAJE_SOLICITUD_MAX } from "@/lib/comunidad/reglasConvocatoria";
import type { ConvocatoriaVista } from "@/lib/comunidad/tipos";
import { AUTH_INPUT_CLASS, FIELD_LABEL_CLASS } from "@/lib/ui";

type Dialogo = "pedir" | "baja" | "cancelar" | null;

const PRINCIPAL =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-300 via-emerald-300 to-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:brightness-105 disabled:cursor-wait disabled:opacity-60";
const SECUNDARIO =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-white transition hover:bg-white/10 disabled:opacity-60";

/** Lo que el usuario puede hacer con una convocatoria según su papel en ella. */
export default function AccionesConvocatoria({ convocatoria: c }: { convocatoria: ConvocatoriaVista }) {
  const router = useRouter();
  const { refrescarPendientes } = useSession();
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const [mensaje, setMensaje] = useState("");
  const [cargando, setCargando] = useState(false);
  const url = `/api/comunidad/convocatorias/${c.id}`;
  const activa = c.estado !== "cancelada" && !c.pasada;

  async function ejecutar(
    peticionUrl: string,
    init: { method: string; body?: unknown },
    exito: string,
  ) {
    if (cargando) return;
    flushSync(() => setCargando(true));
    const respuesta = await peticion(peticionUrl, init);
    setCargando(false);
    if (!respuesta.ok) {
      toast.error(respuesta.error);
      return;
    }
    setDialogo(null);
    setMensaje("");
    toast.success(exito);
    void refrescarPendientes();
    router.refresh();
  }

  const botones: ReactNode[] = [];
  if (c.puedeRegistrarResultado) {
    botones.push(
      <Link key="resultado" href={`/comunidad/partidos/nuevo?convocatoria=${c.id}`} className={PRINCIPAL}>
        <ClipboardCheck className="h-4 w-4" strokeWidth={2} />
        Registrar resultado
      </Link>,
    );
  }
  if (activa && !c.esMia && c.miSolicitud === null && c.estado === "abierta") {
    botones.push(
      <button key="pedir" type="button" onClick={() => setDialogo("pedir")} className={PRINCIPAL}>
        <Hand className="h-4 w-4" strokeWidth={2} />
        Pedir plaza
      </button>,
    );
  }
  if (activa && c.miSolicitud === "pendiente") {
    botones.push(
      <button
        key="retirar"
        type="button"
        disabled={cargando}
        onClick={() => void ejecutar(`${url}/solicitudes`, { method: "DELETE" }, "Solicitud retirada")}
        className={SECUNDARIO}
      >
        {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
        Retirar solicitud
      </button>,
    );
  }
  if (activa && c.miSolicitud === "aceptada") {
    botones.push(
      <button key="baja" type="button" onClick={() => setDialogo("baja")} className={SECUNDARIO}>
        <LogOut className="h-4 w-4" />
        Darme de baja
      </button>,
    );
  }
  if (activa && c.esMia) {
    botones.push(
      <button
        key="cancelar"
        type="button"
        onClick={() => setDialogo("cancelar")}
        className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm text-slate-400 transition hover:bg-rose-500/10 hover:text-rose-200"
      >
        <CalendarX className="h-4 w-4" />
        Cancelar partido
      </button>,
    );
  }

  if (botones.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {botones}

      <ConfirmDialog
        abierto={dialogo === "pedir"}
        titulo="Pedir plaza en este partido"
        textoConfirmar="Enviar solicitud"
        cargando={cargando}
        onConfirmar={() =>
          void ejecutar(`${url}/solicitudes`, { method: "POST", body: { mensaje } }, "Solicitud enviada")
        }
        onCancelar={() => setDialogo(null)}
      >
        <p>{c.creador.nombre} verá tu nombre, tu nivel y tus puntos y decidirá si te da la plaza.</p>
        <label className="mt-4 block">
          <span className={FIELD_LABEL_CLASS}>Mensaje (opcional)</span>
          <textarea
            rows={3}
            value={mensaje}
            maxLength={MENSAJE_SOLICITUD_MAX}
            onChange={(e) => setMensaje(e.target.value)}
            placeholder="Por ejemplo: juego de fondo, nivel intermedio; puedo llevar bolas."
            className={`${AUTH_INPUT_CLASS} resize-none`}
          />
        </label>
      </ConfirmDialog>

      <ConfirmDialog
        abierto={dialogo === "baja"}
        titulo="¿Darte de baja de este partido?"
        textoConfirmar="Darme de baja"
        peligroso
        cargando={cargando}
        onConfirmar={() => void ejecutar(`${url}/solicitudes`, { method: "DELETE" }, "Te has dado de baja")}
        onCancelar={() => setDialogo(null)}
      >
        <p>Tu plaza quedará libre para otro jugador. Avisa a {c.creador.nombre} si puedes.</p>
      </ConfirmDialog>

      <ConfirmDialog
        abierto={dialogo === "cancelar"}
        titulo="¿Cancelar este partido?"
        textoConfirmar="Cancelar partido"
        peligroso
        cargando={cargando}
        onConfirmar={() =>
          void ejecutar(url, { method: "PATCH", body: { accion: "cancelar" } }, "Partido cancelado")
        }
        onCancelar={() => setDialogo(null)}
      >
        <p>Quienes tenían plaza verán que se ha cancelado. No se puede deshacer.</p>
      </ConfirmDialog>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { flushSync } from "react-dom";
import { Check, Clock, Loader2, ShieldOff, UserCheck, UserMinus, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useSession } from "@/components/SessionProvider";
import { peticion } from "@/lib/comunidad/cliente";
import type { EstadoRelacion } from "@/lib/comunidad/tipos";

const BOTON =
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium transition disabled:cursor-wait disabled:opacity-60";
const PRINCIPAL = `${BOTON} bg-gradient-to-r from-cyan-300 via-emerald-300 to-cyan-400 text-slate-950 hover:brightness-105`;
const SECUNDARIO = `${BOTON} border border-white/15 bg-white/5 text-white hover:bg-white/10`;

/**
 * Botón de amistad que cambia según la relación: añadir, solicitud enviada (se puede
 * cancelar), aceptar/rechazar una recibida, amigos (se puede eliminar) o desbloquear.
 */
export default function BotonAmistad({
  username,
  nombre,
  relacion: inicial,
}: {
  username: string;
  nombre: string;
  relacion: EstadoRelacion;
}) {
  const router = useRouter();
  const { refrescarPendientes } = useSession();
  // El cambio local vale hasta que la página se refresca y llega la relación nueva
  const [cambio, setCambio] = useState<{ desde: EstadoRelacion; a: EstadoRelacion } | null>(null);
  const relacion = cambio && cambio.desde === inicial ? cambio.a : inicial;
  const setRelacion = (a: EstadoRelacion) => setCambio({ desde: inicial, a });
  const [cargando, setCargando] = useState(false);
  const [confirmarEliminar, setConfirmarEliminar] = useState(false);

  async function ejecutar(
    url: string,
    method: "POST" | "DELETE",
    exito: (estado: EstadoRelacion) => string,
  ) {
    if (cargando) return;
    flushSync(() => setCargando(true));
    const respuesta = await peticion<{ estado: EstadoRelacion }>(url, { method });
    setCargando(false);
    if (!respuesta.ok) {
      toast.error(respuesta.error);
      return;
    }
    setRelacion(respuesta.data.estado);
    setConfirmarEliminar(false);
    toast.success(exito(respuesta.data.estado));
    void refrescarPendientes();
    router.refresh();
  }

  const amistad = `/api/comunidad/amigos/${encodeURIComponent(username)}`;
  const icono = (Icono: typeof Check) =>
    cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icono className="h-4 w-4" strokeWidth={2} />;

  switch (relacion) {
    case "yo":
    case "te_bloquea":
      return null;

    case "bloqueado":
      return (
        <button
          type="button"
          disabled={cargando}
          onClick={() =>
            void ejecutar(`/api/comunidad/bloqueos/${encodeURIComponent(username)}`, "DELETE", () => `Has desbloqueado a ${nombre}`)
          }
          className={SECUNDARIO}
        >
          {icono(ShieldOff)}
          Desbloquear
        </button>
      );

    case "ninguna":
      return (
        <button
          type="button"
          disabled={cargando}
          onClick={() =>
            void ejecutar(amistad, "POST", (estado) =>
              estado === "amigos" ? `${nombre} y tú ya estáis conectados` : "Solicitud enviada",
            )
          }
          className={PRINCIPAL}
        >
          {icono(UserPlus)}
          Añadir amigo
        </button>
      );

    case "enviada":
      return (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-300">
            <Clock className="h-4 w-4 text-amber-300" strokeWidth={2} />
            Solicitud enviada
          </span>
          <button
            type="button"
            disabled={cargando}
            onClick={() => void ejecutar(amistad, "DELETE", () => "Solicitud cancelada")}
            aria-label={`Cancelar la solicitud a ${nombre}`}
            className={SECUNDARIO}
          >
            {icono(X)}
            Cancelar
          </button>
        </div>
      );

    case "recibida":
      return (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={cargando}
            onClick={() => void ejecutar(amistad, "POST", () => `Solicitud aceptada: ${nombre} y tú ya estáis conectados`)}
            className={PRINCIPAL}
          >
            {icono(Check)}
            Aceptar
          </button>
          <button
            type="button"
            disabled={cargando}
            onClick={() => void ejecutar(amistad, "DELETE", () => "Solicitud rechazada")}
            className={SECUNDARIO}
            aria-label={`Rechazar la solicitud de ${nombre}`}
          >
            <X className="h-4 w-4" strokeWidth={2} />
            Rechazar
          </button>
        </div>
      );

    case "amigos":
      return (
        <>
          <button
            type="button"
            onClick={() => setConfirmarEliminar(true)}
            title="Eliminar de tus amigos"
            className={`${SECUNDARIO} group border-emerald-400/30 text-emerald-100`}
          >
            <UserCheck className="h-4 w-4 group-hover:hidden" strokeWidth={2} />
            <UserMinus className="hidden h-4 w-4 group-hover:block" strokeWidth={2} />
            Amigos
          </button>
          <ConfirmDialog
            abierto={confirmarEliminar}
            titulo={`¿Eliminar a ${nombre} de tus amigos?`}
            textoConfirmar="Eliminar amigo"
            peligroso
            cargando={cargando}
            onConfirmar={() => void ejecutar(amistad, "DELETE", () => "Amigo eliminado")}
            onCancelar={() => setConfirmarEliminar(false)}
          >
            <p>Dejaréis de ver vuestros perfiles privados. Los partidos jugados se conservan.</p>
          </ConfirmDialog>
        </>
      );
  }
}

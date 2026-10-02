"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Ban, Flag, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useSession } from "@/components/SessionProvider";
import { peticion } from "@/lib/comunidad/cliente";
import { DETALLE_DENUNCIA_MAX, MOTIVOS_DENUNCIA } from "@/lib/comunidad/denuncias";
import { AUTH_INPUT_CLASS, FIELD_LABEL_CLASS } from "@/lib/ui";

/** Opciones de seguridad sobre otro jugador: bloquearlo o denunciarlo. */
export default function MenuJugador({
  username,
  nombre,
  bloqueado,
}: {
  username: string;
  nombre: string;
  bloqueado: boolean;
}) {
  const router = useRouter();
  const { refrescarPendientes } = useSession();
  const [abierto, setAbierto] = useState(false);
  const [dialogo, setDialogo] = useState<"bloquear" | "denunciar" | null>(null);
  const [motivo, setMotivo] = useState("");
  const [detalle, setDetalle] = useState("");
  const [cargando, setCargando] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const cerrar = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setAbierto(false);
    };
    const tecla = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAbierto(false);
    };
    document.addEventListener("mousedown", cerrar);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", cerrar);
      document.removeEventListener("keydown", tecla);
    };
  }, [abierto]);

  async function bloquear() {
    if (cargando) return;
    flushSync(() => setCargando(true));
    const respuesta = await peticion(`/api/comunidad/bloqueos/${encodeURIComponent(username)}`, {
      method: "POST",
    });
    setCargando(false);
    if (!respuesta.ok) {
      toast.error(respuesta.error);
      return;
    }
    setDialogo(null);
    toast.success(`Has bloqueado a ${nombre}`);
    void refrescarPendientes();
    router.refresh();
  }

  async function denunciar() {
    if (cargando) return;
    if (!motivo) {
      toast.error("Elige un motivo.");
      return;
    }
    flushSync(() => setCargando(true));
    const respuesta = await peticion("/api/comunidad/denuncias", {
      method: "POST",
      body: { username, motivo, detalle },
    });
    setCargando(false);
    if (!respuesta.ok) {
      toast.error(respuesta.error);
      return;
    }
    setDialogo(null);
    setMotivo("");
    setDetalle("");
    toast.success("Denuncia enviada. Gracias por avisar.");
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label="Más opciones"
        aria-haspopup="menu"
        aria-expanded={abierto}
        onClick={() => setAbierto((a) => !a)}
        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-slate-300 transition hover:bg-white/10 hover:text-white"
      >
        <MoreHorizontal className="h-5 w-5" strokeWidth={1.75} />
      </button>
      {abierto ? (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-2 w-52 rounded-2xl border border-white/10 bg-zinc-900/95 p-1.5 shadow-xl backdrop-blur-md"
        >
          {bloqueado ? null : (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setAbierto(false);
                setDialogo("bloquear");
              }}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm text-slate-200 transition hover:bg-white/10"
            >
              <Ban className="h-4 w-4 text-rose-300" strokeWidth={1.75} />
              Bloquear
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setAbierto(false);
              setDialogo("denunciar");
            }}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm text-slate-200 transition hover:bg-white/10"
          >
            <Flag className="h-4 w-4 text-amber-300" strokeWidth={1.75} />
            Denunciar
          </button>
        </div>
      ) : null}

      <ConfirmDialog
        abierto={dialogo === "bloquear"}
        titulo={`¿Bloquear a ${nombre}?`}
        textoConfirmar="Bloquear"
        peligroso
        cargando={cargando}
        onConfirmar={() => void bloquear()}
        onCancelar={() => setDialogo(null)}
      >
        <p>
          No podréis ver vuestros perfiles, enviaros solicitudes ni apuntaros en partidos, y la
          amistad se elimina si la había. No recibe ningún aviso, y puedes deshacer el
          bloqueo cuando quieras desde Amigos.
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        abierto={dialogo === "denunciar"}
        titulo={`Denunciar a ${nombre}`}
        textoConfirmar="Enviar denuncia"
        cargando={cargando}
        onConfirmar={() => void denunciar()}
        onCancelar={() => setDialogo(null)}
      >
        <p>La revisará quien administra TenisAI. Si además quieres dejar de verlo, bloquéalo.</p>
        <div className="mt-4 space-y-4">
          <label className="block">
            <span className={FIELD_LABEL_CLASS}>Motivo</span>
            <select
              required
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              className={AUTH_INPUT_CLASS}
            >
              <option value="" disabled>
                Elige un motivo
              </option>
              {MOTIVOS_DENUNCIA.map((m) => (
                <option key={m.valor} value={m.valor}>
                  {m.etiqueta}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={FIELD_LABEL_CLASS}>Detalles (opcional)</span>
            <textarea
              value={detalle}
              onChange={(e) => setDetalle(e.target.value)}
              maxLength={DETALLE_DENUNCIA_MAX}
              rows={3}
              className={`${AUTH_INPUT_CLASS} resize-none`}
            />
          </label>
        </div>
      </ConfirmDialog>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { Check, Clock, Dices, Loader2, LogOut, PenLine, X, XCircle } from "lucide-react";
import { toast } from "sonner";
import ConfirmDialog from "@/components/ConfirmDialog";
import SelectorJugador from "@/components/comunidad/SelectorJugador";
import { useSession } from "@/components/SessionProvider";
import { peticion } from "@/lib/comunidad/cliente";
import type { JugadorEncontrado, TorneoVista } from "@/lib/comunidad/tipos";

type Dialogo = "inscribir" | "retirar" | "sortear" | "cancelar" | null;

const PRINCIPAL =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-200 via-amber-300 to-orange-300 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:brightness-105 disabled:cursor-wait disabled:opacity-60";
const SECUNDARIO =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-white transition hover:bg-white/10 disabled:opacity-60";

export default function AccionesTorneo({ torneo: t }: { torneo: TorneoVista }) {
  const router = useRouter();
  const { refrescarPendientes } = useSession();
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const [pareja, setPareja] = useState<JugadorEncontrado | null>(null);
  const [cargando, setCargando] = useState(false);
  const base = `/api/comunidad/torneos/${t.id}`;
  const dobles = t.modalidad === "dobles";

  async function ejecutar(url: string, init: { method: string; body?: unknown }, exito: string) {
    if (cargando) return;
    flushSync(() => setCargando(true));
    const respuesta = await peticion(url, init);
    setCargando(false);
    if (!respuesta.ok) {
      toast.error(respuesta.error);
      return;
    }
    setDialogo(null);
    toast.success(exito);
    void refrescarPendientes();
    router.refresh();
  }

  const botones: ReactNode[] = [];
  const mia = t.miInscripcion;

  if (t.esOrganizador) {
    if (t.estado === "inscripcion") {
      botones.push(
        <button
          key="sortear"
          type="button"
          disabled={t.confirmados < 2}
          title={t.confirmados < 2 ? "Hacen falta al menos dos inscripciones" : undefined}
          onClick={() => setDialogo("sortear")}
          className={PRINCIPAL}
        >
          <Dices className="h-4 w-4" />
          Cerrar inscripción y sortear el cuadro
        </button>,
      );
    }
    if (t.estado === "inscripcion" || t.estado === "en_curso") {
      botones.push(
        <button
          key="cancelar"
          type="button"
          onClick={() => setDialogo("cancelar")}
          className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm text-slate-400 transition hover:bg-rose-500/10 hover:text-rose-200"
        >
          <XCircle className="h-4 w-4" />
          Cancelar torneo
        </button>,
      );
    }
  } else if (!mia && t.inscripcionAbierta) {
    botones.push(
      <button key="inscribir" type="button" onClick={() => setDialogo("inscribir")} className={PRINCIPAL}>
        <PenLine className="h-4 w-4" />
        {dobles ? "Inscribirnos" : "Inscribirme"}
      </button>,
    );
  } else if (mia?.meInvitan && t.estado === "inscripcion") {
    botones.push(
      <button
        key="aceptar"
        type="button"
        disabled={cargando}
        onClick={() =>
          void ejecutar(`${base}/inscripcion`, { method: "PATCH", body: { accion: "aceptar" } }, "¡Ya tenéis plaza en el torneo!")
        }
        className={PRINCIPAL}
      >
        {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        Aceptar y jugar con {mia.pareja?.nombre}
      </button>,
      <button
        key="rechazar"
        type="button"
        disabled={cargando}
        onClick={() =>
          void ejecutar(`${base}/inscripcion`, { method: "PATCH", body: { accion: "rechazar" } }, "Invitación rechazada")
        }
        className={SECUNDARIO}
      >
        <X className="h-4 w-4" />
        Rechazar
      </button>,
    );
  } else if (mia && t.estado === "inscripcion") {
    botones.push(
      <button key="retirar" type="button" onClick={() => setDialogo("retirar")} className={SECUNDARIO}>
        <LogOut className="h-4 w-4" />
        Retirar inscripción
      </button>,
    );
  }

  return (
    <div>
      {mia && !mia.meInvitan && mia.pendiente ? (
        <p className="mb-3 inline-flex items-center gap-2 text-sm text-amber-200">
          <Clock className="h-4 w-4" />
          Esperando a que {mia.pareja?.nombre} acepte jugar contigo.
        </p>
      ) : null}
      {mia && !mia.pendiente ? (
        <p className="mb-3 inline-flex items-center gap-2 text-sm text-emerald-200">
          <Check className="h-4 w-4" />
          {dobles ? `Tenéis plaza: juegas con ${mia.pareja?.nombre}.` : "Tienes plaza en el torneo."}
        </p>
      ) : null}
      {botones.length ? <div className="flex flex-wrap gap-2">{botones}</div> : null}

      <ConfirmDialog
        abierto={dialogo === "inscribir"}
        titulo={dobles ? "Inscribiros en el torneo" : "Inscribirte en el torneo"}
        textoConfirmar={dobles ? "Enviar invitación" : "Inscribirme"}
        cargando={cargando}
        onConfirmar={() => {
          if (dobles && !pareja) {
            toast.error("Elige a tu pareja.");
            return;
          }
          void ejecutar(
            `${base}/inscripcion`,
            { method: "POST", body: dobles ? { companero: pareja?.username } : {} },
            dobles ? "Invitación enviada a tu pareja" : "¡Ya tienes plaza en el torneo!",
          );
        }}
        onCancelar={() => setDialogo(null)}
      >
        <p>
          Tu nombre (con la inicial del apellido) aparecerá en la lista de inscritos y en el cuadro.
          Los resultados del torneo cuentan para el ranking.
        </p>
        {dobles ? (
          <div className="mt-4">
            <SelectorJugador etiqueta="Tu pareja" valor={pareja} onCambio={setPareja} excluir={[]} />
            <p className="mt-2 text-xs text-slate-500">Tu pareja tendrá que aceptar para que la inscripción cuente.</p>
          </div>
        ) : null}
      </ConfirmDialog>

      <ConfirmDialog
        abierto={dialogo === "retirar"}
        titulo="¿Retirar la inscripción?"
        textoConfirmar="Retirar inscripción"
        peligroso
        cargando={cargando}
        onConfirmar={() => void ejecutar(`${base}/inscripcion`, { method: "DELETE" }, "Inscripción retirada")}
        onCancelar={() => setDialogo(null)}
      >
        <p>{dobles ? "Se retira la pareja completa." : "Tu plaza quedará libre."}</p>
      </ConfirmDialog>

      <ConfirmDialog
        abierto={dialogo === "sortear"}
        titulo="¿Cerrar la inscripción y sortear el cuadro?"
        textoConfirmar="Sortear cuadro"
        cargando={cargando}
        onConfirmar={() =>
          void ejecutar(base, { method: "PATCH", body: { accion: "sortear" } }, "Cuadro sorteado: ¡que empiece el torneo!")
        }
        onCancelar={() => setDialogo(null)}
      >
        <p>
          Entran las {t.confirmados} inscripciones confirmadas, con cabezas de serie según sus puntos.
          {dobles ? " Las parejas que no han confirmado quedan fuera." : ""} Ya no se podrán añadir
          jugadores.
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        abierto={dialogo === "cancelar"}
        titulo="¿Cancelar el torneo?"
        textoConfirmar="Cancelar torneo"
        peligroso
        cargando={cargando}
        onConfirmar={() => void ejecutar(base, { method: "PATCH", body: { accion: "cancelar" } }, "Torneo cancelado")}
        onCancelar={() => setDialogo(null)}
      >
        <p>Los inscritos verán que se ha cancelado. Los partidos ya anotados siguen contando en el ranking.</p>
      </ConfirmDialog>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import EntradaSets, { setsEscritos, type FilaSet } from "@/components/comunidad/EntradaSets";
import SelectorJugador from "@/components/comunidad/SelectorJugador";
import { useSession } from "@/components/SessionProvider";
import { peticion } from "@/lib/comunidad/cliente";
import { hoyIso } from "@/lib/comunidad/formato";
import { textoMarcador, validarMarcador } from "@/lib/comunidad/marcador";
import { LUGAR_MAX, MODALIDADES, type Modalidad } from "@/lib/comunidad/perfil";
import type { JugadorEncontrado } from "@/lib/comunidad/tipos";
import {
  AUTH_INPUT_CLASS,
  CARD_CLASS,
  FIELD_LABEL_CLASS,
  FORM_ERROR_CLASS,
  PRIMARY_BUTTON_CLASS,
} from "@/lib/ui";

/** Datos con los que se abre el formulario (desde un perfil o desde una convocatoria jugada). */
export type InicialPartido = {
  modalidad?: Modalidad;
  fecha?: string;
  lugar?: string;
  companero?: JugadorEncontrado | null;
  rival1?: JugadorEncontrado | null;
  rival2?: JugadorEncontrado | null;
  /** Convocatoria de "Buscar partido" cuyo resultado se registra: la modalidad queda fija. */
  convocatoriaId?: string;
};

export default function FormularioPartido({ inicial }: { inicial: InicialPartido }) {
  const router = useRouter();
  const { refrescarPendientes } = useSession();
  const [modalidad, setModalidad] = useState<Modalidad>(inicial.modalidad ?? "individual");
  const [fecha, setFecha] = useState(() => inicial.fecha ?? hoyIso());
  const [lugar, setLugar] = useState(inicial.lugar ?? "");
  const [companero, setCompanero] = useState<JugadorEncontrado | null>(inicial.companero ?? null);
  const [rival1, setRival1] = useState<JugadorEncontrado | null>(inicial.rival1 ?? null);
  const [rival2, setRival2] = useState<JugadorEncontrado | null>(inicial.rival2 ?? null);
  const convocatoriaId = inicial.convocatoriaId;
  const [filas, setFilas] = useState<FilaSet[]>([["", ""], ["", ""]]);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const dobles = modalidad === "dobles";
  const elegidos = [companero, rival1, rival2].flatMap((j) => (j ? [j.username] : []));
  const { sets, incompleto } = setsEscritos(filas);
  const marcador = sets.length > 0 && !incompleto ? validarMarcador(sets) : null;
  const faltanJugadores = !rival1 || (dobles && (!companero || !rival2));

  async function enviar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (enviando) return;
    if (faltanJugadores) {
      setError(dobles ? "Elige a tu compañero y a los dos rivales." : "Elige a tu rival.");
      return;
    }
    if (!marcador?.ok) {
      setError(marcador?.error ?? "Completa el resultado de cada set.");
      return;
    }
    flushSync(() => {
      setEnviando(true);
      setError(null);
    });
    const respuesta = await peticion<{ id: string }>("/api/comunidad/partidos", {
      method: "POST",
      body: {
        modalidad,
        jugadoEn: fecha,
        lugar: lugar.trim() || null,
        companero: dobles ? companero?.username : undefined,
        rivales: dobles ? [rival1?.username, rival2?.username] : [rival1?.username],
        sets: marcador.sets,
        convocatoriaId,
      },
    });
    if (!respuesta.ok) {
      setEnviando(false);
      setError(respuesta.error);
      return;
    }
    toast.success(
      dobles
        ? "Partido registrado. Contará cuando uno de los rivales lo confirme."
        : "Partido registrado. Contará cuando tu rival lo confirme.",
    );
    void refrescarPendientes();
    router.push("/comunidad/partidos");
    router.refresh();
  }

  const nosotros = dobles ? "Vosotros" : "Tú";
  const ellos = dobles ? "Rivales" : "Rival";

  return (
    <form onSubmit={enviar} className={`${CARD_CLASS} space-y-6`} noValidate>
      {error ? (
        <div role="alert" className={FORM_ERROR_CLASS}>
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
          {error}
        </div>
      ) : null}

      <fieldset>
        <legend className={FIELD_LABEL_CLASS}>Modalidad</legend>
        <div className="inline-flex rounded-xl border border-white/10 bg-black/20 p-1">
          {MODALIDADES.map((m) => (
            <label
              key={m.valor}
              className={[
                "cursor-pointer rounded-lg px-4 py-2 text-sm transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-cyan-300",
                modalidad === m.valor ? "bg-white/10 font-medium text-white" : "text-slate-400 hover:text-white",
              ].join(" ")}
            >
              <input
                type="radio"
                name="modalidad"
                value={m.valor}
                checked={modalidad === m.valor}
                disabled={Boolean(convocatoriaId) && modalidad !== m.valor}
                onChange={() => setModalidad(m.valor)}
                className="sr-only"
              />
              {m.etiqueta}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {dobles ? (
          <SelectorJugador
            etiqueta="Tu compañero"
            valor={companero}
            onCambio={setCompanero}
            excluir={elegidos}
            convocatoriaId={convocatoriaId}
          />
        ) : null}
        <SelectorJugador
          etiqueta={dobles ? "Rival 1" : "Rival"}
          valor={rival1}
          onCambio={setRival1}
          excluir={elegidos}
          convocatoriaId={convocatoriaId}
        />
        {dobles ? (
          <SelectorJugador
            etiqueta="Rival 2"
            valor={rival2}
            onCambio={setRival2}
            excluir={elegidos}
            convocatoriaId={convocatoriaId}
          />
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className={FIELD_LABEL_CLASS}>Fecha</span>
          <input
            type="date"
            required
            value={fecha}
            max={hoyIso()}
            onChange={(e) => setFecha(e.target.value)}
            className={AUTH_INPUT_CLASS}
          />
        </label>
        <label className="block">
          <span className={FIELD_LABEL_CLASS}>Lugar (opcional)</span>
          <input
            value={lugar}
            maxLength={LUGAR_MAX}
            onChange={(e) => setLugar(e.target.value)}
            placeholder="Club, polideportivo…"
            className={AUTH_INPUT_CLASS}
          />
        </label>
      </div>

      <fieldset>
        <legend className={FIELD_LABEL_CLASS}>Resultado</legend>
        <EntradaSets
          filas={filas}
          onCambio={setFilas}
          columnas={[nosotros, ellos]}
          etiquetas={[
            (n) => `Set ${n}: ${dobles ? "vuestros juegos" : "tus juegos"}`,
            (n) => `Set ${n}: juegos ${dobles ? "de los rivales" : "del rival"}`,
          ]}
        />
        <div aria-live="polite" className="mt-3 min-h-6 text-sm">
          {marcador?.ok ? (
            <p className="inline-flex items-center gap-2 text-emerald-200">
              <CheckCircle2 className="h-4 w-4" />
              {marcador.ganador === 1
                ? dobles ? "Ganáis" : "Ganas"
                : dobles ? "Perdéis" : "Pierdes"}{" "}
              <span className="font-mono">{textoMarcador(marcador.sets)}</span>
            </p>
          ) : marcador && !marcador.ok ? (
            <p className="text-amber-200">{marcador.error}</p>
          ) : null}
        </div>
      </fieldset>

      <div className="flex flex-col-reverse gap-3 border-t border-white/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-slate-500">
          {dobles ? "Uno de los rivales" : "Tu rival"} tendrá que confirmar el resultado para que
          cuente en el ranking.
        </p>
        <button type="submit" disabled={enviando} className={`${PRIMARY_BUTTON_CLASS} sm:w-auto`}>
          {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {enviando ? "Registrando..." : "Registrar partido"}
        </button>
      </div>
    </form>
  );
}

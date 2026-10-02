"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { AlertCircle, Loader2, Megaphone } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "@/components/SessionProvider";
import { peticion } from "@/lib/comunidad/cliente";
import { hoyIso } from "@/lib/comunidad/formato";
import { LIMITES_PERFIL, LUGAR_MAX, MODALIDADES, NIVELES, type Modalidad } from "@/lib/comunidad/perfil";
import {
  ANTELACION_MAXIMA_DIAS,
  COMENTARIO_MAX,
  plazasPosibles,
  textoPlazas,
  validarConvocatoria,
} from "@/lib/comunidad/reglasConvocatoria";
import {
  AUTH_INPUT_CLASS,
  CARD_CLASS,
  FIELD_LABEL_CLASS,
  FORM_ERROR_CLASS,
  PRIMARY_BUTTON_CLASS,
} from "@/lib/ui";

/** Fecha AAAA-MM-DD dentro de `dias` días, según el reloj del navegador. */
function diaDentroDe(dias: number): string {
  const base = new Date(`${hoyIso()}T12:00:00`);
  base.setDate(base.getDate() + dias);
  const local = new Date(base.getTime() - base.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export default function FormularioConvocatoria({
  ciudadInicial,
}: {
  ciudadInicial: string | null;
}) {
  const router = useRouter();
  const { refrescarPendientes } = useSession();
  const [modalidad, setModalidad] = useState<Modalidad>("individual");
  const [plazas, setPlazas] = useState(1);
  const [dia, setDia] = useState(() => diaDentroDe(1));
  const [hora, setHora] = useState("18:00");
  const [lugar, setLugar] = useState("");
  const [ciudad, setCiudad] = useState(ciudadInicial ?? "");
  const [nivel, setNivel] = useState("");
  const [comentario, setComentario] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  function cambiarModalidad(nueva: Modalidad) {
    setModalidad(nueva);
    // En dobles lo normal es que falten 3 (vas solo); en individual, siempre 1
    setPlazas(nueva === "dobles" ? 3 : 1);
  }

  async function publicar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (enviando) return;
    // La hora la escribe el usuario en la suya; se envía como instante exacto
    const fechaHora = new Date(`${dia}T${hora}`);
    const datos = {
      modalidad,
      plazas,
      fechaHora: Number.isNaN(fechaHora.getTime()) ? "" : fechaHora.toISOString(),
      lugar,
      ciudad,
      nivel: nivel || null,
      comentario,
    };
    const validacion = validarConvocatoria(datos);
    if (!validacion.ok) {
      setError(validacion.error);
      return;
    }
    flushSync(() => {
      setEnviando(true);
      setError(null);
    });
    const respuesta = await peticion<{ id: string }>("/api/comunidad/convocatorias", {
      method: "POST",
      body: datos,
    });
    if (!respuesta.ok) {
      setEnviando(false);
      setError(respuesta.error);
      return;
    }
    toast.success("Partido publicado. Te avisaremos cuando alguien pida plaza.");
    void refrescarPendientes();
    router.push(`/comunidad/convocatorias/${respuesta.data.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={publicar} className={`${CARD_CLASS} space-y-6`} noValidate>
      {error ? (
        <div role="alert" className={FORM_ERROR_CLASS}>
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-6">
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
                  onChange={() => cambiarModalidad(m.valor)}
                  className="sr-only"
                />
                {m.etiqueta}
              </label>
            ))}
          </div>
        </fieldset>

        {modalidad === "dobles" ? (
          <fieldset>
            <legend className={FIELD_LABEL_CLASS}>¿Cuántos jugadores te faltan?</legend>
            <div className="inline-flex rounded-xl border border-white/10 bg-black/20 p-1">
              {plazasPosibles("dobles").map((n) => (
                <label
                  key={n}
                  className={[
                    "cursor-pointer rounded-lg px-4 py-2 text-sm transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-cyan-300",
                    plazas === n ? "bg-white/10 font-medium text-white" : "text-slate-400 hover:text-white",
                  ].join(" ")}
                >
                  <input
                    type="radio"
                    name="plazas"
                    value={n}
                    checked={plazas === n}
                    onChange={() => setPlazas(n)}
                    className="sr-only"
                  />
                  {n}
                </label>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-slate-500">
              {plazas === 3 ? "Vas solo: buscas pareja y dos rivales." : textoPlazas(plazas)}
            </p>
          </fieldset>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <label className="block">
          <span className={FIELD_LABEL_CLASS}>Día</span>
          <input
            type="date"
            required
            value={dia}
            min={hoyIso()}
            max={diaDentroDe(ANTELACION_MAXIMA_DIAS)}
            onChange={(e) => setDia(e.target.value)}
            className={AUTH_INPUT_CLASS}
          />
        </label>
        <label className="block">
          <span className={FIELD_LABEL_CLASS}>Hora</span>
          <input
            type="time"
            required
            step={900}
            value={hora}
            onChange={(e) => setHora(e.target.value)}
            className={AUTH_INPUT_CLASS}
          />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className={FIELD_LABEL_CLASS}>Lugar</span>
          <input
            required
            value={lugar}
            maxLength={LUGAR_MAX}
            onChange={(e) => setLugar(e.target.value)}
            placeholder="Club, polideportivo, pista…"
            className={AUTH_INPUT_CLASS}
          />
        </label>
        <label className="block">
          <span className={FIELD_LABEL_CLASS}>Ciudad</span>
          <input
            required
            value={ciudad}
            maxLength={LIMITES_PERFIL.ciudad}
            onChange={(e) => setCiudad(e.target.value)}
            autoComplete="address-level2"
            className={AUTH_INPUT_CLASS}
          />
        </label>
        <label className="block">
          <span className={FIELD_LABEL_CLASS}>Nivel que buscas</span>
          <select value={nivel} onChange={(e) => setNivel(e.target.value)} className={AUTH_INPUT_CLASS}>
            <option value="">Cualquier nivel</option>
            {NIVELES.map((n) => (
              <option key={n.valor} value={n.valor}>
                {n.etiqueta}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block">
        <span className={FIELD_LABEL_CLASS}>Comentario (opcional)</span>
        <textarea
          rows={3}
          value={comentario}
          maxLength={COMENTARIO_MAX}
          onChange={(e) => setComentario(e.target.value)}
          placeholder="Pista reservada, cómo os repartís el alquiler, si llevas bolas…"
          className={`${AUTH_INPUT_CLASS} resize-none`}
        />
      </label>

      <div className="flex flex-col-reverse gap-3 border-t border-white/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-slate-500">
          Lo verán tus amigos y, si tu perfil es público, cualquier jugador. Tú decides a quién das
          plaza.
        </p>
        <button type="submit" disabled={enviando} className={`${PRIMARY_BUTTON_CLASS} sm:w-auto`}>
          {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Megaphone className="h-4 w-4" />}
          {enviando ? "Publicando..." : "Publicar partido"}
        </button>
      </div>
    </form>
  );
}

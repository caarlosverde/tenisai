"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { AlertCircle, Loader2, Medal } from "lucide-react";
import { toast } from "sonner";
import { peticion } from "@/lib/comunidad/cliente";
import { hoyIso } from "@/lib/comunidad/formato";
import { LIMITES_PERFIL, LUGAR_MAX, MODALIDADES, NIVELES, type Modalidad } from "@/lib/comunidad/perfil";
import {
  DESCRIPCION_TORNEO_MAX,
  NOMBRE_TORNEO_MAX,
  PLAZAS_TORNEO,
  validarTorneo,
} from "@/lib/comunidad/reglasTorneo";
import {
  AUTH_INPUT_CLASS,
  CARD_CLASS,
  FIELD_LABEL_CLASS,
  FORM_ERROR_CLASS,
  PRIMARY_BUTTON_CLASS,
} from "@/lib/ui";

/** Fecha AAAA-MM-DD a `dias` días de `desde` (también AAAA-MM-DD). */
function sumarDias(desde: string, dias: number): string {
  const fecha = new Date(`${desde}T12:00:00Z`);
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return fecha.toISOString().slice(0, 10);
}

function Opciones<T extends string | number>({
  leyenda,
  nombre,
  opciones,
  valor,
  onCambio,
}: {
  leyenda: string;
  nombre: string;
  opciones: { valor: T; etiqueta: string }[];
  valor: T;
  onCambio: (v: T) => void;
}) {
  return (
    <fieldset>
      <legend className={FIELD_LABEL_CLASS}>{leyenda}</legend>
      <div className="inline-flex rounded-xl border border-white/10 bg-black/20 p-1">
        {opciones.map((o) => (
          <label
            key={String(o.valor)}
            className={[
              "cursor-pointer rounded-lg px-4 py-2 text-sm transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-cyan-300",
              valor === o.valor ? "bg-white/10 font-medium text-white" : "text-slate-400 hover:text-white",
            ].join(" ")}
          >
            <input
              type="radio"
              name={nombre}
              checked={valor === o.valor}
              onChange={() => onCambio(o.valor)}
              className="sr-only"
            />
            {o.etiqueta}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default function FormularioTorneo({ ciudadInicial }: { ciudadInicial: string | null }) {
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [modalidad, setModalidad] = useState<Modalidad>("individual");
  const [plazas, setPlazas] = useState<number>(8);
  const [lugar, setLugar] = useState("");
  const [ciudad, setCiudad] = useState(ciudadInicial ?? "");
  const [nivel, setNivel] = useState("");
  const [inicio, setInicio] = useState(() => sumarDias(hoyIso(), 14));
  const [cierreDia, setCierreDia] = useState(() => sumarDias(hoyIso(), 12));
  const [cierreHora, setCierreHora] = useState("22:00");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function crear(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (enviando) return;
    const cierre = new Date(`${cierreDia}T${cierreHora}`);
    const datos = {
      nombre,
      descripcion,
      modalidad,
      plazas,
      lugar,
      ciudad,
      nivel: nivel || null,
      inicio,
      cierreInscripcion: Number.isNaN(cierre.getTime()) ? "" : cierre.toISOString(),
    };
    const validacion = validarTorneo(datos);
    if (!validacion.ok) {
      setError(validacion.error);
      return;
    }
    flushSync(() => {
      setEnviando(true);
      setError(null);
    });
    const respuesta = await peticion<{ id: string }>("/api/comunidad/torneos", { method: "POST", body: datos });
    if (!respuesta.ok) {
      setEnviando(false);
      setError(respuesta.error);
      return;
    }
    toast.success("Torneo creado. Ya se pueden inscribir los jugadores.");
    router.push(`/comunidad/torneos/${respuesta.data.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={crear} className={`${CARD_CLASS} space-y-6`} noValidate>
      {error ? (
        <div role="alert" className={FORM_ERROR_CLASS}>
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
          {error}
        </div>
      ) : null}

      <label className="block">
        <span className={FIELD_LABEL_CLASS}>Nombre del torneo</span>
        <input
          required
          value={nombre}
          maxLength={NOMBRE_TORNEO_MAX}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Open de otoño, Liga de primavera…"
          className={AUTH_INPUT_CLASS}
        />
      </label>

      <div className="flex flex-wrap gap-6">
        <Opciones
          leyenda="Modalidad"
          nombre="modalidad"
          opciones={MODALIDADES.map((m) => ({ valor: m.valor, etiqueta: m.etiqueta }))}
          valor={modalidad}
          onCambio={setModalidad}
        />
        <Opciones
          leyenda={modalidad === "dobles" ? "Parejas como máximo" : "Jugadores como máximo"}
          nombre="plazas"
          opciones={PLAZAS_TORNEO.map((p) => ({ valor: p, etiqueta: String(p) }))}
          valor={plazas}
          onCambio={setPlazas}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label className="block">
          <span className={FIELD_LABEL_CLASS}>Empieza el</span>
          <input type="date" required value={inicio} min={hoyIso()} onChange={(e) => setInicio(e.target.value)} className={AUTH_INPUT_CLASS} />
        </label>
        <label className="block">
          <span className={FIELD_LABEL_CLASS}>Inscripción hasta el</span>
          <input
            type="date"
            required
            value={cierreDia}
            min={hoyIso()}
            max={inicio}
            onChange={(e) => setCierreDia(e.target.value)}
            className={AUTH_INPUT_CLASS}
          />
        </label>
        <label className="block">
          <span className={FIELD_LABEL_CLASS}>A las</span>
          <input type="time" required value={cierreHora} step={900} onChange={(e) => setCierreHora(e.target.value)} className={AUTH_INPUT_CLASS} />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className={FIELD_LABEL_CLASS}>Lugar</span>
          <input required value={lugar} maxLength={LUGAR_MAX} onChange={(e) => setLugar(e.target.value)} placeholder="Club, polideportivo…" className={AUTH_INPUT_CLASS} />
        </label>
        <label className="block">
          <span className={FIELD_LABEL_CLASS}>Ciudad</span>
          <input required value={ciudad} maxLength={LIMITES_PERFIL.ciudad} onChange={(e) => setCiudad(e.target.value)} className={AUTH_INPUT_CLASS} />
        </label>
        <label className="block">
          <span className={FIELD_LABEL_CLASS}>Nivel</span>
          <select value={nivel} onChange={(e) => setNivel(e.target.value)} className={AUTH_INPUT_CLASS}>
            <option value="">Abierto a todos los niveles</option>
            {NIVELES.map((n) => (
              <option key={n.valor} value={n.valor}>
                {n.etiqueta}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block">
        <span className={FIELD_LABEL_CLASS}>Información para los jugadores (opcional)</span>
        <textarea
          rows={4}
          value={descripcion}
          maxLength={DESCRIPCION_TORNEO_MAX}
          onChange={(e) => setDescripcion(e.target.value)}
          placeholder="Formato de los partidos, precio de la inscripción, premios, bolas…"
          className={`${AUTH_INPUT_CLASS} resize-y`}
        />
      </label>

      <div className="flex flex-col-reverse gap-3 border-t border-white/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-slate-500">
          Eliminatoria directa. Al cerrar la inscripción sorteas el cuadro con cabezas de serie por
          puntos, y después anotas los resultados.
        </p>
        <button type="submit" disabled={enviando} className={`${PRIMARY_BUTTON_CLASS} sm:w-auto`}>
          {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Medal className="h-4 w-4" />}
          {enviando ? "Creando..." : "Crear torneo"}
        </button>
      </div>
    </form>
  );
}

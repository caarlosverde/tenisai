"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { AlertCircle, Eye, EyeOff, Loader2, Trophy } from "lucide-react";
import { toast } from "sonner";
import type { ProfileUser } from "@/components/perfil/tipos";
import { LIMITES_PERFIL, NIVELES } from "@/lib/comunidad/perfil";
import {
  AUTH_INPUT_CLASS,
  CARD_CLASS,
  FIELD_LABEL_CLASS,
  FORM_ERROR_CLASS,
  PRIMARY_BUTTON_CLASS,
} from "@/lib/ui";

type Form = {
  perfilPublico: boolean;
  ciudad: string;
  club: string;
  nivel: string;
  disponibilidad: string;
  bio: string;
};

/** Datos que ven otros jugadores en la comunidad y si el perfil es público. */
export default function PerfilJugadorForm({
  user,
  onGuardado,
}: {
  user: ProfileUser;
  onGuardado: (u: ProfileUser) => void;
}) {
  const [form, setForm] = useState<Form>({
    perfilPublico: user.perfilPublico ?? false,
    ciudad: user.ciudad ?? "",
    club: user.club ?? "",
    nivel: user.nivel ?? "",
    disponibilidad: user.disponibilidad ?? "",
    bio: user.bio ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  function campo(nombre: Exclude<keyof Form, "perfilPublico">) {
    return {
      value: form[nombre],
      onChange: (e: { target: { value: string } }) =>
        setForm((prev) => ({ ...prev, [nombre]: e.target.value })),
    };
  }

  async function guardar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (guardando) return;
    flushSync(() => {
      setGuardando(true);
      setError(null);
    });
    try {
      const response = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string; user?: ProfileUser };
      if (!response.ok || !data.user) {
        setError(data.error ?? "No se pudo guardar el perfil.");
        return;
      }
      onGuardado(data.user);
      toast.success("Perfil de jugador actualizado");
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section id="perfil-jugador" className={`${CARD_CLASS} scroll-mt-24`} aria-labelledby="perfil-jugador-titulo">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-400/10 text-emerald-300">
          <Trophy className="h-5 w-5" strokeWidth={1.75} />
        </div>
        <div>
          <h2 id="perfil-jugador-titulo" className="font-display text-lg font-semibold text-white">
            Perfil de jugador
          </h2>
          <p className="text-xs text-slate-400">
            Lo que ven otros jugadores en la{" "}
            <Link href="/comunidad" className="text-cyan-300 hover:underline">
              comunidad
            </Link>
            . Tu edad, altura y peso nunca se muestran.
          </p>
        </div>
      </div>

      <form onSubmit={guardar}>
        {error ? (
          <div role="alert" className={FORM_ERROR_CLASS}>
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
            {error}
          </div>
        ) : null}

        <fieldset className="mb-5">
          <legend className={FIELD_LABEL_CLASS}>Visibilidad</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[
              {
                valor: false,
                titulo: "Privado",
                icono: EyeOff,
                texto: "Solo tus amigos ven tu perfil y tus partidos. No apareces en el ranking general ni en las búsquedas (salvo por tu usuario exacto).",
              },
              {
                valor: true,
                titulo: "Público",
                icono: Eye,
                texto: "Cualquier usuario registrado puede encontrarte, ver tu perfil y tus partidos, y apuntarte en un partido. Apareces en el ranking.",
              },
            ].map(({ valor, titulo, icono: Icono, texto }) => (
              <label
                key={titulo}
                className={[
                  "flex cursor-pointer gap-3 rounded-2xl border p-4 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-cyan-300",
                  form.perfilPublico === valor
                    ? "border-cyan-400/50 bg-cyan-400/[0.07]"
                    : "border-white/10 bg-black/20 hover:border-white/20",
                ].join(" ")}
              >
                <input
                  type="radio"
                  name="perfilPublico"
                  checked={form.perfilPublico === valor}
                  onChange={() => setForm((prev) => ({ ...prev, perfilPublico: valor }))}
                  className="sr-only"
                />
                <Icono className="mt-0.5 h-5 w-5 shrink-0 text-cyan-300" strokeWidth={1.75} />
                <span>
                  <span className="block font-medium text-white">{titulo}</span>
                  <span className="mt-1 block text-xs leading-relaxed text-slate-400">{texto}</span>
                </span>
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Con el perfil público, quien no es tu amigo ve tu nombre con la inicial del apellido.
          </p>
        </fieldset>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={FIELD_LABEL_CLASS}>Ciudad</span>
            <input
              maxLength={LIMITES_PERFIL.ciudad}
              autoComplete="address-level2"
              placeholder="Para el ranking de tu ciudad"
              className={AUTH_INPUT_CLASS}
              {...campo("ciudad")}
            />
          </label>
          <label className="block">
            <span className={FIELD_LABEL_CLASS}>Club</span>
            <input maxLength={LIMITES_PERFIL.club} placeholder="Opcional" className={AUTH_INPUT_CLASS} {...campo("club")} />
          </label>
          <label className="block">
            <span className={FIELD_LABEL_CLASS}>Nivel</span>
            <select className={AUTH_INPUT_CLASS} {...campo("nivel")}>
              <option value="">Sin indicar</option>
              {NIVELES.map((n) => (
                <option key={n.valor} value={n.valor}>
                  {n.etiqueta}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={FIELD_LABEL_CLASS}>Cuándo sueles jugar</span>
            <input
              maxLength={LIMITES_PERFIL.disponibilidad}
              placeholder="Tardes entre semana, sábados por la mañana…"
              className={AUTH_INPUT_CLASS}
              {...campo("disponibilidad")}
            />
          </label>
        </div>
        <label className="mt-4 block">
          <span className={FIELD_LABEL_CLASS}>Presentación</span>
          <textarea
            rows={3}
            maxLength={LIMITES_PERFIL.bio}
            placeholder="Cuéntales a otros jugadores cómo juegas o qué buscas."
            className={`${AUTH_INPUT_CLASS} resize-none`}
            {...campo("bio")}
          />
          <span className="mt-1 block text-right text-xs text-slate-400">
            {form.bio.length}/{LIMITES_PERFIL.bio}
          </span>
        </label>

        <button type="submit" disabled={guardando} className={`mt-4 ${PRIMARY_BUTTON_CLASS} sm:w-auto`}>
          {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {guardando ? "Guardando..." : "Guardar perfil de jugador"}
        </button>
      </form>
    </section>
  );
}

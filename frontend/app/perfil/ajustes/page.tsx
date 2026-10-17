"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import {
  AlertCircle,
  ArrowLeft,
  Download,
  KeyRound,
  Loader2,
  ShieldAlert,
  Trash2,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import ConfirmDialog from "@/components/ConfirmDialog";
import PasswordInput from "@/components/PasswordInput";
import PerfilJugadorForm from "@/components/perfil/PerfilJugadorForm";
import { useSession } from "@/components/SessionProvider";
import type { ProfileUser } from "@/components/perfil/tipos";
import {
  AUTH_INPUT_CLASS,
  CARD_CLASS,
  FIELD_LABEL_CLASS,
  FORM_ERROR_CLASS,
  PAGE_BACKGROUND_CLASS,
  PRIMARY_BUTTON_CLASS,
} from "@/lib/ui";
import { PASSWORD_MIN_LENGTH, RANGOS } from "@/lib/validacionPerfil";

type DatosForm = {
  nombre: string;
  apellidos: string;
  edad: string;
  altura: string;
  peso: string;
};

function ErrorFormulario({ mensaje }: { mensaje: string | null }) {
  if (!mensaje) return null;
  return (
    <div role="alert" className={FORM_ERROR_CLASS}>
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
      {mensaje}
    </div>
  );
}

function CabeceraSeccion({
  icono: Icono,
  titulo,
  descripcion,
  id,
  peligro = false,
}: {
  icono: typeof UserRound;
  titulo: string;
  descripcion: string;
  id: string;
  peligro?: boolean;
}) {
  return (
    <div className="mb-5 flex items-center gap-3">
      <div
        className={[
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border",
          peligro
            ? "border-rose-400/25 bg-rose-500/10 text-rose-200"
            : "border-cyan-400/20 bg-cyan-400/10 text-cyan-300",
        ].join(" ")}
      >
        <Icono className="h-5 w-5" strokeWidth={1.75} />
      </div>
      <div>
        <h2 id={id} className="font-display text-lg font-semibold text-white">
          {titulo}
        </h2>
        <p className="text-xs text-slate-400">{descripcion}</p>
      </div>
    </div>
  );
}

function DatosPersonales({ user, onGuardado }: { user: ProfileUser; onGuardado: (u: ProfileUser) => void }) {
  const [form, setForm] = useState<DatosForm>({
    nombre: user.nombre,
    apellidos: user.apellidos,
    edad: String(user.edad),
    altura: String(user.altura),
    peso: String(user.peso),
  });
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  function campo(nombre: keyof DatosForm) {
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
        body: JSON.stringify({
          nombre: form.nombre,
          apellidos: form.apellidos,
          edad: Number(form.edad),
          altura: Number(form.altura),
          peso: Number(form.peso),
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string; user?: ProfileUser };
      if (!response.ok || !data.user) {
        setError(data.error ?? "No se pudieron guardar los cambios.");
        return;
      }
      onGuardado(data.user);
      toast.success("Datos actualizados");
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className={CARD_CLASS} aria-labelledby="datos-personales">
      <CabeceraSeccion
        id="datos-personales"
        icono={UserRound}
        titulo="Datos personales"
        descripcion="Se usan para personalizar el análisis biomecánico."
      />
      <form onSubmit={guardar}>
        <ErrorFormulario mensaje={error} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={FIELD_LABEL_CLASS}>Nombre</span>
            <input required autoComplete="given-name" maxLength={80} className={AUTH_INPUT_CLASS} {...campo("nombre")} />
          </label>
          <label className="block">
            <span className={FIELD_LABEL_CLASS}>Apellidos</span>
            <input required autoComplete="family-name" maxLength={80} className={AUTH_INPUT_CLASS} {...campo("apellidos")} />
          </label>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3">
          <label className="block">
            <span className={FIELD_LABEL_CLASS}>Edad</span>
            <input required type="number" inputMode="numeric" min={RANGOS.edad.min} max={RANGOS.edad.max} className={AUTH_INPUT_CLASS} {...campo("edad")} />
          </label>
          <label className="block">
            <span className={FIELD_LABEL_CLASS}>Altura (cm)</span>
            <input required type="number" inputMode="decimal" step="0.1" min={RANGOS.altura.min} max={RANGOS.altura.max} className={AUTH_INPUT_CLASS} {...campo("altura")} />
          </label>
          <label className="block">
            <span className={FIELD_LABEL_CLASS}>Peso (kg)</span>
            <input required type="number" inputMode="decimal" step="0.1" min={RANGOS.peso.min} max={RANGOS.peso.max} className={AUTH_INPUT_CLASS} {...campo("peso")} />
          </label>
        </div>
        <button type="submit" disabled={guardando} className={`mt-6 ${PRIMARY_BUTTON_CLASS} sm:w-auto`}>
          {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {guardando ? "Guardando..." : "Guardar cambios"}
        </button>
      </form>
    </section>
  );
}

function CambiarPassword() {
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [repetida, setRepetida] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function cambiar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (guardando) return;
    if (nueva !== repetida) {
      setError("Las contraseñas nuevas no coinciden.");
      return;
    }
    flushSync(() => {
      setGuardando(true);
      setError(null);
    });
    try {
      const response = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actual, nueva }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "No se pudo cambiar la contraseña.");
        return;
      }
      setActual("");
      setNueva("");
      setRepetida("");
      toast.success("Contraseña actualizada");
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className={CARD_CLASS} aria-labelledby="cambiar-password">
      <CabeceraSeccion
        id="cambiar-password"
        icono={KeyRound}
        titulo="Contraseña"
        descripcion={`Mínimo ${PASSWORD_MIN_LENGTH} caracteres.`}
      />
      <form onSubmit={cambiar}>
        <ErrorFormulario mensaje={error} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <label className="block">
            <span className={FIELD_LABEL_CLASS}>Actual</span>
            <PasswordInput required autoComplete="current-password" value={actual} onChange={(e) => setActual(e.target.value)} />
          </label>
          <label className="block">
            <span className={FIELD_LABEL_CLASS}>Nueva</span>
            <PasswordInput required minLength={PASSWORD_MIN_LENGTH} autoComplete="new-password" value={nueva} onChange={(e) => setNueva(e.target.value)} />
          </label>
          <label className="block">
            <span className={FIELD_LABEL_CLASS}>Repite la nueva</span>
            <PasswordInput required minLength={PASSWORD_MIN_LENGTH} autoComplete="new-password" value={repetida} onChange={(e) => setRepetida(e.target.value)} />
          </label>
        </div>
        <button type="submit" disabled={guardando} className={`mt-6 ${PRIMARY_BUTTON_CLASS} sm:w-auto`}>
          {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {guardando ? "Cambiando..." : "Cambiar contraseña"}
        </button>
      </form>
    </section>
  );
}

function BorrarCuenta() {
  const router = useRouter();
  const { setUser } = useSession();
  const [abierto, setAbierto] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [borrando, setBorrando] = useState(false);

  async function borrar() {
    if (borrando) return;
    flushSync(() => {
      setBorrando(true);
      setError(null);
    });
    try {
      const response = await fetch("/api/auth/me", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "No se pudo borrar la cuenta.");
        return;
      }
      setUser(null);
      toast.success("Tu cuenta y todos tus datos se han borrado");
      router.replace("/");
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setBorrando(false);
    }
  }

  return (
    <section className={`${CARD_CLASS} border-rose-400/20`} aria-labelledby="borrar-cuenta">
      <CabeceraSeccion
        id="borrar-cuenta"
        icono={ShieldAlert}
        titulo="Borrar la cuenta"
        descripcion="Elimina tu cuenta, tus análisis y sus vídeos. No se puede deshacer."
        peligro
      />
      <button
        type="button"
        onClick={() => {
          setPassword("");
          setError(null);
          setAbierto(true);
        }}
        className="inline-flex items-center gap-2 rounded-xl border border-rose-400/40 bg-rose-500/10 px-4 py-2.5 text-sm font-medium text-rose-100 transition hover:bg-rose-500/20"
      >
        <Trash2 className="h-4 w-4" strokeWidth={1.75} />
        Borrar mi cuenta
      </button>

      <ConfirmDialog
        abierto={abierto}
        titulo="¿Borrar tu cuenta definitivamente?"
        textoConfirmar="Borrar cuenta"
        peligroso
        cargando={borrando}
        onConfirmar={() => void borrar()}
        onCancelar={() => setAbierto(false)}
      >
        <p>
          Se borrarán tu perfil, todos tus análisis y sus vídeos, tus amistades y los partidos
          sin confirmar. Los partidos ya confirmados seguirán en el historial de tus rivales como
          «Cuenta eliminada». Escribe tu contraseña para confirmarlo.
        </p>
        <div className="mt-4">
          <ErrorFormulario mensaje={error} />
          <label className="block">
            <span className={FIELD_LABEL_CLASS}>Contraseña</span>
            <PasswordInput
              required
              autoFocus
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
        </div>
      </ConfirmDialog>
    </section>
  );
}

export default function AjustesPage() {
  const router = useRouter();
  const { setUser: setSessionUser } = useSession();
  const [user, setUser] = useState<ProfileUser | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function cargar() {
      try {
        const response = await fetch("/api/auth/me", { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = (await response.json()) as { user?: ProfileUser | null };
        if (!data.user) {
          router.replace("/login?next=/perfil/ajustes");
          return;
        }
        if (!cancelled) setUser(data.user);
      } catch {
        if (!cancelled) setLoadError(true);
      }
    }
    void cargar();
    return () => {
      cancelled = true;
    };
  }, [router]);

  function actualizarUsuario(nuevo: ProfileUser) {
    setUser(nuevo);
    // La barra de navegación muestra el nombre: se actualiza también la sesión
    setSessionUser({ id: nuevo.id, username: nuevo.username, nombre: nuevo.nombre });
  }

  return (
    <div className="relative min-h-[calc(100vh-4rem)] overflow-hidden text-white">
      <div className={PAGE_BACKGROUND_CLASS} />
      <div className="relative z-10 mx-auto max-w-3xl px-4 pb-16 pt-8 sm:px-6 md:pt-10">
        <Link
          href="/perfil"
          className="-ml-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
          Mis análisis
        </Link>
        <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-white via-cyan-100 to-emerald-300 sm:text-4xl">
          Ajustes de la cuenta
        </h1>
        {user ? (
          <p className="mt-2 text-sm text-slate-400">@{user.username}</p>
        ) : null}

        {loadError ? (
          <p role="alert" className="mt-8 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            No se pudieron cargar tus datos. Recarga la página para reintentarlo.
          </p>
        ) : !user ? (
          <div role="status" className="mt-8 flex items-center gap-2 text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin text-cyan-300" />
            Cargando...
          </div>
        ) : (
          <div className="mt-8 space-y-6">
            <DatosPersonales user={user} onGuardado={actualizarUsuario} />
            <PerfilJugadorForm user={user} onGuardado={actualizarUsuario} />
            <CambiarPassword />
            <section className={CARD_CLASS} aria-labelledby="tus-datos">
              <CabeceraSeccion
                id="tus-datos"
                icono={Download}
                titulo="Tus datos"
                descripcion="Descarga una copia de tu perfil, tus análisis y tu actividad en la comunidad (JSON)."
              />
              <a
                href="/api/auth/me/exportar"
                download
                className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-white transition hover:bg-white/10"
              >
                <Download className="h-4 w-4" strokeWidth={1.75} />
                Descargar mis datos
              </a>
              <p className="mt-3 text-xs text-slate-400">
                Más información en la{" "}
                <Link href="/privacidad" className="text-cyan-300 underline-offset-4 hover:underline">
                  política de privacidad
                </Link>
                .
              </p>
            </section>
            <BorrarCuenta />
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { AlertCircle, Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import AuthShell from "@/components/AuthShell";
import PasswordInput from "@/components/PasswordInput";
import { safeNextPath, useSession, type SessionUser } from "@/components/SessionProvider";
import {
  AUTH_CARD_CLASS,
  AUTH_INPUT_CLASS,
  FIELD_LABEL_CLASS,
  FORM_ERROR_CLASS,
  PRIMARY_BUTTON_CLASS,
} from "@/lib/ui";
import { EDAD_MINIMA, PASSWORD_MIN_LENGTH, RANGOS } from "@/lib/validacionPerfil";

type FormState = {
  username: string;
  password: string;
  nombre: string;
  apellidos: string;
  edad: string;
  altura: string;
  peso: string;
};

const INITIAL_FORM: FormState = {
  username: "",
  password: "",
  nombre: "",
  apellidos: "",
  edad: "",
  altura: "",
  peso: "",
};

const SECTION_TITLE_CLASS =
  "mb-3 text-sm font-semibold text-slate-200 sm:col-span-2";

function RegistroForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = safeNextPath(searchParams.get("next"));
  const { setUser } = useSession();
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [aceptaPrivacidad, setAceptaPrivacidad] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    flushSync(() => {
      setIsSubmitting(true);
      setError(null);
    });

    try {
      const response = await fetch("/api/auth/registro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          username: form.username.trim(),
          password: form.password,
          nombre: form.nombre,
          apellidos: form.apellidos,
          edad: Number(form.edad),
          altura: Number(form.altura),
          peso: Number(form.peso),
          aceptaPrivacidad,
        }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        user?: SessionUser;
      };

      if (!response.ok || !data.user) {
        setError(data.error ?? `Error HTTP ${response.status}`);
        return;
      }

      // El registro deja la sesión iniciada: no hace falta volver a escribir la contraseña
      setUser(data.user);
      toast.success(`Cuenta creada. ¡Bienvenido/a, ${data.user.nombre}!`);
      router.replace(nextPath);
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor de registro.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const loginHref =
    nextPath === "/" ? "/login" : `/login?next=${encodeURIComponent(nextPath)}`;

  return (
    <form onSubmit={handleSubmit} className={AUTH_CARD_CLASS}>
      {error ? (
        <div role="alert" className={FORM_ERROR_CLASS}>
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <h2 className={SECTION_TITLE_CLASS}>Cuenta</h2>

        <label className="block">
          <span className={FIELD_LABEL_CLASS}>Usuario</span>
          <input
            required
            autoFocus
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            minLength={3}
            maxLength={30}
            pattern="[a-zA-Z0-9_.\-]+"
            title="Letras, números, '_', '.' o '-' (sin espacios)"
            value={form.username}
            onChange={(e) => updateField("username", e.target.value)}
            className={AUTH_INPUT_CLASS}
            placeholder="carlos_tenis"
          />
        </label>

        <label className="block">
          <span className={FIELD_LABEL_CLASS}>Contraseña</span>
          <PasswordInput
            required
            autoComplete="new-password"
            minLength={PASSWORD_MIN_LENGTH}
            value={form.password}
            onChange={(e) => updateField("password", e.target.value)}
            placeholder={`Mínimo ${PASSWORD_MIN_LENGTH} caracteres`}
          />
        </label>

        <label className="block">
          <span className={FIELD_LABEL_CLASS}>Nombre</span>
          <input
            required
            autoComplete="given-name"
            value={form.nombre}
            onChange={(e) => updateField("nombre", e.target.value)}
            className={AUTH_INPUT_CLASS}
            placeholder="Carlos"
          />
        </label>

        <label className="block">
          <span className={FIELD_LABEL_CLASS}>Apellidos</span>
          <input
            required
            autoComplete="family-name"
            value={form.apellidos}
            onChange={(e) => updateField("apellidos", e.target.value)}
            className={AUTH_INPUT_CLASS}
            placeholder="García López"
          />
        </label>

        <div className="mt-2 border-t border-white/5 pt-4 sm:col-span-2">
          <h2 className="text-sm font-semibold text-slate-200">Datos físicos</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Se usan para personalizar el análisis biomecánico.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3 sm:col-span-2">
          <label className="block">
            <span className={FIELD_LABEL_CLASS}>Edad</span>
            <input
              required
              type="number"
              inputMode="numeric"
              min={RANGOS.edad.min}
              max={RANGOS.edad.max}
              title={`Debes tener al menos ${EDAD_MINIMA} años`}
              value={form.edad}
              onChange={(e) => updateField("edad", e.target.value)}
              className={AUTH_INPUT_CLASS}
              placeholder="25"
            />
          </label>

          <label className="block">
            <span className={FIELD_LABEL_CLASS}>Altura (cm)</span>
            <input
              required
              type="number"
              inputMode="decimal"
              min={50}
              max={250}
              step="0.1"
              value={form.altura}
              onChange={(e) => updateField("altura", e.target.value)}
              className={AUTH_INPUT_CLASS}
              placeholder="180"
            />
          </label>

          <label className="block">
            <span className={FIELD_LABEL_CLASS}>Peso (kg)</span>
            <input
              required
              type="number"
              inputMode="decimal"
              min={20}
              max={250}
              step="0.1"
              value={form.peso}
              onChange={(e) => updateField("peso", e.target.value)}
              className={AUTH_INPUT_CLASS}
              placeholder="75"
            />
          </label>
        </div>
      </div>

      <label className="mt-6 flex cursor-pointer items-start gap-3 text-sm text-slate-300">
        <input
          type="checkbox"
          required
          checked={aceptaPrivacidad}
          onChange={(e) => setAceptaPrivacidad(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-cyan-400"
        />
        <span>
          He leído y acepto la{" "}
          <Link
            href="/privacidad"
            target="_blank"
            className="font-medium text-cyan-300 underline-offset-4 hover:underline"
          >
            política de privacidad
          </Link>
          . Tus datos físicos solo se usan para personalizar el análisis.
        </span>
      </label>

      <button type="submit" disabled={isSubmitting} className={`mt-6 ${PRIMARY_BUTTON_CLASS}`}>
        {isSubmitting ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" strokeWidth={1.75} />
            Creando cuenta...
          </>
        ) : (
          <>
            <UserPlus className="h-5 w-5" strokeWidth={1.75} />
            Crear cuenta
          </>
        )}
      </button>

      <p className="mt-5 text-center text-sm text-slate-400">
        ¿Ya tienes cuenta?{" "}
        <Link href={loginHref} className="font-medium text-cyan-300 transition hover:text-cyan-200">
          Inicia sesión
        </Link>
      </p>
    </form>
  );
}

export default function RegistroPage() {
  return (
    <AuthShell
      eyebrow="Crear cuenta"
      title="Registro de atleta"
      subtitle="Crea tu perfil para guardar tus análisis y ver tu evolución."
      maxWidth="max-w-lg"
    >
      <Suspense fallback={<div className={`${AUTH_CARD_CLASS} h-[28rem]`} />}>
        <RegistroForm />
      </Suspense>
    </AuthShell>
  );
}

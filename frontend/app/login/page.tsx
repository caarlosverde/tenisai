"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { AlertCircle, Loader2, LogIn } from "lucide-react";
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

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = safeNextPath(searchParams.get("next"));
  const { setUser } = useSession();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    flushSync(() => {
      setIsSubmitting(true);
      setError(null);
    });

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username: username.trim(), password }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        user?: SessionUser;
      };

      if (!response.ok || !data.user) {
        setError(data.error ?? `Error HTTP ${response.status}`);
        return;
      }

      setUser(data.user);
      toast.success(`¡Hola, ${data.user.nombre || data.user.username}!`);
      router.replace(nextPath);
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor. Comprueba que el frontend está en marcha.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const registroHref =
    nextPath === "/" ? "/registro" : `/registro?next=${encodeURIComponent(nextPath)}`;

  return (
    <form onSubmit={handleSubmit} className={AUTH_CARD_CLASS}>
      {error ? (
        <div role="alert" className={FORM_ERROR_CLASS}>
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
          {error}
        </div>
      ) : null}

      <label className="mb-4 block">
        <span className={FIELD_LABEL_CLASS}>Usuario</span>
        <input
          required
          autoFocus
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          value={username}
          aria-invalid={Boolean(error)}
          onChange={(e) => setUsername(e.target.value)}
          className={AUTH_INPUT_CLASS}
          placeholder="carlos_tenis"
        />
      </label>

      <label className="block">
        <span className={FIELD_LABEL_CLASS}>Contraseña</span>
        <PasswordInput
          required
          autoComplete="current-password"
          value={password}
          aria-invalid={Boolean(error)}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />
      </label>

      <button type="submit" disabled={isSubmitting} className={`mt-6 ${PRIMARY_BUTTON_CLASS}`}>
        {isSubmitting ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" strokeWidth={1.75} />
            Entrando...
          </>
        ) : (
          <>
            <LogIn className="h-5 w-5" strokeWidth={1.75} />
            Entrar
          </>
        )}
      </button>

      <p className="mt-5 text-center text-sm text-slate-400">
        ¿No tienes cuenta?{" "}
        <Link href={registroHref} className="font-medium text-cyan-300 transition hover:text-cyan-200">
          Regístrate
        </Link>
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <AuthShell
      eyebrow="Acceso"
      title="Iniciar sesión"
      subtitle="Entra con tu cuenta para guardar tus análisis y seguir tu evolución."
    >
      <Suspense fallback={<div className={`${AUTH_CARD_CLASS} h-72`} />}>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}

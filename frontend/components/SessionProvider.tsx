"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type SessionUser = {
  id: string;
  username: string;
  nombre: string;
};

/**
 * Avisos de la comunidad: solicitudes de amistad, partidos que esperan tu confirmación y
 * jugadores que piden plaza en tus convocatorias.
 */
export type Pendientes = {
  solicitudes: number;
  partidos: number;
  convocatorias: number;
  torneos: number;
};

const SIN_PENDIENTES: Pendientes = { solicitudes: 0, partidos: 0, convocatorias: 0, torneos: 0 };

type SessionContextValue = {
  user: SessionUser | null;
  setUser: (user: SessionUser | null) => void;
  refresh: () => Promise<SessionUser | null>;
  pendientes: Pendientes;
  refrescarPendientes: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({
  initialUser,
  children,
}: {
  initialUser: SessionUser | null;
  children: ReactNode;
}) {
  const [user, setUser] = useState<SessionUser | null>(initialUser);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/me", {
        credentials: "include",
        cache: "no-store",
      });
      const data = (await response.json()) as { user?: SessionUser | null };
      const next = data.user
        ? { id: data.user.id, username: data.user.username, nombre: data.user.nombre }
        : null;
      setUser(next);
      return next;
    } catch {
      return user;
    }
  }, [user]);

  const [pendientesDe, setPendientesDe] = useState<{ userId: string; valor: Pendientes } | null>(
    null,
  );
  // Solo valen para el usuario con el que se pidieron (al cerrar sesión se descartan)
  const pendientes =
    user && pendientesDe?.userId === user.id ? pendientesDe.valor : SIN_PENDIENTES;
  const userId = user?.id ?? null;

  const refrescarPendientes = useCallback(async () => {
    if (!userId) return;
    try {
      const response = await fetch("/api/comunidad/pendientes", { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as Partial<Pendientes>;
      setPendientesDe({
        userId,
        valor: {
          solicitudes: data.solicitudes ?? 0,
          partidos: data.partidos ?? 0,
          convocatorias: data.convocatorias ?? 0,
          torneos: data.torneos ?? 0,
        },
      });
    } catch {
      // Sin conexión: se mantienen los últimos avisos
    }
  }, [userId]);

  const value = useMemo(
    () => ({ user, setUser, refresh, pendientes, refrescarPendientes }),
    [user, refresh, pendientes, refrescarPendientes],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession debe usarse dentro de <SessionProvider>");
  }
  return context;
}

/** Solo acepta rutas internas para evitar redirecciones abiertas (?next=https://...). */
export function safeNextPath(next: string | null | undefined, fallback = "/"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return fallback;
  return next;
}

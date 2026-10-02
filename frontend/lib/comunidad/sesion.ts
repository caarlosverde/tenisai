import { redirect } from "next/navigation";
import { getCurrentUser, type SessionUser } from "@/lib/auth";

/** Usuario de la sesión o, si no hay, redirección al login volviendo a `ruta`. */
export async function exigirUsuario(ruta: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(ruta)}`);
  return user;
}

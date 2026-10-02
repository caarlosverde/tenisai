// Peticiones a la API de la comunidad desde el navegador.

export type Respuesta<T> = { ok: true; data: T } | { ok: false; error: string };

/** Hace la petición y devuelve los datos o un mensaje de error listo para mostrar. */
export async function peticion<T = unknown>(
  url: string,
  init?: { method?: string; body?: unknown },
): Promise<Respuesta<T>> {
  try {
    const response = await fetch(url, {
      method: init?.method ?? "GET",
      headers: init?.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
    });
    const data = (await response.json().catch(() => ({}))) as T & { error?: string };
    if (!response.ok) {
      return { ok: false, error: data.error ?? "Algo ha fallado. Inténtalo de nuevo." };
    }
    return { ok: true, data };
  } catch {
    return { ok: false, error: "No se pudo conectar con el servidor." };
  }
}

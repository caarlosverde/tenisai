import { SignJWT } from "jose";
import { API_BASE_URL } from "@/lib/api";
import { getJwtSecret } from "@/lib/authToken";

// Desde el servidor de Next el backend puede tener otra dirección (p. ej. el
// nombre del servicio en Docker); en local es la misma que usa el navegador.
const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? API_BASE_URL;

/**
 * Permiso firmado para una única operación: borrar el análisis `jobId` del usuario.
 * Caduca en 60 s y no sirve como sesión, así que aunque alguien robara la cookie de
 * sesión no podría usarla para borrar vídeos llamando directamente al backend.
 */
async function permisoDeBorrado(jobId: string, userId: string): Promise<string> {
  return new SignJWT({ id: userId, accion: "borrar-analisis", job: jobId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("60s")
    .sign(getJwtSecret());
}

/**
 * Borra en el backend la carpeta (vídeos y métricas) de un análisis.
 * El backend comprueba el permiso y que el análisis sea de ese usuario.
 * Lanza un error si el backend no confirma el borrado.
 */
export async function borrarArchivosAnalisis(jobId: string, userId: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${API_INTERNAL_URL}/analisis/${jobId}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${await permisoDeBorrado(jobId, userId)}` },
      cache: "no-store",
    });
  } catch (error) {
    throw new Error("No se pudo conectar con el motor de análisis.", { cause: error });
  }
  // 404: ya no existía; cualquier otro error impide borrar la fila (no dejar vídeos huérfanos)
  if (!response.ok && response.status !== 404) {
    throw new Error(`El motor de análisis respondió ${response.status} al borrar ${jobId}.`);
  }
}

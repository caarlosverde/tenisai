import { jwtVerify } from "jose";

// Sin dependencias de Prisma ni de next/headers: se puede importar desde proxy.ts

export const AUTH_COOKIE_NAME = "auth_token";

const JWT_SECRET_MIN_LENGTH = 32;
const DEV_FALLBACK_SECRET = "tenisai-dev-secret-solo-para-desarrollo-local";

let jwtSecretCache: Uint8Array | null = null;

/**
 * Clave con la que se firman y verifican las sesiones.
 * En producción JWT_SECRET es obligatoria: sin ella se lanza un error en lugar
 * de firmar con una clave conocida. Se lee al usarla (no al importar el módulo)
 * para que `next build` funcione aunque la variable solo exista en ejecución.
 */
export function getJwtSecret(): Uint8Array {
  if (jwtSecretCache) return jwtSecretCache;

  const secreto = process.env.JWT_SECRET?.trim() ?? "";
  if (secreto.length < JWT_SECRET_MIN_LENGTH) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        `JWT_SECRET no está definida o tiene menos de ${JWT_SECRET_MIN_LENGTH} caracteres. ` +
          "Defínela en las variables de entorno del servidor.",
      );
    }
    console.warn(
      "[auth] JWT_SECRET ausente o corta: usando una clave de desarrollo. No uses esto en producción.",
    );
  }

  jwtSecretCache = new TextEncoder().encode(
    secreto.length > 0 ? secreto : DEV_FALLBACK_SECRET,
  );
  return jwtSecretCache;
}

export type AuthTokenPayload = {
  id: string;
  username: string;
  /** Versión de sesión del usuario al firmar (las sesiones antiguas sin ella valen 0). */
  sv: number;
};

export async function verifyAuthToken(
  token: string,
): Promise<AuthTokenPayload | null> {
  // Fuera del try: una clave mal configurada debe fallar de forma visible,
  // no hacerse pasar por "sesión inválida".
  const secret = getJwtSecret();
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    const id = typeof payload.id === "string" ? payload.id : null;
    const username =
      typeof payload.username === "string" ? payload.username : null;

    if (!id || !username) {
      return null;
    }

    const sv = typeof payload.sv === "number" ? payload.sv : 0;
    return { id, username, sv };
  } catch {
    return null;
  }
}

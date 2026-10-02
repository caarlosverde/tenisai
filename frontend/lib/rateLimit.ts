/**
 * Limitador de intentos en memoria (ventana deslizante).
 *
 * Suficiente para un único proceso de Next.js. Si la app se despliega con
 * varias instancias, habría que moverlo a un almacén compartido (p. ej. Redis).
 */

type Limite = {
  clave: string;
  maxIntentos: number;
  ventanaMs: number;
};

const globalParaLimites = globalThis as unknown as {
  __tenisaiIntentos?: Map<string, number[]>;
};

// En globalThis para que la recarga en caliente de desarrollo no lo vacíe
const intentos: Map<string, number[]> = (globalParaLimites.__tenisaiIntentos ??=
  new Map<string, number[]>());

const MAX_CLAVES = 10_000;

function recientes(clave: string, ventanaMs: number, ahora: number): number[] {
  const lista = (intentos.get(clave) ?? []).filter((t) => ahora - t < ventanaMs);
  if (lista.length > 0) intentos.set(clave, lista);
  else intentos.delete(clave);
  return lista;
}

/** Segundos que faltan para poder reintentar (0 si ningún límite está superado). */
export function segundosBloqueado(limites: Limite[]): number {
  const ahora = Date.now();
  let espera = 0;
  for (const { clave, maxIntentos, ventanaMs } of limites) {
    const lista = recientes(clave, ventanaMs, ahora);
    if (lista.length >= maxIntentos) {
      // Se libera un hueco cuando el intento más antiguo sale de la ventana
      const liberaEn = lista[lista.length - maxIntentos] + ventanaMs;
      espera = Math.max(espera, Math.ceil((liberaEn - ahora) / 1000));
    }
  }
  return espera;
}

/** Anota un intento fallido en todas las claves indicadas. */
export function registrarIntento(limites: Limite[]): void {
  const ahora = Date.now();
  if (intentos.size > MAX_CLAVES) {
    // Limpieza ocasional para que el mapa no crezca sin límite
    for (const [clave, lista] of intentos) {
      if (lista.every((t) => ahora - t > 24 * 60 * 60 * 1000)) intentos.delete(clave);
    }
  }
  for (const { clave, ventanaMs } of limites) {
    const lista = recientes(clave, ventanaMs, ahora);
    lista.push(ahora);
    intentos.set(clave, lista);
  }
}

export function limpiarIntentos(clave: string): void {
  intentos.delete(clave);
}

/**
 * Límite para operaciones que piden la contraseña actual con la sesión ya iniciada
 * (cambiarla, borrar la cuenta): impide adivinarla con una sesión robada.
 */
export function limiteConfirmacion(userId: string): Limite[] {
  return [{ clave: `confirmar-password:${userId}`, maxIntentos: 5, ventanaMs: 15 * 60 * 1000 }];
}

/** Límite diario de una acción de la comunidad (solicitudes, partidos, denuncias). */
export function limiteDiario(accion: string, userId: string, maximo: number): Limite[] {
  return [{ clave: `${accion}:${userId}`, maxIntentos: maximo, ventanaMs: 24 * 60 * 60 * 1000 }];
}

/**
 * IP del cliente según la cabecera del proxy. Solo es fiable si delante de la
 * app hay un proxy que la reescribe; por eso no es la única clave de los límites.
 */
export function ipCliente(request: Request): string {
  const reenviada = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return reenviada || request.headers.get("x-real-ip")?.trim() || "desconocida";
}

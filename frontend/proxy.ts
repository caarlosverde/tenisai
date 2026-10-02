import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE_NAME, verifyAuthToken } from "@/lib/authToken";

// La comunidad también es privada: los perfiles de jugador solo los ven usuarios registrados
const PRIVATE_PATHS = ["/perfil", "/analisis", "/comunidad", "/jugador"];
const AUTH_PATHS = ["/login", "/registro"];

// Comprobación optimista de la sesión (solo firma del JWT); cada página y
// ruta de API sigue validando al usuario contra la base de datos.
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const loggedIn = token ? Boolean(await verifyAuthToken(token)) : false;

  if (!loggedIn && PRIVATE_PATHS.some((p) => pathname.startsWith(p))) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }

  if (loggedIn && AUTH_PATHS.includes(pathname)) {
    const next = request.nextUrl.searchParams.get("next");
    const destino = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
    return NextResponse.redirect(new URL(destino, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/perfil/:path*",
    "/analisis/:path*",
    "/comunidad/:path*",
    "/jugador/:path*",
    "/login",
    "/registro",
  ],
};

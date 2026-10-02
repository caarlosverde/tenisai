import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { nombreVisible } from "@/lib/comunidad/perfil";
import { cargarRelaciones, hayBloqueo, puedeJugarCon } from "@/lib/comunidad/relaciones";
import type { JugadorEncontrado } from "@/lib/comunidad/tipos";

export const dynamic = "force-dynamic";

const RESULTADOS_MAX = 20;

/**
 * Busca jugadores por usuario, nombre, ciudad o club.
 *
 * Los perfiles públicos y los amigos aparecen por coincidencia parcial; un perfil
 * privado solo si se escribe su nombre de usuario exacto (para poder enviarle una
 * solicitud). Con `para=partido` devuelve solo a quienes se puede apuntar en un
 * partido y, sin texto, la lista de amigos.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "No autenticado." }, { status: 401 });
    }
    const yoId = session.userId;
    const q = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 60);
    const paraPartido = request.nextUrl.searchParams.get("para") === "partido";
    const convocatoriaId = request.nextUrl.searchParams.get("convocatoria");
    const relaciones = await cargarRelaciones(yoId);

    if (q.length < 2 && !paraPartido) {
      return NextResponse.json({ jugadores: [] });
    }

    // Al registrar el resultado de tu convocatoria, sus jugadores aceptados también valen
    const aceptados = new Set<string>();
    if (paraPartido && convocatoriaId) {
      const convocatoria = await prisma.convocatoria.findFirst({
        where: { id: convocatoriaId, creadorId: yoId },
        select: { solicitudes: { where: { estado: "aceptada" }, select: { userId: true } } },
      });
      for (const s of convocatoria?.solicitudes ?? []) aceptados.add(s.userId);
    }

    const texto = q
      ? [
          { username: { contains: q } },
          { nombre: { contains: q } },
          { apellidos: { contains: q } },
          { ciudad: { contains: q } },
          { club: { contains: q } },
        ]
      : undefined;
    const amigos = [...relaciones.amigos];

    const usuarios = await prisma.user.findMany({
      where: {
        id: { not: yoId },
        OR: q
          ? [
              { perfilPublico: true, OR: texto },
              { id: { in: [...amigos, ...aceptados] }, OR: texto },
              // Privados: solo con el nombre de usuario exacto (se filtra abajo)
              { username: { contains: q } },
            ]
          : [{ id: { in: [...amigos, ...aceptados] } }],
      },
      select: {
        id: true,
        username: true,
        nombre: true,
        apellidos: true,
        ciudad: true,
        nivel: true,
        perfilPublico: true,
        puntosIndividual: true,
        puntosDobles: true,
      },
      take: 60,
    });

    const minusculas = q.toLowerCase();
    const jugadores: JugadorEncontrado[] = usuarios
      .map((u) => ({ u, relacion: relaciones.estado(u.id) }))
      .filter(({ u, relacion }) => {
        if (hayBloqueo(relacion)) return false;
        if (aceptados.has(u.id)) return true;
        const visible =
          u.perfilPublico || relacion === "amigos" || u.username.toLowerCase() === minusculas;
        if (!visible) return false;
        return paraPartido ? puedeJugarCon(relacion, u.perfilPublico) : true;
      })
      .sort(
        (a, b) =>
          Number(aceptados.has(b.u.id)) - Number(aceptados.has(a.u.id)) ||
          Number(b.relacion === "amigos") - Number(a.relacion === "amigos") ||
          Number(b.u.username.toLowerCase() === minusculas) -
            Number(a.u.username.toLowerCase() === minusculas) ||
          a.u.nombre.localeCompare(b.u.nombre, "es"),
      )
      .slice(0, RESULTADOS_MAX)
      .map(({ u, relacion }) => {
        const completo = relacion === "amigos";
        // De un perfil privado ajeno solo se enseña lo justo para reconocerlo
        const reservado = !u.perfilPublico && !completo;
        return {
          username: u.username,
          nombre: nombreVisible(u, completo),
          ciudad: reservado ? null : u.ciudad,
          nivel: reservado ? null : u.nivel,
          perfilPublico: u.perfilPublico,
          relacion,
          puntosIndividual: u.puntosIndividual,
          puntosDobles: u.puntosDobles,
        };
      });

    return NextResponse.json({ jugadores });
  } catch (error) {
    console.error("Error en GET /api/comunidad/jugadores:", error);
    return NextResponse.json({ error: "No se pudo hacer la búsqueda." }, { status: 500 });
  }
}

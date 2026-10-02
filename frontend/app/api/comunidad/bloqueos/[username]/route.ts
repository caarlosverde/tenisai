import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Contexto = { params: Promise<{ username: string }> };

async function otroUsuario(params: Contexto["params"]) {
  const { username } = await params;
  return prisma.user.findUnique({
    where: { username },
    select: { id: true },
  });
}

/**
 * Bloquea a un jugador: deja de ver tu perfil y tú el suyo, no puede enviarte
 * solicitudes ni apuntarte en partidos, y se elimina la amistad si la había.
 */
export async function POST(_request: Request, { params }: Contexto) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
    const yoId = session.userId;

    const otro = await otroUsuario(params);
    if (!otro) return NextResponse.json({ error: "Jugador no encontrado." }, { status: 404 });
    if (otro.id === yoId) {
      return NextResponse.json({ error: "No puedes bloquearte a ti mismo." }, { status: 400 });
    }

    await prisma.$transaction([
      prisma.bloqueo.upsert({
        where: { autorId_bloqueadoId: { autorId: yoId, bloqueadoId: otro.id } },
        create: { autorId: yoId, bloqueadoId: otro.id },
        update: {},
      }),
      prisma.amistad.deleteMany({
        where: {
          OR: [
            { solicitanteId: yoId, receptorId: otro.id },
            { solicitanteId: otro.id, receptorId: yoId },
          ],
        },
      }),
      // Tampoco pueden seguir apuntados en las convocatorias del otro
      prisma.solicitudConvocatoria.deleteMany({
        where: {
          OR: [
            { userId: otro.id, convocatoria: { creadorId: yoId } },
            { userId: yoId, convocatoria: { creadorId: otro.id } },
          ],
        },
      }),
    ]);
    return NextResponse.json({ estado: "bloqueado" });
  } catch (error) {
    console.error("Error en POST /api/comunidad/bloqueos:", error);
    return NextResponse.json({ error: "No se pudo bloquear al jugador." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: Contexto) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

    const otro = await otroUsuario(params);
    if (!otro) return NextResponse.json({ error: "Jugador no encontrado." }, { status: 404 });

    await prisma.bloqueo.deleteMany({ where: { autorId: session.userId, bloqueadoId: otro.id } });
    return NextResponse.json({ estado: "ninguna" });
  } catch (error) {
    console.error("Error en DELETE /api/comunidad/bloqueos:", error);
    return NextResponse.json({ error: "No se pudo desbloquear al jugador." }, { status: 500 });
  }
}

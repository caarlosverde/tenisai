import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cargarRelaciones, hayBloqueo } from "@/lib/comunidad/relaciones";
import { limiteDiario, registrarIntento, segundosBloqueado } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

const SOLICITUDES_POR_DIA = 30;

type Contexto = { params: Promise<{ username: string }> };

/** El otro usuario; un bloqueo en cualquier sentido se trata como si no existiera. */
async function destino(yoId: string, params: Contexto["params"]) {
  const { username } = await params;
  const otro = await prisma.user.findUnique({
    where: { username },
    select: { id: true },
  });
  if (!otro) return null;
  const relacion = (await cargarRelaciones(yoId)).estado(otro.id);
  return hayBloqueo(relacion) ? null : { id: otro.id, relacion };
}

/** Envía una solicitud de amistad o, si el otro ya me la había enviado, la acepta. */
export async function POST(_request: Request, { params }: Contexto) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
    const yoId = session.userId;

    const otro = await destino(yoId, params);
    if (!otro) return NextResponse.json({ error: "Jugador no encontrado." }, { status: 404 });

    switch (otro.relacion) {
      case "yo":
        return NextResponse.json({ error: "No puedes añadirte a ti mismo." }, { status: 400 });
      case "amigos":
      case "enviada":
        return NextResponse.json({ estado: otro.relacion });
      case "recibida":
        await prisma.amistad.updateMany({
          where: { solicitanteId: otro.id, receptorId: yoId, estado: "pendiente" },
          data: { estado: "aceptada", aceptadaEn: new Date() },
        });
        return NextResponse.json({ estado: "amigos" });
    }

    const limite = limiteDiario("solicitud-amistad", yoId, SOLICITUDES_POR_DIA);
    const espera = segundosBloqueado(limite);
    if (espera > 0) {
      return NextResponse.json(
        { error: "Has enviado muchas solicitudes hoy. Vuelve a intentarlo mañana." },
        { status: 429, headers: { "Retry-After": String(espera) } },
      );
    }
    await prisma.amistad.create({ data: { solicitanteId: yoId, receptorId: otro.id } });
    registrarIntento(limite);
    return NextResponse.json({ estado: "enviada" }, { status: 201 });
  } catch (error) {
    console.error("Error en POST /api/comunidad/amigos:", error);
    return NextResponse.json({ error: "No se pudo enviar la solicitud." }, { status: 500 });
  }
}

/** Cancela la solicitud enviada, rechaza la recibida o elimina la amistad. */
export async function DELETE(_request: Request, { params }: Contexto) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
    const yoId = session.userId;

    const otro = await destino(yoId, params);
    if (!otro) return NextResponse.json({ error: "Jugador no encontrado." }, { status: 404 });

    await prisma.amistad.deleteMany({
      where: {
        OR: [
          { solicitanteId: yoId, receptorId: otro.id },
          { solicitanteId: otro.id, receptorId: yoId },
        ],
      },
    });
    return NextResponse.json({ estado: "ninguna" });
  } catch (error) {
    console.error("Error en DELETE /api/comunidad/amigos:", error);
    return NextResponse.json({ error: "No se pudo actualizar la amistad." }, { status: 500 });
  }
}

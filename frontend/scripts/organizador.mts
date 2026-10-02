// Da o quita el rol de organizador (clubes y organizadores de torneos). Solo lo usa quien
// administra TenisAI: no hay forma de hacerse organizador desde la web.
//
//   node scripts/organizador.mts usuario --organizacion "Club de Tenis Leganés"
//   node scripts/organizador.mts usuario --quitar
//   node scripts/organizador.mts --lista
import prismaPkg from "@prisma/client";

const { PrismaClient } = prismaPkg;
const prisma = new PrismaClient();
const args = process.argv.slice(2);

function valor(opcion: string): string | null {
  const i = args.indexOf(opcion);
  return i >= 0 ? (args[i + 1] ?? null) : null;
}

try {
  if (args.includes("--lista")) {
    const organizadores = await prisma.user.findMany({
      where: { rol: "organizador" },
      select: { username: true, organizacion: true, _count: { select: { torneosOrganizados: true } } },
      orderBy: { username: "asc" },
    });
    if (organizadores.length === 0) console.log("No hay organizadores.");
    for (const o of organizadores) {
      console.log(`@${o.username} · ${o.organizacion ?? "(sin organización)"} · ${o._count.torneosOrganizados} torneos`);
    }
  } else {
    const username = args.find((a) => !a.startsWith("--") && a !== valor("--organizacion"));
    if (!username) throw new Error("Indica el usuario: node scripts/organizador.mts usuario [--organizacion \"Club\"] [--quitar]");
    const usuario = await prisma.user.findUnique({ where: { username }, select: { id: true } });
    if (!usuario) throw new Error(`No existe el usuario ${username}.`);

    if (args.includes("--quitar")) {
      await prisma.user.update({ where: { id: usuario.id }, data: { rol: "jugador", organizacion: null } });
      console.log(`@${username} ya no es organizador (sus torneos se conservan).`);
    } else {
      const organizacion = valor("--organizacion")?.trim().slice(0, 80) || null;
      await prisma.user.update({ where: { id: usuario.id }, data: { rol: "organizador", organizacion } });
      console.log(`@${username} ahora es organizador${organizacion ? ` de ${organizacion}` : ""}: puede crear torneos.`);
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}

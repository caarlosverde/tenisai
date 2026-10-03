// Datos de ejemplo para la comunidad (demos y el tribunal del TFG): jugadores ficticios
// con perfil público, amistades y partidos confirmados con sus puntos Elo.
//
//   node scripts/demo-comunidad.mts                  crea los datos de ejemplo
//   node scripts/demo-comunidad.mts --para usuario   además los conecta con tu cuenta:
//                                                   amigos, una solicitud y un partido por confirmar
//   node scripts/demo-comunidad.mts --borrar         borra todo lo de ejemplo y recalcula los puntos
//
// Los jugadores de ejemplo empiezan por "demo_" y no pueden iniciar sesión.
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import prismaPkg from "@prisma/client";
import { calcularPuntos, PUNTOS_INICIALES, type JugadorElo } from "../lib/comunidad/elo.ts";
import { generarCuadro } from "../lib/comunidad/cuadro.ts";
import { validarMarcador, type SetJuegos } from "../lib/comunidad/marcador.ts";

const { PrismaClient } = prismaPkg;
const prisma = new PrismaClient();
const PREFIJO = "demo_";

// Generador pseudoaleatorio con semilla: los datos salen iguales en cada ejecución
let semilla = 20261001;
function azar(): number {
  semilla = (semilla + 0x6d2b79f5) | 0;
  let t = Math.imul(semilla ^ (semilla >>> 15), 1 | semilla);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const elegir = <T,>(lista: readonly T[]): T => lista[Math.floor(azar() * lista.length)];

const NIVEL_REAL = { iniciacion: 1050, intermedio: 1200, avanzado: 1350, competicion: 1500 } as const;

const JUGADORES = [
  ["lucia", "Lucía", "Fernández Gil", "Madrid", "avanzado", "diestro"],
  ["pablo", "Pablo", "Romero Díaz", "Madrid", "intermedio", "diestro"],
  ["marta", "Marta", "Navarro Ruiz", "Leganés", "competicion", "zurdo"],
  ["javier", "Javier", "Torres Molina", "Leganés", "avanzado", "diestro"],
  ["elena", "Elena", "Castro Vidal", "Getafe", "intermedio", "diestro"],
  ["sergio", "Sergio", "Ortega Ramos", "Getafe", "iniciacion", "diestro"],
  ["nuria", "Nuria", "Delgado Prieto", "Valencia", "avanzado", "diestro"],
  ["alvaro", "Álvaro", "Muñoz Serrano", "Valencia", "intermedio", "zurdo"],
  ["irene", "Irene", "Blanco Herrera", "Madrid", "intermedio", "diestro"],
  ["diego", "Diego", "Vargas León", "Leganés", "iniciacion", "diestro"],
  ["carmen", "Carmen", "Iglesias Soto", "Madrid", "competicion", "diestro"],
  ["hugo", "Hugo", "Medina Cano", "Getafe", "avanzado", "diestro"],
] as const;

const CLUBES = ["Club de Tenis Leganés", "Polideportivo Municipal", "Club Raqueta Sur", null, null];
const DISPONIBILIDAD = [
  "Tardes entre semana",
  "Sábados por la mañana",
  "Fines de semana",
  "Mañanas temprano antes de trabajar",
  "Martes y jueves por la tarde",
];
const BIOS = [
  "Juego desde pequeño. Busco partidos de nivel para preparar torneos.",
  "Me encantan los dobles. Revés a dos manos y mucha paciencia desde el fondo.",
  "Volví al tenis hace un año y quiero mejorar el saque.",
  "Busco gente para pelotear y algún partido los fines de semana.",
  null,
];

type Estado = { id: string; nivel: number; individual: JugadorElo; dobles: JugadorElo; victorias: { individual: number; dobles: number } };

// Los resultados ajustados (6-4, 7-5...) salen más a menudo que las palizas
const SETS_GANADOS: SetJuegos[] = [[6, 0], [6, 1], [6, 2], [6, 3], [6, 3], [6, 4], [6, 4], [7, 5], [7, 6]];

/** Sets creíbles para un partido que gana el equipo 1. */
function marcadorGanado(superTieBreak: boolean): SetJuegos[] {
  const setGanado = (): SetJuegos => {
    const [a, b] = elegir(SETS_GANADOS);
    return [a, b];
  };
  const perdido = (): SetJuegos => {
    const [a, b] = setGanado();
    return [b, a];
  };
  if (azar() < 0.6) return [setGanado(), setGanado()];
  const decisivo: SetJuegos = superTieBreak ? [10, 3 + Math.floor(azar() * 6)] : setGanado();
  return azar() < 0.5 ? [perdido(), setGanado(), decisivo] : [setGanado(), perdido(), decisivo];
}

function aplicar(
  modalidad: "individual" | "dobles",
  equipo1: Estado[],
  equipo2: Estado[],
  ganador: 1 | 2,
) {
  const nuevos = calcularPuntos(
    equipo1.map((e) => e[modalidad]),
    equipo2.map((e) => e[modalidad]),
    ganador,
  );
  return [...equipo1, ...equipo2].map((e, i) => {
    const antes = e[modalidad].puntos;
    const despues = nuevos.get(e.id) ?? antes;
    const equipo = i < equipo1.length ? 1 : 2;
    e[modalidad] = { id: e.id, puntos: despues, partidos: e[modalidad].partidos + 1 };
    if (equipo === ganador) e.victorias[modalidad] += 1;
    return { userId: e.id, equipo, puntosAntes: antes, puntosDespues: despues };
  });
}

/** Vuelve a calcular los puntos de todos repitiendo los partidos confirmados en orden. */
async function recalcularPuntos() {
  const usuarios = await prisma.user.findMany({ select: { id: true } });
  const estados = new Map<string, Estado>(
    usuarios.map((u) => [
      u.id,
      {
        id: u.id,
        nivel: 0,
        individual: { id: u.id, puntos: PUNTOS_INICIALES, partidos: 0 },
        dobles: { id: u.id, puntos: PUNTOS_INICIALES, partidos: 0 },
        victorias: { individual: 0, dobles: 0 },
      },
    ]),
  );
  const partidos = await prisma.partido.findMany({
    where: { estado: "confirmado" },
    orderBy: { confirmadoEn: "asc" },
    include: { jugadores: true },
  });
  for (const partido of partidos) {
    const modalidad = partido.modalidad === "dobles" ? "dobles" : "individual";
    const equipo = (n: number) =>
      partido.jugadores.flatMap((j) => (j.equipo === n && j.userId && estados.has(j.userId) ? [estados.get(j.userId)!] : []));
    const [e1, e2] = [equipo(1), equipo(2)];
    if (e1.length === 0 || e2.length === 0) continue;
    const filas = aplicar(modalidad, e1, e2, partido.ganador === 2 ? 2 : 1);
    for (const fila of filas) {
      await prisma.jugadorPartido.updateMany({
        where: { partidoId: partido.id, userId: fila.userId },
        data: { puntosAntes: fila.puntosAntes, puntosDespues: fila.puntosDespues },
      });
    }
  }
  for (const e of estados.values()) {
    await prisma.user.update({
      where: { id: e.id },
      data: {
        puntosIndividual: e.individual.puntos,
        partidosIndividual: e.individual.partidos,
        victoriasIndividual: e.victorias.individual,
        puntosDobles: e.dobles.puntos,
        partidosDobles: e.dobles.partidos,
        victoriasDobles: e.victorias.dobles,
      },
    });
  }
  return partidos.length;
}

async function borrar() {
  const demo = await prisma.user.findMany({ where: { username: { startsWith: PREFIJO } }, select: { id: true } });
  const ids = demo.map((u) => u.id);
  const partidos = await prisma.partido.deleteMany({ where: { jugadores: { some: { userId: { in: ids } } } } });
  const usuarios = await prisma.user.deleteMany({ where: { id: { in: ids } } });
  // Si alguien confirmó un partido con un jugador de ejemplo, sus puntos cambiaron
  const repetidos = await recalcularPuntos();
  console.log(
    `Borrados ${usuarios.count} jugadores y ${partidos.count} partidos de ejemplo. ` +
      `Puntos recalculados a partir de ${repetidos} partidos reales.`,
  );
}

async function crear(para: string | null) {
  if (await prisma.user.count({ where: { username: { startsWith: PREFIJO } } })) {
    throw new Error("Ya hay datos de ejemplo. Bórralos antes con --borrar.");
  }
  const destino = para
    ? await prisma.user.findUnique({ where: { username: para }, select: { id: true, username: true } })
    : null;
  if (para && !destino) throw new Error(`No existe el usuario ${para}.`);

  // Nadie puede iniciar sesión con estas cuentas: la contraseña es aleatoria y se descarta
  const passwordHash = await bcrypt.hash(randomUUID(), 10);
  const estados: Estado[] = [];
  for (const [clave, nombre, apellidos, ciudad, nivel, lateralidad] of JUGADORES) {
    const user = await prisma.user.create({
      data: {
        username: `${PREFIJO}${clave}`,
        passwordHash,
        nombre,
        apellidos,
        edad: 18 + Math.floor(azar() * 35),
        altura: 160 + Math.round(azar() * 30),
        peso: 55 + Math.round(azar() * 30),
        lateralidad,
        privacidadAceptadaEn: new Date(),
        perfilPublico: true,
        ciudad,
        nivel,
        club: elegir(CLUBES),
        disponibilidad: elegir(DISPONIBILIDAD),
        bio: elegir(BIOS),
        createdAt: new Date(Date.now() - (100 + Math.floor(azar() * 200)) * 86_400_000),
      },
      select: { id: true },
    });
    estados.push({
      id: user.id,
      nivel: NIVEL_REAL[nivel] + (azar() - 0.5) * 120,
      individual: { id: user.id, puntos: PUNTOS_INICIALES, partidos: 0 },
      dobles: { id: user.id, puntos: PUNTOS_INICIALES, partidos: 0 },
      victorias: { individual: 0, dobles: 0 },
    });
  }

  // Amistades entre los jugadores de ejemplo
  for (let i = 0; i < estados.length; i += 1) {
    for (let j = i + 1; j < estados.length; j += 1) {
      if (azar() < 0.3) {
        await prisma.amistad.create({
          data: { solicitanteId: estados[i].id, receptorId: estados[j].id, estado: "aceptada", aceptadaEn: new Date() },
        });
      }
    }
  }

  // Partidos de los últimos 90 días, confirmados en orden de fecha
  const fechas = Array.from({ length: 60 }, () => Date.now() - Math.floor(azar() * 90) * 86_400_000).sort();
  let creados = 0;
  let ultimaConfirmacion = 0;
  for (const [n, fecha] of fechas.entries()) {
    const dobles = n % 4 === 3;
    const barajados = [...estados].sort(() => azar() - 0.5).slice(0, dobles ? 4 : 2);
    const [e1, e2] = dobles ? [barajados.slice(0, 2), barajados.slice(2)] : [[barajados[0]], [barajados[1]]];
    // Gana con más probabilidad quien tiene más nivel real
    const nivel = (equipo: Estado[]) => equipo.reduce((s, e) => s + e.nivel, 0) / equipo.length;
    const ganaUno = azar() < 1 / (1 + 10 ** ((nivel(e2) - nivel(e1)) / 400));
    const ganador: 1 | 2 = ganaUno ? 1 : 2;
    const sets = marcadorGanado(dobles && azar() < 0.5).map(([a, b]): SetJuegos => (ganaUno ? [a, b] : [b, a]));
    const marcador = validarMarcador(sets);
    if (!marcador.ok) throw new Error(`Marcador de ejemplo no válido: ${marcador.error}`);

    const modalidad = dobles ? "dobles" : "individual";
    const filas = aplicar(modalidad, e1, e2, ganador);
    const jugadoEn = new Date(fecha);
    jugadoEn.setUTCHours(12, 0, 0, 0);
    // Unos minutos después de jugarlo, siempre en el mismo orden que las fechas
    const confirmadoEn = new Date(jugadoEn.getTime() + 60_000 * (2 + n));
    ultimaConfirmacion = Math.max(ultimaConfirmacion, confirmadoEn.getTime());
    await prisma.partido.create({
      data: {
        modalidad,
        jugadoEn,
        lugar: elegir(CLUBES),
        sets: JSON.stringify(marcador.sets),
        ganador,
        estado: "confirmado",
        creadoPorId: e1[0].id,
        creadoEn: jugadoEn,
        confirmadoEn,
        jugadores: { create: filas },
      },
    });
    creados += 1;
  }

  // Torneos: un club organizador, un torneo ya jugado y otro con la inscripción abierta
  const club = await prisma.user.create({
    data: {
      username: `${PREFIJO}club`,
      passwordHash,
      nombre: "Club",
      apellidos: "de Tenis Leganés",
      edad: 40,
      altura: 170,
      peso: 70,
      privacidadAceptadaEn: new Date(),
      perfilPublico: true,
      ciudad: "Leganés",
      rol: "organizador",
      organizacion: "Club de Tenis Leganés",
      bio: "Organizamos torneos para todos los niveles durante todo el año.",
    },
    select: { id: true },
  });
  const diaRelativo = (dias: number) => {
    const fecha = new Date(Date.now() + dias * 86_400_000);
    fecha.setUTCHours(12, 0, 0, 0);
    return fecha;
  };

  // Torneo de 8 jugadores jugado hace unos días, ronda a ronda, con sus puntos
  const participantes = [...estados].sort(() => azar() - 0.5).slice(0, 8);
  const verano = await prisma.torneo.create({
    data: {
      organizadorId: club.id,
      nombre: "Torneo de fin de verano",
      descripcion: "Eliminatoria al mejor de tres sets. ¡Gracias a todos por participar!",
      modalidad: "individual",
      plazas: 8,
      lugar: "Club de Tenis Leganés",
      ciudad: "Leganés",
      cierreInscripcion: diaRelativo(-6),
      inicio: diaRelativo(-4),
      estado: "en_curso",
    },
    select: { id: true },
  });
  const estadoDeInscripcion = new Map<string, Estado>();
  for (const e of participantes) {
    const inscripcion = await prisma.inscripcionTorneo.create({
      data: { torneoId: verano.id, userId: e.id },
      select: { id: true },
    });
    estadoDeInscripcion.set(inscripcion.id, e);
  }
  const cuadro = generarCuadro(
    [...estadoDeInscripcion].map(([id, e]) => ({ id, puntos: e.individual.puntos })),
  );
  for (const [inscripcionId, semilla] of cuadro.semillas) {
    await prisma.inscripcionTorneo.update({ where: { id: inscripcionId }, data: { semilla } });
  }
  const ganadores = new Map<string, string>();
  let campeonId = "";
  for (const [orden, cruce] of cuadro.cruces.entries()) {
    // Con 8 jugadores no hay pases directos: cada cruce enfrenta a los ganadores de los anteriores
    const a = cruce.ronda === 1 ? cruce.a! : ganadores.get(`${cruce.ronda - 1}-${cruce.posicion * 2}`)!;
    const b = cruce.ronda === 1 ? cruce.b! : ganadores.get(`${cruce.ronda - 1}-${cruce.posicion * 2 + 1}`)!;
    const [ea, eb] = [estadoDeInscripcion.get(a)!, estadoDeInscripcion.get(b)!];
    const ganaA = azar() < 1 / (1 + 10 ** ((eb.nivel - ea.nivel) / 400));
    const sets = marcadorGanado(false).map(([x, y]): SetJuegos => (ganaA ? [x, y] : [y, x]));
    const marcador = validarMarcador(sets);
    if (!marcador.ok) throw new Error(`Marcador de ejemplo no válido: ${marcador.error}`);
    const filas = aplicar("individual", [ea], [eb], ganaA ? 1 : 2);
    const jugadoEn = diaRelativo(-4 + (cruce.ronda - 1));
    const partido = await prisma.partido.create({
      data: {
        modalidad: "individual",
        jugadoEn,
        lugar: "Club de Tenis Leganés",
        sets: JSON.stringify(marcador.sets),
        ganador: ganaA ? 1 : 2,
        estado: "confirmado",
        creadoPorId: club.id,
        creadoEn: jugadoEn,
        // Después de todos los anteriores: los puntos se aplican en orden de confirmación
        confirmadoEn: new Date(ultimaConfirmacion + 60_000 * (orden + 1)),
        jugadores: { create: filas },
      },
      select: { id: true },
    });
    const ganadorId = ganaA ? a : b;
    ganadores.set(`${cruce.ronda}-${cruce.posicion}`, ganadorId);
    campeonId = ganadorId;
    await prisma.partidoTorneo.create({
      data: {
        torneoId: verano.id,
        ronda: cruce.ronda,
        posicion: cruce.posicion,
        inscripcion1Id: a,
        inscripcion2Id: b,
        ganadorId,
        partidoId: partido.id,
      },
    });
  }
  await prisma.torneo.update({ where: { id: verano.id }, data: { estado: "finalizado", campeonId } });

  // Torneo con la inscripción abierta y cinco inscritos
  const cierreOtono = diaRelativo(8);
  cierreOtono.setUTCHours(20, 0, 0, 0);
  const otono = await prisma.torneo.create({
    data: {
      organizadorId: club.id,
      nombre: "Open de otoño",
      descripcion: "Eliminatoria al mejor de tres sets con super tie-break en el tercero.\nInscripción: 10 € (bolas incluidas).",
      modalidad: "individual",
      plazas: 16,
      lugar: "Club de Tenis Leganés",
      ciudad: "Leganés",
      cierreInscripcion: cierreOtono,
      inicio: diaRelativo(10),
    },
    select: { id: true },
  });
  for (const e of estados.slice(5, 10)) {
    await prisma.inscripcionTorneo.create({ data: { torneoId: otono.id, userId: e.id } });
  }

  for (const e of estados) {
    await prisma.user.update({
      where: { id: e.id },
      data: {
        puntosIndividual: e.individual.puntos,
        partidosIndividual: e.individual.partidos,
        victoriasIndividual: e.victorias.individual,
        puntosDobles: e.dobles.puntos,
        partidosDobles: e.dobles.partidos,
        victoriasDobles: e.victorias.dobles,
      },
    });
  }
  // "Buscar partido": convocatorias abiertas en los próximos días
  const convocatorias = [
    { quien: 2, modalidad: "individual", dias: 1, hora: 19, nivel: "avanzado", plazas: 1, comentario: "Pista reservada. Busco a alguien con buen ritmo desde el fondo." },
    { quien: 3, modalidad: "dobles", dias: 2, hora: 10, nivel: null, plazas: 3, comentario: "Partido tranquilo de sábado; luego cañas." },
    { quien: 6, modalidad: "individual", dias: 3, hora: 18, nivel: "intermedio", plazas: 1, comentario: null },
    { quien: 9, modalidad: "individual", dias: 4, hora: 20, nivel: "iniciacion", plazas: 1, comentario: "Estoy empezando: busco alguien con paciencia." },
    { quien: 11, modalidad: "dobles", dias: 5, hora: 17, nivel: "avanzado", plazas: 2, comentario: "Tengo pareja, buscamos rivales de nivel." },
  ] as const;
  for (const c of convocatorias) {
    const creador = estados[c.quien];
    const datos = JUGADORES[c.quien];
    const fechaHora = new Date();
    fechaHora.setDate(fechaHora.getDate() + c.dias);
    fechaHora.setHours(c.hora, 0, 0, 0);
    await prisma.convocatoria.create({
      data: {
        creadorId: creador.id,
        modalidad: c.modalidad,
        fechaHora,
        lugar: elegir(CLUBES.filter((x): x is string => Boolean(x))),
        ciudad: datos[3],
        nivel: c.nivel,
        plazas: c.plazas,
        comentario: c.comentario,
      },
    });
  }
  console.log(
    `Creados ${estados.length} jugadores de ejemplo, ${creados} partidos confirmados y ${convocatorias.length} partidos que buscan jugadores.`,
  );

  if (destino) {
    // Cuatro amistades, una solicitud por responder y un partido por confirmar
    for (const e of estados.slice(0, 4)) {
      await prisma.amistad.create({
        data: { solicitanteId: e.id, receptorId: destino.id, estado: "aceptada", aceptadaEn: new Date() },
      });
    }
    await prisma.amistad.create({ data: { solicitanteId: estados[4].id, receptorId: destino.id } });
    const ayer = new Date(Date.now() - 86_400_000);
    ayer.setUTCHours(12, 0, 0, 0);
    await prisma.partido.create({
      data: {
        modalidad: "individual",
        jugadoEn: ayer,
        lugar: "Club de Tenis Leganés",
        sets: JSON.stringify([[6, 4], [3, 6], [7, 5]]),
        ganador: 1,
        creadoPorId: estados[0].id,
        jugadores: {
          create: [
            { userId: estados[0].id, equipo: 1 },
            { userId: destino.id, equipo: 2 },
          ],
        },
      },
    });
    console.log(
      `@${destino.username}: 4 amigos nuevos, 1 solicitud de amistad y 1 partido por confirmar.`,
    );

    // Y plaza en un partido publicado por una amiga (sale en "Tus próximos partidos")
    const pasadoManana = new Date();
    pasadoManana.setDate(pasadoManana.getDate() + 2);
    pasadoManana.setHours(19, 30, 0, 0);
    await prisma.convocatoria.create({
      data: {
        creadorId: estados[0].id,
        modalidad: "individual",
        fechaHora: pasadoManana,
        lugar: "Club de Tenis Leganés",
        ciudad: "Madrid",
        plazas: 1,
        estado: "completa",
        comentario: "¡Nos vemos en la pista 3!",
        solicitudes: { create: { userId: destino.id, estado: "aceptada", mensaje: "¡Me apunto!" } },
      },
    });
    console.log(`@${destino.username}: además tiene plaza en un partido de pasado mañana.`);
  }
}

const args = process.argv.slice(2);
const indicePara = args.indexOf("--para");
const para = indicePara >= 0 ? (args[indicePara + 1] ?? null) : null;

try {
  if (args.includes("--borrar")) await borrar();
  else await crear(para);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}

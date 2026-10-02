import {
  expect as expectBase,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";

/**
 * «Buscar partido» con tres jugadores: publicar, pedir plaza, aceptar, registrar el
 * resultado, darse de baja y cancelar. No necesita el motor de análisis.
 */

const expect = expectBase.configure({ timeout: 20_000 });
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const SUFIJO = Date.now().toString(36);
const PASSWORD = "contraseña-convocatorias-e2e";
const ZONA = "Europe/Madrid";

type Jugador = {
  username: string;
  nombre: string;
  apellidos: string;
  ciudad: string;
  contexto?: BrowserContext;
  page?: Page;
};

const ANA: Jugador = { username: `e2e_c_ana_${SUFIJO}`, nombre: "Ana", apellidos: "García Pérez", ciudad: "Leganés" };
const BEA: Jugador = { username: `e2e_c_bea_${SUFIJO}`, nombre: "Bea", apellidos: "López Ruiz", ciudad: "Leganés" };
const CARLOS: Jugador = { username: `e2e_c_carlos_${SUFIJO}`, nombre: "Carlos", apellidos: "Martín Gil", ciudad: "Getafe" };
const TODOS = [ANA, BEA, CARLOS];
const LUGAR = `Club de pruebas ${SUFIJO}`;

/** Día y hora (en España) dentro de unos 45 minutos; si eso ya es mañana, mañana a las 18:00. */
function cuandoJugar(): { dia: string; hora: string; hoy: boolean } {
  const partes = (fecha: Date) =>
    Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: ZONA,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      })
        .formatToParts(fecha)
        .map((p) => [p.type, p.value]),
    );
  const ahora = partes(new Date());
  const luego = partes(new Date(Date.now() + 45 * 60_000));
  const hoy = `${ahora.year}-${ahora.month}-${ahora.day}`;
  const diaLuego = `${luego.year}-${luego.month}-${luego.day}`;
  if (diaLuego !== hoy || Number(luego.hour) >= 23) {
    const manana = partes(new Date(Date.now() + 24 * 3_600_000));
    return { dia: `${manana.year}-${manana.month}-${manana.day}`, hora: "18:00", hoy: false };
  }
  return { dia: hoy, hora: `${luego.hour}:${luego.minute}`, hoy: true };
}

async function crear(browser: Browser, jugador: Jugador) {
  jugador.contexto = await browser.newContext({
    baseURL: BASE,
    locale: "es-ES",
    timezoneId: ZONA,
    viewport: { width: 1280, height: 900 },
  });
  jugador.page = await jugador.contexto.newPage();
  const registro = await jugador.contexto.request.post("/api/auth/registro", {
    data: {
      username: jugador.username,
      password: PASSWORD,
      nombre: jugador.nombre,
      apellidos: jugador.apellidos,
      edad: 25,
      altura: 175,
      peso: 70,
      aceptaPrivacidad: true,
    },
  });
  expect(registro.status()).toBe(201);
  const perfil = await jugador.contexto.request.patch("/api/auth/me", {
    data: { perfilPublico: true, ciudad: jugador.ciudad, nivel: "intermedio" },
  });
  expect(perfil.status()).toBe(200);
}

const pagina = (j: Jugador) => j.page!;
const api = (j: Jugador) => j.contexto!.request;

test.describe.configure({ mode: "serial", timeout: 6 * 60_000 });

test.afterAll(async () => {
  for (const jugador of TODOS) {
    if (!jugador.contexto) continue;
    await jugador.contexto.request
      .delete("/api/auth/me", { data: { password: PASSWORD } })
      .catch(() => undefined);
    await jugador.contexto.close();
  }
});

test("buscar partido: publicar, pedir plaza, aceptar, resultado, baja y cancelación", async ({ browser }) => {
  for (const jugador of TODOS) await crear(browser, jugador);
  const ana = pagina(ANA);
  const bea = pagina(BEA);
  const carlos = pagina(CARLOS);
  const cuando = cuandoJugar();
  let detalle = "";

  await test.step("publicar un partido", async () => {
    await ana.goto("/comunidad/convocatorias/nueva");
    await ana.getByLabel("Día").fill(cuando.dia);
    await ana.getByLabel("Hora").fill(cuando.hora);
    await ana.getByLabel("Lugar").fill(LUGAR);
    // La ciudad sale del perfil
    await expect(ana.getByLabel("Ciudad")).toHaveValue("Leganés");
    await ana.getByLabel("Nivel que buscas").selectOption("intermedio");
    await ana.getByLabel("Comentario (opcional)").fill("Pista reservada, llevo bolas.");
    await ana.getByRole("button", { name: "Publicar partido" }).click();

    await expect(ana).toHaveURL(/\/comunidad\/convocatorias\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    detalle = new URL(ana.url()).pathname;
    await expect(ana.getByText(`${LUGAR} · Leganés`)).toBeVisible();
    await expect(ana.getByText("Aún nadie ha pedido plaza.")).toBeVisible();
  });

  await test.step("los jugadores de la ciudad lo ven y piden plaza", async () => {
    await bea.goto("/comunidad/convocatorias");
    const buscan = bea.getByRole("region", { name: "Partidos que buscan jugadores" });
    await buscan.getByRole("link", { name: new RegExp(LUGAR) }).click();
    await expect(bea).toHaveURL(detalle);
    await bea.getByRole("button", { name: "Pedir plaza" }).click();
    const dialogo = bea.getByRole("dialog");
    await dialogo.getByLabel("Mensaje (opcional)").fill("Juego de fondo, nivel intermedio.");
    await dialogo.getByRole("button", { name: "Enviar solicitud" }).click();
    await expect(bea.getByText("Has pedido plaza.")).toBeVisible();

    // Carlos es de Getafe: no lo ve con su ciudad, sí con «Todas las ciudades»
    await carlos.goto("/comunidad/convocatorias");
    const paraCarlos = carlos.getByRole("region", { name: "Partidos que buscan jugadores" });
    await expect(paraCarlos).not.toContainText(LUGAR);
    await carlos.getByRole("link", { name: "Todas las ciudades" }).click();
    await expect(paraCarlos).toContainText(LUGAR);
  });

  await test.step("quien lo publicó da la plaza y el partido queda completo", async () => {
    await ana.goto("/comunidad");
    await expect(ana.getByRole("link", { name: /Comunidad/ }).first()).toContainText("1");
    const pendiente = ana.getByRole("region", { name: "Pendiente de ti" });
    await expect(pendiente).toContainText("1 jugador pide plaza");
    await pendiente.getByRole("link", { name: "Ver solicitudes" }).click();

    const piden = ana.getByRole("region", { name: /Piden plaza/ });
    await expect(piden).toContainText("Bea L.");
    await expect(piden).toContainText("Juego de fondo, nivel intermedio.");
    await piden.getByRole("button", { name: "Dar plaza a Bea L." }).click();
    await expect(ana.getByText("¡Partido completo!").first()).toBeVisible();
    await expect(ana.getByRole("region", { name: "Jugadores" })).toContainText("Bea L.");

    // Ya no busca jugadores
    await carlos.reload();
    await expect(carlos.getByRole("region", { name: "Partidos que buscan jugadores" })).not.toContainText(LUGAR);

    // Bea lo tiene entre sus próximos partidos
    await bea.goto("/comunidad");
    const proximos = bea.getByRole("region", { name: "Tus próximos partidos" });
    await expect(proximos).toContainText(LUGAR);
    await expect(proximos).toContainText("Juegas");
  });

  await test.step("registrar el resultado desde el partido publicado", async () => {
    // El resultado se registra desde el día del partido; de noche el de prueba cae mañana
    // (no se usa test.skip: cortaría también los pasos siguientes)
    if (!cuando.hoy) {
      test.info().annotations.push({
        type: "omitido",
        description: "Registrar el resultado: el partido de prueba cae mañana",
      });
      return;
    }
    await ana.goto(detalle);
    await ana.getByRole("link", { name: "Registrar resultado" }).click();
    await expect(ana.getByText("Resultado del partido del")).toBeVisible();
    // La rival ya viene puesta desde la convocatoria
    await expect(ana.getByText(`@${BEA.username}`)).toBeVisible();
    await ana.getByLabel("Set 1: tus juegos").fill("6");
    await ana.getByLabel("Set 1: juegos del rival").fill("3");
    await ana.getByLabel("Set 2: tus juegos").fill("6");
    await ana.getByLabel("Set 2: juegos del rival").fill("4");
    await ana.getByRole("button", { name: "Registrar partido" }).click();
    await expect(ana).toHaveURL("/comunidad/partidos", { timeout: 30_000 });

    await bea.goto("/comunidad/partidos");
    await bea.getByRole("region", { name: /Por confirmar/ }).getByRole("button", { name: "Confirmar resultado" }).click();
    await expect(bea.getByText("Resultado confirmado")).toBeVisible();

    await ana.goto(detalle);
    await expect(ana.getByText("Resultado registrado.")).toBeVisible();
    // Un segundo resultado para el mismo partido no se acepta
    const repetido = await api(ANA).post("/api/comunidad/partidos", {
      data: {
        modalidad: "individual",
        jugadoEn: cuando.dia,
        rivales: [BEA.username],
        sets: [[6, 0], [6, 0]],
        convocatoriaId: detalle.split("/").pop(),
      },
    });
    expect(repetido.status()).toBe(409);
  });

  await test.step("darse de baja libera la plaza y quien lo publicó puede cancelarlo", async () => {
    const manana = new Date(Date.now() + 26 * 3_600_000).toISOString();
    const creada = await api(ANA).post("/api/comunidad/convocatorias", {
      data: { modalidad: "dobles", plazas: 3, fechaHora: manana, lugar: `Dobles ${SUFIJO}`, ciudad: "Leganés" },
    });
    expect(creada.status()).toBe(201);
    const { id } = (await creada.json()) as { id: string };
    expect((await api(CARLOS).post(`/api/comunidad/convocatorias/${id}/solicitudes`, { data: {} })).status()).toBe(201);
    expect((await api(BEA).post(`/api/comunidad/convocatorias/${id}/solicitudes`, { data: {} })).status()).toBe(201);
    // No se puede pedir plaza dos veces
    expect((await api(BEA).post(`/api/comunidad/convocatorias/${id}/solicitudes`, { data: {} })).status()).toBe(409);
    expect(
      (await api(ANA).patch(`/api/comunidad/convocatorias/${id}/solicitudes/${CARLOS.username}`, { data: { accion: "aceptar" } })).status(),
    ).toBe(200);

    await carlos.goto(`/comunidad/convocatorias/${id}`);
    await expect(carlos.getByText("2 de 4 jugadores")).toBeVisible();
    await carlos.getByRole("button", { name: "Darme de baja" }).click();
    await carlos.getByRole("dialog").getByRole("button", { name: "Darme de baja" }).click();
    await expect(carlos.getByText("Te has dado de baja")).toBeVisible();
    await expect(carlos.getByText("1 de 4 jugadores")).toBeVisible();

    await ana.goto(`/comunidad/convocatorias/${id}`);
    await ana.getByRole("button", { name: "Cancelar partido" }).click();
    await ana.getByRole("dialog").getByRole("button", { name: "Cancelar partido" }).click();
    await expect(ana.getByText("Este partido se ha cancelado.")).toBeVisible();

    // Bea había pedido plaza: lo ve cancelado entre sus próximos partidos
    await bea.goto("/comunidad/convocatorias");
    const deBea = bea.getByRole("region", { name: "Tus próximos partidos" }).getByRole("link", { name: new RegExp(`Dobles ${SUFIJO}`) });
    await expect(deBea).toContainText("Cancelado");
  });
});

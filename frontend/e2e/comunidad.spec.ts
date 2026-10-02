import path from "node:path";
import {
  expect as expectBase,
  test,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";

// En desarrollo, con el equipo cargado, refrescar una página del servidor tras una acción
// puede tardar más de los 10 s por defecto
const expect = expectBase.configure({ timeout: 20_000 });

/**
 * Comunidad con cuatro jugadores, cada uno en su propio navegador: amistad, partido
 * individual confirmado (puntos y ranking), resultado rechazado, dobles, perfil
 * privado y bloqueo. No necesita el motor de análisis. Borra las cuentas al final.
 */

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const CAPTURAS = path.resolve(__dirname, "../../docs/capturas");
const SUFIJO = Date.now().toString(36);
const PASSWORD = "contraseña-comunidad-e2e";

type Jugador = {
  username: string;
  nombre: string;
  apellidos: string;
  ciudad: string;
  publico: boolean;
  contexto?: BrowserContext;
  page?: Page;
};

const ANA: Jugador = { username: `e2e_ana_${SUFIJO}`, nombre: "Ana", apellidos: "García Pérez", ciudad: "Leganés", publico: true };
const BEA: Jugador = { username: `e2e_bea_${SUFIJO}`, nombre: "Bea", apellidos: "López Ruiz", ciudad: "Leganés", publico: true };
const CARLOS: Jugador = { username: `e2e_carlos_${SUFIJO}`, nombre: "Carlos", apellidos: "Martín Gil", ciudad: "Getafe", publico: true };
const DANI: Jugador = { username: `e2e_dani_${SUFIJO}`, nombre: "Dani", apellidos: "Sanz Mora", ciudad: "Madrid", publico: false };
const TODOS = [ANA, BEA, CARLOS, DANI];

async function captura(page: Page, nombre: string, zona?: Locator) {
  if (!process.env.CAPTURAS) return;
  await page.waitForTimeout(600);
  const ruta = path.join(CAPTURAS, `${nombre}.png`);
  if (zona) await zona.screenshot({ path: ruta });
  else await page.screenshot({ path: ruta });
}

/** Crea la cuenta (por la API, en su propio navegador) y configura el perfil de jugador. */
async function crear(browser: Browser, jugador: Jugador) {
  jugador.contexto = await browser.newContext({
    baseURL: BASE,
    locale: "es-ES",
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
    data: { perfilPublico: jugador.publico, ciudad: jugador.ciudad, nivel: "intermedio" },
  });
  expect(perfil.status()).toBe(200);
}

function pagina(jugador: Jugador): Page {
  if (!jugador.page) throw new Error(`Falta el navegador de ${jugador.nombre}`);
  return jugador.page;
}

function api(jugador: Jugador) {
  if (!jugador.contexto) throw new Error(`Falta el navegador de ${jugador.nombre}`);
  return jugador.contexto.request;
}

// En desarrollo Next compila cada ruta la primera vez que se usa: el recorrido completo
// puede pasar de 3 minutos en un portátil
test.describe.configure({ mode: "serial", timeout: 6 * 60_000 });

test.afterAll(async () => {
  // Se borran siempre, aunque el test haya fallado a medias
  for (const jugador of TODOS) {
    if (!jugador.contexto) continue;
    await jugador.contexto.request
      .delete("/api/auth/me", { data: { password: PASSWORD } })
      .catch(() => undefined);
    await jugador.contexto.close();
  }
});

test("amistad, partidos con puntos, ranking, privacidad y bloqueo", async ({ browser }) => {
  for (const jugador of TODOS) await crear(browser, jugador);
  const ana = pagina(ANA);
  const bea = pagina(BEA);
  const carlos = pagina(CARLOS);

  await test.step("buscar jugadores y enviar una solicitud", async () => {
    await ana.goto("/comunidad/amigos");
    const buscador = ana.getByRole("searchbox", { name: "Buscar jugadores" });
    await buscador.fill(BEA.username);
    const fila = ana.getByRole("listitem").filter({ hasText: `@${BEA.username}` });
    // Sin ser amigas, el apellido va con inicial
    await expect(fila).toContainText("Bea L.");
    await fila.getByRole("button", { name: "Añadir amigo" }).click();
    await expect(fila).toContainText("Solicitud enviada");

    // Un perfil privado no sale por coincidencia parcial, solo por su usuario exacto
    await buscador.fill(`e2e_dani_${SUFIJO.slice(0, -1)}`);
    await expect(ana.getByText(/No hay jugadores que coincidan/)).toBeVisible();
    await buscador.fill(DANI.username);
    await expect(ana.getByRole("listitem").filter({ hasText: `@${DANI.username}` })).toContainText(
      "Perfil privado",
    );
  });

  await test.step("aceptar la solicitud desde el resumen", async () => {
    await bea.goto("/comunidad");
    await expect(bea.getByRole("link", { name: /Comunidad/ }).first()).toContainText("1");
    const pendiente = bea.getByRole("region", { name: "Pendiente de ti" });
    await expect(pendiente).toContainText("te ha enviado una solicitud de amistad");
    await pendiente.getByRole("button", { name: "Aceptar" }).click();
    await expect(bea.getByText("Solicitud aceptada")).toBeVisible();

    await bea.goto("/comunidad/amigos");
    // Ya son amigas: nombre completo
    await expect(bea.getByRole("region", { name: /Tus amigos/ })).toContainText("Ana García Pérez");
  });

  await test.step("registrar un partido individual", async () => {
    await ana.goto("/comunidad/partidos/nuevo");
    await ana.getByRole("combobox", { name: "Rival" }).click();
    await ana.getByRole("option", { name: /Bea López Ruiz/ }).click();
    await ana.getByLabel("Set 1: tus juegos").fill("6");
    await ana.getByLabel("Set 1: juegos del rival").fill("4");
    await ana.getByLabel("Set 2: tus juegos").fill("3");
    await ana.getByLabel("Set 2: juegos del rival").fill("6");
    await ana.getByRole("button", { name: "Añadir set" }).click();
    await ana.getByLabel("Set 3: tus juegos").fill("10");
    await ana.getByLabel("Set 3: juegos del rival").fill("8");
    await expect(ana.getByText("Ganas")).toContainText("6-4 3-6 [10-8]");
    await captura(ana, "12-registrar-partido");
    await ana.getByRole("button", { name: "Registrar partido" }).click();

    await expect(ana).toHaveURL("/comunidad/partidos", { timeout: 30_000 });
    await expect(ana.getByRole("region", { name: "Esperando a los rivales" })).toContainText(
      "Pendiente de confirmar",
    );
  });

  await test.step("la rival lo confirma y se reparten los puntos", async () => {
    await bea.goto("/comunidad/partidos");
    const porConfirmar = bea.getByRole("region", { name: /Por confirmar/ });
    await porConfirmar.getByRole("button", { name: "Confirmar resultado" }).click();
    await expect(bea.getByText("Resultado confirmado")).toBeVisible();
    const historial = bea.getByRole("region", { name: "Historial" });
    await expect(historial).toContainText("Derrota");
    await expect(historial).toContainText("-20 puntos");

    await ana.goto("/comunidad/ranking?modalidad=individual&ambito=amigos");
    const filaAna = ana.getByRole("row", { name: /Ana García Pérez/ });
    await expect(filaAna).toContainText("1220");
    await expect(filaAna.getByRole("cell").first()).toContainText("1");
    await expect(ana.getByRole("row", { name: /Bea López Ruiz/ })).toContainText("1180");
  });

  await test.step("un resultado rechazado no cuenta y se puede retirar", async () => {
    const creado = await api(ANA).post("/api/comunidad/partidos", {
      data: {
        modalidad: "individual",
        jugadoEn: new Date().toISOString().slice(0, 10),
        rivales: [BEA.username],
        sets: [[6, 0], [6, 0]],
      },
    });
    expect(creado.status()).toBe(201);

    await bea.goto("/comunidad/partidos");
    await bea.getByRole("region", { name: /Por confirmar/ }).getByRole("button", { name: "No es correcto" }).click();
    await bea.getByRole("dialog").getByRole("button", { name: "Rechazar resultado" }).click();
    await expect(bea.getByText("Has rechazado el resultado")).toBeVisible();

    await ana.goto("/comunidad/partidos");
    const esperando = ana.getByRole("region", { name: "Esperando a los rivales" });
    await expect(esperando).toContainText("Rechazado por el rival");
    await esperando.getByRole("button", { name: "Retirar" }).click();
    await ana.getByRole("dialog").getByRole("button", { name: "Retirar partido" }).click();
    await expect(ana.getByText("Partido retirado")).toBeVisible();
    // Los puntos no cambian
    await ana.goto("/comunidad");
    await expect(ana.getByRole("link", { name: /Individual/ })).toContainText("1220");
  });

  await test.step("dobles: a un perfil privado solo se le apunta siendo amigos", async () => {
    const hoy = new Date().toISOString().slice(0, 10);
    const dobles = {
      modalidad: "dobles",
      jugadoEn: hoy,
      lugar: "Club de pruebas",
      companero: CARLOS.username,
      rivales: [BEA.username, DANI.username],
      sets: [[6, 3], [6, 4]],
    };
    const sinPermiso = await api(ANA).post("/api/comunidad/partidos", { data: dobles });
    expect(sinPermiso.status()).toBe(403);

    // Dani acepta la amistad de Ana y entonces sí
    expect((await api(ANA).post(`/api/comunidad/amigos/${DANI.username}`)).status()).toBe(201);
    expect((await api(DANI).post(`/api/comunidad/amigos/${ANA.username}`)).status()).toBe(200);
    const creado = await api(ANA).post("/api/comunidad/partidos", { data: dobles });
    expect(creado.status()).toBe(201);
    const { id } = (await creado.json()) as { id: string };

    // Lo confirma un rival; el compañero de Ana no puede
    expect((await api(CARLOS).patch(`/api/comunidad/partidos/${id}`, { data: { accion: "confirmar" } })).status()).toBe(403);
    expect((await api(DANI).patch(`/api/comunidad/partidos/${id}`, { data: { accion: "confirmar" } })).status()).toBe(200);
    // Una segunda confirmación no suma otra vez
    expect((await api(BEA).patch(`/api/comunidad/partidos/${id}`, { data: { accion: "confirmar" } })).status()).toBe(409);

    await carlos.goto(`/jugador/${CARLOS.username}`);
    await expect(carlos.getByText("Dobles").first()).toBeVisible();
    await expect(carlos.locator("text=1220").first()).toBeVisible();
  });

  await test.step("perfil privado y bloqueo", async () => {
    // Carlos no es amigo de Dani: solo ve que el perfil es privado
    await carlos.goto(`/jugador/${DANI.username}`);
    await expect(carlos.getByText("Este perfil es privado")).toBeVisible();
    await expect(carlos.getByRole("heading", { level: 1 })).toHaveText("Dani S.");

    // Bea bloquea a Carlos desde su perfil
    await bea.goto(`/jugador/${CARLOS.username}`);
    await bea.getByRole("button", { name: "Más opciones" }).click();
    await bea.getByRole("menuitem", { name: "Bloquear" }).click();
    await bea.getByRole("dialog").getByRole("button", { name: "Bloquear" }).click();
    await expect(bea.getByText(`Has bloqueado a ${CARLOS.nombre}`)).toBeVisible();
    await expect(bea.getByRole("button", { name: "Desbloquear" })).toBeVisible();

    // Para Carlos, el perfil de Bea ya no existe
    const respuesta = await carlos.goto(`/jugador/${BEA.username}`);
    expect(respuesta?.status()).toBe(404);
  });

  await test.step("ajustes: datos personales y perfil de jugador", async () => {
    await ana.goto("/perfil/ajustes");
    await ana.getByLabel("Peso (kg)").fill("61.5");
    await ana.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(ana.getByText("Datos actualizados")).toBeVisible();

    const perfil = ana.getByRole("region", { name: "Perfil de jugador" });
    await perfil.getByLabel("Club").fill("Club de Tenis Leganés");
    await perfil.getByLabel("Cuándo sueles jugar").fill("Tardes entre semana");
    await perfil.getByRole("button", { name: "Guardar perfil de jugador" }).click();
    await expect(ana.getByText("Perfil de jugador actualizado")).toBeVisible();

    await ana.goto(`/jugador/${ANA.username}`);
    await expect(ana.getByText("Club de Tenis Leganés")).toBeVisible();
    await expect(ana.getByText("Suele jugar: Tardes entre semana")).toBeVisible();
  });

  await test.step("perfil de una amiga con enfrentamientos y evolución", async () => {
    await ana.goto(`/jugador/${BEA.username}`);
    await expect(ana.getByRole("heading", { level: 1 })).toHaveText("Bea López Ruiz");
    // El individual y el de dobles (en equipos contrarios)
    await expect(ana.getByText("Vuestros enfrentamientos")).toContainText("tú 2 – 0");
    await expect(ana.getByRole("region", { name: "Evolución de los puntos" })).toBeVisible();
    await captura(ana, "11-jugador");

    await ana.goto("/comunidad");
    await captura(ana, "09-comunidad");
    await ana.goto("/comunidad/ranking?modalidad=individual&ambito=amigos");
    await captura(ana, "10-ranking");
  });

  await test.step("borrar la cuenta conserva los partidos confirmados de los demás", async () => {
    // Dani deja un partido pendiente con Ana y borra su cuenta desde Ajustes
    const pendiente = await api(DANI).post("/api/comunidad/partidos", {
      data: {
        modalidad: "individual",
        jugadoEn: new Date().toISOString().slice(0, 10),
        rivales: [ANA.username],
        sets: [[6, 2], [6, 2]],
      },
    });
    expect(pendiente.status()).toBe(201);

    const dani = pagina(DANI);
    await dani.goto("/perfil/ajustes");
    await dani.getByRole("button", { name: "Borrar mi cuenta" }).click();
    const dialogo = dani.getByRole("dialog");
    await dialogo.getByLabel("Contraseña", { exact: true }).fill(PASSWORD);
    await dialogo.getByRole("button", { name: "Borrar cuenta" }).click();
    await expect(dani).toHaveURL("/", { timeout: 30_000 });

    // El dobles confirmado sigue en el historial de Ana, sin el nombre de Dani,
    // y el partido pendiente ha desaparecido
    await ana.goto("/comunidad/partidos");
    await expect(ana.getByRole("region", { name: /Por confirmar/ })).toHaveCount(0);
    const historial = ana.getByRole("region", { name: "Historial" });
    await expect(historial).toContainText("Cuenta eliminada");
    await expect(historial.locator("article").filter({ hasText: "Victoria" })).toHaveCount(2);
    await ana.goto("/comunidad");
    await expect(ana.getByRole("link", { name: /Dobles/ })).toContainText("1220");
  });
});

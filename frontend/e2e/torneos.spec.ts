import { execFileSync } from "node:child_process";
import path from "node:path";
import {
  expect as expectBase,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";

/**
 * Torneos: solo los crea un organizador; inscripción, sorteo con cabezas de serie y
 * pases directos, resultados hasta el campeón e invitación de pareja en dobles.
 */

const expect = expectBase.configure({ timeout: 20_000 });
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const FRONTEND = path.resolve(__dirname, "..");
const SUFIJO = Date.now().toString(36);
const PASSWORD = "contraseña-torneos-e2e";
const NOMBRE_TORNEO = `Open de pruebas ${SUFIJO}`;

type Jugador = { username: string; nombre: string; contexto?: BrowserContext; page?: Page };

const ORGANIZADOR: Jugador = { username: `e2e_t_club_${SUFIJO}`, nombre: "Club" };
const JUGADORES: Jugador[] = ["Alba", "Blas", "Ciro", "Dora", "Eloy"].map((nombre) => ({
  username: `e2e_t_${nombre.toLowerCase()}_${SUFIJO}`,
  nombre,
}));
const TODOS = [ORGANIZADOR, ...JUGADORES];

async function crear(browser: Browser, jugador: Jugador) {
  jugador.contexto = await browser.newContext({
    baseURL: BASE,
    locale: "es-ES",
    timezoneId: "Europe/Madrid",
    viewport: { width: 1440, height: 900 },
  });
  jugador.page = await jugador.contexto.newPage();
  const registro = await jugador.contexto.request.post("/api/auth/registro", {
    data: {
      username: jugador.username,
      password: PASSWORD,
      nombre: jugador.nombre,
      apellidos: "Pruebas Torneo",
      edad: 30,
      altura: 175,
      peso: 70,
      aceptaPrivacidad: true,
    },
  });
  expect(registro.status()).toBe(201);
  const perfil = await jugador.contexto.request.patch("/api/auth/me", {
    data: { perfilPublico: true, ciudad: "Leganés" },
  });
  expect(perfil.status()).toBe(200);
}

const api = (j: Jugador) => j.contexto!.request;

test.describe.configure({ mode: "serial", timeout: 8 * 60_000 });

test.afterAll(async () => {
  for (const jugador of TODOS) {
    if (!jugador.contexto) continue;
    await jugador.contexto.request.delete("/api/auth/me", { data: { password: PASSWORD } }).catch(() => undefined);
    await jugador.contexto.close();
  }
});

test("torneo de eliminatoria: inscripción, sorteo, resultados y campeón", async ({ browser }) => {
  for (const jugador of TODOS) await crear(browser, jugador);
  const club = ORGANIZADOR.page!;
  const alba = JUGADORES[0].page!;
  let torneoUrl = "";

  await test.step("solo los organizadores crean torneos", async () => {
    const intento = await api(JUGADORES[0]).post("/api/comunidad/torneos", { data: { nombre: "No vale" } });
    expect(intento.status()).toBe(403);
    await alba.goto("/comunidad/torneos/nuevo");
    await expect(alba.getByText("Solo las cuentas de organizador")).toBeVisible();

    // El rol lo da el administrador con el script, no la web
    execFileSync(
      process.execPath,
      [path.join(FRONTEND, "scripts/organizador.mts"), ORGANIZADOR.username, "--organizacion", `Club E2E ${SUFIJO}`],
      { cwd: FRONTEND, stdio: "pipe" },
    );
  });

  await test.step("el organizador crea el torneo", async () => {
    await club.goto("/comunidad/torneos/nuevo");
    await club.getByLabel("Nombre del torneo").fill(NOMBRE_TORNEO);
    await club.getByLabel("Lugar").fill("Club de pruebas");
    await club.getByRole("button", { name: "Crear torneo" }).click();
    await expect(club).toHaveURL(/\/comunidad\/torneos\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    torneoUrl = new URL(club.url()).pathname;
    await expect(club.getByRole("heading", { name: NOMBRE_TORNEO })).toBeVisible();
    await expect(club.getByText(`Organiza Club E2E ${SUFIJO}`)).toBeVisible();
  });

  await test.step("cinco jugadores se inscriben", async () => {
    await alba.goto(torneoUrl);
    await alba.getByRole("button", { name: "Inscribirme" }).click();
    await alba.getByRole("dialog").getByRole("button", { name: "Inscribirme" }).click();
    await expect(alba.getByText("Tienes plaza en el torneo.")).toBeVisible();
    const torneoId = torneoUrl.split("/").pop();
    for (const jugador of JUGADORES.slice(1)) {
      const inscripcion = await api(jugador).post(`/api/comunidad/torneos/${torneoId}/inscripcion`, { data: {} });
      expect(inscripcion.status()).toBe(201);
    }
    // Nadie se inscribe dos veces
    expect((await api(JUGADORES[1]).post(`/api/comunidad/torneos/${torneoId}/inscripcion`, { data: {} })).status()).toBe(409);
    await club.reload();
    await expect(club.getByRole("region", { name: /Inscritos/ })).toContainText("5/8");
  });

  await test.step("sorteo: cuadro de 8 con tres pases directos", async () => {
    await club.getByRole("button", { name: "Cerrar inscripción y sortear el cuadro" }).click();
    await club.getByRole("dialog").getByRole("button", { name: "Sortear cuadro" }).click();
    await expect(club.getByText("Cuadro sorteado")).toBeVisible();
    const cuadro = club.getByRole("region", { name: "Cuadro" });
    await expect(cuadro.getByRole("region", { name: "Cuartos de final" })).toBeVisible();
    await expect(cuadro.getByText("Pasa directamente")).toHaveCount(3);
    // Ya no se puede inscribir nadie
    await alba.reload();
    await expect(alba.getByRole("button", { name: "Inscribirme" })).toHaveCount(0);
    // Los jugadores ven el cuadro, pero no pueden anotar resultados
    await expect(alba.getByRole("region", { name: "Cuadro" })).toBeVisible();
    await expect(alba.getByRole("button", { name: /Anotar resultado/ })).toHaveCount(0);
  });

  await test.step("el organizador anota los cuatro partidos hasta el campeón", async () => {
    const cuadro = club.getByRole("region", { name: "Cuadro" });
    for (let partido = 1; partido <= 4; partido += 1) {
      await club.getByRole("button", { name: /Anotar resultado/ }).first().click();
      const dialogo = club.getByRole("dialog");
      const casillas = dialogo.getByRole("textbox");
      await casillas.nth(0).fill("6");
      await casillas.nth(1).fill("2");
      await casillas.nth(2).fill("6");
      await casillas.nth(3).fill("3");
      await expect(dialogo.getByText(/^Gana /)).toBeVisible();
      await dialogo.getByRole("button", { name: "Guardar resultado" }).click();
      await expect(dialogo).toBeHidden();
      // El cuadro ya refleja el resultado antes de pasar al siguiente cruce
      await expect(cuadro.getByText("6-2 6-3")).toHaveCount(partido);
    }
    await expect(club.getByText("Campeón del torneo")).toBeVisible();
    await expect(club.getByRole("button", { name: /Anotar resultado/ })).toHaveCount(0);
  });

  await test.step("el campeón luce el título en su perfil y suma puntos", async () => {
    await club.getByText("Campeón del torneo").locator("..").getByRole("link").click();
    await expect(club).toHaveURL(/\/jugador\//);
    await expect(club.getByRole("link", { name: new RegExp(`Campeón · ${NOMBRE_TORNEO}`) })).toBeVisible();
    // Ganó tres partidos (o dos, si pasó directo): sus puntos individuales ya no son 1200
    await expect(club.getByText("Individual").first().locator("..")).not.toContainText(/\b1200\s*puntos/);
  });

  await test.step("dobles: la pareja invitada acepta desde el resumen", async () => {
    const creado = await api(ORGANIZADOR).post("/api/comunidad/torneos", {
      data: {
        nombre: `Dobles de pruebas ${SUFIJO}`,
        modalidad: "dobles",
        plazas: 4,
        lugar: "Club de pruebas",
        ciudad: "Leganés",
        inicio: new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10),
        cierreInscripcion: new Date(Date.now() + 5 * 86_400_000).toISOString(),
      },
    });
    expect(creado.status()).toBe(201);
    const { id } = (await creado.json()) as { id: string };
    const invitacion = await api(JUGADORES[0]).post(`/api/comunidad/torneos/${id}/inscripcion`, {
      data: { companero: JUGADORES[1].username },
    });
    expect(invitacion.status()).toBe(201);

    const blas = JUGADORES[1].page!;
    await blas.goto("/comunidad");
    const pendiente = blas.getByRole("region", { name: "Pendiente de ti" });
    await expect(pendiente).toContainText("te invita a jugar en pareja");
    await pendiente.getByRole("link", { name: "Responder" }).click();
    await blas.getByRole("button", { name: /Aceptar y jugar con/ }).click();
    await expect(blas.getByText("¡Ya tenéis plaza en el torneo!")).toBeVisible();
    await expect(blas.getByRole("region", { name: /Inscritos/ })).toContainText("1/4");
  });
});

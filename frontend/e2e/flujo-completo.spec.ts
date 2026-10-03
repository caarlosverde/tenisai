import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * Recorrido completo de un usuario nuevo. Necesita el backend en marcha
 * (docker compose up -d). Borra su propia cuenta al final.
 *
 * Con CAPTURAS=1 guarda capturas de cada pantalla en docs/capturas para el README.
 */

const VIDEO = path.resolve(__dirname, "../../data/prueba.mp4");
const CAPTURAS = path.resolve(__dirname, "../../docs/capturas");
const USUARIO = `e2e_${Date.now()}`;
const PASSWORD = "contraseña-de-prueba-e2e";
// En un portátil con la CPU compartida (navegador + Next + Docker) un análisis puede
// pasar de 5 minutos; E2E_ANALISIS_MAX_MIN permite ajustarlo
const ANALISIS_MAX_MS = Number(process.env.E2E_ANALISIS_MAX_MIN ?? 10) * 60_000;

/** Captura de la página (o solo de una zona) para el README, si CAPTURAS=1. */
async function captura(page: Page, nombre: string, zona?: Locator) {
  if (!process.env.CAPTURAS) return;
  await page.waitForTimeout(600); // deja terminar las animaciones de entrada
  const ruta = path.join(CAPTURAS, `${nombre}.png`);
  if (zona) await zona.screenshot({ path: ruta });
  else await page.screenshot({ path: ruta });
}

async function analizarVideo(page: Page, nombre: string) {
  // El primero elige un archivo; el segundo es el de la cámara del móvil
  await page.locator('input[type="file"]').first().setInputFiles({
    name: `${nombre}.mp4`,
    mimeType: "video/mp4",
    buffer: await readFile(VIDEO),
  });
  // El guardado en el historial es lo que importa; en desarrollo Next compila la ruta
  // en la primera petición y el aviso puede tardar más que el análisis en mostrarse
  const guardado = page.waitForResponse(
    (r) => r.url().includes("/api/analisis/guardar") && r.request().method() === "POST",
    { timeout: ANALISIS_MAX_MS + 2 * 60_000 },
  );
  await page.getByRole("button", { name: "Iniciar Análisis Biomecánico" }).click();
  await expect(page.getByRole("heading", { name: "Analizando tu golpe" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Resultados del Análisis" })).toBeVisible({
    timeout: ANALISIS_MAX_MS,
  });
  expect((await guardado).status()).toBe(201);
  await expect(page.getByText("Análisis concluido y guardado en tu perfil")).toBeVisible();
}

test.describe.configure({ mode: "serial", timeout: 2 * ANALISIS_MAX_MS + 5 * 60_000 });

test("registro, dos análisis, comparación, borrado y baja de la cuenta", async ({ page }) => {
  await test.step("portada para visitantes", async () => {
    await page.goto("/");
    await captura(page, "01-portada");
  });

  await test.step("registro con consentimiento", async () => {
    await page.goto("/registro");
    await page.getByLabel("Usuario").fill(USUARIO);
    await page.getByLabel("Contraseña", { exact: true }).fill(PASSWORD);
    await page.getByLabel("Nombre").fill("Playwright");
    await page.getByLabel("Apellidos").fill("Prueba Automática");
    await page.getByLabel("Edad").fill("27");
    await page.getByLabel("Altura (cm)").fill("178");
    await page.getByLabel("Peso (kg)").fill("72");
    await page.getByRole("checkbox", { name: /política de privacidad/ }).check();
    await captura(page, "02-registro");
    await page.getByRole("button", { name: "Crear cuenta" }).click();

    // El registro deja la sesión iniciada
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("button", { name: "Abrir menú de usuario" })).toContainText("Playwright");
  });

  await test.step("primer análisis", async () => {
    await analizarVideo(page, "derecha_antes");
    await captura(page, "03-resultados");
  });

  await test.step("segundo análisis", async () => {
    await page.getByRole("button", { name: "Analizar nuevo vídeo" }).click();
    await analizarVideo(page, "derecha_despues");
  });

  await test.step("historial con evolución", async () => {
    await page.getByRole("link", { name: "Ver en mis análisis" }).click();
    await expect(page).toHaveURL("/perfil");
    await expect(page.getByRole("heading", { name: "Hola, Playwright" })).toBeVisible();
    const filas = page.locator("table tbody tr");
    await expect(filas).toHaveCount(2);
    await captura(page, "04-perfil");
  });

  await test.step("comparar antes y después", async () => {
    await page.getByRole("checkbox", { name: /Comparar derecha_antes/ }).check();
    await page.getByRole("checkbox", { name: /Comparar derecha_despues/ }).check();
    await page.getByRole("link", { name: "Comparar", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Antes y después" })).toBeVisible();
    await expect(page.locator("video")).toHaveCount(2);
    await expect(page.getByText(/se mantienen?/)).toBeVisible();
    await captura(page, "05-comparar");
  });

  await test.step("detalle: cámara lenta y fallos uno a uno", async () => {
    await page.goto("/perfil");
    await page.getByRole("link", { name: "derecha_antes" }).click();
    await expect(page.getByRole("heading", { name: "derecha_antes" })).toBeVisible();

    const vistas = page.locator("article").filter({ has: page.getByRole("tablist") });
    await expect(page.getByRole("tab", { name: /Cámara lenta/ })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("button", { name: /Pausar|Reproducir/ }).first()).toBeVisible();
    await page.waitForTimeout(3000); // deja avanzar la cámara lenta con el zoom
    await captura(page, "06-camara-lenta", vistas);

    await page.getByRole("tab", { name: /Fallos uno a uno/ }).click();
    await expect(page.getByRole("region", { name: "Fallos uno a uno" })).toBeVisible();
    // La primera imagen del fallo se genera en el navegador a partir del vídeo
    await expect(page.locator('img[alt*="zona del fallo"]').first()).toBeVisible({ timeout: 60_000 });
    await captura(page, "07-fallos", vistas);

    await page.getByRole("button", { name: "Ver este momento a cámara lenta" }).click();
    await expect(page.getByRole("tab", { name: /Cámara lenta/ })).toHaveAttribute("aria-selected", "true");
  });

  await test.step("borrar un análisis", async () => {
    await page.getByRole("button", { name: "Borrar", exact: true }).click();
    const dialogo = page.getByRole("dialog");
    await expect(dialogo).toBeVisible();
    await dialogo.getByRole("button", { name: "Borrar análisis" }).click();
    // En desarrollo Next compila la ruta de borrado en su primera llamada (de 10 a 30 s
    // según la carga del equipo)
    await expect(page).toHaveURL("/perfil", { timeout: 60_000 });
    await expect(page.locator("table tbody tr")).toHaveCount(1);
  });

  await test.step("editar datos en ajustes", async () => {
    await page.getByRole("link", { name: "Ajustes de la cuenta" }).click();
    await page.getByLabel("Peso (kg)").fill("73.5");
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(page.getByText("Datos actualizados")).toBeVisible();
    await captura(page, "08-ajustes");
  });

  await test.step("borrar la cuenta (RGPD)", async () => {
    await page.getByRole("button", { name: "Borrar mi cuenta" }).click();
    const dialogo = page.getByRole("dialog");
    await dialogo.getByLabel("Contraseña", { exact: true }).fill(PASSWORD);
    await dialogo.getByRole("button", { name: "Borrar cuenta" }).click();
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("link", { name: "Iniciar sesión" })).toBeVisible();

    // La cuenta ya no existe
    await page.goto("/login");
    await page.getByLabel("Usuario").fill(USUARIO);
    await page.getByLabel("Contraseña", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.locator("form").getByRole("alert")).toContainText("Credenciales incorrectas");
  });
});

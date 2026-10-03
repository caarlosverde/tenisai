import { expect, test } from "@playwright/test";

// Pruebas rápidas que no necesitan el motor de análisis.

test("un visitante ve la portada con la guía y la zona de subida", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { level: 1, name: /Tu técnica de tenis/ }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Cómo conseguir un buen análisis" })).toBeVisible();

  await page.getByRole("link", { name: "Analizar un vídeo gratis" }).click();
  await expect(page).toHaveURL(/#analizar$/);
  await expect(page.getByRole("button", { name: "Seleccionar un vídeo para analizar" })).toBeVisible();
  // El botón de la cámara solo aparece en pantallas táctiles
  await expect(page.getByRole("button", { name: "Grabar el golpe con la cámara" })).toBeHidden();

  await expect(page.getByRole("contentinfo").getByRole("link", { name: "Política de privacidad" })).toBeVisible();
});

for (const ruta of [
  "/perfil",
  "/perfil/ajustes",
  "/analisis/cualquiera",
  "/comunidad",
  "/comunidad/ranking",
  "/jugador/cualquiera",
]) {
  test(`${ruta} sin sesión lleva al login y conserva el destino`, async ({ page }) => {
    await page.goto(ruta);
    await expect(page).toHaveURL(`/login?next=${encodeURIComponent(ruta)}`);
    await expect(page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
  });
}

test("un login incorrecto muestra el error en el formulario", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Usuario").fill(`no_existe_${Date.now()}`);
  await page.getByLabel("Contraseña", { exact: true }).fill("contraseña-incorrecta");
  await page.getByRole("button", { name: "Entrar" }).click();
  // Dentro del formulario: Next tiene otro role="alert" para anunciar cambios de ruta
  await expect(page.locator("form").getByRole("alert")).toContainText("Credenciales incorrectas");
  await expect(page).toHaveURL(/\/login/);
});

test("el registro exige aceptar la política de privacidad", async ({ page }) => {
  await page.goto("/registro");
  await page.getByLabel("Usuario").fill(`sin_consentimiento_${Date.now()}`);
  await page.getByLabel("Contraseña", { exact: true }).fill("una-contraseña-larga");
  await page.getByLabel("Nombre").fill("Prueba");
  await page.getByLabel("Apellidos").fill("Sin Consentimiento");
  await page.getByLabel("Edad").fill("30");
  await page.getByLabel("Altura (cm)").fill("180");
  await page.getByLabel("Peso (kg)").fill("75");
  await page.getByRole("button", { name: "Crear cuenta" }).click();

  // La validación del navegador impide enviar el formulario
  await expect(page).toHaveURL("/registro");
  const casilla = page.getByRole("checkbox", { name: /política de privacidad/ });
  expect(await casilla.evaluate((el: HTMLInputElement) => el.validity.valid)).toBe(false);
});

test("una dirección que no existe muestra la página 404 propia", async ({ page }) => {
  const respuesta = await page.goto("/esta-pagina-no-existe");
  expect(respuesta?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Esta página no existe" })).toBeVisible();
  await expect(page).toHaveTitle("Página no encontrada — TenisAI");
});

test("las páginas legales están enlazadas y tienen título propio", async ({ page }) => {
  await page.goto("/privacidad");
  await expect(page).toHaveTitle("Política de privacidad — TenisAI");
  await expect(page.getByRole("heading", { name: "Tus derechos" })).toBeVisible();
  await page.getByRole("contentinfo").getByRole("link", { name: "Aviso legal" }).click();
  await expect(page).toHaveURL("/aviso-legal");
});

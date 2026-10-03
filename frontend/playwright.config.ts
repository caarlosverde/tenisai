import { defineConfig } from "@playwright/test";

/**
 * Tests de extremo a extremo. Requieren el frontend (se arranca solo si no está en
 * marcha) y, para el flujo completo, el backend de Docker (docker compose up -d).
 *
 *   npm run test:e2e                          # todos
 *   CAPTURAS=1 npx playwright test flujo      # además guarda capturas en docs/capturas
 */
export default defineConfig({
  testDir: "./e2e",
  // Un solo trabajador: el backend procesa los análisis de uno en uno
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    // En Windows se usa el Edge instalado: no hace falta descargar navegadores
    channel: process.platform === "win32" ? "msedge" : undefined,
    locale: "es-ES",
    viewport: { width: 1440, height: 900 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev",
    // Con E2E_BASE_URL (p. ej. un next start en otro puerto) se usa ese servidor
    url: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});

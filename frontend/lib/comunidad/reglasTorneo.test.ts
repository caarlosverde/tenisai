import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { validarTorneo } from "./reglasTorneo.ts";

const AHORA = new Date("2026-10-02T10:00:00Z");
const BASE = {
  nombre: "  Open   de otoño ",
  modalidad: "individual",
  plazas: 8,
  lugar: "Club de Tenis Leganés",
  ciudad: "Leganés",
  inicio: "2026-10-17",
  cierreInscripcion: "2026-10-15T20:00:00Z",
};

function error(cambios: Record<string, unknown>) {
  const resultado = validarTorneo({ ...BASE, ...cambios }, AHORA);
  assert.equal(resultado.ok, false);
  return resultado.ok ? "" : resultado.error;
}

describe("validarTorneo", () => {
  test("un torneo válido limpia el nombre y guarda el inicio a mediodía UTC", () => {
    const resultado = validarTorneo(BASE, AHORA);
    assert.ok(resultado.ok);
    assert.equal(resultado.datos.nombre, "Open de otoño");
    assert.equal(resultado.datos.inicio.toISOString(), "2026-10-17T12:00:00.000Z");
    assert.equal(resultado.datos.descripcion, null);
  });

  test("plazas de cuadro de eliminatoria", () => {
    for (const plazas of [4, 8, 16, 32]) assert.ok(validarTorneo({ ...BASE, plazas }, AHORA).ok);
    assert.match(error({ plazas: 6 }), /4, 8, 16, 32/);
  });

  test("fechas coherentes", () => {
    assert.match(error({ inicio: "2026-09-30" }), /pasado/);
    assert.match(error({ inicio: "2027-06-01", cierreInscripcion: "2027-05-30T10:00:00Z" }), /180 días/);
    assert.match(error({ cierreInscripcion: "2026-10-01T10:00:00Z" }), /futuro/);
    assert.match(error({ cierreInscripcion: "2026-10-18T10:00:00Z" }), /como tarde/);
    assert.match(error({ inicio: "17/10/2026" }), /día en que empieza/);
    // Cerrar el mismo día del inicio sí vale
    assert.ok(validarTorneo({ ...BASE, cierreInscripcion: "2026-10-17T08:00:00Z" }, AHORA).ok);
  });

  test("campos obligatorios y límites", () => {
    assert.match(error({ nombre: "ab" }), /nombre/);
    assert.match(error({ lugar: " " }), /dónde se juega/);
    assert.match(error({ ciudad: "" }), /ciudad/);
    assert.match(error({ modalidad: "mixto" }), /individual o dobles/);
    assert.match(error({ nivel: "experto" }), /nivel/);
    assert.match(error({ descripcion: "x".repeat(1001) }), /1000/);
  });
});

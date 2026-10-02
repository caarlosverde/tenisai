import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  diaEnEspana,
  puedeRegistrarResultado,
  textoPlazas,
  validarConvocatoria,
} from "./reglasConvocatoria.ts";

const AHORA = new Date("2026-10-01T10:00:00Z");
const dentroDe = (minutos: number) => new Date(AHORA.getTime() + minutos * 60_000).toISOString();

const BASE = {
  modalidad: "individual",
  fechaHora: dentroDe(24 * 60),
  lugar: "  Club   de Tenis Leganés ",
  ciudad: "Leganés",
};

function error(entrada: Record<string, unknown>) {
  const resultado = validarConvocatoria(entrada, AHORA);
  assert.equal(resultado.ok, false);
  return resultado.ok ? "" : resultado.error;
}

describe("validarConvocatoria", () => {
  test("individual válida: limpia espacios y busca un rival", () => {
    const resultado = validarConvocatoria(BASE, AHORA);
    assert.ok(resultado.ok);
    assert.equal(resultado.datos.lugar, "Club de Tenis Leganés");
    assert.equal(resultado.datos.plazas, 1);
    assert.equal(resultado.datos.nivel, null);
    assert.equal(resultado.datos.comentario, null);
  });

  test("dobles admite de 1 a 3 plazas", () => {
    for (const plazas of [1, 2, 3]) {
      assert.ok(validarConvocatoria({ ...BASE, modalidad: "dobles", plazas }, AHORA).ok);
    }
    assert.match(error({ ...BASE, modalidad: "dobles", plazas: 4 }), /de 1 a 3/);
    assert.match(error({ ...BASE, plazas: 2 }), /un rival/);
  });

  test("la fecha tiene que ser futura, con margen, y no demasiado lejana", () => {
    assert.match(error({ ...BASE, fechaHora: dentroDe(5) }), /10 minutos/);
    assert.match(error({ ...BASE, fechaHora: dentroDe(-60) }), /10 minutos/);
    assert.match(error({ ...BASE, fechaHora: dentroDe(61 * 24 * 60) }), /60 días/);
    assert.match(error({ ...BASE, fechaHora: "mañana" }), /día y la hora/);
  });

  test("lugar y ciudad son obligatorios; nivel y comentario, opcionales", () => {
    assert.match(error({ ...BASE, lugar: "   " }), /dónde se juega/);
    assert.match(error({ ...BASE, ciudad: "" }), /ciudad/);
    assert.match(error({ ...BASE, nivel: "pro" }), /nivel/);
    assert.match(error({ ...BASE, comentario: "x".repeat(281) }), /280/);
    const resultado = validarConvocatoria({ ...BASE, nivel: "avanzado", comentario: " Traigo bolas " }, AHORA);
    assert.ok(resultado.ok);
    assert.equal(resultado.datos.nivel, "avanzado");
    assert.equal(resultado.datos.comentario, "Traigo bolas");
  });
});

describe("fechas en hora de España", () => {
  test("medianoche en España es otro día en UTC", () => {
    // 22:30 UTC del 1 de octubre = 00:30 del 2 de octubre en Madrid (horario de verano)
    assert.equal(diaEnEspana(new Date("2026-10-01T22:30:00Z")), "2026-10-02");
  });

  test("el resultado se registra desde el mismo día", () => {
    const partido = new Date("2026-10-01T18:00:00Z");
    assert.equal(puedeRegistrarResultado(partido, new Date("2026-10-01T08:00:00Z")), true);
    assert.equal(puedeRegistrarResultado(partido, new Date("2026-09-30T20:00:00Z")), false);
  });
});

test("textoPlazas", () => {
  assert.equal(textoPlazas(0), "Completo");
  assert.equal(textoPlazas(1), "Falta 1 jugador");
  assert.equal(textoPlazas(3), "Faltan 3 jugadores");
});

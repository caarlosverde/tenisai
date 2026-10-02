import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  PARTIDOS_PROVISIONALES,
  calcularPuntos,
  factorK,
  probabilidadVictoria,
} from "./elo.ts";

describe("probabilidadVictoria", () => {
  test("a igualdad de puntos es 50 %", () => {
    assert.equal(probabilidadVictoria(1200, 1200), 0.5);
  });

  test("400 puntos de ventaja dan 10 a 1", () => {
    assert.ok(Math.abs(probabilidadVictoria(1600, 1200) - 10 / 11) < 1e-9);
  });

  test("las dos probabilidades suman 1", () => {
    assert.ok(Math.abs(probabilidadVictoria(1350, 1180) + probabilidadVictoria(1180, 1350) - 1) < 1e-9);
  });
});

describe("factorK", () => {
  test("los jugadores nuevos se mueven más deprisa", () => {
    assert.ok(factorK(0) > factorK(PARTIDOS_PROVISIONALES));
    assert.equal(factorK(PARTIDOS_PROVISIONALES - 1), factorK(0));
  });
});

describe("calcularPuntos", () => {
  test("individual entre iguales nuevos: ±20", () => {
    const nuevos = calcularPuntos(
      [{ id: "ana", puntos: 1200, partidos: 0 }],
      [{ id: "luis", puntos: 1200, partidos: 0 }],
      1,
    );
    assert.equal(nuevos.get("ana"), 1220);
    assert.equal(nuevos.get("luis"), 1180);
  });

  test("ganar al favorito da más que ganar al débil", () => {
    const sorpresa = calcularPuntos(
      [{ id: "debil", puntos: 1100, partidos: 10 }],
      [{ id: "fuerte", puntos: 1400, partidos: 10 }],
      1,
    );
    const esperado = calcularPuntos(
      [{ id: "debil", puntos: 1100, partidos: 10 }],
      [{ id: "fuerte", puntos: 1400, partidos: 10 }],
      2,
    );
    const subidaSorpresa = sorpresa.get("debil")! - 1100;
    const subidaEsperada = esperado.get("fuerte")! - 1400;
    assert.ok(subidaSorpresa > subidaEsperada);
    // Con el mismo K lo que gana uno lo pierde el otro
    assert.equal(sorpresa.get("fuerte")! - 1400, -subidaSorpresa);
  });

  test("dobles: cada pareja juega con su media y cada jugador con su K", () => {
    const nuevos = calcularPuntos(
      [
        { id: "a", puntos: 1300, partidos: 10 },
        { id: "b", puntos: 1100, partidos: 0 },
      ],
      [
        { id: "c", puntos: 1200, partidos: 10 },
        { id: "d", puntos: 1200, partidos: 10 },
      ],
      1,
    );
    // Medias iguales (1200 vs 1200): el veterano sube K/2 = 12 y el nuevo 40/2 = 20
    assert.equal(nuevos.get("a"), 1312);
    assert.equal(nuevos.get("b"), 1120);
    assert.equal(nuevos.get("c"), 1188);
    assert.equal(nuevos.get("d"), 1188);
  });

  test("nunca baja de un mínimo", () => {
    const nuevos = calcularPuntos(
      [{ id: "a", puntos: 100, partidos: 0 }],
      [{ id: "b", puntos: 100, partidos: 0 }],
      2,
    );
    assert.equal(nuevos.get("a"), 100);
  });

  test("un equipo vacío es un error", () => {
    assert.throws(() => calcularPuntos([], [{ id: "b", puntos: 1200, partidos: 0 }], 1));
  });
});

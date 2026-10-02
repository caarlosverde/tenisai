import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { leerSets, textoMarcador, validarMarcador } from "./marcador.ts";

function ganador(sets: unknown) {
  const resultado = validarMarcador(sets);
  assert.ok(resultado.ok, resultado.ok ? "" : resultado.error);
  return resultado.ganador;
}

function error(sets: unknown) {
  const resultado = validarMarcador(sets);
  assert.equal(resultado.ok, false);
  return resultado.ok ? "" : resultado.error;
}

describe("validarMarcador: partidos válidos", () => {
  test("al mejor de 3", () => {
    assert.equal(ganador([[6, 4], [6, 3]]), 1);
    assert.equal(ganador([[4, 6], [7, 5], [3, 6]]), 2);
  });

  test("sets con tie-break y 7-5", () => {
    assert.equal(ganador([[7, 6], [5, 7], [7, 5]]), 1);
  });

  test("super tie-break como set decisivo", () => {
    assert.equal(ganador([[6, 4], [3, 6], [10, 8]]), 1);
    assert.equal(ganador([[6, 4], [3, 6], [12, 14]]), 2);
  });

  test("a un set y al mejor de 5", () => {
    assert.equal(ganador([[6, 2]]), 1);
    assert.equal(ganador([[6, 4], [4, 6], [6, 7], [6, 3], [6, 4]]), 1);
    assert.equal(ganador([[6, 0], [6, 0], [6, 0]]), 1);
  });
});

describe("validarMarcador: errores", () => {
  test("sin sets o con demasiados", () => {
    assert.match(error([]), /al menos un set/);
    assert.match(error(Array(6).fill([6, 0])), /como mucho 5/);
  });

  test("sets imposibles", () => {
    assert.match(error([[6, 5], [6, 0]]), /set 1 \(6-5\)/);
    assert.match(error([[8, 6], [6, 0]]), /no es un resultado posible/);
    assert.match(error([[6, 6]]), /no es un resultado posible/);
  });

  test("super tie-break fuera del set decisivo o mal cerrado", () => {
    assert.match(error([[10, 8]]), /super tie-break/);
    assert.match(error([[6, 4], [10, 8]]), /super tie-break/);
    assert.match(error([[6, 4], [3, 6], [10, 9]]), /no es un resultado posible/);
    assert.match(error([[6, 4], [3, 6], [13, 9]]), /no es un resultado posible/);
  });

  test("empate o partido ya decidido", () => {
    assert.match(error([[6, 4], [4, 6]]), /empate/);
    assert.match(error([[6, 4], [6, 4], [4, 6]]), /ya estaba decidido/);
  });

  test("datos con otra forma", () => {
    assert.match(error([[6]]), /incompleto/);
    assert.match(error([[6, -1]]), /incompleto/);
    assert.match(error([["6", "4"]]), /incompleto/);
    assert.match(error("6-4 6-3"), /al menos un set/);
  });
});

describe("textoMarcador y leerSets", () => {
  test("se lee desde cualquiera de los dos equipos", () => {
    const sets: [number, number][] = [[6, 4], [3, 6], [10, 8]];
    assert.equal(textoMarcador(sets), "6-4 3-6 [10-8]");
    assert.equal(textoMarcador(sets, 2), "4-6 6-3 [8-10]");
  });

  test("leerSets tolera JSON roto", () => {
    assert.deepEqual(leerSets("[[6,4],[6,3]]"), [[6, 4], [6, 3]]);
    assert.deepEqual(leerSets("no es json"), []);
  });
});

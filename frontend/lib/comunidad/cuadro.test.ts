import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  generarCuadro,
  nombreRonda,
  ordenSemillas,
  siguienteCruce,
  tamanoCuadro,
  type Participante,
} from "./cuadro.ts";

const jugadores = (n: number): Participante[] =>
  Array.from({ length: n }, (_, i) => ({ id: `j${i + 1}`, puntos: 2000 - i * 10 }));

describe("tamaño y orden del cuadro", () => {
  test("potencia de 2 que da cabida a todos", () => {
    assert.equal(tamanoCuadro(2), 2);
    assert.equal(tamanoCuadro(5), 8);
    assert.equal(tamanoCuadro(8), 8);
    assert.equal(tamanoCuadro(9), 16);
  });

  test("orden clásico de cabezas de serie", () => {
    assert.deepEqual(ordenSemillas(4), [1, 4, 2, 3]);
    assert.deepEqual(ordenSemillas(8), [1, 8, 4, 5, 2, 7, 3, 6]);
  });

  test("el ganador pasa al cruce correspondiente", () => {
    assert.deepEqual(siguienteCruce(1, 0), { ronda: 2, posicion: 0, lado: "a" });
    assert.deepEqual(siguienteCruce(1, 3), { ronda: 2, posicion: 1, lado: "b" });
  });

  test("nombres de las rondas", () => {
    assert.equal(nombreRonda(3, 3), "Final");
    assert.equal(nombreRonda(2, 3), "Semifinales");
    assert.equal(nombreRonda(1, 3), "Cuartos de final");
    assert.equal(nombreRonda(1, 6), "Ronda 1");
  });
});

describe("generarCuadro", () => {
  test("8 jugadores: 7 cruces y el 1 contra el 8", () => {
    const { rondas, cruces, semillas } = generarCuadro(jugadores(8));
    assert.equal(rondas, 3);
    assert.equal(cruces.length, 7);
    const primero = cruces.find((c) => c.ronda === 1 && c.posicion === 0)!;
    assert.deepEqual([primero.a, primero.b], ["j1", "j8"]);
    assert.equal(semillas.get("j1"), 1);
    assert.ok(cruces.every((c) => c.tipo === "normal" && c.ganador === null));
  });

  test("las cabezas de serie salen de los puntos, no del orden de inscripción", () => {
    const desordenados = [
      { id: "flojo", puntos: 1100 },
      { id: "fuerte", puntos: 1500 },
      { id: "medio", puntos: 1300 },
      { id: "regular", puntos: 1200 },
    ];
    const { semillas, cruces } = generarCuadro(desordenados);
    assert.equal(semillas.get("fuerte"), 1);
    assert.deepEqual(
      cruces.filter((c) => c.ronda === 1).map((c) => [c.a, c.b]),
      [["fuerte", "flojo"], ["medio", "regular"]],
    );
  });

  test("5 jugadores: los 3 mejores pasan directamente a la segunda ronda", () => {
    const { cruces } = generarCuadro(jugadores(5));
    const byes = cruces.filter((c) => c.tipo === "bye");
    assert.equal(byes.length, 3);
    assert.deepEqual(byes.map((c) => c.ganador).sort(), ["j1", "j2", "j3"]);
    // El único partido de primera ronda es el 4 contra el 5
    const jugado = cruces.find((c) => c.ronda === 1 && c.tipo === "normal")!;
    assert.deepEqual([jugado.a, jugado.b], ["j4", "j5"]);
    // j1 ya espera en semifinales a quien gane el 4-5
    const semi = cruces.find((c) => c.ronda === 2 && c.posicion === 0)!;
    assert.equal(semi.a, "j1");
    assert.equal(semi.b, null);
    // j2 y j3 ya se enfrentan en la otra semifinal
    const otraSemi = cruces.find((c) => c.ronda === 2 && c.posicion === 1)!;
    assert.deepEqual([otraSemi.a, otraSemi.b].sort(), ["j2", "j3"]);
  });

  test("2 jugadores: solo la final", () => {
    const { rondas, cruces } = generarCuadro(jugadores(2));
    assert.equal(rondas, 1);
    assert.deepEqual(cruces.map((c) => [c.a, c.b]), [["j1", "j2"]]);
  });

  test("hace falta más de un participante", () => {
    assert.throws(() => generarCuadro(jugadores(1)));
  });
});

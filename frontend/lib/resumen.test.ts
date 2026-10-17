import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { mensajeResumen } from "./resumen.ts";

const ADAPTACION = "Análisis adaptado para jugador Diestro, estilo clásico, revés a 2 manos";

describe("mensajeResumen", () => {
  test("quita la adaptación y la frase de la nota, que ya están a la vista", () => {
    const { texto, golpes } = mensajeResumen({
      adaptacion: ADAPTACION,
      mensaje: `${ADAPTACION}. Análisis de Derecha: valoración biomecánica de 44/100. Puntos fuertes: Base de apoyo. El principal aspecto a corregir es la terminación.`,
    });
    assert.equal(texto, "Puntos fuertes: Base de apoyo. El principal aspecto a corregir es la terminación.");
    assert.equal(golpes, null); // un solo tipo: la cabecera usa el tipo de golpe
  });

  test("con varios tipos de golpe devuelve cuántos de cada uno", () => {
    const { texto, golpes } = mensajeResumen({
      adaptacion: ADAPTACION,
      mensaje: `${ADAPTACION}. Análisis de 4 derechas y 4 reveses a dos manos: valoración biomecánica de 78/100. Solo te queda pulir la base.`,
    });
    assert.equal(golpes, "4 derechas y 4 reveses a dos manos");
    assert.equal(texto, "Solo te queda pulir la base.");
  });

  test("un mensaje con otro formato se deja tal cual", () => {
    const mensaje = "No hay métricas suficientes para valorar el clip.";
    assert.deepEqual(mensajeResumen({ mensaje }), { texto: mensaje, golpes: null });
  });
});

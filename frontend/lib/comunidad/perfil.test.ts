import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { claveCiudad, nombreVisible, validarPerfilJugador } from "./perfil.ts";

describe("validarPerfilJugador", () => {
  test("limpia espacios y deja vacíos como null", () => {
    const resultado = validarPerfilJugador({ ciudad: "  San   Sebastián ", club: "  ", nivel: "" });
    assert.deepEqual(resultado, {
      ok: true,
      datos: { ciudad: "San Sebastián", club: null, nivel: null },
    });
  });

  test("la presentación conserva los saltos de línea", () => {
    const resultado = validarPerfilJugador({ bio: "Hola\n\n\n\nJuego  por  las tardes" });
    assert.deepEqual(resultado, { ok: true, datos: { bio: "Hola\n\nJuego por las tardes" } });
  });

  test("rechaza valores no permitidos", () => {
    assert.equal(validarPerfilJugador({ nivel: "pro" }).ok, false);
    assert.equal(validarPerfilJugador({ perfilPublico: "si" }).ok, false);
    assert.equal(validarPerfilJugador({ ciudad: 28 }).ok, false);
    assert.equal(validarPerfilJugador({ bio: "x".repeat(281) }).ok, false);
  });

  test("solo devuelve los campos que llegan", () => {
    assert.deepEqual(validarPerfilJugador({ perfilPublico: true }), {
      ok: true,
      datos: { perfilPublico: true },
    });
  });
});

describe("nombreVisible", () => {
  const persona = { nombre: "Lucía", apellidos: "álvarez Ruiz" };

  test("completo para amigos, con inicial para el resto", () => {
    assert.equal(nombreVisible(persona, true), "Lucía álvarez Ruiz");
    assert.equal(nombreVisible(persona, false), "Lucía Á.");
  });
});

test("claveCiudad ignora tildes, mayúsculas y espacios", () => {
  assert.equal(claveCiudad(" Leganés "), claveCiudad("leganes"));
});

"""
Tests del motor de feedback biomecánico (biomecanica.py).

Las pruebas de generar_feedback usan CSV sintéticos con golpes de valores
conocidos: así se comprueba cada regla sin depender de un vídeo real.
"""

from __future__ import annotations

import csv
import json
import math
from pathlib import Path

import pytest

import biomecanica as bio

# --------------------------------------------------------------------------
# Geometría y lateralidad
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("p1", "p2", "p3", "esperado"),
    [
        ((0, 1), (0, 0), (1, 0), 90.0),  # ángulo recto
        ((-1, 0), (0, 0), (1, 0), 180.0),  # brazo totalmente extendido
        ((1, 0), (0, 0), (1, 1), 45.0),
        ((1, -1), (0, 0), (1, 1), 90.0),  # cruza el eje: nunca devuelve más de 180°
    ],
)
def test_angulo_3p(p1, p2, p3, esperado):
    assert bio._angulo_3p(p1, p2, p3) == pytest.approx(esperado)


def test_lado_zurdo_invierte_brazo_y_columnas():
    zurdo = bio._lado("zurdo")
    assert zurdo["dir_x"] == -1
    assert zurdo["muneca_dom"] == "muneca_izq"
    assert zurdo["col_codo"] == bio.COL_CODO_IZQ

    diestro = bio._lado("diestro")
    assert diestro["dir_x"] == 1
    assert diestro["col_codo"] == bio.COL_CODO_DER


@pytest.mark.parametrize("valor", [None, "", "ambidiestro", "  DIESTRO "])
def test_lateralidad_desconocida_o_con_espacios_es_diestro(valor):
    assert bio._normalizar_lateralidad(valor) == "diestro"


def test_normalizadores_de_estilo_aplican_valores_por_defecto():
    assert bio._normalizar_estilo_reves("1_MANO") == "1_mano"
    assert bio._normalizar_estilo_reves("otro") == "2_manos"
    assert bio._normalizar_estilo_derecha("Nadal") == "nadal"
    assert bio._normalizar_estilo_derecha(None) == "tradicional"


# --------------------------------------------------------------------------
# Fases del golpe
# --------------------------------------------------------------------------


def test_construir_golpes_fases_crea_cuatro_fases_por_impacto():
    fases = bio.construir_golpes_fases([1.0, 3.0])
    assert len(fases) == 8
    impacto = next(f for f in fases if f["fase"] == "impacto" and f["t_impacto"] == 1.0)
    assert impacto["t_inicio"] == pytest.approx(0.9)
    assert impacto["t_fin"] == pytest.approx(1.1)
    assert impacto["fase_label"] == "3. Impacto"


def test_construir_golpes_fases_no_genera_tiempos_negativos():
    fases = bio.construir_golpes_fases([0.2])
    assert all(f["t_inicio"] >= 0 and f["t_fin"] >= f["t_inicio"] for f in fases)


def test_fase_en_t_prioriza_el_impacto_y_detecta_desplazamiento():
    fases = bio.construir_golpes_fases([1.0])
    assert bio._fase_en_t(1.0, fases)[0] == "impacto"
    assert bio._fase_en_t(0.8, fases)[0] == "carga"
    assert bio._fase_en_t(1.3, fases)[0] == "terminacion"
    assert bio._fase_en_t(5.0, fases) == ("recuperacion", "Desplazamiento")


def _frames_con_velocidades(velocidades: list[float], fps: float = 30.0) -> list[dict]:
    return [{"t": i / fps} for i in range(len(velocidades))]


def test_picos_impacto_separa_golpes_distintos():
    vel = [0.0] * 120
    vel[30] = 5.0  # golpe en t = 1.0 s
    vel[90] = 4.0  # golpe en t = 3.0 s
    impactos = bio._picos_impacto(_frames_con_velocidades(vel), vel)
    assert impactos == pytest.approx([1.0, 3.0])


def test_picos_impacto_fusiona_picos_del_mismo_golpe():
    vel = [0.0] * 60
    vel[30] = 5.0
    vel[36] = 4.0  # 0,2 s después: el mismo swing, se queda el más fuerte
    impactos = bio._picos_impacto(_frames_con_velocidades(vel), vel)
    assert impactos == pytest.approx([1.0])


def test_extremos_locales_respeta_el_cooldown():
    serie = [(0, 150.0), (100, 120.0), (200, 150.0), (400, 110.0), (500, 150.0), (3000, 118.0), (3100, 150.0)]
    minimos = bio._extremos_locales(serie, "min", cooldown_ms=1200)
    # 120 y 110 están a menos de 1,2 s: cuentan como una carga (la más profunda)
    assert minimos == [(400, 110.0), (3000, 118.0)]


def test_citar_segundos():
    assert bio._citar_segundos([]) == ""
    assert bio._citar_segundos([1.25]) == "en el segundo 1.2"
    assert bio._citar_segundos([1.0, 2.5, 3.0]) == "en los segundos 1.0, 2.5 y 3.0"


def test_en_cuantos_golpes():
    assert bio._en_cuantos(1, 1) == "en el golpe"
    assert bio._en_cuantos(3, 3) == "en los 3 golpes"
    assert bio._en_cuantos(2, 3) == "en 2 de 3 golpes"


def test_nota_de_terminacion_sin_coordenadas_normalizadas():
    # El recorrido de la muñeca no tiene unidades que el jugador entienda
    _, nota = bio.META_COACH["terminacion"]["fallo"](0.03)
    assert nota == "Terminación corta"


# --------------------------------------------------------------------------
# Perfiles por tipo de golpe y puntuación
# --------------------------------------------------------------------------


def test_perfil_reves_dos_manos_no_evalua_el_codo():
    perfil = bio._perfil_golpe(bio.TIPO_REVES_2)
    assert perfil["eval_codo"] is False
    assert perfil["spacing_min"] < bio.SPACING_MINIMO


def test_perfil_saque_exige_mas_flexion_y_no_evalua_spacing():
    perfil = bio._perfil_golpe(bio.TIPO_SAQUE)
    assert perfil["eval_spacing"] is False
    assert perfil["rodilla_insuf"] < bio.RODILLA_FLEXION_INSUFICIENTE
    assert perfil["codo_vertical"] is True


def _ev(tipo: str, titulo: str) -> dict:
    return {"tipo": tipo, "titulo": titulo}


def test_resumen_penaliza_segun_gravedad_y_elige_el_aspecto_principal():
    resumen = bio._resumen_general(
        [_ev("optimo", "Base de apoyo"), _ev("mejora", "Rodillas"), _ev("alerta", "Codo")]
    )
    assert resumen["puntuacion"] == 100 - 16 - 8
    assert resumen["tipo"] == "mejora"
    assert resumen["aspecto_principal"] == "Codo"
    assert resumen["puntos_fuertes"] == ["Base de apoyo"]


def test_resumen_todo_optimo_garantiza_nota_alta():
    resumen = bio._resumen_general([_ev("optimo", "A"), _ev("optimo", "B")])
    assert resumen["puntuacion"] >= 92
    assert resumen["tipo"] == "optimo"


def test_resumen_nunca_baja_de_cero():
    resumen = bio._resumen_general([_ev("alerta", f"Fallo {i}") for i in range(10)])
    assert resumen["puntuacion"] == 0
    assert resumen["tipo"] == "alerta"


def test_resumen_sin_evaluaciones():
    assert bio._resumen_general([])["puntuacion"] == 0


# --------------------------------------------------------------------------
# generar_feedback con CSV sintéticos
# --------------------------------------------------------------------------

COLUMNAS = [
    bio.COLUMNA_TIMESTAMP,
    bio.COL_CODO_DER,
    bio.COL_CODO_IZQ,
    bio.COL_ROD_DER,
    bio.COL_ROD_IZQ,
    bio.COL_APERTURA,
    bio.COL_APERTURA_IZQ,
    bio.COL_SPACING,
    bio.COL_SPACING_IZQ,
    bio.COL_BASE,
    bio.COL_TRONCO,
]
GOLPES_S = (0.8, 2.3, 3.8)  # tres swings separados más de 1,2 s


def _campana(t: float, centro: float, anchura: float = 0.12) -> float:
    return math.exp(-((t - centro) ** 2) / (2 * anchura**2))


def _escribir_csv(
    ruta: Path,
    *,
    rodilla_min: float = 120.0,
    codo_der_max: float = 162.0,
    codo_izq_max: float = 162.0,
) -> Path:
    """Clip de 4,5 s a 30 fps con tres golpes: flexión de rodillas y extensión de codos."""
    with open(ruta, "w", newline="", encoding="utf-8") as archivo:
        escritor = csv.writer(archivo)
        escritor.writerow(COLUMNAS)
        for i in range(135):
            t = i / 30
            carga = max(_campana(t, g - 0.2) for g in GOLPES_S)  # la carga precede al impacto
            impacto = max(_campana(t, g) for g in GOLPES_S)
            rodilla = 170 - (170 - rodilla_min) * carga
            codo_der = 110 + (codo_der_max - 110) * impacto
            codo_izq = 110 + (codo_izq_max - 110) * impacto
            escritor.writerow(
                [round(t * 1000), codo_der, codo_izq, rodilla, rodilla + 3, 90, 90, 1.1, 1.1, 1.0, 10]
            )
    return ruta


def _evaluacion(resultado: dict, categoria: str) -> dict:
    return next(ev for ev in resultado["evaluaciones"] if ev["categoria"] == categoria)


def test_generar_feedback_rodillas_en_zona_de_carga(tmp_path):
    resultado = bio.generar_feedback(_escribir_csv(tmp_path / "m.csv", rodilla_min=120))
    rodilla = _evaluacion(resultado, "rodilla")
    assert rodilla["tipo"] == "optimo"
    assert rodilla["valor"] == pytest.approx(120, abs=2)
    assert len(rodilla["timestamps"]) == 3  # un episodio por golpe


def test_generar_feedback_detecta_poca_flexion(tmp_path):
    resultado = bio.generar_feedback(_escribir_csv(tmp_path / "m.csv", rodilla_min=150))
    rodilla = _evaluacion(resultado, "rodilla")
    assert rodilla["tipo"] == "alerta"  # 150° está muy por encima del límite de 130°
    assert "Flexión" in rodilla["titulo"]


def test_generar_feedback_zurdo_evalua_el_codo_izquierdo(tmp_path):
    # Brazo derecho encogido y brazo izquierdo extendido
    ruta = _escribir_csv(tmp_path / "m.csv", codo_der_max=120, codo_izq_max=165)

    diestro = bio.generar_feedback(ruta, lateralidad="diestro")
    zurdo = bio.generar_feedback(ruta, lateralidad="zurdo")

    assert _evaluacion(diestro, "codo")["tipo"] == "alerta"
    assert _evaluacion(zurdo, "codo")["tipo"] == "optimo"
    assert zurdo["lateralidad"] == "zurdo"
    assert "Zurdo" in zurdo["adaptacion"]


def test_generar_feedback_devuelve_un_resultado_serializable(tmp_path):
    resultado = bio.generar_feedback(_escribir_csv(tmp_path / "m.csv"))
    # La API lo guarda como JSON: no puede llevar tipos de NumPy ni similares
    json.dumps(resultado)
    resumen = resultado["resumen_general"]
    assert 0 <= resumen["puntuacion"] <= 100
    assert resultado["tipo_golpe"] == bio.TIPO_DERECHA
    for evaluacion in resultado["evaluaciones"]:
        assert evaluacion["tipo"] in ("optimo", "mejora", "alerta")
        assert evaluacion["fase"] in bio.FASE_NOMBRE


def test_generar_feedback_sin_csv(tmp_path):
    resultado = bio.generar_feedback(tmp_path / "no_existe.csv")
    assert resultado["evaluaciones"] == []
    assert resultado["resumen_general"] is None

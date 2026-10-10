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


def test_resumen_con_nota_alta_tambien_nombra_lo_que_falla():
    resumen = bio._resumen_general([_ev("optimo", "Base de apoyo"), _ev("mejora", "Flexión de piernas")])
    assert resumen["tipo"] == "optimo"  # 92: nota alta
    assert "pulir flexión de piernas" in resumen["mensaje"]


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
    codos_der: tuple[float, float, float] | None = None,
) -> Path:
    """
    Clip de 4,5 s a 30 fps con tres golpes: flexión de rodillas y extensión de codos.
    codos_der: extensión del codo derecho en cada golpe (por defecto, la misma).
    """
    with open(ruta, "w", newline="", encoding="utf-8") as archivo:
        escritor = csv.writer(archivo)
        escritor.writerow(COLUMNAS)
        for i in range(135):
            t = i / 30
            carga = max(_campana(t, g - 0.2) for g in GOLPES_S)  # la carga precede al impacto
            impacto = max(_campana(t, g) for g in GOLPES_S)
            rodilla = 170 - (170 - rodilla_min) * carga
            if codos_der:
                codo_der = 110 + max((c - 110) * _campana(t, g) for g, c in zip(GOLPES_S, codos_der))
            else:
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


# --------------------------------------------------------------------------
# Cada golpe con su tipo
# --------------------------------------------------------------------------


def _fases_con_tipos(tipos: list[str]) -> list[dict]:
    """Fases de los tres golpes del CSV sintético, ya clasificados (como hace main.py)."""
    fases = bio.construir_golpes_fases(list(GOLPES_S))
    for fase in fases:
        fase["tipo_golpe"] = tipos[GOLPES_S.index(fase["t_impacto"])]
    return fases


def test_cada_tipo_de_golpe_se_evalua_solo_con_sus_golpes(tmp_path):
    ruta = _escribir_csv(tmp_path / "m.csv")
    fases = _fases_con_tipos([bio.TIPO_DERECHA, bio.TIPO_DERECHA, bio.TIPO_REVES_2])

    resultado = bio.generar_feedback(ruta, golpes_fases=fases)

    assert resultado["tipo_golpe"] == bio.TIPO_DERECHA  # el más repetido
    assert [g["tipo_golpe"] for g in resultado["golpes"]] == [
        bio.TIPO_DERECHA,
        bio.TIPO_DERECHA,
        bio.TIPO_REVES_2,
    ]
    derecha = [ev for ev in resultado["evaluaciones"] if ev["tipo_golpe"] == bio.TIPO_DERECHA]
    reves = [ev for ev in resultado["evaluaciones"] if ev["tipo_golpe"] == bio.TIPO_REVES_2]
    # Las rodillas de las derechas solo miran sus dos golpes, no el revés
    rodilla = next(ev for ev in derecha if ev["categoria"] == "rodilla")
    assert len(rodilla["timestamps"]) == 2
    # En el revés a dos manos no se evalúa el codo
    assert any(ev["categoria"] == "codo" for ev in derecha)
    assert not any(ev["categoria"] == "codo" for ev in reves)
    # Los títulos dicen a qué golpe se refieren (el carrusel los distingue por título)
    assert all(ev["titulo"].endswith(f"· {ev['tipo_golpe']}") for ev in resultado["evaluaciones"])
    assert "2 derechas y 1 revés a dos manos" in resultado["resumen_general"]["mensaje"]


def test_con_un_solo_tipo_los_titulos_no_cambian(tmp_path):
    ruta = _escribir_csv(tmp_path / "m.csv")
    fases = _fases_con_tipos([bio.TIPO_DERECHA] * 3)

    resultado = bio.generar_feedback(ruta, golpes_fases=fases)

    assert all("·" not in ev["titulo"] for ev in resultado["evaluaciones"])
    assert len(_evaluacion(resultado, "rodilla")["timestamps"]) == 3


def test_regularidad_entre_golpes(tmp_path):
    regular = _evaluacion(bio.generar_feedback(_escribir_csv(tmp_path / "a.csv")), "codo")
    assert regular["regularidad"]["regular"] is True
    assert "con regularidad en los 3 golpes" in regular["mensaje"]

    # Media buena (166°) pero un golpe a 135° y otro a 175°: gesto sin automatizar
    irregular = _evaluacion(
        bio.generar_feedback(_escribir_csv(tmp_path / "b.csv", codos_der=(175, 135, 175))), "codo"
    )
    assert irregular["regularidad"] == {"regular": False, "minimo": pytest.approx(135, abs=1),
                                        "maximo": pytest.approx(175, abs=1), "golpes": 3}
    assert "varía mucho de un golpe a otro" in irregular["mensaje"]


def test_un_fallo_que_se_repite_es_un_habito(tmp_path):
    rodilla = _evaluacion(bio.generar_feedback(_escribir_csv(tmp_path / "m.csv", rodilla_min=150)), "rodilla")
    assert rodilla["tipo"] != "optimo"
    assert "es un hábito del gesto" in rodilla["mensaje"]


def test_con_menos_de_tres_golpes_no_se_valora_la_regularidad():
    assert bio._regularidad("codo", [(0, 120.0), (2000, 170.0)]) is None
    assert bio._regularidad("terminacion", [(0, 0.1), (2000, 0.2), (4000, 0.3)]) is None


def test_tipo_elegido_por_el_jugador():
    assert bio.tipo_elegido("auto") is None
    assert bio.tipo_elegido(None) is None
    assert bio.tipo_elegido("derecha") == bio.TIPO_DERECHA
    # El revés toma las manos del perfil del jugador
    assert bio.tipo_elegido("reves", "1_mano") == bio.TIPO_REVES_1
    assert bio.tipo_elegido("reves", "2_manos") == bio.TIPO_REVES_2


def test_el_tipo_elegido_se_aplica_a_todos_los_golpes(tmp_path):
    ruta = _escribir_csv(tmp_path / "m.csv")
    # Aunque las fases ya traigan tipos distintos (clasificación automática)
    fases = _fases_con_tipos([bio.TIPO_DERECHA, bio.TIPO_VOLEA, bio.TIPO_REVES_2])

    resultado = bio.generar_feedback(ruta, golpes_fases=fases, tipo_forzado=bio.TIPO_SAQUE, frames=[{"t": 0}])

    assert resultado["tipo_golpe"] == bio.TIPO_SAQUE
    assert {g["tipo_golpe"] for g in resultado["golpes"]} == {bio.TIPO_SAQUE}
    assert all(f["tipo_golpe"] == bio.TIPO_SAQUE for f in fases)


def test_tipo_principal_en_empate_elige_el_primero():
    assert bio.tipo_principal([]) == bio.TIPO_DERECHA
    assert (
        bio.tipo_principal([(1.0, bio.TIPO_REVES_2), (2.0, bio.TIPO_DERECHA)])
        == bio.TIPO_REVES_2
    )


def test_etiqueta_de_varios_golpes():
    assert bio._etiqueta_golpes({bio.TIPO_DERECHA: 1}) == "1 derecha"
    assert (
        bio._etiqueta_golpes({bio.TIPO_DERECHA: 2, bio.TIPO_SAQUE: 1, bio.TIPO_VOLEA: 3})
        == "2 derechas, 1 saque y 3 voleas"
    )


def test_en_fase_no_usa_otros_momentos_si_el_golpe_no_tiene_datos():
    fases = bio.construir_golpes_fases([5.0])
    serie = [(0, 120.0), (1000, 125.0)]  # ningún dato cerca del golpe de t = 5 s
    assert bio._en_fase(serie, fases, "carga") == []
    # Sin golpes detectados sí se evalúa el clip entero
    assert bio._en_fase(serie, [], "carga") == serie


def test_el_resumen_avisa_de_lo_que_no_se_pudo_medir(tmp_path):
    ruta = _escribir_csv(tmp_path / "m.csv")
    # Piernas fuera de plano: main.py deja vacías las celdas poco visibles
    with open(ruta, encoding="utf-8") as archivo:
        filas = list(csv.DictReader(archivo))
    with open(ruta, "w", newline="", encoding="utf-8") as archivo:
        escritor = csv.DictWriter(archivo, fieldnames=COLUMNAS)
        escritor.writeheader()
        for fila in filas:
            fila.update({bio.COL_ROD_DER: "", bio.COL_ROD_IZQ: "", bio.COL_BASE: ""})
            escritor.writerow(fila)

    resultado = bio.generar_feedback(ruta, golpes_fases=_fases_con_tipos([bio.TIPO_DERECHA] * 3))

    resumen = resultado["resumen_general"]
    assert resumen["sin_datos"] == ["rodilla", "base"]
    assert "No se ha podido valorar la flexión de piernas y la base de apoyo" in resumen["mensaje"]
    assert not any(ev["categoria"] in ("rodilla", "base") for ev in resultado["evaluaciones"])


# --------------------------------------------------------------------------
# Orientación de la cámara
# --------------------------------------------------------------------------


def _frame(t: float, *, de_frente: bool, muneca_der_x: float, muneca_izq_x: float, fase="recuperacion"):
    """Esqueleto mínimo; de frente, el lado derecho del jugador sale a la izquierda."""
    signo = -1 if de_frente else 1
    vis = 0.99
    return {
        "t": t,
        "fase": fase,
        "landmarks": {
            "nariz": [0.5, 0.3, vis],
            "hombro_der": [0.5 + 0.05 * signo, 0.4, vis],
            "hombro_izq": [0.5 - 0.05 * signo, 0.4, vis],
            "cadera_der": [0.5 + 0.04 * signo, 0.6, vis],
            "cadera_izq": [0.5 - 0.04 * signo, 0.6, vis],
            "codo_der": [muneca_der_x, 0.5, vis],
            "codo_izq": [muneca_izq_x, 0.5, vis],
            "muneca_der": [muneca_der_x, 0.55, vis],
            "muneca_izq": [muneca_izq_x, 0.55, vis],
        },
    }


@pytest.mark.parametrize(("de_frente", "esperado"), [(False, 1), (True, -1)])
def test_orientacion_de_la_camara(de_frente, esperado):
    frames = [_frame(i / 30, de_frente=de_frente, muneca_der_x=0.6, muneca_izq_x=0.4) for i in range(10)]
    assert bio.orientacion_camara(frames) == esperado


def test_orientacion_dudosa_de_perfil():
    # De perfil los hombros se solapan en la imagen
    frames = [_frame(i / 30, de_frente=False, muneca_der_x=0.6, muneca_izq_x=0.4) for i in range(10)]
    for frame in frames:
        for nombre in ("hombro_der", "hombro_izq", "cadera_der", "cadera_izq"):
            frame["landmarks"][nombre][0] = 0.5
    assert bio.orientacion_camara(frames) == 0


@pytest.mark.parametrize("de_frente", [False, True])
def test_una_derecha_se_reconoce_desde_delante_y_desde_detras(de_frente):
    # Armado con la muñeca derecha en el lado derecho del jugador; en el impacto
    # (pico de velocidad, ya cruzando) queda en el centro
    lado = -1 if de_frente else 1
    prep = [
        _frame(0.1 * i, de_frente=de_frente, muneca_der_x=0.5 + 0.2 * lado, muneca_izq_x=0.5 - 0.15 * lado, fase="preparacion")
        for i in range(5)
    ]
    impacto = _frame(0.6, de_frente=de_frente, muneca_der_x=0.5 - 0.02 * lado, muneca_izq_x=0.5 - 0.15 * lado)
    orientacion = -1 if de_frente else 1
    assert bio.clasificar_tipo_golpe(impacto, prep, [], orientacion=orientacion) == bio.TIPO_DERECHA


def test_reves_a_dos_manos_por_el_armado():
    # De espaldas: muñecas juntas en el lado izquierdo del jugador durante el armado
    prep = [
        _frame(0.1 * i, de_frente=False, muneca_der_x=0.38, muneca_izq_x=0.36, fase="preparacion")
        for i in range(5)
    ]
    impacto = _frame(0.6, de_frente=False, muneca_der_x=0.5, muneca_izq_x=0.48)
    assert bio.clasificar_tipo_golpe(impacto, prep, [], orientacion=1) == bio.TIPO_REVES_2


@pytest.mark.parametrize(
    ("distancia_manos", "esperado"),
    [(0.1, bio.TIPO_REVES_2), (0.45, bio.TIPO_REVES_2), (0.9, bio.TIPO_DERECHA)],
)
def test_sin_orientacion_decide_por_las_manos_en_el_armado(distancia_manos, esperado):
    # De perfil no se sabe qué lado es cuál; las manos juntas en el armado son revés.
    # 0,45 cae en la zona gris del agarre: decide el estilo del perfil (dos manos)
    prep = [
        _frame(0.1 * i, de_frente=False, muneca_der_x=0.5 + distancia_manos * 0.2, muneca_izq_x=0.5, fase="preparacion")
        for i in range(5)
    ]
    impacto = _frame(0.6, de_frente=False, muneca_der_x=0.5, muneca_izq_x=0.45)
    tipo = bio.clasificar_tipo_golpe(impacto, prep, [], estilo_reves="2_manos", orientacion=0)
    assert tipo == esperado


def test_un_descenso_pequeno_no_es_cortado():
    # Jugador lejano (escala pequeña): 0,03 de la imagen es menos de medio tronco
    prep = [_frame(0.1 * i, de_frente=False, muneca_der_x=0.7, muneca_izq_x=0.3, fase="preparacion") for i in range(5)]
    impacto = _frame(0.6, de_frente=False, muneca_der_x=0.6, muneca_izq_x=0.3)
    final = _frame(0.9, de_frente=False, muneca_der_x=0.4, muneca_izq_x=0.3)
    final["landmarks"]["muneca_der"][1] = impacto["landmarks"]["muneca_der"][1] + 0.03
    final["landmarks"]["hombro_der"][1] = 0.4
    assert bio.clasificar_tipo_golpe(impacto, prep, [final], orientacion=1) == bio.TIPO_DERECHA
    # Medio tronco (escala 0,2) por debajo del impacto sí es un cortado
    final["landmarks"]["muneca_der"][1] = impacto["landmarks"]["muneca_der"][1] + 0.15
    assert bio.clasificar_tipo_golpe(impacto, prep, [final], orientacion=1) == bio.TIPO_CORTADO


# --------------------------------------------------------------------------
# Textos coherentes con los umbrales y la lateralidad
# --------------------------------------------------------------------------


def test_texto_de_la_base_coincide_con_el_umbral():
    meta = bio.META_COACH["base"]
    assert f"{bio.BASE_OPTIMA:.1f}" in meta["objetivo_texto"]
    assert f"{bio.BASE_OPTIMA:.1f}" in meta["fallo"](0.6)[1]


def test_consejo_del_codo_nombra_el_brazo_dominante(tmp_path):
    ruta = _escribir_csv(tmp_path / "m.csv", codo_der_max=120, codo_izq_max=120)
    zurdo = _evaluacion(bio.generar_feedback(ruta, lateralidad="zurdo"), "codo")
    assert "izquierdo" in zurdo["consejo_corto"]
    assert zurdo["zona_corporal"] == "brazo_izq"


def test_la_nota_de_cada_fallo_usa_el_objetivo_de_su_golpe(tmp_path):
    ruta = _escribir_csv(tmp_path / "m.csv", rodilla_min=150)
    fases = _fases_con_tipos([bio.TIPO_SAQUE] * 3)
    rodilla = _evaluacion(bio.generar_feedback(ruta, golpes_fases=fases), "rodilla")
    perfil = bio._perfil_golpe(bio.TIPO_SAQUE)
    objetivo = f"{perfil['rodilla_min']:.0f}°–{perfil['rodilla_max']:.0f}°"
    assert all(objetivo in d["nota_corta"] for d in rodilla["eventos_detalle"])

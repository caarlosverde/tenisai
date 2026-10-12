"""
Tests de los cálculos geométricos y de suavizado (geometria.py).

Se usan esqueletos sintéticos con medidas conocidas: así se comprueban las
métricas sin depender de MediaPipe ni de un vídeo real.
"""

from __future__ import annotations

import math
from types import SimpleNamespace

import numpy as np
import pytest

import geometria as geo


def _landmark(x: float, y: float, z: float = 0.0, visibilidad: float = 0.99):
    return SimpleNamespace(x=x, y=y, z=z, visibility=visibilidad)


def _esqueleto(**puntos) -> list:
    """33 landmarks (los no indicados, en el origen) con los puntos dados por índice."""
    landmarks = [_landmark(0.0, 0.0) for _ in range(33)]
    for indice, valor in puntos.items():
        landmarks[getattr(geo, indice)] = _landmark(*valor)
    return landmarks


# --------------------------------------------------------------------------
# Geometría básica
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("p1", "p2", "p3", "esperado"),
    [((0, 1), (0, 0), (1, 0), 90.0), ((-1, 0), (0, 0), (1, 0), 180.0), ((1, -1), (0, 0), (1, 1), 90.0)],
)
def test_calcular_angulo(p1, p2, p3, esperado):
    assert geo.calcular_angulo(p1, p2, p3) == pytest.approx(esperado)


def test_distancia_a_eje_en_2d_y_3d():
    eje_a, eje_b = np.array([0.0, 0.0, 0.0]), np.array([0.0, 1.0, 0.0])
    # Lo que se aleja del eje cuenta en las dos direcciones horizontales (3-4-5)
    assert geo.distancia_a_eje(np.array([0.3, 5.0, 0.4]), eje_a, eje_b) == pytest.approx(0.5)
    assert geo.distancia_a_eje(np.array([2.0, 7.0]), np.array([0.0, 0.0]), np.array([0.0, 1.0])) == pytest.approx(2.0)
    # Eje degenerado: distancia al punto
    assert geo.distancia_a_eje(np.array([3.0, 4.0]), np.array([0.0, 0.0]), np.array([0.0, 0.0])) == pytest.approx(5.0)


def test_inclinacion_respecto_a_la_vertical():
    # Y crece hacia abajo en la imagen: de la cadera (abajo) al hombro (arriba)
    assert geo.inclinacion_respecto_vertical((0, 1), (0, 0)) == pytest.approx(0.0)
    assert geo.inclinacion_respecto_vertical((0, 1), (1, 0)) == pytest.approx(45.0)


# --------------------------------------------------------------------------
# Métricas en 3D (coordenadas del mundo de MediaPipe, en metros)
# --------------------------------------------------------------------------


def _mundo(*, pies: float = 0.40, muneca_der=(0.60, -0.10, 0.0), giro_hombros: float = 0.0) -> list:
    """Jugador erguido: hombros de 0,40 m, tronco de 0,50 m y pies separados `pies`."""
    a = math.radians(giro_hombros)
    hombro = (0.20 * math.cos(a), -0.5, 0.20 * math.sin(a))
    return _esqueleto(
        LEFT_SHOULDER=(-hombro[0], hombro[1], -hombro[2]),
        RIGHT_SHOULDER=hombro,
        LEFT_HIP=(-0.15, 0.0, 0.0),
        RIGHT_HIP=(0.15, 0.0, 0.0),
        LEFT_ANKLE=(-pies / 2, 0.9, 0.0),
        RIGHT_ANKLE=(pies / 2, 0.9, 0.0),
        RIGHT_WRIST=muneca_der,
        LEFT_WRIST=(-0.10, -0.10, 0.0),
    )


def test_base_en_3d_en_anchos_de_hombro():
    assert geo._metricas_3d(_mundo(pies=0.60))["amplitud_base"] == pytest.approx(1.5)


def test_separacion_de_la_muneca_no_depende_de_la_direccion():
    # 0,6 m del eje del tronco hacia un lado o hacia delante: la misma separación
    lado = geo._metricas_3d(_mundo(muneca_der=(0.60, -0.10, 0.0)))["distancia_muneca_cuerpo"]
    delante = geo._metricas_3d(_mundo(muneca_der=(0.0, -0.10, 0.60)))["distancia_muneca_cuerpo"]
    assert lado == pytest.approx(delante)
    assert lado == pytest.approx(0.60 / 0.50)  # en longitudes de tronco


def test_giro_de_hombros_respecto_a_caderas():
    metricas = geo._metricas_3d(_mundo(giro_hombros=30.0))
    assert metricas["giro_caderas"] == pytest.approx(0.0)
    assert metricas["giro_hombros"] == pytest.approx(30.0)


# --------------------------------------------------------------------------
# Métricas por frame y visibilidad
# --------------------------------------------------------------------------


def _esqueleto_imagen(visibilidad_tobillos: float = 0.99) -> list:
    esqueleto = _esqueleto(
        LEFT_SHOULDER=(0.45, 0.30), RIGHT_SHOULDER=(0.55, 0.30),
        LEFT_ELBOW=(0.40, 0.40), RIGHT_ELBOW=(0.55, 0.40),  # codo derecho bajo el hombro
        LEFT_WRIST=(0.35, 0.50), RIGHT_WRIST=(0.65, 0.40),
        LEFT_HIP=(0.46, 0.55), RIGHT_HIP=(0.54, 0.55),
        LEFT_KNEE=(0.46, 0.70), RIGHT_KNEE=(0.54, 0.70),
        LEFT_ANKLE=(0.46, 0.85), RIGHT_ANKLE=(0.54, 0.85),
    )
    for indice in (geo.LEFT_ANKLE, geo.RIGHT_ANKLE):
        esqueleto[indice].visibility = visibilidad_tobillos
    return esqueleto


def test_extraer_metricas_angulos_basicos():
    metricas = geo.extraer_metricas_pose(_esqueleto_imagen(), 1000, 1000)
    # Codo derecho: hombro arriba, codo y muñeca en horizontal -> 90°
    assert metricas["angulo_codo_der"] == pytest.approx(90.0)
    # Piernas rectas
    assert metricas["angulo_rodilla_der"] == pytest.approx(180.0)
    assert metricas["inclinacion_tronco"] == pytest.approx(0.0)
    # Sin coordenadas 3D no se puede medir el giro sobre el eje vertical
    assert metricas["giro_hombros"] is None


def test_articulaciones_poco_visibles_no_dan_metricas():
    metricas = geo.extraer_metricas_pose(
        _esqueleto_imagen(visibilidad_tobillos=0.1), 1000, 1000, min_visibilidad=0.3
    )
    assert metricas["angulo_rodilla_der"] is None
    assert metricas["amplitud_base"] is None
    assert metricas["angulo_codo_der"] is not None  # el brazo sí se ve


def test_con_coordenadas_3d_la_base_es_la_del_mundo():
    metricas = geo.extraer_metricas_pose(_esqueleto_imagen(), 1000, 1000, mundo=_mundo(pies=0.60))
    assert metricas["amplitud_base"] == pytest.approx(1.5)


# --------------------------------------------------------------------------
# Suavizado de las series
# --------------------------------------------------------------------------


def test_suavizar_serie_respeta_los_huecos():
    serie = [1.0, 2.0, None, None, 5, 5, 5, 5, 5, 5, 5, None, 3.0]
    suavizada = geo.suavizar_serie(serie)
    assert [v is None for v in suavizada] == [v is None for v in serie]
    assert suavizada[4:11] == pytest.approx([5.0] * 7)


def test_desenrollar_grados_quita_los_saltos_de_360():
    assert geo.desenrollar_grados([170.0, 179.0, -179.0, -170.0, None, 10.0]) == pytest.approx(
        [170.0, 179.0, 181.0, 190.0, None, 10.0]
    )


def test_ema_conserva_el_valor_si_falta_el_dato():
    assert geo.ema(None, 120.0, 0.5) == 120.0
    assert geo.ema(100.0, None, 0.5) == 100.0
    assert geo.ema(100.0, 120.0, 0.5) == pytest.approx(110.0)


def test_ema_de_fase_cero_no_cruza_los_huecos():
    resultado = geo.ema_fase_cero([0.0, 0.0, 10.0, None, 50.0, 50.0], alpha=0.5)
    assert resultado[3] is None
    # El tramo tras el hueco no arrastra los valores de antes
    assert resultado[4:] == pytest.approx([50.0, 50.0])

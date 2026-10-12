"""
TFG Tenis - Cálculos geométricos y de suavizado sobre los esqueletos de MediaPipe.

Funciones puras (sin OpenCV, MediaPipe ni YOLO): ángulos, distancias, medidas en
3D, extracción de métricas por frame y filtros de las series. Están separadas de
main.py para poder probarlas con pytest fuera de Docker.
"""

from __future__ import annotations

import math

import numpy as np
from scipy.signal import savgol_filter

# Índices de los landmarks de MediaPipe Pose
NOSE = 0
LEFT_SHOULDER = 11
RIGHT_SHOULDER = 12
LEFT_ELBOW = 13
RIGHT_ELBOW = 14
LEFT_WRIST = 15
RIGHT_WRIST = 16
LEFT_HIP = 23
RIGHT_HIP = 24
LEFT_KNEE = 25
RIGHT_KNEE = 26
LEFT_ANKLE = 27
RIGHT_ANKLE = 28

SAVGOL_WINDOW = 11
SAVGOL_POLYORDER = 3
# Por debajo de esta visibilidad MediaPipe está adivinando la articulación (oculta
# tras el cuerpo o fuera de plano): sus métricas no se usan en la evaluación. No es
# más alto porque la muñeca baja a 0,35-0,40 en pleno swing por el desenfoque, y
# se perderían el codo y el spacing justo en el impacto
UMBRAL_VISIBILIDAD_METRICAS = 0.3


def calcular_angulo(p1, p2, p3) -> float:
    """Ángulo interior en grados en p2 formado por los puntos p1-p2-p3 (coords x, y)."""
    angulo_rad = math.atan2(p3[1] - p2[1], p3[0] - p2[0]) - math.atan2(
        p1[1] - p2[1], p1[0] - p2[0]
    )
    angulo_deg = abs(math.degrees(angulo_rad))
    if angulo_deg > 180.0:
        angulo_deg = 360.0 - angulo_deg
    return angulo_deg


def landmark_px(landmark, frame_w: int, frame_h: int) -> tuple[float, float]:
    """Convierte un landmark normalizado a píxeles."""
    return (landmark.x * frame_w, landmark.y * frame_h)


def distancia(p1: tuple[float, float], p2: tuple[float, float]) -> float:
    """Distancia euclídea entre dos puntos en píxeles."""
    return math.hypot(p1[0] - p2[0], p1[1] - p2[1])


def punto_medio(
    p1: tuple[float, float], p2: tuple[float, float]
) -> tuple[float, float]:
    return ((p1[0] + p2[0]) / 2.0, (p1[1] + p2[1]) / 2.0)


def calcular_escala(
    hombro_izq: tuple[float, float],
    hombro_der: tuple[float, float],
    cadera_izq: tuple[float, float],
    cadera_der: tuple[float, float],
) -> float:
    """Escala del jugador: el mayor entre ancho de hombros y longitud del torso."""
    ancho_hombros = distancia(hombro_izq, hombro_der)
    torso = distancia(
        punto_medio(cadera_izq, cadera_der),
        punto_medio(hombro_izq, hombro_der),
    )
    return max(ancho_hombros, torso, 1.0)


def inclinacion_respecto_vertical(
    origen: tuple[float, float], destino: tuple[float, float]
) -> float:
    """Ángulo en grados del vector origen->destino respecto a la vertical de imagen."""
    vx = destino[0] - origen[0]
    vy = destino[1] - origen[1]
    return abs(math.degrees(math.atan2(vx, -vy)))


def _punto_3d(landmark) -> np.ndarray:
    return np.array([float(landmark.x), float(landmark.y), float(landmark.z)])


def distancia_a_eje(
    punto: np.ndarray, eje_a: np.ndarray, eje_b: np.ndarray
) -> float:
    """Distancia de un punto a la recta que pasa por eje_a y eje_b (2D o 3D)."""
    eje = eje_b - eje_a
    largo = float(np.linalg.norm(eje))
    if largo < 1e-9:
        return float(np.linalg.norm(punto - eje_a))
    rel = punto - eje_a
    proyeccion = float(np.dot(rel, eje)) / largo
    return math.sqrt(max(float(np.dot(rel, rel)) - proyeccion**2, 0.0))


def _metricas_3d(mundo) -> dict[str, float]:
    """
    Base, separación de la muñeca y giro de hombros y caderas con las coordenadas
    3D de MediaPipe (en metros): no cambian según desde dónde se grabe. En 2D, de
    perfil los hombros se ven estrechos y la base sale enorme; la muñeca por
    delante del cuerpo apenas se separa en horizontal si la cámara está detrás; y
    el giro del tronco sobre el eje vertical no se ve.
    """
    hombro_izq, hombro_der = _punto_3d(mundo[LEFT_SHOULDER]), _punto_3d(mundo[RIGHT_SHOULDER])
    cadera_izq, cadera_der = _punto_3d(mundo[LEFT_HIP]), _punto_3d(mundo[RIGHT_HIP])

    def giro(izq: np.ndarray, der: np.ndarray) -> float:
        # Orientación de la línea izquierda-derecha en el plano horizontal (x, z):
        # su diferencia entre hombros y caderas es la separación del tronco
        return math.degrees(math.atan2(der[2] - izq[2], der[0] - izq[0]))

    centro_hombros = (hombro_izq + hombro_der) / 2.0
    centro_caderas = (cadera_izq + cadera_der) / 2.0
    ancho_hombros = max(float(np.linalg.norm(hombro_izq - hombro_der)), 1e-3)
    escala = max(ancho_hombros, float(np.linalg.norm(centro_hombros - centro_caderas)))
    return {
        "distancia_muneca_cuerpo": distancia_a_eje(
            _punto_3d(mundo[RIGHT_WRIST]), centro_caderas, centro_hombros
        )
        / escala,
        "distancia_muneca_izq": distancia_a_eje(
            _punto_3d(mundo[LEFT_WRIST]), centro_caderas, centro_hombros
        )
        / escala,
        "amplitud_base": float(
            np.linalg.norm(_punto_3d(mundo[LEFT_ANKLE]) - _punto_3d(mundo[RIGHT_ANKLE]))
        )
        / ancho_hombros,
        "giro_hombros": giro(hombro_izq, hombro_der),
        "giro_caderas": giro(cadera_izq, cadera_der),
    }


def extraer_metricas_pose(
    pose_landmarks,
    frame_w: int,
    frame_h: int,
    *,
    mundo=None,
    min_visibilidad: float = 0.0,
) -> dict:
    """
    Ángulos y métricas espaciales normalizadas de un esqueleto MediaPipe.

    mundo: landmarks 3D de MediaPipe (metros); si están, la base y la separación
    de la muñeca se miden en 3D. min_visibilidad: una métrica vale None si alguna
    de sus articulaciones tiene menos visibilidad (oculta o mal detectada), para
    que no entre en las medias.
    """
    p_hombro_izq = landmark_px(pose_landmarks[LEFT_SHOULDER], frame_w, frame_h)
    p_hombro_der = landmark_px(pose_landmarks[RIGHT_SHOULDER], frame_w, frame_h)
    p_codo_izq = landmark_px(pose_landmarks[LEFT_ELBOW], frame_w, frame_h)
    p_codo_der = landmark_px(pose_landmarks[RIGHT_ELBOW], frame_w, frame_h)
    p_muneca_izq = landmark_px(pose_landmarks[LEFT_WRIST], frame_w, frame_h)
    p_muneca_der = landmark_px(pose_landmarks[RIGHT_WRIST], frame_w, frame_h)
    p_cadera_izq = landmark_px(pose_landmarks[LEFT_HIP], frame_w, frame_h)
    p_cadera_der = landmark_px(pose_landmarks[RIGHT_HIP], frame_w, frame_h)
    p_rodilla_izq = landmark_px(pose_landmarks[LEFT_KNEE], frame_w, frame_h)
    p_rodilla_der = landmark_px(pose_landmarks[RIGHT_KNEE], frame_w, frame_h)
    p_tobillo_izq = landmark_px(pose_landmarks[LEFT_ANKLE], frame_w, frame_h)
    p_tobillo_der = landmark_px(pose_landmarks[RIGHT_ANKLE], frame_w, frame_h)

    centro_hombros = punto_medio(p_hombro_izq, p_hombro_der)
    centro_caderas = punto_medio(p_cadera_izq, p_cadera_der)
    escala = calcular_escala(p_hombro_izq, p_hombro_der, p_cadera_izq, p_cadera_der)
    # Sin 3D, de perfil el ancho de hombros se ve casi nulo: se usa como mínimo
    # el que corresponde a la longitud del tronco (hombros ≈ 0,9 veces el tronco)
    torso = distancia(centro_caderas, centro_hombros)
    ancho_hombros = max(distancia(p_hombro_izq, p_hombro_der), 0.9 * torso, 1.0)

    if mundo is not None:
        distancias = _metricas_3d(mundo)
    else:
        # El giro sobre el eje vertical no se puede medir en 2D
        eje_a, eje_b = np.array(centro_caderas), np.array(centro_hombros)
        distancias = {
            "distancia_muneca_cuerpo": distancia_a_eje(np.array(p_muneca_der), eje_a, eje_b)
            / escala,
            "distancia_muneca_izq": distancia_a_eje(np.array(p_muneca_izq), eje_a, eje_b)
            / escala,
            "amplitud_base": distancia(p_tobillo_izq, p_tobillo_der) / ancho_hombros,
            "giro_hombros": None,
            "giro_caderas": None,
        }

    def visibles(*indices: int) -> bool:
        return all(_visibilidad(pose_landmarks[i]) >= min_visibilidad for i in indices)

    def si_visibles(valor: float | None, *indices: int) -> float | None:
        return float(valor) if valor is not None and visibles(*indices) else None

    tronco = (LEFT_SHOULDER, RIGHT_SHOULDER, LEFT_HIP, RIGHT_HIP)
    return {
        "angulo_codo_der": si_visibles(
            calcular_angulo(p_hombro_der, p_codo_der, p_muneca_der),
            RIGHT_SHOULDER, RIGHT_ELBOW, RIGHT_WRIST,
        ),
        "angulo_codo_izq": si_visibles(
            calcular_angulo(p_hombro_izq, p_codo_izq, p_muneca_izq),
            LEFT_SHOULDER, LEFT_ELBOW, LEFT_WRIST,
        ),
        "angulo_rodilla_der": si_visibles(
            calcular_angulo(p_cadera_der, p_rodilla_der, p_tobillo_der),
            RIGHT_HIP, RIGHT_KNEE, RIGHT_ANKLE,
        ),
        "angulo_rodilla_izq": si_visibles(
            calcular_angulo(p_cadera_izq, p_rodilla_izq, p_tobillo_izq),
            LEFT_HIP, LEFT_KNEE, LEFT_ANKLE,
        ),
        "apertura_hombro_der": si_visibles(
            calcular_angulo(p_cadera_der, p_hombro_der, p_codo_der),
            RIGHT_HIP, RIGHT_SHOULDER, RIGHT_ELBOW,
        ),
        "apertura_hombro_izq": si_visibles(
            calcular_angulo(p_cadera_izq, p_hombro_izq, p_codo_izq),
            LEFT_HIP, LEFT_SHOULDER, LEFT_ELBOW,
        ),
        "distancia_muneca_cuerpo": si_visibles(
            distancias["distancia_muneca_cuerpo"], RIGHT_WRIST, *tronco
        ),
        "distancia_muneca_izq": si_visibles(
            distancias["distancia_muneca_izq"], LEFT_WRIST, *tronco
        ),
        "amplitud_base": si_visibles(
            distancias["amplitud_base"], LEFT_ANKLE, RIGHT_ANKLE, LEFT_SHOULDER, RIGHT_SHOULDER
        ),
        "inclinacion_tronco": si_visibles(
            inclinacion_respecto_vertical(centro_caderas, centro_hombros), *tronco
        ),
        "giro_hombros": si_visibles(distancias["giro_hombros"], LEFT_SHOULDER, RIGHT_SHOULDER),
        "giro_caderas": si_visibles(distancias["giro_caderas"], LEFT_HIP, RIGHT_HIP),
        "p_codo_der": p_codo_der,
        "p_rodilla_der": p_rodilla_der,
        "p_rodilla_izq": p_rodilla_izq,
        "p_tobillo_der": p_tobillo_der,
        "p_tobillo_izq": p_tobillo_izq,
    }


def _visibilidad(landmark) -> float:
    valor = getattr(landmark, "visibility", None)
    if valor is None:
        return 1.0
    return float(valor)


def _ema_1d(valores: list[float], alpha: float) -> list[float]:
    if not valores:
        return []
    suavizados = [float(valores[0])]
    for valor in valores[1:]:
        suavizados.append(alpha * float(valor) + (1.0 - alpha) * suavizados[-1])
    return suavizados


def ema_fase_cero(valores: list[float | None], alpha: float) -> list[float | None]:
    """EMA forward-backward (fase 0). No interpola a través de huecos None."""
    n = len(valores)
    resultado: list[float | None] = [None] * n
    i = 0
    while i < n:
        if valores[i] is None:
            i += 1
            continue
        j = i + 1
        while j < n and valores[j] is not None:
            j += 1
        segmento = [float(v) for v in valores[i:j] if v is not None]
        if len(segmento) == 1:
            resultado[i] = segmento[0]
        else:
            ida = _ema_1d(segmento, alpha)
            vuelta = list(reversed(_ema_1d(list(reversed(segmento)), alpha)))
            for k, (f, b) in enumerate(zip(ida, vuelta)):
                resultado[i + k] = (f + b) / 2.0
        i = j
    return resultado


def ema(actual: float | None, anterior: float | None, alpha: float) -> float | None:
    if actual is None:
        return anterior
    if anterior is None:
        return actual
    return alpha * actual + (1.0 - alpha) * anterior


def suavizar_serie(
    valores: list[float | None],
    window_length: int = SAVGOL_WINDOW,
    polyorder: int = SAVGOL_POLYORDER,
) -> list[float | None]:
    """
    Savitzky-Golay por tramos: los huecos (None, articulación poco visible) se
    mantienen y no se rellenan con valores inventados.
    """
    resultado: list[float | None] = [None] * len(valores)
    inicio = None
    for i, valor in enumerate([*valores, None]):
        if valor is not None and inicio is None:
            inicio = i
        elif valor is None and inicio is not None:
            resultado[inicio:i] = _suavizar_tramo(
                [float(v) for v in valores[inicio:i]], window_length, polyorder
            )
            inicio = None
    return resultado


def desenrollar_grados(valores: list[float | None]) -> list[float | None]:
    """
    Quita los saltos de ±360° de un ángulo que da vueltas (179° -> -179° es un
    giro de 2°, no de 358°), por tramos sin huecos, antes de suavizarlo.
    """
    resultado = list(valores)
    inicio = None
    for i, valor in enumerate([*valores, None]):
        if valor is not None and inicio is None:
            inicio = i
        elif valor is None and inicio is not None:
            tramo = np.unwrap(np.radians(np.array(valores[inicio:i], dtype=float)))
            resultado[inicio:i] = [float(v) for v in np.degrees(tramo)]
            inicio = None
    return resultado


def _suavizar_tramo(
    valores: list[float], window_length: int, polyorder: int
) -> list[float]:
    """Aplica Savitzky-Golay adaptando la ventana si el tramo es corto."""
    if len(valores) < 5:
        return [round(v, 2) for v in valores]

    window = min(window_length, len(valores))
    if window % 2 == 0:
        window -= 1
    if window <= polyorder:
        return [round(v, 2) for v in valores]

    filtrado = savgol_filter(valores, window_length=window, polyorder=polyorder)
    return [round(float(v), 2) for v in filtrado]

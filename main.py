"""
TFG Tenis - Detección de pose con OpenCV/MediaPipe y rastreo de pelota con YOLOv8.
Analiza un vídeo de tenis, anota el esqueleto y exporta métricas de codo y rodillas.
Compatible con Python 3.14 (API Tasks; sin mp.solutions).
"""

from __future__ import annotations

import csv
import json
import math
import subprocess
import sys
import time
import urllib.request
from collections.abc import Callable
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np
import torch
from mediapipe.tasks.python import vision
from mediapipe.tasks.python.vision import drawing_utils
from scipy.signal import savgol_filter
from ultralytics import YOLO

from biomecanica import (
    anotar_fases_golpe,
    clasificar_golpes,
    generar_feedback,
    tipo_elegido,
)

# ---------------------------------------------------------------------------
# Rutas y constantes
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parent
VIDEO_PATH = PROJECT_ROOT / "data" / "prueba.mp4"
OUTPUT_VIDEO_PATH = PROJECT_ROOT / "data" / "resultado_angulos.mp4"
METRICS_CSV_PATH = PROJECT_ROOT / "data" / "metricas_codo.csv"
POSE_TRACKS_PATH = PROJECT_ROOT / "data" / "pose_tracks.json"
# Variante del Pose Landmarker: 'lite', 'full' o 'heavy'.
# Medido sobre data/prueba.mp4 en un i7-7600U (ms/frame y desvío de ángulos vs heavy):
#   lite   40 ms  -> codo 17.2°, rodilla 2.9°  (descartado: arruina el ángulo de codo)
#   full   68 ms  -> codo  6.4°, rodilla 2.5°
#   heavy 200 ms  -> referencia
POSE_MODEL_VARIANT = "full"
MODEL_PATH = PROJECT_ROOT / "models" / f"pose_landmarker_{POSE_MODEL_VARIANT}.task"
MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/"
    f"pose_landmarker_{POSE_MODEL_VARIANT}/float16/1/"
    f"pose_landmarker_{POSE_MODEL_VARIANT}.task"
)
OUTPUT_HEIGHT = 800  # Alto fijo del vídeo de salida

# YOLOv8 'nano' para rastrear la pelota (clase 32 de COCO: sports ball)
YOLO_MODEL_PATH = PROJECT_ROOT / "models" / "yolov8n.pt"
YOLO_TRACKER = "bytetrack.yaml"
# Ejecutar YOLO 1 de cada N frames: la pelota sale en pocos frames y el coste por
# frame es alto, así que espaciarlo recorta el tiempo casi sin perder detecciones.
YOLO_FRAME_STRIDE = 3
SPORTS_BALL_CLASS_ID = 32
BALL_BOX_COLOR = (0, 165, 255)  # Naranja puro (BGR)
# Ancho de zapatilla como fracción del ancho del frame, para filtrar falsos positivos
FOOT_WIDTH_RATIO = 0.10

# Aceleración por hardware: usa la GPU si hay CUDA disponible, si no CPU
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

# Índices MediaPipe Pose
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

# Puntos que se exportan a pose_tracks.json (overlay HTML5)
LANDMARKS_TRACK = {
    "nariz": NOSE,
    "hombro_izq": LEFT_SHOULDER,
    "hombro_der": RIGHT_SHOULDER,
    "codo_izq": LEFT_ELBOW,
    "codo_der": RIGHT_ELBOW,
    "muneca_izq": LEFT_WRIST,
    "muneca_der": RIGHT_WRIST,
    "cadera_izq": LEFT_HIP,
    "cadera_der": RIGHT_HIP,
    "rodilla_izq": LEFT_KNEE,
    "rodilla_der": RIGHT_KNEE,
    "tobillo_izq": LEFT_ANKLE,
    "tobillo_der": RIGHT_ANKLE,
}

SAVGOL_WINDOW = 11
SAVGOL_POLYORDER = 3
# Por debajo de esta visibilidad MediaPipe está adivinando la articulación (oculta
# tras el cuerpo o fuera de plano): sus métricas no se usan en la evaluación. No es
# más alto porque la muñeca baja a 0,35-0,40 en pleno swing por el desenfoque, y
# se perderían el codo y el spacing justo en el impacto
UMBRAL_VISIBILIDAD_METRICAS = 0.3

# Suavizado temporal del overlay MP4: landmarks un poco más reactivos que los textos
EMA_ALPHA_LANDMARKS = 0.55
EMA_ALPHA_ANGULOS = 0.35
# pose_tracks.json: EMA bidireccional (fase 0) más reactiva, sin retraso de golpe
EMA_ALPHA_TRACKS = 0.65
# Si MediaPipe/YOLO fallan unos pocos frames, se retiene el último dibujo válido
GRACE_FRAMES = 5


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


def _r4(valor: float) -> float:
    return round(float(valor), 4)


def _visibilidad(landmark) -> float:
    valor = getattr(landmark, "visibility", None)
    if valor is None:
        return 1.0
    return float(valor)


def bbox_normalizada(
    landmarks, margen: float = 0.03, *, redondear: bool = True
) -> list[float] | None:
    """Bounding box del jugador en coords 0-1 a partir de los landmarks."""
    xs: list[float] = []
    ys: list[float] = []
    for landmark in landmarks:
        if _visibilidad(landmark) < 0.25:
            continue
        xs.append(float(landmark.x))
        ys.append(float(landmark.y))
    if not xs:
        return None
    caja = [
        max(0.0, min(xs) - margen),
        max(0.0, min(ys) - margen),
        min(1.0, max(xs) + margen),
        min(1.0, max(ys) + margen),
    ]
    return [_r4(v) for v in caja] if redondear else caja


def serializar_landmarks_track(
    landmarks, *, redondear: bool = True
) -> dict[str, list[float]]:
    """Subset compacto de keypoints normalizados para el canvas del frontend."""
    exportados: dict[str, list[float]] = {}
    total = len(landmarks)
    for nombre, indice in LANDMARKS_TRACK.items():
        if indice >= total:
            continue
        punto = landmarks[indice]
        valores = [
            float(punto.x),
            float(punto.y),
            float(_visibilidad(punto)),
        ]
        exportados[nombre] = [_r4(v) for v in valores] if redondear else valores
    return exportados


def serializar_caja_yolo(
    caja: dict, frame_w: int, frame_h: int
) -> list[float] | None:
    if frame_w <= 0 or frame_h <= 0:
        return None
    return [
        _r4(caja["x1"] / frame_w),
        _r4(caja["y1"] / frame_h),
        _r4(caja["x2"] / frame_w),
        _r4(caja["y2"] / frame_h),
    ]


def escribir_pose_tracks(
    ruta: Path,
    fps: float,
    width: int,
    height: int,
    frames: list[dict],
    golpes_fases: list[dict] | None = None,
) -> Path:
    ruta.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "fps": _r4(fps if fps > 0 else 30.0),
        "width": int(width),
        "height": int(height),
        "total_frames": len(frames),
        "golpes_fases": golpes_fases or [],
        "frames": frames,
    }
    with open(ruta, "w", encoding="utf-8") as archivo:
        json.dump(payload, archivo, ensure_ascii=True, separators=(",", ":"))
    print(f"Tracks de pose exportados: {ruta} ({len(frames)} frames)")
    return ruta


def _ema_1d(valores: list[float], alpha: float) -> list[float]:
    if not valores:
        return []
    suavizados = [float(valores[0])]
    for valor in valores[1:]:
        suavizados.append(alpha * float(valor) + (1.0 - alpha) * suavizados[-1])
    return suavizados


def ema_fase_cero(
    valores: list[float | None], alpha: float = EMA_ALPHA_TRACKS
) -> list[float | None]:
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


def suavizar_pose_tracks(
    frames: list[dict], alpha: float = EMA_ALPHA_TRACKS
) -> list[dict]:
    """Suaviza landmarks, bboxes y ángulos de pose_tracks.json con EMA de fase 0."""
    if not frames:
        return frames

    nombres: set[str] = set()
    for frame in frames:
        landmarks = frame.get("landmarks") or {}
        nombres.update(landmarks.keys())

    series_x = {nombre: [] for nombre in nombres}
    series_y = {nombre: [] for nombre in nombres}
    series_v = {nombre: [] for nombre in nombres}
    for frame in frames:
        landmarks = frame.get("landmarks") or {}
        for nombre in nombres:
            punto = landmarks.get(nombre)
            if punto is None:
                series_x[nombre].append(None)
                series_y[nombre].append(None)
                series_v[nombre].append(None)
            else:
                series_x[nombre].append(float(punto[0]))
                series_y[nombre].append(float(punto[1]))
                series_v[nombre].append(float(punto[2]))

    suaves_x = {
        nombre: ema_fase_cero(serie, alpha) for nombre, serie in series_x.items()
    }
    suaves_y = {
        nombre: ema_fase_cero(serie, alpha) for nombre, serie in series_y.items()
    }

    def canal_caja(clave: str, indice: int) -> list[float | None]:
        return [
            None if frame.get(clave) is None else float(frame[clave][indice])
            for frame in frames
        ]

    bbox_s = [ema_fase_cero(canal_caja("bbox", i), alpha) for i in range(4)]
    yolo_s = [ema_fase_cero(canal_caja("bbox_yolo", i), alpha) for i in range(4)]

    claves_angulo = ("codo_der", "codo_izq", "rodilla_der", "rodilla_izq")
    angulos_s = {
        clave: ema_fase_cero(
            [
                None
                if not frame.get("angulos")
                else float(frame["angulos"][clave])
                for frame in frames
            ],
            alpha,
        )
        for clave in claves_angulo
    }

    suavizados: list[dict] = []
    for i, frame in enumerate(frames):
        nuevo = {
            "t": _r4(frame["t"]),
            "bbox": None,
            "bbox_yolo": None,
            "landmarks": None,
            "angulos": None,
            "fase": frame.get("fase"),
            "fase_label": frame.get("fase_label"),
        }
        if frame.get("landmarks"):
            landmarks_s: dict[str, list[float]] = {}
            for nombre in nombres:
                x = suaves_x[nombre][i]
                y = suaves_y[nombre][i]
                vis = series_v[nombre][i]
                if x is None or y is None:
                    continue
                landmarks_s[nombre] = [
                    _r4(x),
                    _r4(y),
                    _r4(1.0 if vis is None else vis),
                ]
            nuevo["landmarks"] = landmarks_s or None
        if frame.get("bbox"):
            coords = [bbox_s[c][i] for c in range(4)]
            if None not in coords:
                nuevo["bbox"] = [_r4(v) for v in coords]
        if frame.get("bbox_yolo"):
            coords_yolo = [yolo_s[c][i] for c in range(4)]
            if None not in coords_yolo:
                nuevo["bbox_yolo"] = [_r4(v) for v in coords_yolo]
        if frame.get("angulos"):
            angs = {clave: angulos_s[clave][i] for clave in claves_angulo}
            if None not in angs.values():
                nuevo["angulos"] = {clave: _r4(val) for clave, val in angs.items()}
        suavizados.append(nuevo)
    return suavizados


def timestamp_presentacion(
    cap: cv2.VideoCapture,
    frame_index: int,
    fps: float,
    t_anterior: float | None,
) -> float:
    """Timestamp de presentación en segundos (POS_MSEC; fallback idx/fps)."""
    pos_msec = float(cap.get(cv2.CAP_PROP_POS_MSEC))
    if frame_index > 0 and pos_msec <= 0:
        t_sec = frame_index / float(fps if fps > 0 else 30.0)
    else:
        t_sec = max(0.0, pos_msec) / 1000.0
    if t_anterior is not None and t_sec <= t_anterior:
        t_sec = t_anterior + (1.0 / float(fps if fps > 0 else 30.0))
    return t_sec


class _LandmarkSuave:
    """Landmark con la misma interfaz .x/.y/.z que usa drawing_utils."""

    __slots__ = ("x", "y", "z", "visibility", "presence")

    def __init__(
        self,
        x: float,
        y: float,
        z: float = 0.0,
        visibility: float = 1.0,
        presence: float = 1.0,
    ) -> None:
        self.x = float(x)
        self.y = float(y)
        self.z = float(z)
        self.visibility = float(visibility)
        self.presence = float(presence)


def clonar_landmarks(pose_landmarks) -> list[_LandmarkSuave]:
    # Sin dato de visibilidad se supone visible; un 0 real se conserva
    return [
        _LandmarkSuave(
            getattr(lm, "x", 0.0),
            getattr(lm, "y", 0.0),
            getattr(lm, "z", 0.0),
            _visibilidad(lm),
            1.0 if getattr(lm, "presence", None) is None else float(lm.presence),
        )
        for lm in pose_landmarks
    ]


def suavizar_landmarks(
    actuales,
    anteriores: list[_LandmarkSuave] | None,
    alpha: float = EMA_ALPHA_LANDMARKS,
) -> list[_LandmarkSuave]:
    """EMA por coordenada entre el frame actual y el esqueleto anterior."""
    actuales_n = clonar_landmarks(actuales)
    if anteriores is None or len(anteriores) != len(actuales_n):
        return actuales_n
    return [
        _LandmarkSuave(
            alpha * cur.x + (1.0 - alpha) * prev.x,
            alpha * cur.y + (1.0 - alpha) * prev.y,
            alpha * cur.z + (1.0 - alpha) * prev.z,
            cur.visibility,
            cur.presence,
        )
        for cur, prev in zip(actuales_n, anteriores)
    ]


def ema(actual: float | None, anterior: float | None, alpha: float) -> float | None:
    if actual is None:
        return anterior
    if anterior is None:
        return actual
    return alpha * actual + (1.0 - alpha) * anterior


def extraer_cajas_pelota(
    resultados_yolo,
    tobillos: list[tuple[float, float]] | None,
    frame_w: int,
) -> list[dict]:
    """Convierte la salida de YOLO en cajas serializables para reutilizarlas."""
    radio_pie = frame_w * FOOT_WIDTH_RATIO
    cajas: list[dict] = []
    for resultado in resultados_yolo:
        if resultado.boxes is None:
            continue
        for box in resultado.boxes:
            x1, y1, x2, y2 = (float(v) for v in box.xyxy[0])
            centro = ((x1 + x2) / 2.0, (y1 + y2) / 2.0)
            if tobillos and es_zapatilla(centro, tobillos, radio_pie):
                continue
            track_id = int(box.id[0]) if box.id is not None else None
            cajas.append(
                {
                    "x1": x1,
                    "y1": y1,
                    "x2": x2,
                    "y2": y2,
                    "conf": float(box.conf[0]),
                    "track_id": track_id,
                }
            )
    return cajas


def suavizar_cajas(
    nuevas: list[dict],
    anteriores: list[dict],
    alpha: float = EMA_ALPHA_LANDMARKS,
) -> list[dict]:
    """EMA de bounding boxes, emparejando por track_id si existe."""
    if not nuevas:
        return [dict(caja) for caja in anteriores]
    if not anteriores:
        return [dict(caja) for caja in nuevas]

    prev_por_id = {
        caja["track_id"]: caja
        for caja in anteriores
        if caja.get("track_id") is not None
    }
    suavizadas: list[dict] = []
    for caja in nuevas:
        previa = prev_por_id.get(caja.get("track_id"))
        if previa is None and len(anteriores) == 1 and len(nuevas) == 1:
            previa = anteriores[0]
        if previa is None:
            suavizadas.append(dict(caja))
            continue
        mezclada = dict(caja)
        for clave in ("x1", "y1", "x2", "y2"):
            mezclada[clave] = alpha * caja[clave] + (1.0 - alpha) * previa[clave]
        suavizadas.append(mezclada)
    return suavizadas


def dibujar_cajas_pelota(frame: np.ndarray, cajas: list[dict]) -> int:
    """Pinta las cajas de pelota (nuevas o retenidas) sobre el frame."""
    for caja in cajas:
        x1, y1, x2, y2 = (int(caja["x1"]), int(caja["y1"]), int(caja["x2"]), int(caja["y2"]))
        track_id = caja.get("track_id")
        etiqueta = (
            f"Pelota {caja['conf']:.2f}"
            if track_id is None
            else f"Pelota #{track_id} {caja['conf']:.2f}"
        )
        cv2.rectangle(frame, (x1, y1), (x2, y2), BALL_BOX_COLOR, 2)
        cv2.putText(
            frame,
            etiqueta,
            (x1, max(y1 - 8, 16)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            BALL_BOX_COLOR,
            2,
            cv2.LINE_AA,
        )
    return len(cajas)


def dibujar_angulos_overlay(
    frame: np.ndarray,
    metricas: dict,
    angulo_codo: float | None,
    angulo_rod_der: float | None,
    angulo_rod_izq: float | None,
) -> None:
    for angulo, punto, color in (
        (angulo_codo, metricas["p_codo_der"], (0, 255, 255)),
        (angulo_rod_der, metricas["p_rodilla_der"], (255, 200, 0)),
        (angulo_rod_izq, metricas["p_rodilla_izq"], (0, 200, 255)),
    ):
        if angulo is None:
            continue
        cv2.putText(
            frame,
            f"{angulo:.1f}",
            (int(punto[0]) + 10, int(punto[1]) - 10),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.7,
            color,
            2,
            cv2.LINE_AA,
        )


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


_yolo_model: YOLO | None = None


def get_yolo_model() -> YOLO:
    """Carga YOLOv8n una única vez en DEVICE; los pesos se descargan al primer uso."""
    global _yolo_model
    if _yolo_model is None:
        YOLO_MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
        print(f"Cargando YOLOv8n: {YOLO_MODEL_PATH} (device={DEVICE})")
        _yolo_model = YOLO(str(YOLO_MODEL_PATH))
        _yolo_model.to(DEVICE)
    return _yolo_model


def es_zapatilla(
    centro: tuple[float, float],
    tobillos: list[tuple[float, float]],
    radio: float,
) -> bool:
    """
    True si la caja cae justo debajo de un tobillo y alineada con él.

    Las zapatillas blancas se confunden con la pelota, pero solo hay que descartar
    las cajas que caen sobre el pie: una pelota botando en la pista queda también
    por debajo de los tobillos y debe conservarse.
    """
    x_centro, y_centro = centro
    return any(
        y_centro > y_tobillo and abs(x_centro - x_tobillo) < radio
        for x_tobillo, y_tobillo in tobillos
    )


def ensure_model_downloaded(model_path: Path = MODEL_PATH, url: str = MODEL_URL) -> Path:
    """Descarga el modelo .task de Google si no existe en disco (plug-and-play)."""
    if model_path.is_file():
        print(f"Modelo encontrado: {model_path}")
        return model_path

    model_path.parent.mkdir(parents=True, exist_ok=True)
    print(f"Modelo no encontrado. Descargando desde:\n  {url}")
    print(f"Destino: {model_path}")

    try:
        urllib.request.urlretrieve(url, model_path)
    except Exception as exc:
        if model_path.exists():
            model_path.unlink()
        raise RuntimeError(
            f"No se pudo descargar el modelo Pose Landmarker.\n"
            f"URL: {url}\nError: {exc}"
        ) from exc

    print("Descarga completada.")
    return model_path


def open_video(video_path: Path) -> tuple[cv2.VideoCapture, np.ndarray]:
    """Abre el vídeo, valida el primer frame y lo devuelve (sin seek)."""
    print(f"Ruta del vídeo: {video_path}")
    print(f"¿Existe el archivo?: {video_path.is_file()}")

    error_msg = (
        f"ERROR: No se encuentra el vídeo en la ruta {video_path}. "
        "Comprueba si la extensión está duplicada (ej. prueba.mp4.mp4)"
    )

    cap = cv2.VideoCapture(str(video_path))

    if not cap.isOpened():
        raise RuntimeError(error_msg)

    ok, first_frame = cap.read()
    if not ok or first_frame is None:
        cap.release()
        raise RuntimeError(error_msg)

    print(
        f"Vídeo OK: {int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))}x"
        f"{int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))}, "
        f"{cap.get(cv2.CAP_PROP_FPS):.2f} FPS, "
        f"~{int(cap.get(cv2.CAP_PROP_FRAME_COUNT))} frames"
    )
    return cap, first_frame


def recodificar_h264(
    video_path: Path,
    original_path: Path,
    fps: float,
    *,
    obligatorio: bool = False,
) -> None:
    """
    Recodifica a H.264 CFR + faststart, con keyframes frecuentes y audio opcional.

    El primer input es el vídeo anotado de OpenCV; el segundo es el original,
    del que se copia la pista de audio si existe (`-map 1:a:0?`).
    """
    temp_path = video_path.with_suffix(".raw.mp4")
    if temp_path.exists():
        temp_path.unlink()
    video_path.rename(temp_path)

    fps_salida = fps if fps and fps > 0 else 30.0

    try:
        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-i",
                str(temp_path),
                "-i",
                str(original_path),
                "-map",
                "0:v:0",
                "-map",
                "1:a:0?",
                "-c:v",
                "libx264",
                "-preset",
                "fast",
                "-crf",
                "21",
                "-r",
                f"{fps_salida:.3f}",
                "-fps_mode",
                "cfr",
                "-g",
                "15",
                "-keyint_min",
                "15",
                "-pix_fmt",
                "yuv420p",
                "-c:a",
                "aac",
                "-b:a",
                "128k",
                "-shortest",
                "-movflags",
                "+faststart",
                str(video_path),
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        print(
            f"Vídeo recodificado a H.264 CFR ({fps_salida:.2f} fps, g=15): {video_path}"
        )
    except FileNotFoundError as exc:
        if not video_path.exists() and temp_path.exists():
            temp_path.rename(video_path)
        if obligatorio:
            raise RuntimeError(
                "ffmpeg no está instalado. En Docker debe añadirse al Dockerfile."
            ) from exc
        print("AVISO: ffmpeg no disponible; se deja el vídeo de OpenCV.")
    except subprocess.CalledProcessError as exc:
        if not video_path.exists() and temp_path.exists():
            temp_path.rename(video_path)
        raise RuntimeError(
            f"ffmpeg no pudo recodificar {video_path} a H.264."
        ) from exc
    finally:
        temp_path.unlink(missing_ok=True)


def procesar_video(
    input_path: Path,
    *,
    output_dir: Path | None = None,
    show_preview: bool = False,
    on_progress: Callable[[int, int], None] | None = None,
    estilo_reves: str = "2_manos",
    estilo_derecha: str = "tradicional",
    lateralidad: str = "diestro",
    tipo_golpe: str = "auto",
    codo_derecha: str = "recto",
) -> tuple[Path, Path, dict]:
    """
    Procesa un vídeo de tenis: pose, ángulos de codo/rodillas, vídeo anotado y CSV.

    Args:
        input_path: Ruta del vídeo de entrada (p. ej. data/analisis/<id>/original.mp4).
        output_dir: Carpeta donde escribir vídeo anotado, CSV y pose_tracks.json.
                    Si es None se usan las rutas fijas de data/ (uso CLI).
        show_preview: Si True, muestra ventanas OpenCV (solo uso local/CLI).
                      En servidor/API debe permanecer False.
        on_progress: Callback (frames_procesados, frames_totales) tras cada frame,
                     para alimentar la barra de progreso de la API.
        tipo_golpe: "auto" para clasificar cada golpe, o el que indica el jugador
                    ("derecha", "reves", "saque", "volea", "remate", "cortado").
        codo_derecha: "recto" o "flexionado" (doble flexión) en la derecha.

    Returns:
        (ruta_video_anotado, ruta_csv_metricas, analisis_entrenador)
    """
    if output_dir is None:
        output_video_path = OUTPUT_VIDEO_PATH
        metrics_csv_path = METRICS_CSV_PATH
        pose_tracks_path = POSE_TRACKS_PATH
    else:
        output_video_path = output_dir / OUTPUT_VIDEO_PATH.name
        metrics_csv_path = output_dir / METRICS_CSV_PATH.name
        pose_tracks_path = output_dir / POSE_TRACKS_PATH.name

    model_path = ensure_model_downloaded()
    yolo_model = get_yolo_model()  # Fuera del bucle: se carga una sola vez
    cap, first_frame = open_video(input_path)

    fps = cap.get(cv2.CAP_PROP_FPS)
    if not fps or fps <= 0:
        fps = 30.0

    total_frames = max(int(cap.get(cv2.CAP_PROP_FRAME_COUNT)), 0)

    src_h, src_w = first_frame.shape[:2]
    scale = OUTPUT_HEIGHT / src_h
    output_width = int(src_w * scale)
    output_size = (output_width, OUTPUT_HEIGHT)

    output_video_path.parent.mkdir(parents=True, exist_ok=True)

    # Intentar inicializar con H.264 (avc1) para máxima compatibilidad web
    codec_usado = "avc1"
    fourcc = cv2.VideoWriter_fourcc(*"avc1")
    writer = cv2.VideoWriter(str(output_video_path), fourcc, fps, output_size)

    if not writer.isOpened():
        print("⚠️ Códec avc1 no disponible en este entorno. Usando fallback a mp4v...")
        writer.release()

        # Fallback a mp4v
        codec_usado = "mp4v"
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        writer = cv2.VideoWriter(str(output_video_path), fourcc, fps, output_size)

        if not writer.isOpened():
            cap.release()
            raise RuntimeError(
                f"No se pudo crear el VideoWriter en {output_video_path} "
                "con ningún códec."
            )

    print(f"Exportando resultado a: {output_video_path} ({output_width}x{OUTPUT_HEIGHT})")

    # Series crudas (se suavizan al final antes de escribir el CSV)
    # None: articulación poco visible en ese frame (queda vacío en el CSV)
    timestamps_ms: list[int] = []
    angulos_codo: list[float | None] = []
    angulos_codo_izq: list[float | None] = []
    angulos_rodilla_der: list[float | None] = []
    angulos_rodilla_izq: list[float | None] = []
    aperturas_hombro: list[float | None] = []
    aperturas_hombro_izq: list[float | None] = []
    distancias_muneca: list[float | None] = []
    distancias_muneca_izq: list[float | None] = []
    amplitudes_base: list[float | None] = []
    inclinaciones_tronco: list[float | None] = []
    # Giro de hombros y caderas (3D): se guarda en el CSV para estudiarlo, pero no se
    # evalúa. Probado con 24 golpes, la separación en el armado no distingue la buena
    # técnica (los reveses de Sinner salen con 11-13°, por debajo de muchos
    # aficionados) y daría consejos equivocados
    giros_hombros: list[float | None] = []
    giros_caderas: list[float | None] = []
    pose_tracks: list[dict] = []

    options = vision.PoseLandmarkerOptions(
        base_options=mp.tasks.BaseOptions(model_asset_path=str(model_path)),
        running_mode=vision.RunningMode.VIDEO,
        num_poses=1,
        min_pose_detection_confidence=0.5,
        min_pose_presence_confidence=0.5,
        min_tracking_confidence=0.5,
    )

    window_name = "Depuracion TenisAI"
    if show_preview:
        cv2.namedWindow(window_name, cv2.WINDOW_NORMAL)
        print("Vista previa activa. Pulsa 'q' sobre la ventana para cancelar.")
    else:
        print("Modo headless: sin ventanas OpenCV (servidor/API).")

    frame_index = 0
    frames_escritos = 0
    frames_con_pelota = 0
    start_time = time.time()
    tiempo_mediapipe = 0.0
    tiempo_yolo = 0.0
    landmarks_previos: list[_LandmarkSuave] | None = None
    landmarks_crudos_previos: list[_LandmarkSuave] | None = None
    mundo_previo = None  # Landmarks 3D (metros) del último esqueleto detectado
    frames_sin_pose = 0
    angulos_overlay = {
        "codo": None,
        "codo_izq": None,
        "rod_der": None,
        "rod_izq": None,
    }
    cajas_pelota: list[dict] = []
    frames_sin_pelota = 0
    try:
        with vision.PoseLandmarker.create_from_options(options) as landmarker:
            last_timestamp_ms = -1
            frame = first_frame

            while True:
                if frame_index > 0:
                    success, frame = cap.read()
                    if not success:
                        print("Fin del vídeo.")
                        break

                # Copia sin anotaciones: toda la inferencia (MediaPipe y YOLO) se
                # hace sobre ella; los overlays van solo sobre `frame`.
                frame_limpio = frame.copy()
                frame_h, frame_w = frame_limpio.shape[:2]

                frame_rgb = np.ascontiguousarray(
                    cv2.cvtColor(frame_limpio, cv2.COLOR_BGR2RGB)
                )
                mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=frame_rgb)

                t_sec = timestamp_presentacion(
                    cap, frame_index, fps, pose_tracks[-1]["t"] if pose_tracks else None
                )
                # MediaPipe exige timestamps enteros estrictamente crecientes.
                timestamp_ms = int(round(t_sec * 1000.0))
                if timestamp_ms <= last_timestamp_ms:
                    timestamp_ms = last_timestamp_ms + 1
                last_timestamp_ms = timestamp_ms

                start_mp = time.time()
                results = landmarker.detect_for_video(mp_image, timestamp_ms)
                tiempo_mediapipe += time.time() - start_mp

                pose_cruda = None
                if results.pose_landmarks:
                    pose_cruda = results.pose_landmarks[0]
                    frames_sin_pose = 0
                    landmarks_crudos_previos = clonar_landmarks(pose_cruda)
                    landmarks_previos = suavizar_landmarks(
                        pose_cruda, landmarks_previos
                    )
                    mundo_previo = (
                        results.pose_world_landmarks[0]
                        if results.pose_world_landmarks
                        else None
                    )
                elif landmarks_previos is not None and frames_sin_pose < GRACE_FRAMES:
                    frames_sin_pose += 1
                else:
                    frames_sin_pose += 1
                    landmarks_previos = None
                    landmarks_crudos_previos = None
                    mundo_previo = None

                tobillos: list[tuple[float, float]] = []
                pose_para_dibujo = landmarks_previos

                if pose_para_dibujo is not None:
                    drawing_utils.draw_landmarks(
                        frame,
                        pose_para_dibujo,
                        vision.PoseLandmarksConnections.POSE_LANDMARKS,
                        landmark_drawing_spec=drawing_utils.DrawingSpec(
                            color=(0, 255, 0), thickness=2, circle_radius=2
                        ),
                        connection_drawing_spec=drawing_utils.DrawingSpec(
                            color=(255, 0, 0), thickness=2
                        ),
                    )

                    metricas = extraer_metricas_pose(
                        pose_para_dibujo,
                        frame_w,
                        frame_h,
                        mundo=mundo_previo,
                        min_visibilidad=UMBRAL_VISIBILIDAD_METRICAS,
                    )
                    tobillos.extend(
                        (metricas["p_tobillo_der"], metricas["p_tobillo_izq"])
                    )

                    timestamps_ms.append(timestamp_ms)
                    angulos_codo.append(metricas["angulo_codo_der"])
                    angulos_codo_izq.append(metricas["angulo_codo_izq"])
                    angulos_rodilla_der.append(metricas["angulo_rodilla_der"])
                    angulos_rodilla_izq.append(metricas["angulo_rodilla_izq"])
                    aperturas_hombro.append(metricas["apertura_hombro_der"])
                    aperturas_hombro_izq.append(metricas["apertura_hombro_izq"])
                    distancias_muneca.append(metricas["distancia_muneca_cuerpo"])
                    distancias_muneca_izq.append(metricas["distancia_muneca_izq"])
                    amplitudes_base.append(metricas["amplitud_base"])
                    inclinaciones_tronco.append(metricas["inclinacion_tronco"])
                    giros_hombros.append(metricas["giro_hombros"])
                    giros_caderas.append(metricas["giro_caderas"])

                    angulos_overlay["codo"] = ema(
                        metricas["angulo_codo_der"],
                        angulos_overlay["codo"],
                        EMA_ALPHA_ANGULOS,
                    )
                    angulos_overlay["codo_izq"] = ema(
                        metricas["angulo_codo_izq"],
                        angulos_overlay["codo_izq"],
                        EMA_ALPHA_ANGULOS,
                    )
                    angulos_overlay["rod_der"] = ema(
                        metricas["angulo_rodilla_der"],
                        angulos_overlay["rod_der"],
                        EMA_ALPHA_ANGULOS,
                    )
                    angulos_overlay["rod_izq"] = ema(
                        metricas["angulo_rodilla_izq"],
                        angulos_overlay["rod_izq"],
                        EMA_ALPHA_ANGULOS,
                    )
                    dibujar_angulos_overlay(
                        frame,
                        metricas,
                        angulos_overlay["codo"],
                        angulos_overlay["rod_der"],
                        angulos_overlay["rod_izq"],
                    )

                # YOLO solo 1 de cada N frames; en los intermedios se reutiliza
                # la última caja (EMA) y se dibuja en todos los fotogramas.
                if frame_index % YOLO_FRAME_STRIDE == 0:
                    start_yolo = time.time()
                    resultados_yolo = yolo_model.track(
                        frame_limpio,
                        persist=frame_index > 0,
                        tracker=YOLO_TRACKER,
                        classes=[SPORTS_BALL_CLASS_ID],
                        device=DEVICE,
                        verbose=False,
                    )
                    tiempo_yolo += time.time() - start_yolo
                    cajas_nuevas = extraer_cajas_pelota(
                        resultados_yolo, tobillos, frame_w
                    )
                    if cajas_nuevas:
                        cajas_pelota = suavizar_cajas(cajas_nuevas, cajas_pelota)
                        frames_sin_pelota = 0
                    else:
                        frames_sin_pelota += 1
                        if frames_sin_pelota > GRACE_FRAMES:
                            cajas_pelota = []

                if cajas_pelota:
                    if dibujar_cajas_pelota(frame, cajas_pelota) > 0:
                        frames_con_pelota += 1

                track = {
                    "t": t_sec,
                    "bbox": None,
                    "bbox_yolo": None,
                    "landmarks": None,
                    "angulos": None,
                }
                pose_para_track = landmarks_crudos_previos
                if pose_para_track is not None:
                    track["bbox"] = bbox_normalizada(
                        pose_para_track, redondear=False
                    )
                    track["landmarks"] = serializar_landmarks_track(
                        pose_para_track, redondear=False
                    )
                    metricas_track = extraer_metricas_pose(
                        pose_para_track, frame_w, frame_h
                    )
                    track["angulos"] = {
                        "codo_der": metricas_track["angulo_codo_der"],
                        "codo_izq": metricas_track["angulo_codo_izq"],
                        "rodilla_der": metricas_track["angulo_rodilla_der"],
                        "rodilla_izq": metricas_track["angulo_rodilla_izq"],
                    }
                if cajas_pelota:
                    track["bbox_yolo"] = serializar_caja_yolo(
                        cajas_pelota[0], frame_w, frame_h
                    )
                pose_tracks.append(track)

                frame_resized = cv2.resize(frame, output_size)
                writer.write(frame_resized)
                frames_escritos += 1

                if show_preview:
                    cv2.imshow(window_name, frame_resized)
                    if frame_index == 0:
                        print(
                            f"Ventana abierta. Procesando frames... "
                            f"(timestamp inicial={timestamp_ms} ms)."
                        )
                    if cv2.waitKey(1) & 0xFF == ord("q"):
                        print("Cancelado por el usuario (tecla 'q').")
                        break
                elif frame_index == 0:
                    print(
                        f"Procesando frames en segundo plano "
                        f"(timestamp inicial={timestamp_ms} ms)..."
                    )

                frame_index += 1
                if on_progress is not None:
                    on_progress(frame_index, total_frames)
    finally:
        writer.release()
        cap.release()
        if show_preview:
            cv2.destroyAllWindows()

    # mp4v no sirve para <video> HTML5. En Linux (Docker) recodificamos
    # siempre a H.264 real como paso final de aseguramiento.
    if codec_usado == "mp4v" or sys.platform.startswith("linux"):
        recodificar_h264(
            output_video_path,
            input_path,
            fps,
            obligatorio=sys.platform.startswith("linux"),
        )

    tiempo_total = time.time() - start_time
    tiempo_otros = tiempo_total - tiempo_mediapipe - tiempo_yolo
    etiqueta_yolo = f"YOLOv8 ({DEVICE}):"
    print(
        f"⚡ Procesamiento de IA completado en {tiempo_total:.2f} "
        f"segundos usando: {DEVICE}\n"
        f"   {'Tiempo Total:':<34}{tiempo_total:6.2f} s\n"
        f"   {'MediaPipe (CPU):':<34}{tiempo_mediapipe:6.2f} s\n"
        f"   {etiqueta_yolo:<34}{tiempo_yolo:6.2f} s\n"
        f"   {'Otros (I/O, dibujado, overhead):':<34}{tiempo_otros:6.2f} s"
    )

    # Suavizado Savitzky-Golay sobre las series biomecánicas
    codo_f = suavizar_serie(angulos_codo)
    codo_izq_f = suavizar_serie(angulos_codo_izq)
    rod_der_f = suavizar_serie(angulos_rodilla_der)
    rod_izq_f = suavizar_serie(angulos_rodilla_izq)
    apertura_f = suavizar_serie(aperturas_hombro)
    apertura_izq_f = suavizar_serie(aperturas_hombro_izq)
    spacing_f = suavizar_serie(distancias_muneca)
    spacing_izq_f = suavizar_serie(distancias_muneca_izq)
    base_f = suavizar_serie(amplitudes_base)
    tronco_f = suavizar_serie(inclinaciones_tronco)
    giro_hombros_f = suavizar_serie(desenrollar_grados(giros_hombros))
    giro_caderas_f = suavizar_serie(desenrollar_grados(giros_caderas))

    with open(metrics_csv_path, mode="w", newline="", encoding="utf-8") as csv_file:
        csv_writer = csv.writer(csv_file)
        csv_writer.writerow(
            [
                "Timestamp_ms",
                "Angulo_Codo",
                "Angulo_Codo_Izq",
                "Angulo_Rodilla_Der",
                "Angulo_Rodilla_Izq",
                "Apertura_Hombro_Der",
                "Apertura_Hombro_Izq",
                "Distancia_Muneca_Cuerpo",
                "Distancia_Muneca_Izq",
                "Amplitud_Base",
                "Inclinacion_Tronco",
                "Giro_Hombros",
                "Giro_Caderas",
            ]
        )
        for fila in zip(
            timestamps_ms,
            codo_f,
            codo_izq_f,
            rod_der_f,
            rod_izq_f,
            apertura_f,
            apertura_izq_f,
            spacing_f,
            spacing_izq_f,
            base_f,
            tronco_f,
            giro_hombros_f,
            giro_caderas_f,
            strict=True,
        ):
            csv_writer.writerow(fila)

    frames_suaves = suavizar_pose_tracks(pose_tracks)
    frames_suaves, golpes_fases = anotar_fases_golpe(
        frames_suaves, lateralidad=lateralidad
    )
    # Antes de guardar los tracks: así el reproductor sabe el tipo de cada golpe
    tipo_forzado = tipo_elegido(tipo_golpe, estilo_reves)
    clasificar_golpes(
        frames_suaves,
        golpes_fases,
        estilo_reves=estilo_reves,
        lateralidad=lateralidad,
        tipo_forzado=tipo_forzado,
    )
    escribir_pose_tracks(
        pose_tracks_path,
        fps,
        src_w,
        src_h,
        frames_suaves,
        golpes_fases,
    )

    print(
        f"Procesados {frame_index} frames leídos, "
        f"{frames_escritos} escritos "
        f"(origen ~{total_frames}; {frames_con_pelota} con pelota). "
        f"Vídeo exportado en: {output_video_path}. "
        f"Métricas (suavizadas) en: {metrics_csv_path}"
    )

    # El CSV ya está cerrado en disco: se puede evaluar la técnica
    feedback = generar_feedback(
        metrics_csv_path,
        golpes_fases=golpes_fases,
        frames=frames_suaves,
        estilo_reves=estilo_reves,
        estilo_derecha=estilo_derecha,
        lateralidad=lateralidad,
        tipo_forzado=tipo_forzado,
        codo_derecha=codo_derecha,
        alto_video=src_h,
        fps=fps,
    )
    evaluaciones = feedback.get("evaluaciones", [])
    print(f"Feedback biomecánico: {len(evaluaciones)} evaluaciones agrupadas")

    return output_video_path, metrics_csv_path, feedback


def main() -> None:
    """Entrada CLI para probar el pipeline sin levantar FastAPI."""
    video_entrada = VIDEO_PATH
    video_anotado, csv_metricas, feedback = procesar_video(
        video_entrada, show_preview=True
    )
    print(f"Vídeo anotado: {video_anotado}")
    print(f"Métricas CSV:  {csv_metricas}")
    resumen = feedback.get("resumen_general")
    if resumen:
        print(f"  Tipo de golpe: {feedback.get('tipo_golpe') or resumen.get('tipo_golpe')}")
        print(f"  Resumen {resumen.get('puntuacion')}/100: {resumen.get('mensaje')}")
    for evento in feedback.get("evaluaciones", []):
        print(f"  [{evento['tipo']}] {evento['titulo']}: {evento['mensaje']}")


if __name__ == "__main__":
    main()

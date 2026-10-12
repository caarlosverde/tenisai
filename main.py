"""
TFG Tenis - Detección de pose con OpenCV/MediaPipe y rastreo de pelota con YOLOv8.
Analiza un vídeo de tenis, anota el esqueleto y exporta métricas de codo y rodillas.
Compatible con Python 3.14 (API Tasks; sin mp.solutions).
"""

from __future__ import annotations

import csv
import json
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
from ultralytics import YOLO

from geometria import (
    LEFT_ANKLE,
    LEFT_ELBOW,
    LEFT_HIP,
    LEFT_KNEE,
    LEFT_SHOULDER,
    LEFT_WRIST,
    NOSE,
    RIGHT_ANKLE,
    RIGHT_ELBOW,
    RIGHT_HIP,
    RIGHT_KNEE,
    RIGHT_SHOULDER,
    RIGHT_WRIST,
    UMBRAL_VISIBILIDAD_METRICAS,
    _visibilidad,
    desenrollar_grados,
    ema,
    ema_fase_cero,
    extraer_metricas_pose,
    suavizar_serie,
)
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
# Medido: de 3 a 4 frames, un 25 % menos de llamadas con la misma proporción de
# frames con pelota (33-35 % en WA0006). Bajar la resolución de entrada no sirve: a
# 480 px la pelota, diminuta, solo se encuentra en el 18 % de los frames (76 % a 640)
YOLO_FRAME_STRIDE = 4
SPORTS_BALL_CLASS_ID = 32
BALL_BOX_COLOR = (0, 165, 255)  # Naranja puro (BGR)
# Ancho de zapatilla como fracción del ancho del frame, para filtrar falsos positivos
FOOT_WIDTH_RATIO = 0.10

# Aceleración por hardware: usa la GPU si hay CUDA disponible, si no CPU
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"


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


# Suavizado temporal del overlay MP4: landmarks un poco más reactivos que los textos
EMA_ALPHA_LANDMARKS = 0.55
EMA_ALPHA_ANGULOS = 0.35
# pose_tracks.json: EMA bidireccional (fase 0) más reactiva, sin retraso de golpe
EMA_ALPHA_TRACKS = 0.65
# Si MediaPipe/YOLO fallan unos pocos frames, se retiene el último dibujo válido
GRACE_FRAMES = 5


def _r4(valor: float) -> float:
    return round(float(valor), 4)


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
                # Medido con 500 frames: la mitad de tiempo que "fast" (10 s frente a
                # 21 s) y un archivo algo menor con la misma calidad (CRF 21)
                "veryfast",
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

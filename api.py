"""
TFG Tenis - API FastAPI para conectar el frontend Next.js con el motor de IA.

El análisis es largo (decenas de segundos), así que se ejecuta en segundo plano:
POST /analizar-video/ devuelve un job_id al instante y GET /progreso/{job_id}
permite al frontend pintar una barra de progreso en tiempo real.

Cola: los análisis se procesan de uno en uno, en orden de llegada, en un hilo
dedicado (YOLO y su tracker se comparten entre llamadas). Mientras un vídeo
espera, /progreso indica cuántos análisis tiene por delante.

Quién llama: si llega la cookie de sesión del frontend (un JWT firmado con
JWT_SECRET, la misma clave que usa Next.js), se identifica al usuario; si no,
se trata como anónimo por IP. Cada llamante puede tener un solo análisis en
marcha y un número limitado por hora.

Cada análisis vive en su propia carpeta, data/analisis/<job_id>/, con el vídeo
original, el vídeo anotado, las métricas, las poses y un resultado.json con el
feedback. GET /resultado/{job_id} lo lee de disco, así que el historial sigue
funcionando aunque el servidor se reinicie.
"""

import asyncio
import json
import logging
import math
import os
import re
import shutil
import subprocess
import threading
import time
import uuid
from collections import deque
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, NamedTuple

import jwt
import uvicorn
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.types import Scope

logger = logging.getLogger("uvicorn.error")


def _motor():
    """
    Módulo del motor de visión (main.py), importado solo cuando hace falta.

    main.py carga OpenCV, MediaPipe y PyTorch: importarlo al arrancar hacía que la
    API tardara en responder y que no se pudiera probar sin toda esa pila. El hilo
    de la cola lo precarga en segundo plano nada más arrancar.
    """
    import main  # noqa: PLC0415

    return main

PROJECT_ROOT = Path(__file__).resolve().parent
DATA_DIR = PROJECT_ROOT / "data"
ANALISIS_DIR = DATA_DIR / "analisis"
ORIGINAL_FILENAME = "original.mp4"
MANIFEST_FILENAME = "resultado.json"
# El vídeo tal como llega (subida.mp4, subida.mov...); se normaliza a original.mp4 y se borra
SUBIDA_FILENAME = "subida"
# Lo que graban los móviles: MP4 en Android, MOV (H.264 o HEVC) en iPhone
TIPOS_VIDEO = {"video/mp4": ".mp4", "video/quicktime": ".mov", "video/x-m4v": ".m4v"}

# --- Configuración (variables de entorno; en Docker las fija docker-compose.yml) ---

# URL con la que el navegador llega a esta API: por defecto, a través de la web (/motor/...),
# en el mismo origen que el frontend
API_PUBLIC_BASE = os.environ.get("API_PUBLIC_BASE", "/motor").rstrip("/")
# Orígenes del frontend autorizados por CORS, separados por comas
FRONTEND_ORIGINS = [
    origen.strip().rstrip("/")
    for origen in os.environ.get("FRONTEND_ORIGINS", "http://localhost:3000").split(",")
    if origen.strip()
]
# Misma cookie y misma clave con las que el frontend firma las sesiones
AUTH_COOKIE_NAME = "auth_token"
JWT_SECRET = os.environ.get("JWT_SECRET", "").strip()

# --- Límites ---

# Un vídeo de móvil de 10-20 s en 1080p ocupa 30-60 MB; en 4K, más
MAX_VIDEO_BYTES = 150 * 1024 * 1024
MAX_DURACION_S = 90
# Al normalizar: lado mayor y fotogramas por segundo máximos (de sobra para analizar un golpe)
LADO_MAX_PX = 1280
FPS_MAX = 60
MAX_EN_COLA = 10
ANALISIS_POR_HORA_USUARIO = 30
ANALISIS_POR_HORA_ANONIMO = 5
RETENCION_TRABAJOS_S = 60 * 60  # los terminados siguen en memoria 1 h (luego, de disco)
# Los análisis sin cuenta no se guardan en ningún historial: se borran pasado un día
RETENCION_ANONIMOS_S = 24 * 60 * 60
INTERVALO_LIMPIEZA_S = 60 * 60

# uuid4().hex: además de validar, impide rutas como "../" al leer de disco
JOB_ID_RE = re.compile(r"[0-9a-f]{32}")

ESTADOS_ACTIVOS = ("en_cola", "procesando")

# --- Estado compartido (protegido por _lock) ---

# Trabajos recientes. Las claves que empiezan por "_" son internas y no se publican.
_trabajos: dict[str, dict] = {}
# Trabajos esperando turno, en orden de llegada
_cola: deque[str] = deque()
# Momentos (time.monotonic) en que cada llamante lanzó un análisis, para el límite por hora
_historial_llamantes: dict[str, deque[float]] = {}
_lock = threading.Lock()
_hay_trabajo = threading.Condition(_lock)
_parar_worker = False


class Llamante(NamedTuple):
    clave: str  # "usuario:<id>" o "ip:<dirección>"
    usuario_id: str | None


def _actualizar_trabajo(job_id: str, **campos) -> None:
    """Actualiza el estado de un trabajo de forma segura entre hilos."""
    with _lock:
        _trabajos[job_id].update(campos)


def _carpeta_trabajo(job_id: str) -> Path:
    return ANALISIS_DIR / job_id


class VideoNoValido(Exception):
    """El vídeo no se puede analizar; el mensaje se muestra tal cual al usuario."""


def _duracion_video(ruta: Path) -> float:
    resultado = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(ruta)],
        capture_output=True, text=True, timeout=60, check=False,
    )
    try:
        return float(resultado.stdout.strip())
    except ValueError as exc:
        raise VideoNoValido("No se pudo leer el vídeo: el formato no es compatible.") from exc


def _normalizar_video(carpeta: Path) -> None:
    """
    Convierte el vídeo subido en original.mp4: H.264 (lo reproducen todos los
    navegadores, también el HEVC de los iPhone), girado según los metadatos del móvil y
    con el lado mayor y los fotogramas por segundo limitados. Un vídeo 4K a 120 fps no
    multiplica así el tiempo de análisis, y el reproductor puede mostrar el original.
    """
    subida = next(carpeta.glob(f"{SUBIDA_FILENAME}.*"), None)
    if subida is None:
        raise VideoNoValido("No se encontró el vídeo subido.")
    destino = carpeta / ORIGINAL_FILENAME

    if shutil.which("ffmpeg") is None:
        # Sin ffmpeg (fuera de Docker) solo vale un .mp4, tal cual
        if subida.suffix.lower() != ".mp4":
            raise VideoNoValido("Este servidor solo admite vídeos .mp4 (le falta ffmpeg).")
        subida.replace(destino)
        return

    duracion = _duracion_video(subida)
    if duracion > MAX_DURACION_S:
        raise VideoNoValido(
            f"El vídeo dura {duracion:.0f} s: recórtalo a {MAX_DURACION_S} s como mucho, "
            "solo con el golpe."
        )
    # Lado mayor como mucho LADO_MAX_PX, en número par (lo exige H.264)
    lado = f"trunc(min({LADO_MAX_PX}\\,{{}})/2)*2"
    escala = (
        f"scale=w=if(gte(iw\\,ih)\\,{lado.format('iw')}\\,-2)"
        f":h=if(gte(iw\\,ih)\\,-2\\,{lado.format('ih')})"
    )
    resultado = subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(subida),
         "-vf", escala, "-fpsmax", str(FPS_MAX),
         "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
         "-an", "-movflags", "+faststart", str(destino)],
        capture_output=True, text=True, timeout=600, check=False,
    )
    if resultado.returncode != 0 or not destino.exists():
        logger.warning("ffmpeg no pudo normalizar %s: %s", subida, resultado.stderr.strip()[-500:])
        raise VideoNoValido(
            "No se pudo leer el vídeo. Prueba a grabarlo de nuevo o a guardarlo como MP4."
        )
    subida.unlink(missing_ok=True)


def _json_default(valor: Any) -> Any:
    """Convierte escalares/arrays de NumPy que json no sabe serializar."""
    if hasattr(valor, "item"):
        return valor.item()
    if hasattr(valor, "tolist"):
        return valor.tolist()
    raise TypeError(f"Tipo no serializable: {type(valor).__name__}")


def _escribir_manifest(carpeta: Path, manifest: dict) -> None:
    """Escribe resultado.json de forma atómica (nunca queda a medias)."""
    destino = carpeta / MANIFEST_FILENAME
    temporal = destino.with_suffix(".json.tmp")
    temporal.write_text(
        json.dumps(manifest, ensure_ascii=False, default=_json_default),
        encoding="utf-8",
    )
    temporal.replace(destino)


def _respuesta_resultado(job_id: str, manifest: dict) -> dict:
    """Forma pública de un análisis terminado: URLs de sus archivos + feedback."""
    base = f"{API_PUBLIC_BASE}/data/analisis/{job_id}"
    archivos = manifest.get("archivos", {})
    return {
        "estado": "completado",
        "progreso": 100.0,
        "mensaje": "Análisis biomecánico concluido correctamente",
        "nombre_original": manifest.get("nombre_original"),
        "creado": manifest.get("creado"),
        "original_url": f"{base}/{archivos.get('original', ORIGINAL_FILENAME)}",
        "processed_url": f"{base}/{archivos['procesado']}",
        "tracks_url": f"{base}/{archivos['tracks']}",
        "feedback": manifest.get("feedback", []),
        "resumen_general": manifest.get("resumen_general"),
        "tipo_golpe": manifest.get("tipo_golpe"),
        "lateralidad": manifest.get("lateralidad"),
        "estilo_reves": manifest.get("estilo_reves"),
        "estilo_derecha": manifest.get("estilo_derecha"),
        "adaptacion": manifest.get("adaptacion"),
    }


# --- Quién llama y límites ---


def _usuario_de_la_sesion(request: Request) -> str | None:
    """Id del usuario de la cookie de sesión; None si no hay sesión. 401 si es falsa."""
    token = request.cookies.get(AUTH_COOKIE_NAME)
    if not token or not JWT_SECRET:
        return None
    try:
        payload = jwt.decode(
            token,
            JWT_SECRET,
            algorithms=["HS256"],
            options={"require": ["exp"]},
        )
    except jwt.InvalidTokenError as exc:
        raise HTTPException(
            status_code=401,
            detail="Tu sesión no es válida o ha caducado. Vuelve a iniciar sesión.",
        ) from exc
    usuario_id = payload.get("id")
    if not isinstance(usuario_id, str) or not usuario_id:
        raise HTTPException(status_code=401, detail="Sesión no válida.")
    return usuario_id


def _identificar_llamante(request: Request) -> Llamante:
    """Usuario de la sesión del frontend o, si no hay sesión, anónimo por IP."""
    usuario_id = _usuario_de_la_sesion(request)
    if usuario_id:
        return Llamante(f"usuario:{usuario_id}", usuario_id)

    # uvicorn solo toma la IP de X-Forwarded-For si la petición llega de un proxy de confianza
    # (variable FORWARDED_ALLOW_IPS; por defecto, ninguno fuera de 127.0.0.1): si no, un
    # cliente podría inventarse la cabecera para saltarse el límite de análisis anónimos
    ip = request.client.host if request.client else "desconocida"
    return Llamante(f"ip:{ip}", None)


def _purgar_memoria(ahora: float) -> None:
    """Olvida trabajos terminados hace tiempo e historiales vacíos. Requiere _lock."""
    viejos = [
        job_id
        for job_id, trabajo in _trabajos.items()
        if ahora - trabajo.get("_terminado_en", ahora) > RETENCION_TRABAJOS_S
    ]
    for job_id in viejos:
        del _trabajos[job_id]

    for clave in list(_historial_llamantes):
        historial = _historial_llamantes[clave]
        while historial and ahora - historial[0] > 3600:
            historial.popleft()
        if not historial:
            del _historial_llamantes[clave]


def _comprobar_limites(llamante: Llamante, ahora: float) -> None:
    """Lanza HTTPException si el llamante no puede lanzar otro análisis. Requiere _lock."""
    if any(
        trabajo["_clave"] == llamante.clave and trabajo["estado"] in ESTADOS_ACTIVOS
        for trabajo in _trabajos.values()
    ):
        raise HTTPException(
            status_code=429,
            detail="Ya tienes un análisis en marcha. Espera a que termine para subir otro.",
        )

    maximo = ANALISIS_POR_HORA_USUARIO if llamante.usuario_id else ANALISIS_POR_HORA_ANONIMO
    historial = _historial_llamantes.get(llamante.clave, deque())
    if len(historial) >= maximo:
        espera_s = max(1, math.ceil(3600 - (ahora - historial[0])))
        minutos = math.ceil(espera_s / 60)
        detalle = (
            f"Has alcanzado el límite de {maximo} análisis por hora. "
            f"Vuelve a intentarlo en {minutos} {'minuto' if minutos == 1 else 'minutos'}."
        )
        if llamante.usuario_id is None:
            detalle += " Con una cuenta el límite es mayor."
        raise HTTPException(
            status_code=429, detail=detalle, headers={"Retry-After": str(espera_s)}
        )

    if len(_cola) >= MAX_EN_COLA:
        raise HTTPException(
            status_code=503,
            detail="Hay demasiados análisis en cola. Inténtalo de nuevo en unos minutos.",
            headers={"Retry-After": "60"},
        )


def _por_delante(job_id: str) -> int:
    """Análisis que se procesarán antes que este (el actual incluido). Requiere _lock."""
    try:
        posicion = _cola.index(job_id)
    except ValueError:
        return 0
    procesando = sum(1 for trabajo in _trabajos.values() if trabajo["estado"] == "procesando")
    return posicion + procesando


# --- Motor de análisis (hilo dedicado) ---


def _ejecutar_analisis(job_id: str, trabajo: dict) -> None:
    """Corre el motor biomecánico publicando el progreso."""
    carpeta = _carpeta_trabajo(job_id)

    def on_progress(frames_hechos: int, frames_totales: int) -> None:
        porcentaje = round(frames_hechos / frames_totales * 100, 1) if frames_totales else 0.0
        _actualizar_trabajo(
            job_id,
            progreso=porcentaje,
            frames_procesados=frames_hechos,
            frames_totales=frames_totales,
        )

    try:
        _normalizar_video(carpeta)
        motor = _motor()
        video_anotado, csv_metricas, feedback = motor.procesar_video(
            carpeta / ORIGINAL_FILENAME,
            output_dir=carpeta,
            on_progress=on_progress,
            estilo_reves=trabajo["estilo_reves"],
            estilo_derecha=trabajo["estilo_derecha"],
            lateralidad=trabajo["lateralidad"],
        )

        datos = feedback if isinstance(feedback, dict) else {"evaluaciones": feedback}
        manifest = {
            "job_id": job_id,
            "creado": datetime.now(timezone.utc).isoformat(),
            "nombre_original": trabajo.get("nombre_original"),
            "usuario_id": trabajo.get("_usuario_id"),
            "archivos": {
                "original": ORIGINAL_FILENAME,
                "procesado": video_anotado.name,
                "metricas": csv_metricas.name,
                "tracks": motor.POSE_TRACKS_PATH.name,
            },
            "feedback": datos.get("evaluaciones", []),
            "resumen_general": datos.get("resumen_general"),
            "tipo_golpe": datos.get("tipo_golpe"),
            "lateralidad": datos.get("lateralidad", trabajo["lateralidad"]),
            "estilo_reves": datos.get("estilo_reves", trabajo["estilo_reves"]),
            "estilo_derecha": datos.get("estilo_derecha", trabajo["estilo_derecha"]),
            "adaptacion": datos.get("adaptacion"),
        }
        # Primero a disco: cuando el frontend vea "completado", /resultado ya responde
        _escribir_manifest(carpeta, manifest)
    except VideoNoValido as exc:
        shutil.rmtree(carpeta, ignore_errors=True)
        _actualizar_trabajo(job_id, estado="error", error=str(exc), _terminado_en=time.monotonic())
        return
    except Exception as exc:
        logger.exception("Falló el análisis %s", job_id)
        shutil.rmtree(carpeta, ignore_errors=True)
        _actualizar_trabajo(
            job_id,
            estado="error",
            error=f"Error durante el análisis biomecánico: {exc}",
            _terminado_en=time.monotonic(),
        )
        return

    _actualizar_trabajo(
        job_id,
        **_respuesta_resultado(job_id, manifest),
        _terminado_en=time.monotonic(),
    )


def _siguiente_trabajo() -> tuple[str, dict] | None:
    """Espera hasta que haya un trabajo en la cola y lo marca como en proceso."""
    with _hay_trabajo:
        while not _cola and not _parar_worker:
            _hay_trabajo.wait()
        if _parar_worker:
            return None
        job_id = _cola.popleft()
        trabajo = _trabajos[job_id]
        trabajo["estado"] = "procesando"
        return job_id, dict(trabajo)


def _bucle_worker() -> None:
    # Precarga del motor de visión (varios segundos) sin bloquear las peticiones
    try:
        _motor()
        logger.info("Motor de visión cargado")
    except Exception:
        logger.exception("No se pudo cargar el motor de visión")

    while (siguiente := _siguiente_trabajo()) is not None:
        job_id, trabajo = siguiente
        try:
            _ejecutar_analisis(job_id, trabajo)
        except Exception:
            # Nunca dejar morir el hilo: la cola se quedaría parada para todos
            logger.exception("Error inesperado procesando %s", job_id)
            with _lock:
                if job_id in _trabajos:
                    _trabajos[job_id].update(
                        estado="error",
                        error="Error inesperado en el servidor de análisis.",
                        _terminado_en=time.monotonic(),
                    )


def _leer_manifest(carpeta: Path) -> dict | None:
    try:
        return json.loads((carpeta / MANIFEST_FILENAME).read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return None


def _limpiar_anonimos() -> int:
    """Borra los análisis anónimos con más de RETENCION_ANONIMOS_S. Devuelve cuántos."""
    ahora = datetime.now(timezone.utc)
    with _lock:
        activos = {j for j, t in _trabajos.items() if t["estado"] in ESTADOS_ACTIVOS}
    borrados = 0
    for carpeta in ANALISIS_DIR.iterdir():
        if not carpeta.is_dir() or carpeta.name in activos:
            continue
        manifest = _leer_manifest(carpeta)
        # Solo los marcados como anónimos: los anteriores a la identificación del
        # usuario no llevan la clave "usuario_id" y pueden estar en un historial
        if manifest is None or "usuario_id" not in manifest or manifest["usuario_id"]:
            continue
        try:
            creado = datetime.fromisoformat(manifest["creado"])
        except (KeyError, TypeError, ValueError):
            continue
        if (ahora - creado).total_seconds() > RETENCION_ANONIMOS_S:
            shutil.rmtree(carpeta, ignore_errors=True)
            borrados += 1
    return borrados


def _bucle_limpieza(parar: threading.Event) -> None:
    while not parar.is_set():
        try:
            borrados = _limpiar_anonimos()
            if borrados:
                logger.info("Limpieza: %d análisis anónimos caducados borrados", borrados)
        except Exception:
            logger.exception("Error limpiando análisis anónimos")
        parar.wait(INTERVALO_LIMPIEZA_S)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global _parar_worker
    if not JWT_SECRET:
        logger.warning(
            "JWT_SECRET no está definida: no se pueden verificar sesiones y todas "
            "las peticiones se tratarán como anónimas."
        )
    hilo = threading.Thread(target=_bucle_worker, name="tenisai-analisis", daemon=True)
    hilo.start()
    parar_limpieza = threading.Event()
    limpieza = threading.Thread(
        target=_bucle_limpieza, args=(parar_limpieza,), name="tenisai-limpieza", daemon=True
    )
    limpieza.start()
    try:
        yield
    finally:
        parar_limpieza.set()
        with _hay_trabajo:
            _parar_worker = True
            _hay_trabajo.notify_all()


app = FastAPI(title="TenisAI API", version="0.4.0", lifespan=lifespan)

# CORS: solo el frontend. Se aplica también a /data (el reproductor pide los
# vídeos con crossOrigin para poder capturar fotogramas en el informe PDF).
app.add_middleware(
    CORSMiddleware,
    allow_origins=FRONTEND_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Accept-Ranges", "Content-Range", "Content-Length", "Content-Type"],
)


def _guardar_video(carpeta: Path, origen: Any, extension: str) -> None:
    """Copia la subida (ya en un temporal de Starlette) a la carpeta del análisis, por trozos."""
    carpeta.mkdir(parents=True, exist_ok=False)
    origen.seek(0)
    with (carpeta / f"{SUBIDA_FILENAME}{extension}").open("wb") as destino:
        shutil.copyfileobj(origen, destino, length=1024 * 1024)


def _tamano_subida(origen: Any) -> int:
    origen.seek(0, os.SEEK_END)
    tamano = origen.tell()
    origen.seek(0)
    return tamano


# Sin barra final: Next redirige /motor/analizar-video/ a /motor/analizar-video al reenviar.
# La ruta con barra se mantiene para los clientes que ya la usaban
@app.post("/analizar-video", status_code=202)
@app.post("/analizar-video/", status_code=202, include_in_schema=False)
async def analizar_video(
    request: Request,
    file: UploadFile = File(...),
    estilo_reves: str = Form("2_manos"),
    estilo_derecha: str = Form("tradicional"),
    lateralidad: str = Form("diestro"),
) -> dict:
    """Recibe un vídeo, lo pone en la cola y devuelve su job_id."""
    llamante = _identificar_llamante(request)

    reves = (estilo_reves or "").strip().lower()
    if reves not in ("1_mano", "2_manos"):
        reves = "2_manos"
    derecha = (estilo_derecha or "").strip().lower()
    if derecha not in ("tradicional", "nadal"):
        derecha = "tradicional"
    lat = (lateralidad or "").strip().lower()
    if lat not in ("diestro", "zurdo"):
        lat = "diestro"

    nombre = file.filename or "video.mp4"
    extension = Path(nombre).suffix.lower()
    if extension not in TIPOS_VIDEO.values():
        # Algunos móviles mandan el vídeo de la cámara sin extensión: vale el tipo
        extension = TIPOS_VIDEO.get(file.content_type or "", "")
    if not extension:
        raise HTTPException(
            status_code=415,
            detail="Formato no admitido: sube un vídeo MP4 o MOV (vale el de la cámara del móvil).",
        )
    # El vídeo ya está en un temporal de Starlette: se mide sin cargarlo en memoria
    tamano = await asyncio.to_thread(_tamano_subida, file.file)
    if tamano == 0:
        raise HTTPException(status_code=400, detail="El archivo de vídeo está vacío.")
    if tamano > MAX_VIDEO_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"El vídeo supera el límite de {MAX_VIDEO_BYTES // (1024 * 1024)} MB.",
        )

    job_id = uuid.uuid4().hex
    with _lock:
        ahora = time.monotonic()
        _purgar_memoria(ahora)
        _comprobar_limites(llamante, ahora)
        # Se registra ya (aún fuera de la cola) para que el mismo llamante no pueda
        # colar otro análisis mientras se guarda este en disco
        _trabajos[job_id] = {
            "estado": "en_cola",
            "progreso": 0.0,
            "frames_procesados": 0,
            "frames_totales": 0,
            "nombre_original": nombre,
            "feedback": [],
            "resumen_general": None,
            "tipo_golpe": None,
            "estilo_reves": reves,
            "estilo_derecha": derecha,
            "lateralidad": lat,
            "_clave": llamante.clave,
            "_usuario_id": llamante.usuario_id,
        }
        _historial_llamantes.setdefault(llamante.clave, deque()).append(ahora)

    carpeta = _carpeta_trabajo(job_id)
    try:
        await asyncio.to_thread(_guardar_video, carpeta, file.file, extension)
    except OSError as exc:
        shutil.rmtree(carpeta, ignore_errors=True)
        _actualizar_trabajo(
            job_id,
            estado="error",
            error="No se pudo guardar el vídeo.",
            _terminado_en=time.monotonic(),
        )
        raise HTTPException(status_code=500, detail="No se pudo guardar el vídeo.") from exc

    with _hay_trabajo:
        _cola.append(job_id)
        por_delante = _por_delante(job_id)
        _hay_trabajo.notify()

    return {"job_id": job_id, "estado": "en_cola", "por_delante": por_delante}


@app.get("/progreso/{job_id}")
async def consultar_progreso(job_id: str) -> dict:
    """Estado de un análisis: posición en la cola, progreso o, si terminó, sus resultados."""
    with _lock:
        trabajo = _trabajos.get(job_id)
        if trabajo is None:
            raise HTTPException(status_code=404, detail="Trabajo no encontrado")
        publico = {clave: valor for clave, valor in trabajo.items() if not clave.startswith("_")}
        if trabajo["estado"] == "en_cola":
            publico["por_delante"] = _por_delante(job_id)
        return {"job_id": job_id, **publico}


@app.get("/resultado/{job_id}")
async def consultar_resultado(job_id: str) -> dict:
    """Devuelve un análisis terminado leyendo su carpeta (sobrevive a reinicios)."""
    if not JOB_ID_RE.fullmatch(job_id):
        raise HTTPException(status_code=404, detail="Análisis no encontrado")

    ruta = _carpeta_trabajo(job_id) / MANIFEST_FILENAME
    try:
        manifest = json.loads(ruta.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Análisis no encontrado") from exc

    return {"job_id": job_id, **_respuesta_resultado(job_id, manifest)}


def _usuario_del_permiso_de_borrado(request: Request, job_id: str) -> str:
    """
    Valida el permiso de borrado que firma el frontend (cabecera Authorization).

    No se acepta la cookie de sesión: el permiso caduca en 60 s y solo vale para
    este análisis, así que una sesión robada no basta para borrar vídeos.
    """
    cabecera = request.headers.get("authorization", "")
    token = cabecera.removeprefix("Bearer ").strip() if cabecera.startswith("Bearer ") else ""
    if not token or not JWT_SECRET:
        raise HTTPException(status_code=401, detail="Falta el permiso de borrado.")
    try:
        payload = jwt.decode(
            token, JWT_SECRET, algorithms=["HS256"], options={"require": ["exp"]}
        )
    except jwt.InvalidTokenError as exc:
        raise HTTPException(status_code=401, detail="Permiso de borrado no válido.") from exc
    usuario_id = payload.get("id")
    if (
        payload.get("accion") != "borrar-analisis"
        or payload.get("job") != job_id
        or not isinstance(usuario_id, str)
        or not usuario_id
    ):
        raise HTTPException(status_code=401, detail="Permiso de borrado no válido.")
    return usuario_id


@app.delete("/analisis/{job_id}", status_code=204)
async def borrar_analisis(job_id: str, request: Request) -> None:
    """Borra la carpeta de un análisis. Solo su dueño, con un permiso del frontend."""
    if not JOB_ID_RE.fullmatch(job_id):
        raise HTTPException(status_code=404, detail="Análisis no encontrado")
    usuario_id = _usuario_del_permiso_de_borrado(request, job_id)

    with _lock:
        trabajo = _trabajos.get(job_id)
        if trabajo and trabajo["estado"] in ESTADOS_ACTIVOS:
            raise HTTPException(
                status_code=409, detail="El análisis aún se está procesando."
            )

    carpeta = _carpeta_trabajo(job_id)
    if not carpeta.exists():
        return None  # Idempotente: ya no estaba

    manifest = _leer_manifest(carpeta) or {}
    # Los análisis anteriores a la identificación del usuario no tienen dueño
    # registrado: basta con conocer su id (aleatorio) y tener sesión
    dueno = manifest.get("usuario_id")
    if dueno and dueno != usuario_id:
        raise HTTPException(status_code=403, detail="Este análisis pertenece a otra cuenta.")

    await asyncio.to_thread(shutil.rmtree, carpeta, True)
    with _lock:
        _trabajos.pop(job_id, None)
    return None


class DataStaticFiles(StaticFiles):
    """StaticFiles con Range Requests (FileResponse) y sin caché agresiva."""

    async def get_response(self, path: str, scope: Scope):
        response = await super().get_response(path, scope)
        response.headers.setdefault("Accept-Ranges", "bytes")
        response.headers["Cache-Control"] = "no-store"
        response.headers["Cross-Origin-Resource-Policy"] = "cross-origin"
        return response


# Servir la carpeta data/ como archivos estáticos (después de las rutas API)
ANALISIS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/data", DataStaticFiles(directory=str(DATA_DIR)), name="data")


if __name__ == "__main__":
    uvicorn.run("api:app", host="0.0.0.0", port=8001, reload=True)

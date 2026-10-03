"""
Tests de la API (api.py): cola, identificación del llamante, límites y borrado.

El motor de visión se sustituye por uno falso e instantáneo: aquí se prueba el
comportamiento HTTP, no el análisis (eso lo cubre test_biomecanica.py).
"""

from __future__ import annotations

import json
import threading
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

import jwt
import pytest
from fastapi.testclient import TestClient

import api

SECRETO = "clave-de-pruebas-con-mas-de-32-caracteres"
VIDEO_FALSO = b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 1024

# Mientras esté cerrada, el motor falso no termina (para simular análisis largos)
puerta = threading.Event()


def motor_falso(input_path: Path, *, output_dir: Path, on_progress, **_estilo):
    on_progress(1, 2)
    puerta.wait(timeout=10)
    video = output_dir / "resultado_angulos.mp4"
    csv = output_dir / "metricas_codo.csv"
    video.write_bytes(b"video")
    csv.write_text("Timestamp_ms,Angulo_Codo\n0,150\n", encoding="utf-8")
    (output_dir / "pose_tracks.json").write_text("{}", encoding="utf-8")
    on_progress(2, 2)
    return video, csv, {
        "evaluaciones": [{"categoria": "codo", "tipo": "optimo", "titulo": "Codo", "mensaje": "Bien"}],
        "resumen_general": {"puntuacion": 90, "tipo": "optimo", "titulo": "Resumen", "mensaje": "Bien"},
        "tipo_golpe": "Derecha",
    }


# Extensiones de los vídeos que ha recibido la normalización falsa
normalizados: list[str] = []


def normalizar_falso(carpeta: Path) -> None:
    """Como la real (sin ffmpeg): deja la subida como original.mp4."""
    subida = next(carpeta.glob(f"{api.SUBIDA_FILENAME}.*"))
    normalizados.append(subida.suffix)
    subida.replace(carpeta / api.ORIGINAL_FILENAME)


def token(usuario_id: str, segundos: int = 60) -> str:
    return jwt.encode(
        {"id": usuario_id, "username": usuario_id, "exp": int(time.time()) + segundos},
        SECRETO,
        algorithm="HS256",
    )


@pytest.fixture
def cliente(tmp_path, monkeypatch):
    carpeta = tmp_path / "analisis"
    carpeta.mkdir()
    monkeypatch.setattr(api, "ANALISIS_DIR", carpeta)
    monkeypatch.setattr(api, "JWT_SECRET", SECRETO)
    motor = SimpleNamespace(procesar_video=motor_falso, POSE_TRACKS_PATH=Path("pose_tracks.json"))
    monkeypatch.setattr(api, "_motor", lambda: motor)
    # Sin ffmpeg en los tests: la normalización real se prueba aparte
    monkeypatch.setattr(api, "_normalizar_video", normalizar_falso)
    normalizados.clear()
    monkeypatch.setattr(api, "_parar_worker", False)
    # Sin el hilo de limpieza: su primera pasada podría coincidir con la del test
    monkeypatch.setattr(api, "_bucle_limpieza", lambda parar: None)
    api._trabajos.clear()
    api._cola.clear()
    api._historial_llamantes.clear()
    puerta.set()
    with TestClient(api.app) as c:
        yield c
    puerta.set()
    # El hilo de la cola debe acabar antes de que el siguiente test reinicie
    # _parar_worker; si no, habría dos hilos sacando trabajos de la misma cola
    for hilo in threading.enumerate():
        if hilo.name == "tenisai-analisis":
            hilo.join(timeout=10)


def subir(cliente: TestClient, cookie: str | None = None, contenido: bytes = VIDEO_FALSO,
          nombre: str = "golpe.mp4", tipo: str = "video/mp4"):
    cookies = {"auth_token": cookie} if cookie else None
    cliente.cookies.clear()
    return cliente.post(
        "/analizar-video/",
        files={"file": (nombre, contenido, tipo)},
        cookies=cookies,
    )


def esperar(cliente: TestClient, job_id: str, estado: str = "completado", limite_s: float = 10) -> dict:
    fin = time.monotonic() + limite_s
    while time.monotonic() < fin:
        datos = cliente.get(f"/progreso/{job_id}").json()
        if datos["estado"] == estado:
            return datos
        time.sleep(0.05)
    raise AssertionError(f"{job_id} no llegó a '{estado}': {datos}")


def test_analisis_anonimo_completo(cliente):
    respuesta = subir(cliente)
    assert respuesta.status_code == 202
    job_id = respuesta.json()["job_id"]

    datos = esperar(cliente, job_id)
    assert datos["resumen_general"]["puntuacion"] == 90
    assert not any(clave.startswith("_") for clave in datos)  # sin campos internos

    resultado = cliente.get(f"/resultado/{job_id}").json()
    assert resultado["processed_url"].endswith(f"/data/analisis/{job_id}/resultado_angulos.mp4")
    manifest = json.loads((api.ANALISIS_DIR / job_id / "resultado.json").read_text(encoding="utf-8"))
    assert manifest["usuario_id"] is None


def test_con_sesion_se_guarda_el_dueno(cliente):
    job_id = subir(cliente, token("usuario-1")).json()["job_id"]
    esperar(cliente, job_id)
    manifest = json.loads((api.ANALISIS_DIR / job_id / "resultado.json").read_text(encoding="utf-8"))
    assert manifest["usuario_id"] == "usuario-1"


@pytest.mark.parametrize("cookie", ["no.es.un.jwt", jwt.encode({"id": "x", "exp": 9999999999}, "otra-clave-distinta-de-32-o-mas-caracteres", algorithm="HS256")])
def test_cookie_falsa_da_401(cliente, cookie):
    assert subir(cliente, cookie).status_code == 401


def test_sesion_caducada_da_401(cliente):
    assert subir(cliente, token("usuario-1", segundos=-10)).status_code == 401


def test_cola_y_un_analisis_en_marcha_por_llamante(cliente):
    puerta.clear()  # el primer análisis se queda "procesando"
    primero = subir(cliente).json()
    esperar(cliente, primero["job_id"], "procesando")

    # El mismo llamante no puede lanzar otro mientras tanto
    repetido = subir(cliente)
    assert repetido.status_code == 429

    # Otro usuario sí entra, en la cola, con uno por delante
    segundo = subir(cliente, token("usuario-2"))
    assert segundo.status_code == 202
    assert segundo.json()["por_delante"] == 1
    assert cliente.get(f"/progreso/{segundo.json()['job_id']}").json()["estado"] == "en_cola"

    puerta.set()
    esperar(cliente, primero["job_id"])
    esperar(cliente, segundo.json()["job_id"])


def test_limite_por_hora_anonimo(cliente):
    for _ in range(api.ANALISIS_POR_HORA_ANONIMO):
        job_id = subir(cliente).json()["job_id"]
        esperar(cliente, job_id)
    respuesta = subir(cliente)
    assert respuesta.status_code == 429
    assert "Retry-After" in respuesta.headers
    assert "cuenta" in respuesta.json()["detail"]


def test_rechaza_archivos_que_no_son_video(cliente):
    respuesta = subir(cliente, nombre="notas.txt", tipo="text/plain", contenido=b"hola")
    assert respuesta.status_code == 415
    respuesta = subir(cliente, nombre="golpe.avi", tipo="video/x-msvideo")
    assert respuesta.status_code == 415


@pytest.mark.parametrize(
    ("nombre", "tipo", "extension"),
    [
        ("IMG_0042.MOV", "video/quicktime", ".mov"),  # iPhone
        ("VID_20261003.mp4", "video/mp4", ".mp4"),  # Android
        ("blob", "video/quicktime", ".mov"),  # cámara sin nombre de archivo
    ],
)
def test_acepta_los_videos_de_la_camara_del_movil(cliente, nombre, tipo, extension):
    respuesta = subir(cliente, nombre=nombre, tipo=tipo)
    assert respuesta.status_code == 202
    esperar(cliente, respuesta.json()["job_id"])
    assert normalizados == [extension]


def test_rechaza_videos_demasiado_grandes(cliente, monkeypatch):
    monkeypatch.setattr(api, "MAX_VIDEO_BYTES", 2048)
    respuesta = subir(cliente, contenido=b"\x00" * 2049)
    assert respuesta.status_code == 413
    assert "MB" in respuesta.json()["detail"]
    assert subir(cliente, contenido=b"").status_code == 400


def test_un_video_no_valido_se_explica_al_usuario(cliente, monkeypatch):
    def demasiado_largo(carpeta: Path) -> None:
        raise api.VideoNoValido("El vídeo dura 300 s: recórtalo a 90 s como mucho, solo con el golpe.")

    monkeypatch.setattr(api, "_normalizar_video", demasiado_largo)
    job_id = subir(cliente).json()["job_id"]
    datos = esperar(cliente, job_id, "error")
    assert datos["error"].startswith("El vídeo dura 300 s")
    # No queda nada en disco
    assert not (api.ANALISIS_DIR / job_id).exists()


def test_normalizar_sin_ffmpeg_solo_admite_mp4(tmp_path, monkeypatch):
    monkeypatch.setattr(api.shutil, "which", lambda programa: None)
    mp4 = tmp_path / "mp4"
    mp4.mkdir()
    (mp4 / "subida.mp4").write_bytes(VIDEO_FALSO)
    api._normalizar_video(mp4)
    assert (mp4 / api.ORIGINAL_FILENAME).read_bytes() == VIDEO_FALSO

    mov = tmp_path / "mov"
    mov.mkdir()
    (mov / "subida.mov").write_bytes(VIDEO_FALSO)
    with pytest.raises(api.VideoNoValido, match="solo admite vídeos .mp4"):
        api._normalizar_video(mov)


@pytest.mark.parametrize("job_id", ["abc", "..", "0" * 31, "G" * 32])
def test_resultado_solo_acepta_ids_validos(cliente, job_id):
    assert cliente.get(f"/resultado/{job_id}").status_code == 404


def permiso_borrado(usuario_id: str, job_id: str, segundos: int = 60, accion: str = "borrar-analisis") -> dict:
    """Cabecera con el permiso de un solo uso que firma el frontend para borrar."""
    firmado = jwt.encode(
        {"id": usuario_id, "accion": accion, "job": job_id, "exp": int(time.time()) + segundos},
        SECRETO,
        algorithm="HS256",
    )
    return {"Authorization": f"Bearer {firmado}"}


def test_borrar_solo_el_dueno_con_permiso(cliente):
    job_id = subir(cliente, token("dueno")).json()["job_id"]
    esperar(cliente, job_id)
    carpeta = api.ANALISIS_DIR / job_id
    cliente.cookies.clear()

    # Sin permiso, o con la cookie de sesión (aunque sea del dueño): no
    assert cliente.delete(f"/analisis/{job_id}").status_code == 401
    assert cliente.delete(f"/analisis/{job_id}", cookies={"auth_token": token("dueno")}).status_code == 401
    # Permiso caducado, para otra acción o para otro análisis: no
    assert cliente.delete(f"/analisis/{job_id}", headers=permiso_borrado("dueno", job_id, segundos=-5)).status_code == 401
    assert cliente.delete(f"/analisis/{job_id}", headers=permiso_borrado("dueno", job_id, accion="otra")).status_code == 401
    assert cliente.delete(f"/analisis/{job_id}", headers=permiso_borrado("dueno", "f" * 32)).status_code == 401
    # Permiso válido pero de otro usuario: prohibido
    assert cliente.delete(f"/analisis/{job_id}", headers=permiso_borrado("otro", job_id)).status_code == 403
    assert carpeta.exists()

    assert cliente.delete(f"/analisis/{job_id}", headers=permiso_borrado("dueno", job_id)).status_code == 204
    assert not carpeta.exists()
    # Idempotente: borrarlo otra vez no es un error
    assert cliente.delete(f"/analisis/{job_id}", headers=permiso_borrado("dueno", job_id)).status_code == 204


def _crear_analisis(job_id: str, manifest: dict) -> Path:
    carpeta = api.ANALISIS_DIR / job_id
    carpeta.mkdir()
    (carpeta / "resultado.json").write_text(json.dumps(manifest), encoding="utf-8")
    return carpeta


def test_limpieza_borra_solo_anonimos_caducados(cliente):
    hace_dos_dias = (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()
    ahora = datetime.now(timezone.utc).isoformat()

    anonimo_viejo = _crear_analisis("a" * 32, {"usuario_id": None, "creado": hace_dos_dias})
    anonimo_nuevo = _crear_analisis("b" * 32, {"usuario_id": None, "creado": ahora})
    con_dueno = _crear_analisis("c" * 32, {"usuario_id": "u1", "creado": hace_dos_dias})
    anterior_sin_clave = _crear_analisis("d" * 32, {"creado": hace_dos_dias})

    assert api._limpiar_anonimos() == 1
    assert not anonimo_viejo.exists()
    assert anonimo_nuevo.exists()
    assert con_dueno.exists()
    assert anterior_sin_clave.exists()

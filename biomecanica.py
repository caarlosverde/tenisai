"""
TFG Tenis - Motor de feedback biomecánico (análisis de entrenador).

Lee el CSV de métricas, detecta episodios locales con cooldown para no
duplicar el mismo golpe, y agrupa los patrones por categoría técnica.

Se usa el módulo csv de la librería estándar (no pandas) para devolver
float/int nativos y no romper la serialización JSON de FastAPI.
"""

from __future__ import annotations

import csv
import math
from pathlib import Path

# Umbrales heurísticos
RODILLA_CARGA_OBJETIVO_MIN = 115.0
RODILLA_CARGA_OBJETIVO_MAX = 125.0
RODILLA_FLEXION_INSUFICIENTE = 130.0
CODO_EXTENSION_OBJETIVO = 155.0
CODO_EXTENSION_ACEPTABLE = 140.0
SPACING_MINIMO = 0.85
SPACING_OPTIMO = 1.05
APERTURA_HOMBRO_MINIMA = 75.0
APERTURA_HOMBRO_OPTIMA = 95.0
BASE_MINIMA = 0.75
BASE_OPTIMA = 1.0
INCLINACION_MAXIMA = 22.0
INCLINACION_ALERTA = 30.0

COOLDOWN_MS = 1200

COLUMNA_TIMESTAMP = "Timestamp_ms"
COL_CODO_DER = "Angulo_Codo"
COL_CODO_IZQ = "Angulo_Codo_Izq"
COL_ROD_DER = "Angulo_Rodilla_Der"
COL_ROD_IZQ = "Angulo_Rodilla_Izq"
COL_APERTURA = "Apertura_Hombro_Der"
COL_APERTURA_IZQ = "Apertura_Hombro_Izq"
COL_SPACING = "Distancia_Muneca_Cuerpo"
COL_SPACING_IZQ = "Distancia_Muneca_Izq"
COL_BASE = "Amplitud_Base"
COL_TRONCO = "Inclinacion_Tronco"

PENALIZACION = {"alerta": 16, "mejora": 8, "optimo": 0}

SWING_SEP_S = 1.2
VENTANAS_FASE = {
    "preparacion": (-0.65, -0.35),
    "carga": (-0.35, -0.10),
    "impacto": (-0.10, 0.10),
    "terminacion": (0.10, 0.55),
}
FASE_LABEL = {
    "preparacion": "1. Preparación",
    "carga": "2. Carga",
    "impacto": "3. Impacto",
    "terminacion": "4. Terminación",
    "recuperacion": "Desplazamiento",
}
FASE_NOMBRE = {
    "preparacion": "Fase de Preparación",
    "carga": "Fase de Carga",
    "impacto": "Fase de Impacto",
    "terminacion": "Fase de Terminación",
    "recuperacion": "Posición de espera",
}
FASE_CORTA = {
    "preparacion": "Preparación",
    "carga": "Carga",
    "impacto": "Impacto",
    "terminacion": "Terminación",
    "recuperacion": "Desplazamiento",
}
FASE_POR_CATEGORIA = {
    "apertura": "preparacion",
    "rodilla": "carga",
    "base": "carga",
    "codo": "impacto",
    "spacing": "impacto",
    "tronco": "impacto",
    "terminacion": "terminacion",
}
PRIORIDAD_FASE = ("impacto", "carga", "preparacion", "terminacion")
TERMINACION_SUBIDA_MIN = 0.03
TERMINACION_CRUCE_MIN = 0.04

TIPO_DERECHA = "Derecha"
TIPO_SAQUE = "Saque"
TIPO_REMATE = "Remate"
TIPO_REVES_2 = "Revés (2 Manos)"
TIPO_REVES_1 = "Revés (1 Mano)"
TIPO_VOLEA = "Volea"
TIPO_CORTADO = "Cortado"

ESTILO_REVES_1 = "1_mano"
ESTILO_REVES_2 = "2_manos"
ESTILO_DERECHA_TRAD = "tradicional"
ESTILO_DERECHA_NADAL = "nadal"
LAT_DIESTRO = "diestro"
LAT_ZURDO = "zurdo"

# Umbrales del clasificador (coords normalizadas, Y crece hacia abajo)
OVERHEAD_MARGEN = 0.015
MANOS_JUNTAS_CLARO = 0.30
MANOS_JUNTAS_SEPARADAS = 0.48
REVES_MARGEN_X = 0.02
VOLEA_APERTURA_MAX = 35.0
RODILLA_TROFEO_MAX = 128.0
SUBIDA_IZQ_TROFEO = 0.05
TERMINACION_DESCENSO_MIN = 0.02
TERMINACION_LAZO_SUBIDA = 0.06

# Metadatos visuales para el canvas del entrenador interactivo
META_COACH = {
    "rodilla": {
        "zona_corporal": "piernas",
        "objetivo_texto": "Objetivo: 115°–125°",
        "consejo_corto": "Flexiona más las rodillas y baja el centro de gravedad.",
        "fallo": lambda v: (f"{v:.0f}°", f"Piernas rígidas ({v:.0f}° vs 120° ideal)"),
        "ok": lambda v: (f"{v:.0f}°", f"Buena flexión ({v:.0f}°)"),
    },
    "codo": {
        "zona_corporal": "brazo_der",
        "objetivo_texto": "Objetivo: >155°",
        "consejo_corto": "Estira el brazo derecho al impactar para ganar palanca.",
        "fallo": lambda v: (f"{v:.0f}°", f"Brazo encogido ({v:.0f}° vs >155°)"),
        "ok": lambda v: (f"{v:.0f}°", f"Buena extensión ({v:.0f}°)"),
    },
    "spacing": {
        "zona_corporal": "spacing",
        "objetivo_texto": "Separar muñeca del torso",
        "consejo_corto": "Aléjate de la bola y libera el swing.",
        "fallo": lambda v: (f"{v:.2f}×", f"Spacing corto ({v:.2f}× vs >0.85×)"),
        "ok": lambda v: (f"{v:.2f}×", f"Buena separación ({v:.2f}×)"),
    },
    "apertura": {
        "zona_corporal": "backswing",
        "objetivo_texto": "Abrir más el hombro",
        "consejo_corto": "Abre más el arco en la preparación del golpe.",
        "fallo": lambda v: (f"{v:.0f}°", f"Arco corto ({v:.0f}° vs >95°)"),
        "ok": lambda v: (f"{v:.0f}°", f"Buen armado ({v:.0f}°)"),
    },
    "base": {
        "zona_corporal": "base_tronco",
        "objetivo_texto": "Ancho > 1.2x hombros",
        "consejo_corto": "Separa los pies en la carga para estabilizar el golpe.",
        "fallo": lambda v: (f"{v:.2f}×", f"Base estrecha ({v:.2f}× vs >1.2×)"),
        "ok": lambda v: (f"{v:.2f}×", f"Apoyos sólidos ({v:.2f}×)"),
    },
    "tronco": {
        "zona_corporal": "base_tronco",
        "objetivo_texto": "Tronco < 22° respecto a la vertical",
        "consejo_corto": "Mantén el tronco más vertical en el impacto.",
        "fallo": lambda v: (f"{v:.0f}°", f"Tronco inclinado ({v:.0f}° vs <22°)"),
        "ok": lambda v: (f"{v:.0f}°", f"Tronco estable ({v:.0f}°)"),
    },
    "terminacion": {
        "zona_corporal": "brazo_der",
        "objetivo_texto": "Acompañar el golpe (muñeca arriba / cruce)",
        "consejo_corto": "No frenes el swing: deja que la muñeca suba y cruce.",
        # El recorrido va en coordenadas normalizadas de la imagen: no se muestra
        "fallo": lambda v: (f"{v:.2f}", "Terminación corta"),
        "ok": lambda v: (f"{v:.2f}", "Buen acompañamiento"),
    },
}


def _escala_norm(landmarks: dict) -> float:
    hi = landmarks.get("hombro_izq")
    hd = landmarks.get("hombro_der")
    ci = landmarks.get("cadera_izq")
    cd = landmarks.get("cadera_der")
    partes: list[float] = []
    if hi and hd:
        partes.append(math.hypot(hi[0] - hd[0], hi[1] - hd[1]))
    if hi and hd and ci and cd:
        mh = ((hi[0] + hd[0]) / 2.0, (hi[1] + hd[1]) / 2.0)
        mc = ((ci[0] + cd[0]) / 2.0, (ci[1] + cd[1]) / 2.0)
        partes.append(math.hypot(mh[0] - mc[0], mh[1] - mc[1]))
    return max(partes) if partes else 0.2


def _media_movil(valores: list[float], radio: int = 2) -> list[float]:
    n = len(valores)
    suaves: list[float] = []
    for i in range(n):
        lo, hi = max(0, i - radio), min(n, i + radio + 1)
        ventana = valores[lo:hi]
        suaves.append(sum(ventana) / len(ventana) if ventana else 0.0)
    return suaves


def _normalizar_lateralidad(valor: str | None) -> str:
    v = (valor or "").strip().lower()
    return v if v in (LAT_DIESTRO, LAT_ZURDO) else LAT_DIESTRO


def _lado(lateralidad: str | None) -> dict:
    """Brazo/pierna dominantes, no dominantes y dir_x (1 diestro, -1 zurdo)."""
    if _normalizar_lateralidad(lateralidad) == LAT_ZURDO:
        return {
            "valor": LAT_ZURDO,
            "dir_x": -1,
            "etiqueta": "Zurdo",
            "lado_dom": "izquierdo",
            "muneca_dom": "muneca_izq",
            "muneca_nd": "muneca_der",
            "hombro_dom": "hombro_izq",
            "hombro_nd": "hombro_der",
            "codo_dom": "codo_izq",
            "codo_nd": "codo_der",
            "cadera_dom": "cadera_izq",
            "cadera_nd": "cadera_der",
            "rodilla_dom": "rodilla_izq",
            "col_codo": COL_CODO_IZQ,
            "col_apertura": COL_APERTURA_IZQ,
            "col_spacing": COL_SPACING_IZQ,
            "zona_brazo": "brazo_izq",
        }
    return {
        "valor": LAT_DIESTRO,
        "dir_x": 1,
        "etiqueta": "Diestro",
        "lado_dom": "derecho",
        "muneca_dom": "muneca_der",
        "muneca_nd": "muneca_izq",
        "hombro_dom": "hombro_der",
        "hombro_nd": "hombro_izq",
        "codo_dom": "codo_der",
        "codo_nd": "codo_izq",
        "cadera_dom": "cadera_der",
        "cadera_nd": "cadera_izq",
        "rodilla_dom": "rodilla_der",
        "col_codo": COL_CODO_DER,
        "col_apertura": COL_APERTURA,
        "col_spacing": COL_SPACING,
        "zona_brazo": "brazo_der",
    }


def _cruzar_hacia_nd(torso_x: float, x: float, dir_x: int, margen: float = REVES_MARGEN_X) -> bool:
    """True si x está al lado no dominante del torso (izquierda para diestro)."""
    return (torso_x - x) * dir_x > margen


def _velocidad_muneca(
    frames: list[dict],
    muneca_key: str = "muneca_der",
) -> list[float]:
    """Velocidad lineal de la muñeca dominante, normalizada por la escala del jugador."""
    vels = [0.0] * len(frames)
    prev_xy: tuple[float, float] | None = None
    prev_t: float | None = None
    for i, frame in enumerate(frames):
        landmarks = frame.get("landmarks") or {}
        muneca = landmarks.get(muneca_key)
        t = float(frame.get("t") or 0.0)
        if not muneca or len(muneca) < 2 or float(muneca[2] if len(muneca) > 2 else 1.0) < 0.25:
            prev_xy = None
            prev_t = t
            continue
        xy = (float(muneca[0]), float(muneca[1]))
        if prev_xy is not None and prev_t is not None:
            dt = max(t - prev_t, 1e-3)
            dist = math.hypot(xy[0] - prev_xy[0], xy[1] - prev_xy[1])
            escala = max(_escala_norm(landmarks), 1e-3)
            vels[i] = dist / (dt * escala)
        prev_xy = xy
        prev_t = t
    return _media_movil(vels)


def _picos_impacto(frames: list[dict], vels: list[float]) -> list[float]:
    """Picos locales de vel_muneca con separación mínima de 1.2 s -> t_impacto."""
    if len(vels) < 3:
        return []
    vmax = max(vels)
    if vmax <= 1e-6:
        return []
    ordenados = sorted(vels)
    p75 = ordenados[int(0.75 * (len(ordenados) - 1))]
    umbral = max(0.35 * vmax, p75)

    candidatos: list[tuple[float, float]] = []
    for i in range(1, len(vels) - 1):
        if vels[i] >= vels[i - 1] and vels[i] >= vels[i + 1] and vels[i] >= umbral:
            candidatos.append((float(frames[i]["t"]), vels[i]))
    if not candidatos:
        i_max = max(range(len(vels)), key=lambda k: vels[k])
        if vels[i_max] > 0:
            candidatos.append((float(frames[i_max]["t"]), vels[i_max]))

    candidatos.sort(key=lambda p: -p[1])
    aceptados: list[tuple[float, float]] = []
    for t, v in candidatos:
        if all(abs(t - t2) >= SWING_SEP_S for t2, _ in aceptados):
            aceptados.append((t, v))
    aceptados.sort(key=lambda p: p[0])
    return [t for t, _ in aceptados]


def _fase_en_t(t: float, golpes_fases: list[dict]) -> tuple[str, str]:
    for fase in PRIORIDAD_FASE:
        for intervalo in golpes_fases:
            if intervalo["fase"] != fase:
                continue
            if intervalo["t_inicio"] - 1e-4 <= t <= intervalo["t_fin"] + 1e-4:
                return fase, intervalo["fase_label"]
    return "recuperacion", FASE_LABEL["recuperacion"]


def construir_golpes_fases(tiempos_impacto: list[float]) -> list[dict]:
    """Intervalos [t_inicio, t_fin] de cada fase alrededor de cada impacto."""
    golpes: list[dict] = []
    for t_imp in tiempos_impacto:
        for fase, (dt0, dt1) in VENTANAS_FASE.items():
            t0 = max(0.0, t_imp + dt0)
            t1 = max(t0, t_imp + dt1)
            golpes.append(
                {
                    "t_inicio": round(t0, 4),
                    "t_fin": round(t1, 4),
                    "fase": fase,
                    "fase_label": FASE_LABEL[fase],
                    "t_impacto": round(t_imp, 4),
                }
            )
    return golpes


def anotar_fases_golpe(
    frames: list[dict],
    lateralidad: str = LAT_DIESTRO,
) -> tuple[list[dict], list[dict]]:
    """
    Detecta golpes por picos de vel_muneca y anota fase/fase_label en cada frame.
    Devuelve (frames_anotados, golpes_fases).
    """
    if not frames:
        return frames, []

    lado = _lado(lateralidad)
    vels = _velocidad_muneca(frames, lado["muneca_dom"])
    impactos = _picos_impacto(frames, vels)
    golpes_fases = construir_golpes_fases(impactos)

    for frame, vel in zip(frames, vels):
        fase, label = _fase_en_t(float(frame["t"]), golpes_fases)
        frame["fase"] = fase
        frame["fase_label"] = label
        frame["vel_muneca"] = round(float(vel), 4)

    print(
        f"Fases del golpe: {len(impactos)} impacto(s) "
        f"en t={', '.join(f'{t:.2f}s' for t in impactos) or '—'}"
    )
    return frames, golpes_fases


def _punto(frame: dict | None, nombre: str) -> tuple[float, float] | None:
    if not frame:
        return None
    lm = (frame.get("landmarks") or {}).get(nombre)
    if not lm or len(lm) < 2:
        return None
    if float(lm[2] if len(lm) > 2 else 1.0) < 0.25:
        return None
    return float(lm[0]), float(lm[1])


def _angulo_3p(
    p1: tuple[float, float],
    p2: tuple[float, float],
    p3: tuple[float, float],
) -> float:
    angulo = math.atan2(p3[1] - p2[1], p3[0] - p2[0]) - math.atan2(
        p1[1] - p2[1], p1[0] - p2[0]
    )
    deg = abs(math.degrees(angulo))
    if deg > 180.0:
        deg = 360.0 - deg
    return deg


def _torso_xy(frame: dict | None) -> tuple[float, float] | None:
    ci, cd = _punto(frame, "cadera_izq"), _punto(frame, "cadera_der")
    hi, hd = _punto(frame, "hombro_izq"), _punto(frame, "hombro_der")
    xs: list[float] = []
    ys: list[float] = []
    for p in (ci, cd, hi, hd):
        if p:
            xs.append(p[0])
            ys.append(p[1])
    if not xs:
        return None
    return sum(xs) / len(xs), sum(ys) / len(ys)


def _escala_frame(frame: dict | None) -> float:
    if not frame:
        return 0.2
    return max(_escala_norm(frame.get("landmarks") or {}), 1e-3)


def _apertura_hombro_frame(
    frame: dict | None,
    cadera_key: str = "cadera_der",
    hombro_key: str = "hombro_der",
    codo_key: str = "codo_der",
) -> float | None:
    cadera = _punto(frame, cadera_key)
    hombro = _punto(frame, hombro_key)
    codo = _punto(frame, codo_key)
    if not (cadera and hombro and codo):
        return None
    return _angulo_3p(cadera, hombro, codo)


def _rodilla_min_frame(frame: dict | None) -> float | None:
    if not frame:
        return None
    angs = frame.get("angulos") or {}
    vals = [
        float(angs[k])
        for k in ("rodilla_der", "rodilla_izq")
        if angs.get(k) is not None
    ]
    return min(vals) if vals else None


def _frames_en_ventanas(
    frames: list[dict],
    golpes_fases: list[dict],
    fase: str,
    t_impacto: float | None = None,
) -> list[dict]:
    ventanas = [
        g
        for g in golpes_fases
        if g["fase"] == fase
        and (t_impacto is None or abs(float(g.get("t_impacto", t_impacto)) - t_impacto) < 0.05)
    ]
    if not ventanas:
        return []
    out: list[dict] = []
    for frame in frames:
        t = float(frame.get("t") or 0.0)
        if any(g["t_inicio"] - 1e-3 <= t <= g["t_fin"] + 1e-3 for g in ventanas):
            out.append(frame)
    return out


def _frame_mas_cercano(frames: list[dict], t_objetivo: float) -> dict | None:
    if not frames:
        return None
    return min(frames, key=lambda f: abs(float(f.get("t") or 0.0) - t_objetivo))


def _normalizar_estilo_reves(valor: str | None) -> str:
    v = (valor or "").strip().lower()
    return v if v in (ESTILO_REVES_1, ESTILO_REVES_2) else ESTILO_REVES_2


def _normalizar_estilo_derecha(valor: str | None) -> str:
    v = (valor or "").strip().lower()
    return v if v in (ESTILO_DERECHA_TRAD, ESTILO_DERECHA_NADAL) else ESTILO_DERECHA_TRAD


def _estado_manos(
    muneca_der: tuple[float, float] | None,
    muneca_izq: tuple[float, float] | None,
    escala: float,
) -> str:
    """'juntas', 'separadas' o 'duda' (oclusión o zona gris del grip)."""
    if not muneca_der or not muneca_izq:
        return "duda"
    dist = math.hypot(muneca_der[0] - muneca_izq[0], muneca_der[1] - muneca_izq[1])
    umbral = max(escala, 1e-3)
    if dist <= MANOS_JUNTAS_CLARO * umbral:
        return "juntas"
    if dist >= MANOS_JUNTAS_SEPARADAS * umbral:
        return "separadas"
    return "duda"


def clasificar_tipo_golpe(
    frame_impacto: dict | None,
    frames_preparacion: list[dict] | None,
    frames_terminacion: list[dict] | None,
    estilo_reves: str = ESTILO_REVES_2,
    lateralidad: str = LAT_DIESTRO,
) -> str:
    """
    Clasifica el golpe a partir del esqueleto (Y hacia abajo).
    Usa el brazo dominante según lateralidad. estilo_reves desempata
    1 vs 2 manos cuando hay oclusión o duda en el lado no dominante.
    """
    prep = frames_preparacion or []
    term = frames_terminacion or []
    impacto = frame_impacto
    if not impacto and prep:
        impacto = prep[-1]
    if not impacto:
        return TIPO_DERECHA

    lado = _lado(lateralidad)
    dir_x = int(lado["dir_x"])
    prior_reves = _normalizar_estilo_reves(estilo_reves)
    muneca_dom = _punto(impacto, lado["muneca_dom"])
    muneca_nd = _punto(impacto, lado["muneca_nd"])
    nariz = _punto(impacto, "nariz")
    hombro_dom = _punto(impacto, lado["hombro_dom"])
    hombro_nd = _punto(impacto, lado["hombro_nd"])
    cadera_dom = _punto(impacto, lado["cadera_dom"])
    cadera_nd = _punto(impacto, lado["cadera_nd"])
    torso = _torso_xy(impacto)
    escala = _escala_frame(impacto)

    overhead = bool(
        muneca_dom
        and nariz
        and muneca_dom[1] < nariz[1] - OVERHEAD_MARGEN
    )

    if overhead:
        ys_nd = [
            p[1]
            for fr in prep
            if (p := _punto(fr, lado["muneca_nd"]))
        ]
        hombros_nd_y = [
            p[1]
            for fr in prep
            if (p := _punto(fr, lado["hombro_nd"]))
        ]
        subida_nd = (max(ys_nd) - min(ys_nd)) if len(ys_nd) >= 2 else 0.0
        mano_nd_alta = bool(
            ys_nd
            and hombros_nd_y
            and min(ys_nd) < min(hombros_nd_y) - 0.01
        )
        rodillas = [v for fr in prep if (v := _rodilla_min_frame(fr)) is not None]
        rodilla_carga = min(rodillas) if rodillas else 180.0
        trofeo = (mano_nd_alta or subida_nd >= SUBIDA_IZQ_TROFEO) and (
            rodilla_carga <= RODILLA_TROFEO_MAX
        )
        return TIPO_SAQUE if trofeo else TIPO_REMATE

    tipo_base = TIPO_DERECHA
    impacto_reves = bool(
        muneca_dom
        and torso
        and _cruzar_hacia_nd(torso[0], muneca_dom[0], dir_x)
    )
    if impacto_reves:
        estado_manos = _estado_manos(muneca_dom, muneca_nd, escala)
        if estado_manos == "juntas":
            tipo_base = TIPO_REVES_2
        elif estado_manos == "separadas":
            tipo_base = TIPO_REVES_1
        else:
            tipo_base = TIPO_REVES_2 if prior_reves == ESTILO_REVES_2 else TIPO_REVES_1
    else:
        aperturas = [
            v
            for fr in prep
            if (
                v := _apertura_hombro_frame(
                    fr, lado["cadera_dom"], lado["hombro_dom"], lado["codo_dom"]
                )
            )
            is not None
        ]
        apertura_max = max(aperturas) if aperturas else 90.0
        y_hombro = None
        if hombro_dom and hombro_nd:
            y_hombro = (hombro_dom[1] + hombro_nd[1]) / 2.0
        elif hombro_dom:
            y_hombro = hombro_dom[1]
        y_cadera = None
        if cadera_dom and cadera_nd:
            y_cadera = (cadera_dom[1] + cadera_nd[1]) / 2.0
        elif cadera_dom:
            y_cadera = cadera_dom[1]
        impacto_alto = bool(
            muneca_dom
            and y_hombro is not None
            and y_cadera is not None
            and y_hombro - 0.02 <= muneca_dom[1] <= y_cadera - 0.01
        )
        if apertura_max < VOLEA_APERTURA_MAX and impacto_alto:
            tipo_base = TIPO_VOLEA

    if tipo_base in (TIPO_VOLEA, TIPO_SAQUE, TIPO_REMATE):
        return tipo_base

    y_imp = muneca_dom[1] if muneca_dom else None
    ys_term = [
        _punto(fr, lado["muneca_dom"])[1]
        for fr in term
        if _punto(fr, lado["muneca_dom"])
    ]
    if y_imp is not None and ys_term:
        y_fin = ys_term[-1]
        y_min_term = min(ys_term)
        hombro_y = hombro_dom[1] if hombro_dom else None
        subio_hombro = hombro_y is not None and y_min_term < hombro_y - 0.01
        descendente = y_fin > y_imp + TERMINACION_DESCENSO_MIN and not subio_hombro
        if descendente:
            return TIPO_CORTADO

    return tipo_base


def clasificar_tipo_golpe_clip(
    frames: list[dict] | None,
    golpes_fases: list[dict] | None,
    estilo_reves: str = ESTILO_REVES_2,
    lateralidad: str = LAT_DIESTRO,
) -> str:
    """Clasifica el golpe principal del clip (primer impacto)."""
    if not frames or not golpes_fases:
        return TIPO_DERECHA
    impactos = sorted(
        {
            float(g["t_impacto"])
            for g in golpes_fases
            if g.get("t_impacto") is not None
        }
    )
    if not impactos:
        return TIPO_DERECHA
    t_imp = impactos[0]
    frame_imp = _frame_mas_cercano(frames, t_imp)
    prep = _frames_en_ventanas(frames, golpes_fases, "preparacion", t_imp)
    carga = _frames_en_ventanas(frames, golpes_fases, "carga", t_imp)
    term = _frames_en_ventanas(frames, golpes_fases, "terminacion", t_imp)
    tipo = clasificar_tipo_golpe(
        frame_imp,
        prep + carga,
        term,
        estilo_reves=estilo_reves,
        lateralidad=lateralidad,
    )
    print(f"Tipo de golpe detectado: {tipo} (impacto t={t_imp:.2f}s)")
    return tipo


def _perfil_golpe(
    tipo: str,
    estilo_derecha: str = ESTILO_DERECHA_TRAD,
    lateralidad: str = LAT_DIESTRO,
) -> dict:
    """Ajusta qué reglas se evalúan y con qué umbrales según el golpe."""
    estilo_d = _normalizar_estilo_derecha(estilo_derecha)
    lado = _lado(lateralidad)
    perfil = {
        "tipo": tipo,
        "estilo_derecha": estilo_d,
        "lateralidad": lado["valor"],
        "dir_x": lado["dir_x"],
        "etiqueta_lat": lado["etiqueta"],
        "lado_dom": lado["lado_dom"],
        "col_codo": lado["col_codo"],
        "col_apertura": lado["col_apertura"],
        "col_spacing": lado["col_spacing"],
        "zona_brazo": lado["zona_brazo"],
        "muneca_dom": lado["muneca_dom"],
        "hombro_dom": lado["hombro_dom"],
        "hombro_nd": lado["hombro_nd"],
        "codo_dom": lado["codo_dom"],
        "cadera_dom": lado["cadera_dom"],
        "eval_apertura": True,
        "eval_rodilla": True,
        "eval_codo": True,
        "eval_spacing": True,
        "eval_base": True,
        "eval_tronco": True,
        "eval_terminacion": True,
        "codo_objetivo": CODO_EXTENSION_OBJETIVO,
        "codo_aceptable": CODO_EXTENSION_ACEPTABLE,
        "codo_titulo": "Extensión del brazo al golpear",
        "codo_vertical": False,
        "spacing_min": SPACING_MINIMO,
        "spacing_optimo": SPACING_OPTIMO,
        "rodilla_insuf": RODILLA_FLEXION_INSUFICIENTE,
        "rodilla_min": RODILLA_CARGA_OBJETIVO_MIN,
        "rodilla_max": RODILLA_CARGA_OBJETIVO_MAX,
    }
    if tipo in (TIPO_SAQUE, TIPO_REMATE):
        perfil["eval_spacing"] = False
        perfil["codo_objetivo"] = 162.0
        perfil["codo_aceptable"] = 145.0
        perfil["codo_titulo"] = f"Extensión vertical del brazo {lado['lado_dom']}"
        perfil["codo_vertical"] = True
        if tipo == TIPO_SAQUE:
            perfil["rodilla_insuf"] = 125.0
            perfil["rodilla_min"] = 108.0
            perfil["rodilla_max"] = 122.0
        else:
            perfil["rodilla_insuf"] = 138.0
            perfil["rodilla_min"] = 118.0
            perfil["rodilla_max"] = 135.0
    elif tipo == TIPO_REVES_2:
        perfil["spacing_min"] = 0.55
        perfil["spacing_optimo"] = 0.75
        # Grip a dos manos: el codo izquierdo (y el brazo de arriba) pueden ir flexionados.
        perfil["eval_codo"] = False
    elif tipo == TIPO_VOLEA:
        perfil["eval_apertura"] = False
        perfil["spacing_min"] = 0.95
        perfil["spacing_optimo"] = 1.10
    elif tipo == TIPO_CORTADO:
        perfil["eval_terminacion"] = False
    return perfil


def _en_fase(
    serie: list[tuple[int, float]],
    golpes_fases: list[dict] | None,
    fase: str,
) -> list[tuple[int, float]]:
    """Filtra la serie a las ventanas de una fase; si queda vacía, no recorta."""
    if not serie or not golpes_fases:
        return serie
    ventanas = [
        (g["t_inicio"], g["t_fin"]) for g in golpes_fases if g["fase"] == fase
    ]
    if not ventanas:
        return serie
    filtrada = [
        (t, v)
        for t, v in serie
        if any(a - 1e-3 <= t / 1000.0 <= b + 1e-3 for a, b in ventanas)
    ]
    return filtrada or serie


def _leer_filas(ruta: Path) -> list[dict[str, float | None]]:
    """Lee el CSV a floats nativos; los valores no numéricos quedan como None."""
    try:
        with open(ruta, newline="", encoding="utf-8") as archivo:
            filas = list(csv.DictReader(archivo))
    except (OSError, UnicodeDecodeError, csv.Error):
        return []

    convertidas: list[dict[str, float | None]] = []
    for fila in filas:
        convertida: dict[str, float | None] = {}
        for clave, valor in fila.items():
            if clave is None:
                continue
            try:
                convertida[clave] = float(valor)
            except (TypeError, ValueError):
                convertida[clave] = None
        convertidas.append(convertida)
    return convertidas


def _serie(
    filas: list[dict[str, float | None]], columna: str
) -> list[tuple[int, float]]:
    """Pares (timestamp_ms, valor) válidos de una columna."""
    serie: list[tuple[int, float]] = []
    for fila in filas:
        timestamp = fila.get(COLUMNA_TIMESTAMP)
        valor = fila.get(columna)
        if timestamp is None or valor is None:
            continue
        serie.append((int(timestamp), float(valor)))
    return serie


def _serie_combinada(
    filas: list[dict[str, float | None]],
    columnas: tuple[str, ...],
    agregador,
) -> list[tuple[int, float]]:
    """Combina varias columnas del mismo frame (p. ej. min de ambas rodillas)."""
    serie: list[tuple[int, float]] = []
    for fila in filas:
        timestamp = fila.get(COLUMNA_TIMESTAMP)
        if timestamp is None:
            continue
        valores = [fila.get(col) for col in columnas]
        validos = [float(v) for v in valores if v is not None]
        if not validos:
            continue
        serie.append((int(timestamp), float(agregador(validos))))
    return serie


def _extremos_locales(
    serie: list[tuple[int, float]],
    modo: str,
    cooldown_ms: int = COOLDOWN_MS,
) -> list[tuple[int, float]]:
    """
    Extremos locales (mínimos o máximos) con cooldown para no repetir el mismo golpe.
    Si no hay extremos claros, se queda el más extremo de toda la serie.
    """
    if not serie:
        return []

    candidatos: list[tuple[int, float]] = []
    if len(serie) >= 3:
        for i in range(1, len(serie) - 1):
            prev, cur, nxt = serie[i - 1][1], serie[i][1], serie[i + 1][1]
            es_min = modo == "min" and cur <= prev and cur <= nxt and cur < max(prev, nxt)
            es_max = modo == "max" and cur >= prev and cur >= nxt and cur > min(prev, nxt)
            if es_min or es_max:
                candidatos.append(serie[i])

    if not candidatos:
        candidatos = [
            min(serie, key=lambda p: p[1]) if modo == "min" else max(serie, key=lambda p: p[1])
        ]

    filtrados: list[tuple[int, float]] = []
    for t, v in candidatos:
        if not filtrados or t - filtrados[-1][0] >= cooldown_ms:
            filtrados.append((t, v))
            continue
        if modo == "min" and v < filtrados[-1][1]:
            filtrados[-1] = (t, v)
        elif modo == "max" and v > filtrados[-1][1]:
            filtrados[-1] = (t, v)
    return filtrados


def _segundos(t_ms: int) -> float:
    return round(t_ms / 1000.0, 1)


def _citar_segundos(tiempos: list[float]) -> str:
    if not tiempos:
        return ""
    if len(tiempos) == 1:
        return f"en el segundo {tiempos[0]:.1f}"
    etiquetas = [f"{t:.1f}" for t in tiempos]
    return f"en los segundos {', '.join(etiquetas[:-1])} y {etiquetas[-1]}"


def _en_cuantos(n: int, total: int) -> str:
    """'en 2 de 3 golpes', 'en los 3 golpes' o 'en el golpe'."""
    if total <= 1:
        return "en el golpe"
    if n == total:
        return f"en los {total} golpes"
    return f"en {n} de {total} golpes"


def _media(valores: list[float]) -> float:
    return sum(valores) / len(valores) if valores else 0.0


def _pack_detalles(
    episodios: list[tuple[int, float]],
    pack_fn,
    fase_id: str,
) -> list[dict]:
    detalles: list[dict] = []
    for t_ms, valor in episodios:
        valor_medido, nota = pack_fn(valor)
        detalles.append(
            {
                "t": _segundos(t_ms),
                "valor_medido": valor_medido,
                "nota_corta": nota,
                "fase": fase_id,
                "fase_nombre": FASE_NOMBRE.get(fase_id, ""),
                "fase_corta": FASE_CORTA.get(fase_id, ""),
            }
        )
    return detalles


def _sello_fase(detalles: list[dict], fase_id: str) -> list[dict]:
    for detalle in detalles:
        detalle.setdefault("fase", fase_id)
        detalle.setdefault("fase_nombre", FASE_NOMBRE.get(fase_id, ""))
        detalle.setdefault("fase_corta", FASE_CORTA.get(fase_id, ""))
    return detalles


def _evaluacion(
    categoria: str,
    tipo: str,
    titulo: str,
    mensaje: str,
    valor: float,
    episodios: list[tuple[int, float]],
    *,
    eventos_detalle: list[dict] | None = None,
    objetivo_texto: str | None = None,
    consejo_corto: str | None = None,
    fase: str | None = None,
    zona_corporal: str | None = None,
) -> dict:
    timestamps = [_segundos(t) for t, _ in episodios]
    primero_ms = episodios[0][0] if episodios else 0
    meta = META_COACH.get(categoria, {})
    fase_id = fase or FASE_POR_CATEGORIA.get(categoria, "impacto")
    pack_fn = meta.get("ok" if tipo == "optimo" else "fallo")
    detalles = eventos_detalle
    if detalles is None and pack_fn is not None:
        detalles = _pack_detalles(episodios, pack_fn, fase_id)
    else:
        detalles = _sello_fase(list(detalles or []), fase_id)
    return {
        "categoria": categoria,
        "tipo": tipo,
        "titulo": titulo,
        "mensaje": mensaje,
        "valor": round(float(valor), 1),
        "timestamps": timestamps,
        "timestamp": timestamps[0] if timestamps else 0.0,
        "timestamp_ms": primero_ms,
        "regla": categoria,
        "zona_corporal": zona_corporal or meta.get("zona_corporal"),
        "objetivo_texto": objetivo_texto or meta.get("objetivo_texto"),
        "consejo_corto": consejo_corto or meta.get("consejo_corto"),
        "eventos_detalle": detalles,
        "fase": fase_id,
        "fase_nombre": FASE_NOMBRE.get(fase_id, ""),
        "fase_corta": FASE_CORTA.get(fase_id, ""),
    }


def _eval_rodillas(
    filas: list[dict[str, float | None]],
    golpes_fases: list[dict] | None,
    perfil: dict | None = None,
) -> dict | None:
    p = perfil or _perfil_golpe(TIPO_DERECHA)
    if not p.get("eval_rodilla", True):
        return None
    rod_min = float(p["rodilla_min"])
    rod_max = float(p["rodilla_max"])
    rod_insuf = float(p["rodilla_insuf"])
    serie = _en_fase(
        _serie_combinada(filas, (COL_ROD_DER, COL_ROD_IZQ), min),
        golpes_fases,
        "carga",
    )
    if not serie:
        return None

    cargas = _extremos_locales(serie, "min")
    valores = [v for _, v in cargas]
    media = _media(valores)
    insuf = [(t, v) for t, v in cargas if v > rod_insuf]
    buenas = [(t, v) for t, v in cargas if v <= rod_max]
    fase_n = FASE_NOMBRE["carga"]
    extra_saque = (
        " En el saque la flexión debe ser más profunda que en un remate."
        if p["tipo"] == TIPO_SAQUE
        else ""
    )

    if insuf and len(insuf) >= max(1, len(cargas) // 2):
        tipo = "alerta" if media > rod_insuf + 15 else "mejora"
        mensaje = (
            f"En la {fase_n} te quedas con las piernas a {media:.0f}° de media "
            f"(busca {rod_min:.0f}°–{rod_max:.0f}° "
            f"para bajar el centro de gravedad). "
            f"Este patrón se repite {_citar_segundos([_segundos(t) for t, _ in insuf])}."
            f"{extra_saque}"
        )
        if buenas:
            mensaje += (
                f" Sí lo haces bien {_citar_segundos([_segundos(t) for t, _ in buenas])}: "
                "repite esa flexión en el resto de golpes."
            )
        return _evaluacion(
            "rodilla",
            tipo,
            "Flexión y carga de piernas",
            mensaje,
            media,
            insuf,
            objetivo_texto=f"Objetivo: {rod_min:.0f}°–{rod_max:.0f}°",
        )

    mensaje = (
        f"En la {fase_n} bajas hasta {media:.0f}° de media, dentro de la zona de "
        f"carga ({rod_min:.0f}°–{rod_max:.0f}°). "
        f"Se observa {_citar_segundos([_segundos(t) for t, _ in cargas])}."
    )
    return _evaluacion(
        "rodilla",
        "optimo",
        "Flexión y carga de piernas",
        mensaje,
        media,
        cargas,
        objetivo_texto=f"Objetivo: {rod_min:.0f}°–{rod_max:.0f}°",
    )


def _eval_codo(
    filas: list[dict[str, float | None]],
    golpes_fases: list[dict] | None,
    perfil: dict | None = None,
) -> dict | None:
    p = perfil or _perfil_golpe(TIPO_DERECHA)
    if not p.get("eval_codo", True):
        return None
    obj = float(p["codo_objetivo"])
    aceptable = float(p["codo_aceptable"])
    titulo = str(p["codo_titulo"])
    col_codo = str(p.get("col_codo") or COL_CODO_DER)
    lado_dom = str(p.get("lado_dom") or "derecho")
    serie = _en_fase(_serie(filas, col_codo), golpes_fases, "impacto")
    if not serie:
        return None

    picos = _extremos_locales(serie, "max")
    valores = [v for _, v in picos]
    media = _media(valores)
    encogidos = [(t, v) for t, v in picos if v < obj]
    buenos = [(t, v) for t, v in picos if v >= obj]
    fase_n = FASE_NOMBRE["impacto"]
    meta = (
        f"extender el brazo {lado_dom} hacia arriba"
        if p.get("codo_vertical")
        else f"superar los {obj:.0f}° para ganar palanca"
    )

    if encogidos and media < obj:
        tipo = "alerta" if media < aceptable else "mejora"
        mensaje = (
            f"Durante la {fase_n} encoges el codo {lado_dom} a {media:.0f}° de media "
            f"(procura {meta}). "
            f"Aparece {_citar_segundos([_segundos(t) for t, _ in encogidos])}."
        )
        if buenos:
            mensaje += (
                f" La extensión sí es correcta "
                f"{_citar_segundos([_segundos(t) for t, _ in buenos])}."
            )
        return _evaluacion(
            "codo",
            tipo,
            titulo,
            mensaje,
            media,
            encogidos,
            objetivo_texto=f"Objetivo: >{obj:.0f}°",
            zona_corporal=str(p.get("zona_brazo") or "brazo_der"),
        )

    mensaje = (
        f"Durante la {fase_n} llegas a {media:.0f}° de media, por encima de los "
        f"{obj:.0f}° que buscamos. "
        f"Se observa {_citar_segundos([_segundos(t) for t, _ in picos])}."
    )
    return _evaluacion(
        "codo",
        "optimo",
        titulo,
        mensaje,
        media,
        picos,
        objetivo_texto=f"Objetivo: >{obj:.0f}°",
        zona_corporal=str(p.get("zona_brazo") or "brazo_der"),
    )


def _eval_spacing(
    filas: list[dict[str, float | None]],
    golpes_fases: list[dict] | None,
    perfil: dict | None = None,
) -> dict | None:
    p = perfil or _perfil_golpe(TIPO_DERECHA)
    if not p.get("eval_spacing", True):
        return None
    sp_min = float(p["spacing_min"])
    sp_opt = float(p["spacing_optimo"])
    col_sp = str(p.get("col_spacing") or COL_SPACING)
    serie = _en_fase(_serie(filas, col_sp), golpes_fases, "impacto")
    if not serie:
        return None

    alcances = _extremos_locales(serie, "max")
    valores = [v for _, v in alcances]
    media = _media(valores)
    pegados = [(t, v) for t, v in alcances if v < sp_min]
    buenos = [(t, v) for t, v in alcances if v >= sp_opt]
    fase_n = FASE_NOMBRE["impacto"]
    nota_2m = (
        " En el revés a dos manos el contacto puede ir un poco más pegado."
        if p["tipo"] == TIPO_REVES_2
        else ""
    )
    nota_volea = (
        " En la volea el contacto debe quedar firme por delante del cuerpo."
        if p["tipo"] == TIPO_VOLEA
        else ""
    )

    if pegados and media < sp_opt:
        tipo = "alerta" if media < max(0.45, sp_min - 0.15) else "mejora"
        mensaje = (
            f"Durante la {fase_n} golpeas demasiado pegado al cuerpo "
            f"(separación media {media:.2f}; busca al menos {sp_min:.2f}). "
            f"{nota_volea}"
            f"Aparece {_citar_segundos([_segundos(t) for t, _ in pegados])}."
        )
        if buenos:
            mensaje += (
                f" Mantén la distancia que ya logras "
                f"{_citar_segundos([_segundos(t) for t, _ in buenos])}."
            )
        return _evaluacion(
            "spacing",
            tipo,
            "Separación respecto a la bola (Spacing)",
            mensaje,
            media,
            pegados,
            objetivo_texto=f"Separar muñeca del torso (>{sp_min:.2f}×)",
        )

    mensaje = (
        f"Durante la {fase_n} la muñeca se aleja {media:.2f} veces tu escala "
        f"corporal, suficiente para liberar el swing.{nota_2m}{nota_volea} "
        f"Se observa {_citar_segundos([_segundos(t) for t, _ in alcances])}."
    )
    return _evaluacion(
        "spacing",
        "optimo",
        "Separación respecto a la bola (Spacing)",
        mensaje,
        media,
        alcances,
        objetivo_texto=f"Separar muñeca del torso (>{sp_min:.2f}×)",
    )


def _eval_apertura(
    filas: list[dict[str, float | None]],
    golpes_fases: list[dict] | None,
    perfil: dict | None = None,
) -> dict | None:
    p = perfil or _perfil_golpe(TIPO_DERECHA)
    if not p.get("eval_apertura", True):
        return None
    serie = _en_fase(
        _serie(filas, str(p.get("col_apertura") or COL_APERTURA)),
        golpes_fases,
        "preparacion",
    )
    if not serie:
        return None

    armados = _extremos_locales(serie, "max")
    valores = [v for _, v in armados]
    media = _media(valores)
    cortos = [(t, v) for t, v in armados if v < APERTURA_HOMBRO_MINIMA]
    buenos = [(t, v) for t, v in armados if v >= APERTURA_HOMBRO_OPTIMA]
    fase_n = FASE_NOMBRE["preparacion"]

    if cortos and media < APERTURA_HOMBRO_OPTIMA:
        tipo = "alerta" if media < 60 else "mejora"
        mensaje = (
            f"En la {fase_n} el armado queda corto: el hombro {p.get('lado_dom') or 'derecho'} abre "
            f"{media:.0f}° de media (busca superar los {APERTURA_HOMBRO_OPTIMA:.0f}°). "
            f"Aparece {_citar_segundos([_segundos(t) for t, _ in cortos])}."
        )
        if buenos:
            mensaje += (
                f" La amplitud sí es buena "
                f"{_citar_segundos([_segundos(t) for t, _ in buenos])}."
            )
        return _evaluacion(
            "apertura",
            tipo,
            "Apertura del arco y preparación (Backswing)",
            mensaje,
            media,
            cortos,
        )

    mensaje = (
        f"En la {fase_n} el hombro derecho abre {media:.0f}° de media, con un "
        f"arco amplio para acelerar la raqueta. "
        f"Se observa {_citar_segundos([_segundos(t) for t, _ in armados])}."
    )
    return _evaluacion(
        "apertura",
        "optimo",
        "Apertura del arco y preparación (Backswing)",
        mensaje,
        media,
        armados,
    )


def _eval_base(
    filas: list[dict[str, float | None]],
    golpes_fases: list[dict] | None,
) -> dict | None:
    serie_base = _en_fase(_serie(filas, COL_BASE), golpes_fases, "carga")
    if not serie_base:
        return None

    mins = _extremos_locales(serie_base, "min")
    media_base = _media([v for _, v in mins])
    estrechas = [(t, v) for t, v in mins if v < BASE_MINIMA]
    fase_n = FASE_NOMBRE["carga"]

    if estrechas:
        tipo = "alerta" if media_base < 0.55 else "mejora"
        mensaje = (
            f"En la {fase_n} la base de apoyos se queda en {media_base:.2f} veces "
            f"el ancho de hombros (busca al menos {BASE_OPTIMA:.1f}). "
            f"Separa más los pies {_citar_segundos([_segundos(t) for t, _ in estrechas])}."
        )
        return _evaluacion(
            "base", tipo, "Base de apoyo", mensaje, media_base, estrechas
        )

    mensaje = (
        f"En la {fase_n} los apoyos son sólidos: la base ronda {media_base:.2f} "
        f"veces el ancho de hombros. "
        f"Se observa {_citar_segundos([_segundos(t) for t, _ in mins])}."
    )
    return _evaluacion(
        "base", "optimo", "Base de apoyo", mensaje, media_base, mins
    )


def _eval_tronco(
    filas: list[dict[str, float | None]],
    golpes_fases: list[dict] | None,
) -> dict | None:
    serie = _en_fase(_serie(filas, COL_TRONCO), golpes_fases, "impacto")
    if not serie:
        return None

    picos = _extremos_locales(serie, "max")
    media = _media([v for _, v in picos])
    inclinadas = [(t, v) for t, v in picos if v > INCLINACION_MAXIMA]
    fase_n = FASE_NOMBRE["impacto"]

    if inclinadas:
        tipo = "alerta" if media > INCLINACION_ALERTA else "mejora"
        mensaje = (
            f"Durante la {fase_n} el tronco se inclina {media:.0f}° respecto a la "
            f"vertical (procura no superar {INCLINACION_MAXIMA:.0f}°). "
            f"Aparece {_citar_segundos([_segundos(t) for t, _ in inclinadas])}."
        )
        return _evaluacion(
            "tronco",
            tipo,
            "Equilibrio postural del tronco",
            mensaje,
            media,
            inclinadas,
        )

    mensaje = (
        f"Durante la {fase_n} el tronco se mantiene estable ({media:.0f}° de "
        f"inclinación media). "
        f"Se observa {_citar_segundos([_segundos(t) for t, _ in picos])}."
    )
    return _evaluacion(
        "tronco",
        "optimo",
        "Equilibrio postural del tronco",
        mensaje,
        media,
        picos,
    )


def _stats_terminacion(
    frames: list[dict] | None,
    golpes_fases: list[dict] | None,
    perfil: dict | None = None,
) -> list[dict]:
    """Por cada ventana de terminación: geometría de muñeca dominante, torso y hombros."""
    if not frames or not golpes_fases:
        return []
    p = perfil or _perfil_golpe(TIPO_DERECHA)
    muneca_key = str(p.get("muneca_dom") or "muneca_der")
    hombro_dom_key = str(p.get("hombro_dom") or "hombro_der")
    hombro_nd_key = str(p.get("hombro_nd") or "hombro_izq")
    dir_x = int(p.get("dir_x") or 1)
    ventanas = [g for g in golpes_fases if g["fase"] == "terminacion"]
    stats: list[dict] = []
    for ventana in ventanas:
        puntos: list[tuple[float, float, float, dict]] = []
        for frame in frames:
            t = float(frame.get("t") or 0.0)
            if t < ventana["t_inicio"] - 1e-3 or t > ventana["t_fin"] + 1e-3:
                continue
            muneca = _punto(frame, muneca_key)
            if not muneca:
                continue
            puntos.append((t, muneca[0], muneca[1], frame))
        if len(puntos) < 2:
            continue
        y0 = puntos[0][2]
        ymin = min(p[2] for p in puntos)
        subida = y0 - ymin
        cruce = abs(puntos[-1][1] - puntos[0][1])
        recorrido = subida + 0.5 * cruce
        t_pico = min(puntos, key=lambda p: p[2])[0]
        frame_fin = puntos[-1][3]
        frame_pico = min(puntos, key=lambda p: p[2])[3]
        torso = _torso_xy(frame_fin) or _torso_xy(frame_pico)
        hombro_dom = _punto(frame_fin, hombro_dom_key) or _punto(frame_pico, hombro_dom_key)
        hombro_nd = _punto(frame_fin, hombro_nd_key) or _punto(frame_pico, hombro_nd_key)
        nariz = _punto(frame_pico, "nariz") or _punto(frame_fin, "nariz")
        stats.append(
            {
                "t_ms": int(round(t_pico * 1000)),
                "recorrido": recorrido,
                "subida": subida,
                "cruce": cruce,
                "dir_x": dir_x,
                "x0": puntos[0][1],
                "x_fin": puntos[-1][1],
                "y0": y0,
                "y_fin": puntos[-1][2],
                "y_min": ymin,
                "torso_x": torso[0] if torso else None,
                "hombro_dom_x": hombro_dom[0] if hombro_dom else None,
                "hombro_dom_y": hombro_dom[1] if hombro_dom else None,
                "hombro_nd_x": hombro_nd[0] if hombro_nd else None,
                "nariz_y": nariz[1] if nariz else None,
            }
        )
    return stats


def _modo_terminacion(perfil: dict) -> str:
    if perfil.get("tipo") != TIPO_DERECHA:
        return "generico"
    if perfil.get("estilo_derecha") == ESTILO_DERECHA_NADAL:
        return "lazo"
    return "cruce"


def _es_terminacion_completa(stat: dict, modo: str) -> bool:
    """Follow-through según estilo. dir_x invierte el cruce para zurdos."""
    subida = float(stat.get("subida") or 0.0)
    cruce = float(stat.get("cruce") or 0.0)
    x_fin = float(stat.get("x_fin") or 0.0)
    y_fin = float(stat.get("y_fin") or 0.0)
    y_min = float(stat.get("y_min") or y_fin)
    torso_x = stat.get("torso_x")
    hombro_dom_x = stat.get("hombro_dom_x")
    hombro_dom_y = stat.get("hombro_dom_y")
    hombro_nd_x = stat.get("hombro_nd_x")
    nariz_y = stat.get("nariz_y")
    dir_x = int(stat.get("dir_x") or 1)

    if modo == "lazo":
        sobre_cabeza = nariz_y is not None and (
            y_min < float(nariz_y) - 0.01 or y_fin < float(nariz_y)
        )
        lado_dominante = torso_x is None or (x_fin - float(torso_x)) * dir_x >= -0.04
        sobre_hombro_dom = bool(
            hombro_dom_y is not None
            and y_fin < float(hombro_dom_y) - 0.015
            and (
                lado_dominante
                or (
                    hombro_dom_x is not None
                    and abs(x_fin - float(hombro_dom_x)) < 0.14
                )
            )
        )
        lazo_alto = subida >= TERMINACION_LAZO_SUBIDA and lado_dominante
        return bool(sobre_cabeza or sobre_hombro_dom or lazo_alto)

    if modo == "cruce":
        if torso_x is not None:
            return _cruzar_hacia_nd(float(torso_x), x_fin, dir_x)
        if hombro_nd_x is not None:
            return _cruzar_hacia_nd(float(hombro_nd_x), x_fin, dir_x, margen=-0.04)
        x0 = float(stat.get("x0") or 0.0)
        return (x0 - x_fin) * dir_x > TERMINACION_CRUCE_MIN

    return not (subida < TERMINACION_SUBIDA_MIN and cruce < TERMINACION_CRUCE_MIN)


def _eval_terminacion(
    frames: list[dict] | None,
    golpes_fases: list[dict] | None,
    perfil: dict | None = None,
) -> dict | None:
    """Comprueba el follow-through según el estilo de derecha del jugador."""
    p = perfil or _perfil_golpe(TIPO_DERECHA)
    if not p.get("eval_terminacion", True):
        return None
    stats = _stats_terminacion(frames, golpes_fases, p)
    if not stats:
        return None

    modo = _modo_terminacion(p)
    for stat in stats:
        stat["completo"] = _es_terminacion_completa(stat, modo)

    episodios = [(s["t_ms"], s["recorrido"]) for s in stats]
    cortos = [(s["t_ms"], s["recorrido"]) for s in stats if not s["completo"]]
    media = _media([v for _, v in episodios])
    fase_n = FASE_NOMBRE["terminacion"]

    if modo == "lazo":
        objetivo = "Lazo alto (sobre hombro dominante / por encima de la cabeza)"
        consejo = "Deja que la muñeca suba en el lazo, sin forzar el cruce al hombro no dominante."
        if cortos:
            tipo = "alerta" if len(cortos) >= max(1, len(episodios) // 2) else "mejora"
            mensaje = (
                f"En la {fase_n} el lazo no sube lo suficiente "
                f"{_en_cuantos(len(cortos), len(episodios))}: en un swing tipo Nadal "
                f"la muñeca debe terminar alta, por encima de la cabeza o sobre el "
                f"hombro dominante. "
                f"Aparece {_citar_segundos([_segundos(t) for t, _ in cortos])}."
            )
            return _evaluacion(
                "terminacion",
                tipo,
                "Acompañamiento / Terminación (Lazo)",
                mensaje,
                media,
                cortos,
                objetivo_texto=objetivo,
                consejo_corto=consejo,
            )
        mensaje = (
            f"En la {fase_n} el lazo termina alto (Buggy Whip): la muñeca sube por "
            f"encima de la cabeza o sobre el hombro dominante. "
            f"Se observa {_citar_segundos([_segundos(t) for t, _ in episodios])}."
        )
        return _evaluacion(
            "terminacion",
            "optimo",
            "Acompañamiento / Terminación (Lazo)",
            mensaje,
            media,
            episodios,
            objetivo_texto=objetivo,
            consejo_corto=consejo,
        )

    if modo == "cruce":
        objetivo = "Cruzar la muñeca hacia el hombro no dominante"
        consejo = "Acompaña el golpe cruzando el cuerpo hacia el lado no dominante."
        if cortos:
            tipo = "alerta" if len(cortos) >= max(1, len(episodios) // 2) else "mejora"
            mensaje = (
                f"En la {fase_n} la muñeca no cruza hacia el hombro no dominante "
                f"{_en_cuantos(len(cortos), len(episodios))}. En un swing clásico el brazo debe "
                f"acompañar cruzando el cuerpo. "
                f"Aparece {_citar_segundos([_segundos(t) for t, _ in cortos])}."
            )
            return _evaluacion(
                "terminacion",
                tipo,
                "Acompañamiento / Terminación",
                mensaje,
                media,
                cortos,
                objetivo_texto=objetivo,
                consejo_corto=consejo,
            )
        mensaje = (
            f"En la {fase_n} la muñeca cruza hacia el lado no dominante y acompaña el "
            f"swing. "
            f"Se observa {_citar_segundos([_segundos(t) for t, _ in episodios])}."
        )
        return _evaluacion(
            "terminacion",
            "optimo",
            "Acompañamiento / Terminación",
            mensaje,
            media,
            episodios,
            objetivo_texto=objetivo,
            consejo_corto=consejo,
        )

    if cortos:
        tipo = "alerta" if len(cortos) >= max(1, len(episodios) // 2) else "mejora"
        mensaje = (
            f"En la {fase_n} frenas el golpe en seco "
            f"{_en_cuantos(len(cortos), len(episodios))}: la muñeca apenas sube ni "
            f"cruza tras el impacto. Deja que el "
            f"brazo acompañe. Aparece {_citar_segundos([_segundos(t) for t, _ in cortos])}."
        )
        return _evaluacion(
            "terminacion",
            tipo,
            "Acompañamiento / Terminación",
            mensaje,
            media,
            cortos,
        )

    mensaje = (
        f"En la {fase_n} la muñeca sube y acompaña el swing. Se observa {_citar_segundos([_segundos(t) for t, _ in episodios])}."
    )
    return _evaluacion(
        "terminacion",
        "optimo",
        "Acompañamiento / Terminación",
        mensaje,
        media,
        episodios,
    )


def _texto_adaptacion(
    lateralidad: str,
    estilo_reves: str,
    estilo_derecha: str,
) -> str:
    lado = _lado(lateralidad)
    estilo = "Lazo" if estilo_derecha == ESTILO_DERECHA_NADAL else "clásico"
    grip = "revés a 1 mano" if estilo_reves == ESTILO_REVES_1 else "revés a 2 manos"
    return (
        f"Análisis adaptado para jugador {lado['etiqueta']}, "
        f"estilo {estilo}, {grip}"
    )


def _resumen_general(
    evaluaciones: list[dict],
    tipo_golpe: str = TIPO_DERECHA,
    *,
    lateralidad: str = LAT_DIESTRO,
    estilo_reves: str = ESTILO_REVES_2,
    estilo_derecha: str = ESTILO_DERECHA_TRAD,
) -> dict:
    adaptacion = _texto_adaptacion(lateralidad, estilo_reves, estilo_derecha)
    extra = {
        "tipo_golpe": tipo_golpe,
        "lateralidad": _normalizar_lateralidad(lateralidad),
        "estilo_reves": _normalizar_estilo_reves(estilo_reves),
        "estilo_derecha": _normalizar_estilo_derecha(estilo_derecha),
        "adaptacion": adaptacion,
    }
    if not evaluaciones:
        return {
            "puntuacion": 0,
            "tipo": "mejora",
            "titulo": "Análisis general del clip",
            "mensaje": "No hay métricas suficientes para valorar el clip.",
            "puntos_fuertes": [],
            "aspecto_principal": "",
            **extra,
        }

    penalizacion = sum(PENALIZACION.get(ev["tipo"], 8) for ev in evaluaciones)
    puntuacion = max(0, min(100, 100 - penalizacion))
    if all(ev["tipo"] == "optimo" for ev in evaluaciones):
        puntuacion = max(puntuacion, 92)

    if puntuacion >= 85:
        tipo = "optimo"
    elif puntuacion >= 65:
        tipo = "mejora"
    else:
        tipo = "alerta"

    fuertes = [ev["titulo"] for ev in evaluaciones if ev["tipo"] == "optimo"]
    a_corregir = [ev for ev in evaluaciones if ev["tipo"] != "optimo"]
    a_corregir.sort(key=lambda ev: PENALIZACION.get(ev["tipo"], 0), reverse=True)
    principal = a_corregir[0]["titulo"] if a_corregir else "Ninguno: el clip está equilibrado"
    etiqueta = tipo_golpe

    if tipo == "optimo":
        mensaje = (
            f"{adaptacion}. Análisis de {etiqueta}: valoración biomecánica de {puntuacion}/100. "
            f"El clip muestra un patrón sólido: "
            f"{', '.join(fuertes) or 'los apoyos y el swing están coordinados'}. "
            "Sigue insistiendo en esa repetición."
        )
    elif a_corregir:
        mensaje = (
            f"{adaptacion}. Análisis de {etiqueta}: valoración biomecánica de {puntuacion}/100. "
            f"{('Puntos fuertes: ' + ', '.join(fuertes) + '. ') if fuertes else ''}"
            f"El principal aspecto a corregir es {principal.lower()}."
        )
    else:
        mensaje = (
            f"{adaptacion}. Análisis de {etiqueta}: valoración biomecánica de {puntuacion}/100 "
            "en este clip."
        )

    return {
        "puntuacion": int(puntuacion),
        "tipo": tipo,
        "titulo": "Análisis general del clip",
        "mensaje": mensaje,
        "puntos_fuertes": fuertes,
        "aspecto_principal": principal,
        **extra,
    }


def generar_feedback(
    csv_path: str | Path,
    golpes_fases: list[dict] | None = None,
    frames: list[dict] | None = None,
    estilo_reves: str = ESTILO_REVES_2,
    estilo_derecha: str = ESTILO_DERECHA_TRAD,
    lateralidad: str = LAT_DIESTRO,
) -> dict:
    """
    Evalúa las métricas del vídeo y devuelve un análisis de entrenador agrupado.
    """
    estilo_r = _normalizar_estilo_reves(estilo_reves)
    estilo_d = _normalizar_estilo_derecha(estilo_derecha)
    lat = _normalizar_lateralidad(lateralidad)
    adaptacion = _texto_adaptacion(lat, estilo_r, estilo_d)
    extra = {
        "estilo_reves": estilo_r,
        "estilo_derecha": estilo_d,
        "lateralidad": lat,
        "adaptacion": adaptacion,
    }
    vacio = {
        "resumen_general": None,
        "evaluaciones": [],
        "golpes_fases": golpes_fases or [],
        "tipo_golpe": TIPO_DERECHA,
        **extra,
    }
    ruta = Path(csv_path)
    if not ruta.is_file():
        return vacio

    filas = _leer_filas(ruta)
    if not filas:
        return vacio

    if golpes_fases is None and frames:
        _, golpes_fases = anotar_fases_golpe(frames, lateralidad=lat)

    tipo_golpe = clasificar_tipo_golpe_clip(
        frames, golpes_fases, estilo_reves=estilo_r, lateralidad=lat
    )
    perfil = _perfil_golpe(tipo_golpe, estilo_derecha=estilo_d, lateralidad=lat)
    print(f"{adaptacion} -> reglas de {tipo_golpe}")

    evaluaciones = [
        ev
        for ev in (
            _eval_apertura(filas, golpes_fases, perfil),
            _eval_rodillas(filas, golpes_fases, perfil),
            _eval_base(filas, golpes_fases),
            _eval_codo(filas, golpes_fases, perfil),
            _eval_spacing(filas, golpes_fases, perfil),
            _eval_tronco(filas, golpes_fases),
            _eval_terminacion(frames, golpes_fases, perfil),
        )
        if ev is not None
    ]
    if not evaluaciones:
        return {
            "resumen_general": {
                "puntuacion": 0,
                "tipo": "mejora",
                "titulo": "Análisis general del clip",
                "mensaje": f"{adaptacion}. No hay métricas suficientes para valorar este {tipo_golpe.lower()}.",
                "puntos_fuertes": [],
                "aspecto_principal": "",
                "tipo_golpe": tipo_golpe,
                **extra,
            },
            "evaluaciones": [],
            "golpes_fases": golpes_fases or [],
            "tipo_golpe": tipo_golpe,
            **extra,
        }

    resumen = _resumen_general(
        evaluaciones,
        tipo_golpe,
        lateralidad=lat,
        estilo_reves=estilo_r,
        estilo_derecha=estilo_d,
    )
    return {
        "resumen_general": resumen,
        "evaluaciones": evaluaciones,
        "golpes_fases": golpes_fases or [],
        "tipo_golpe": tipo_golpe,
        **extra,
    }


generar_feedback_biomecanico = generar_feedback

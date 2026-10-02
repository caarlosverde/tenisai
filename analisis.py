"""
TFG Tenis - Análisis temporal de ángulos articulares (codo y rodillas).
Lee las métricas exportadas por main.py (ya suavizadas) y muestra la evolución.
"""

from pathlib import Path

import matplotlib.pyplot as plt
import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parent
METRICS_CSV_PATH = PROJECT_ROOT / "data" / "metricas_codo.csv"


def main() -> None:
    if not METRICS_CSV_PATH.is_file():
        raise FileNotFoundError(
            f"No se encuentra el CSV de métricas: {METRICS_CSV_PATH}\n"
            "Ejecuta primero main.py para generar data/metricas_codo.csv."
        )

    df = pd.read_csv(METRICS_CSV_PATH)

    required = [
        "Timestamp_ms",
        "Angulo_Codo",
        "Angulo_Rodilla_Der",
        "Angulo_Rodilla_Izq",
    ]
    missing = [col for col in required if col not in df.columns]
    if missing:
        raise ValueError(
            f"El CSV no tiene las columnas esperadas: {missing}. "
            "Vuelve a procesar el vídeo con la versión actualizada de main.py."
        )

    plt.figure(figsize=(11, 5.5))
    plt.plot(
        df["Timestamp_ms"],
        df["Angulo_Codo"],
        color="crimson",
        linewidth=2.0,
        label="Codo derecho",
    )
    plt.plot(
        df["Timestamp_ms"],
        df["Angulo_Rodilla_Der"],
        color="dodgerblue",
        linewidth=2.0,
        label="Rodilla derecha",
    )
    plt.plot(
        df["Timestamp_ms"],
        df["Angulo_Rodilla_Izq"],
        color="mediumseagreen",
        linewidth=2.0,
        label="Rodilla izquierda",
    )

    plt.title("Evolución Biomecánica: Codo y Rodillas (Savitzky-Golay)")
    plt.xlabel("Timestamp (ms)")
    plt.ylabel("Ángulo (°)")
    plt.grid(True, linestyle="--", alpha=0.6)
    plt.legend()
    plt.tight_layout()
    plt.show()


if __name__ == "__main__":
    main()

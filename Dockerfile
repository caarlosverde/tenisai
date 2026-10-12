# TFG Tenis - Backend (FastAPI + MediaPipe + YOLOv8)
FROM python:3.11-slim

# Librerías de sistema que OpenCV necesita en contenedores Linux.
# libgl1 y libglib2.0-0 son obligatorias; libgomp1 lo pide PyTorch.
RUN apt-get update && apt-get install -y --no-install-recommends \
        libgl1 \
        libglib2.0-0 \
        libgomp1 \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    # Ultralytics y matplotlib necesitan directorios de config escribibles
    YOLO_CONFIG_DIR=/tmp/ultralytics \
    MPLCONFIGDIR=/tmp/matplotlib

WORKDIR /app

# PyTorch de CPU: la rueda por defecto arrastra CUDA y multiplica por varios
# GB el tamaño de la imagen, inútil aquí porque no hay GPU NVIDIA.
RUN pip install --no-cache-dir \
        --index-url https://download.pytorch.org/whl/cpu \
        --extra-index-url https://pypi.org/simple \
        torch==2.14.0 torchvision==0.29.0

# Dependencias en capa propia para aprovechar la caché de Docker al cambiar código
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    && pip uninstall -y opencv-contrib-python opencv-python opencv-python-headless \
    && pip install --no-cache-dir --force-reinstall opencv-python-headless==5.0.0.93

# Modelos ya descargados: evita bajarlos en el primer análisis
COPY models/ ./models/

# MediaPipe Tasks carga EGL/GLES al crear el PoseLandmarker, aunque no
# haya GPU. ffmpeg recodifica el mp4v de OpenCV a H.264 para <video> HTML5.
# Capa propia, antes de copiar el código, para no invalidar la caché de pip.
RUN apt-get update && apt-get install -y --no-install-recommends \
        libegl1 \
        libgles2 \
        ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Código del backend
COPY main.py api.py biomecanica.py geometria.py ./

EXPOSE 8000

CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8000"]

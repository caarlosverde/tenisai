import sys
from pathlib import Path

# Los módulos del backend (biomecanica.py, api.py...) están en la raíz del proyecto
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

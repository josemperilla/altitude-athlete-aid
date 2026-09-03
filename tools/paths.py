"""
Dónde viven los datos de trabajo.

En local es `.tmp/` junto al proyecto, como siempre. En Railway el disco del
contenedor se borra en cada deploy, así que api.py exporta DATA_DIR apuntando al
volumen montado y todas las herramientas escriben ahí. Un solo sitio donde
decidirlo evita que unas herramientas escriban en el volumen y otras en el disco
efímero, que es el fallo que dejaría el plan a medias tras un redeploy.
"""
from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).parent.parent

DATA_DIR = Path(os.environ.get("DATA_DIR") or (ROOT / ".tmp"))


def data_dir() -> Path:
    """Crea el directorio la primera vez que alguien lo pide."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    return DATA_DIR


def data_file(name: str) -> Path:
    return data_dir() / name

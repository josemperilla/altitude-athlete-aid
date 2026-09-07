"""Compartido de las pruebas del backend.

Regla de oro: DATA_DIR apunta a un tmp_path ANTES de importar api — nunca se
escribe sobre .tmp/ real ni sobre el volumen de Railway. api.py (y paths.py,
que él arrastra) leen la variable al importarse, así que cada prueba que
necesite un estado inicial distinto importa la app contra su propio
directorio: los módulos se sacan de sys.modules y se re-importan.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parent.parent

# Para poder hacer `import api` y `from paths import data_file` como hace uvicorn.
for p in (str(BACKEND), str(BACKEND / "tools")):
    if p not in sys.path:
        sys.path.insert(0, p)


@pytest.fixture
def make_client(monkeypatch: pytest.MonkeyPatch):
    """Fábrica de TestClient con un DATA_DIR fresco.

    La prueba prepara su tmp_path (por ejemplo, escribiendo un diagnosis.json
    legado) y DESPUÉS llama a la fábrica: el import de api corre la migración
    y los _read contra ese directorio, no contra el .tmp/ de verdad.
    """

    def _make(tmp_path: Path):
        monkeypatch.setenv("DATA_DIR", str(tmp_path))
        # paths.py resuelve DATA_DIR al importarse; sin sacar estos módulos de
        # la caché, un import anterior (la prueba de al lado) dejaría el
        # directorio viejo filtrándose en data_file().
        for name in ("api", "export_gym_plan", "strength_plan", "paths"):
            sys.modules.pop(name, None)
        import api

        from fastapi.testclient import TestClient

        return TestClient(api.app)

    return _make

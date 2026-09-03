"""
Exporta el plan de gimnasio + la semana actual de Runna/ciclismo a
web/public/plan.json, que es lo que consume la app desplegada en Railway.

Se corre al final de run_weekly.sh: después de fetch_garmin y generate_plan, el
JSON queda con las sesiones de carrera reales de la semana, no proyectadas.

Es tolerante a fallos a propósito. La app tiene que abrir en el gimnasio aunque
Garmin esté caído o el plan aumentado no se haya generado: en ese caso exporta
solo el bloque de fuerza, que es estático y siempre sirve.

Usage: .venv/bin/python tools/export_gym_plan.py
"""
from __future__ import annotations

import json
import sys
from datetime import date, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import strength_plan

from paths import data_file

ROOT = Path(__file__).parent.parent
GARMIN_DATA = data_file("garmin_data.json")
PLAN_DATA = data_file("augmented_plan.json")

DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]


def _read(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        print(f"  aviso: no se pudo leer {path.name} ({e}); sigo sin él", file=sys.stderr)
        return {}


def _describe_runna(session: dict) -> str:
    """La descripción de Runna trae el detalle real (ritmos, series). Vale más
    que el título, que solo dice el tipo y la distancia.

    Acepta las dos formas en que llega: anidada en `garmin_workout` (lo que
    escribe fetch_garmin.py) o suelta en la raíz.
    """
    workout = session.get("garmin_workout") or {}
    desc = (workout.get("description") or session.get("description") or "").strip()
    if not desc:
        return ""
    # La primera línea es siempre "Half Marathon Plan (Week N/15)" — sobra aquí.
    lines = [ln.strip() for ln in desc.split("\n") if ln.strip()]
    if lines and lines[0].lower().startswith("half marathon plan"):
        lines = lines[1:]
    return " · ".join(lines)


def build_calendar(garmin: dict, plan: dict) -> list[dict]:
    """
    Un día por entrada, con lo que haya: carrera, bici y/o gimnasio.

    Las sesiones de carrera salen de garmin_data.json y no del plan aumentado:
    fetch_garmin.py lo reescribe cada semana con el calendario real de Runna,
    mientras que augmented_plan.json solo se regenera si la llamada a Claude sale
    bien. Si Claude falla, la app igual muestra la semana de carrera correcta.
    """
    by_date: dict[str, dict] = {}

    def slot(d: str) -> dict:
        if d not in by_date:
            dt = date.fromisoformat(d)
            by_date[d] = {
                "date": d,
                "weekday": DIAS[dt.weekday()],
                "running": [],
                "cycling": [],
                "gym": None,
            }
        return by_date[d]

    for s in garmin.get("weekly_plan", []):
        d = s.get("date")
        if not d:
            continue
        entry = {"name": s.get("name", ""), "detail": _describe_runna(s)}
        key = "cycling" if s.get("sport") == "cycling" else "running"
        slot(d)[key].append(entry)

    for s in plan.get("cycling_sessions", []):
        d = s.get("date")
        if not d:
            continue
        bucket = slot(d)["cycling"]
        name = s.get("name", "Ciclismo")
        # El plan aumentado y el calendario de Garmin pueden traer la misma sesión
        # de bici: generate_plan.build_runna_sessions() incluye el ciclismo ya
        # agendado. Sin esta comprobación salía duplicada en la app.
        if any(b["name"] == name for b in bucket):
            continue
        bucket.append({
            "name": name,
            "detail": f"{s.get('duration_min', '?')} min · {s.get('primary_zone', '')}".strip(" ·"),
        })

    for d, code in strength_plan.gym_dates().items():
        slot(d)["gym"] = code

    return [by_date[d] for d in sorted(by_date)]


def build() -> dict:
    """El plan de gimnasio completo, listo para servir.

    Antes esto escribía web/public/plan.json y la app de gimnasio lo leía como
    archivo estático. Ahora lo sirve el endpoint /gym de api.py, así que el plan
    se refresca al correr run_weekly.sh sin necesidad de redesplegar el frontend.
    """
    garmin = _read(GARMIN_DATA)
    plan = _read(PLAN_DATA)

    out = strength_plan.as_dict()
    out["generated_at"] = datetime.now().isoformat(timespec="seconds")
    out["calendar"] = build_calendar(garmin, plan)
    out["athlete_state"] = plan.get("athlete_state")
    out["week_summary"] = plan.get("week_summary")
    return out


def main() -> None:
    """Vuelca el plan por stdout. Solo para inspeccionarlo a mano; nada lo consume."""
    out = build()

    if not _read(GARMIN_DATA):
        print("  aviso: sin garmin_data.json — el calendario va sin sesiones de carrera", file=sys.stderr)
    if not _read(PLAN_DATA):
        print("  aviso: sin augmented_plan.json — el calendario va sin ciclismo", file=sys.stderr)

    print(json.dumps(out, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()

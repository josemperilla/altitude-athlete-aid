"""
Descarga el plan completo de Runna desde su feed iCalendar → runna_plan.json.

Por qué existe, si fetch_garmin.py ya trae las sesiones de Runna: Garmin solo
recibe unas 2 semanas hacia adelante (aunque se le pidan 60 días), y con eso no
se ve el ciclo — la progresión de la tirada larga, las descargas, el taper, la
fecha de la carrera. El feed trae TODAS las sesiones que faltan, cada una con su
estructura en texto (calentamiento, repeticiones, ritmos, descansos). No trae las
pasadas: el historial real sigue saliendo de Garmin.

La URL del feed es un secreto de solo lectura (quien la tenga ve el plan): vive
en RUNNA_ICS_URL, nunca en el código. Si falta o el feed no responde, el script
avisa y termina bien sin tocar el runna_plan.json anterior — el plan semanal
sigue saliendo sin la vista macro, igual que antes de que existiera esto.

Output: runna_plan.json → {fetched_at, race_date, sessions: [...]}
Usage: .venv/bin/python tools/fetch_runna_plan.py
"""
from __future__ import annotations

import json
import os
import re
import sys
import urllib.request
from datetime import date
from pathlib import Path

from dotenv import load_dotenv

from paths import data_file
from runna_checks import km_in

ROOT = Path(__file__).parent.parent
load_dotenv(ROOT / ".env")

OUTPUT = data_file("runna_plan.json")

# UID: UPCOMING_PLAN_WORKOUT-<planId>_plan_week_<N>_<KIND>_<i>
_UID_RE = re.compile(r"_plan_week_(\d+)_([A-Z][A-Z_]*?)_\d+$")
# SUMMARY: "🏃 1km Repeats • 10km" / "🏋️ Strong Foundation • 55m - 65m"
RUN_EMOJI = "🏃"


def _unfold(text: str) -> str:
    """RFC 5545: una línea larga sigue en la siguiente si esta empieza con espacio."""
    return re.sub(r"\r?\n[ \t]", "", text)


def _unescape(value: str) -> str:
    return (
        value.replace("\\n", "\n").replace("\\N", "\n")
        .replace("\\,", ",").replace("\\;", ";").replace("\\\\", "\\")
    )


def _events(text: str) -> list[dict[str, str]]:
    events = []
    for block in re.findall(r"BEGIN:VEVENT\r?\n(.*?)END:VEVENT", _unfold(text), re.S):
        fields: dict[str, str] = {}
        for line in block.splitlines():
            if ":" in line:
                key, value = line.split(":", 1)
                fields[key.split(";")[0].upper()] = _unescape(value)
        events.append(fields)
    return events


def _parse_date(raw: str) -> str | None:
    digits = re.sub(r"\D", "", raw)[:8]
    try:
        return date(int(digits[:4]), int(digits[4:6]), int(digits[6:8])).isoformat()
    except ValueError:
        return None


def parse_ics(text: str) -> list[dict]:
    """Sesiones del plan, ordenadas por fecha. Ignora lo que no sea una sesión
    planificada (Runna también publica actividades completadas en el feed)."""
    sessions = []
    for ev in _events(text):
        uid = ev.get("UID", "")
        m = _UID_RE.search(uid)
        day = _parse_date(ev.get("DTSTART", ""))
        if not uid.startswith("UPCOMING_PLAN_WORKOUT") or not m or not day:
            continue
        summary = ev.get("SUMMARY", "")
        title, _, measure = summary.partition("•")
        km = km_in(measure)
        # Carrera si lo dice el emoji o trae km. Un rodaje por tiempo ("• 40m")
        # no trae km pero sí el 🏃; clasificarlo como fuerza lo sacaba del volumen
        # semanal y de la regla de sesión pico.
        is_run = summary.lstrip().startswith(RUN_EMOJI) or km is not None
        # La descripción termina con un enlace a la app; no aporta nada al plan.
        description = ev.get("DESCRIPTION", "").split("📲")[0].strip()
        sessions.append({
            "date": day,
            "week": int(m.group(1)),
            "kind": m.group(2),
            "sport": "running" if is_run else "strength",
            # Sin el emoji del principio: "1km Repeats".
            "name": re.sub(r"^[^\w]+", "", title).strip(),
            "distance_km": km,
            "description": description,
        })
    return sorted(sessions, key=lambda s: (s["date"], s["kind"]))


def race_date(sessions: list[dict]) -> str | None:
    races = [s["date"] for s in sessions if s["kind"] == "RACE"]
    return races[-1] if races else None


def main() -> None:
    url = os.environ.get("RUNNA_ICS_URL", "").strip()
    if not url:
        print("RUNNA_ICS_URL no está configurada: se sigue sin el plan completo de Runna.")
        return
    # Runna la entrega como webcal://, que urllib no conoce.
    url = re.sub(r"^webcal://", "https://", url)

    try:
        with urllib.request.urlopen(url, timeout=20) as resp:
            text = resp.read().decode("utf-8")
    except Exception as e:  # red, 404 por token revocado, etc.
        print(f"WARNING: no se pudo descargar el feed de Runna ({type(e).__name__}); "
              "se conserva el runna_plan.json anterior.", file=sys.stderr)
        return

    sessions = parse_ics(text)
    if not sessions:
        print("WARNING: el feed de Runna no trajo sesiones planificadas; "
              "se conserva el runna_plan.json anterior.", file=sys.stderr)
        return

    out = {"fetched_at": date.today().isoformat(), "race_date": race_date(sessions), "sessions": sessions}
    OUTPUT.write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding="utf-8")
    runs = [s for s in sessions if s["sport"] == "running"]
    print(f"Plan de Runna: {len(runs)} carreras y {len(sessions) - len(runs)} de fuerza, "
          f"{sessions[0]['date']} → {sessions[-1]['date']}; carrera: {out['race_date'] or '—'}")
    print(f"Saved → {OUTPUT}")


if __name__ == "__main__":
    main()

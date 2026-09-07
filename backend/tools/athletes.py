"""Fuente única de verdad de cada atleta: carrera objetivo, dónde entrena
y si tiene Garmin o no.

El resto del backend (api.py, export_gym_plan.py, strength_plan.py) importa
de aquí en vez de repetir fechas y nombres. `has_garmin` es el interruptor
explícito de "sin Garmin todavía": decide si un endpoint intenta leer datos
reales o devuelve vacío a propósito.
"""
from __future__ import annotations

from datetime import date

DEFAULT_ATHLETE = "jose"
TRAINING_LOCATION = "Bogotá"
TRAINING_ALTITUDE_M = 2600

RACES = {
    "jose": {
        "name": "Media Maratón del Meta",
        "distance_label": "medio maratón (21.1 km)",
        "race_date": date(2026, 10, 4),
        "race_location": "Villavicencio",
        "race_altitude_m": 467,
        "has_garmin": True,
    },
    "andrea": {
        "name": "Maratón de Chicago",
        "distance_label": "maratón (42.2 km)",
        "race_date": date(2026, 10, 11),
        "race_location": "Chicago",
        "race_altitude_m": 181,
        "has_garmin": False,
    },
}


def resolve_athlete(raw: str | None) -> str:
    """Normaliza cualquier valor de query param a un atleta conocido; nunca falla."""
    if raw and raw.lower() in RACES:
        return raw.lower()
    return DEFAULT_ATHLETE

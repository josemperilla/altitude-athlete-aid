"""Fuente única de verdad del atleta: carrera objetivo, dónde entrena y
composición corporal.

El resto del backend (api.py, generate_plan.py, strength_plan.py, diagnose.py)
importa de aquí en vez de repetir fechas y nombres. La app es de un solo atleta,
José: hasta el 29-sep-2026 tuvo un segundo perfil, que se retiró.
"""
from __future__ import annotations

from datetime import date

TRAINING_LOCATION = "Bogotá"
TRAINING_ALTITUDE_M = 2600

# Hasta el 29-sep-2026 era la Media Maratón del Meta (Villavicencio, 4-oct).
# José la dejó y arrancó en Runna un plan nuevo de 9 semanas hacia este.
RACE = {
    "name": "Medio maratón en Bogotá",
    "distance_label": "medio maratón (21.1 km)",
    "race_date": date(2026, 11, 29),
    # Lunes de la semana 1 del plan de Runna: desde aquí mide la barra de
    # progreso del bloque en Hoy.
    "block_start": date(2026, 9, 28),
    "race_location": "Bogotá",
    "race_altitude_m": 2600,
}


# ── Composición corporal ──────────────────────────────────────────────────────
# Medición real, con fecha, en vez de supuestos repartidos por el código. La guía
# de cargas del gimnasio (src/lib/gym/loads.js) llevaba clavado "un corredor de
# ~70 kg"; con esto se puede decir de dónde sale cada número.
#
# El peso libre de grasa que se registra aquí es peso − grasa (85,3 − 23,3 = 62,0),
# NO el "masa libre de grasa: 57,0" que imprime el informe. Ese 57,0 es la suma de
# los cinco segmentos (dos brazos, tronco, dos piernas) y se deja por fuera la
# cabeza y el cuello, que los cinco electrodos no modelan: por eso los segmentos
# suman 80,3 kg y la báscula marca 85,3. Para escalar cargas manda el de 62,0.
BODY_COMPOSITION = {
    "measured_on": date(2026, 9, 16),
    "source": "bioimpedancia (5 electrodos, 5/50/250 kHz)",
    "height_cm": 172,
    "weight_kg": 85.3,
    "fat_kg": 23.3,
    "fat_pct": 27.3,
    "lean_kg": 62.0,
    "skeletal_muscle_kg": 34.0,
    "appendicular_index": 9.47,   # kg/m² — normal; el umbral de sarcopenia ronda 7,0
    "visceral_fat": 10,           # tope del rango normal (0–10)
    "bmr_kcal": 1909,
    # Magro por segmento. La diferencia entre lados es lo único que puede pedir
    # trabajo correctivo, y aquí no lo pide: 2,3 % en piernas y 1,7 % en brazos,
    # muy por debajo del ~5 % que se suele considerar relevante.
    "lean_segments_kg": {
        "arm_right": 3.59, "arm_left": 3.53,
        "trunk": 29.02,
        "leg_right": 10.56, "leg_left": 10.32,
    },
}


def body_summary() -> str:
    """Una línea de composición corporal para meter en un prompt.

    Lo consume diagnose.py: una molestia de aquiles, rodilla o tibia no se evalúa
    igual en alguien de 85 kg que en alguien de 70, y el dato estaba solo en un PDF.
    """
    b = BODY_COMPOSITION
    return (
        f"Body composition ({b['source']}, measured {b['measured_on'].isoformat()}): "
        f"{b['weight_kg']} kg, {b['height_cm']} cm, {b['fat_pct']}% body fat "
        f"({b['fat_kg']} kg fat, {b['lean_kg']} kg lean mass, "
        f"{b['skeletal_muscle_kg']} kg skeletal muscle). "
        f"Lean mass is normal for their frame (appendicular index {b['appendicular_index']} kg/m²); "
        f"the excess is fat. Relevant because impact load when running scales with total "
        f"bodyweight, not with lean mass."
    )

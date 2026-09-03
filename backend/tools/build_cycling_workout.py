"""
Construye el garmin_workout completo (segments/steps con descripción, FC
objetivo, zonas) a partir de la decisión mínima que devuelve Claude —
{date, type, duration_min, rationale} — y las hr_zones del atleta.

Antes Claude generaba el JSON completo del workout (segments, steps,
descripciones, endCondition, targetType...); ahora solo decide QUÉ tipo de
sesión y CUÁNTO dura, y este módulo arma el resto de forma determinista.
Reduce tokens de salida y elimina la clase de error donde el modelo inventa
un campo que Garmin rechaza.

La salida es el mismo formato "simplificado" que upload_workouts.py ya sabe
enriquecer (ver enrich_workout() en ese archivo) — no cambia el consumidor.
"""

# TIPO A — "Subida a Patios": Calle 104A #21-66 (Bogotá) → Peaje La Calera.
# ~16 km solo de subida, ~680 m de desnivel. Usar con atleta BALANCEADO o
# DESCARGADO; nunca con atleta FATIGADO.
SUBIDA_A_PATIOS = {
    "name": "Subida a Patios",
    "zone_key": "Z2",
    "route_desc": (
        "Ruta: Calle 104A #21-66 (Bogotá) → Peaje La Calera. "
        "Distancia solo subida: ~16 km. Desnivel positivo: ~680 m."
    ),
    "warmup_min": 10,
    "warmup_desc": "Pedalea suave desde casa en plano",
    "cooldown_frac": 0.17,  # de la duración total, dentro de [15,20] min
    "cooldown_range": (15, 20),
    "cooldown_desc": "Baja controlado, sin esfuerzo",
    "main_desc": "Ritmo constante y controlado en la subida",
}

# TIPO B — "Ciclorruta en plano": salida libre por ciclorrutas planas de
# Bogotá. Siempre Z1 — recuperación activa o atleta FATIGADO.
CICLORRUTA_EN_PLANO = {
    "name": "Ciclorruta en plano",
    "zone_key": "Z1",
    "route_desc": "Ruta: ciclorrutas planas de Bogotá, salida libre desde casa. Terreno plano, sin desnivel significativo.",
    "warmup_min": None,  # proporcional, ver warmup_frac
    "warmup_frac": 0.15,
    "warmup_range": (5, 10),
    "warmup_desc": "Pedaleo suave hasta encontrar ritmo",
    "cooldown_frac": 0.15,
    "cooldown_range": (5, 10),
    "cooldown_desc": "Reduce cadencia gradualmente",
    "main_desc": "Ritmo conversacional, sin superar Z1",
}

TYPES = {"subida_a_patios": SUBIDA_A_PATIOS, "ciclorruta_en_plano": CICLORRUTA_EN_PLANO}


def _clamp(v: float, lo: float, hi: float) -> int:
    return int(round(min(max(v, lo), hi)))


def _zone_range(hr_zones: dict, key: str) -> tuple[int, int] | None:
    z = (hr_zones or {}).get(key) or {}
    lo, hi = z.get("min"), z.get("max")
    if isinstance(lo, (int, float)) and isinstance(hi, (int, float)):
        return int(lo), int(hi)
    return None


def _hr_step(minutes: int, description: str, zone_range: tuple[int, int] | None, order: int) -> dict:
    step = {
        "stepOrder": order,
        "stepType": {"stepTypeKey": "warmup" if order == 1 else "interval"},
        "description": description,
        "endCondition": {"conditionTypeKey": "time"},
        "endConditionValue": minutes * 60,
    }
    if zone_range:
        step["targetType"] = {"workoutTargetTypeKey": "heart.rate.zone"}
        step["targetValueOne"], step["targetValueTwo"] = zone_range
    else:
        step["targetType"] = {"workoutTargetTypeKey": "no.target"}
    return step


def build(session: dict, hr_zones: dict) -> dict:
    """
    session: {"date", "type", "duration_min", "rationale"} — la decisión de Claude.
    Devuelve {"name", "garmin_workout", "primary_zone"} listo para
    fusionar en la sesión final.
    """
    spec = TYPES.get(session.get("type"))
    if spec is None:
        raise ValueError(f"Tipo de ciclismo desconocido: {session.get('type')!r}")

    duration = session.get("duration_min")
    if not isinstance(duration, (int, float)) or duration <= 0:
        raise ValueError(f"duration_min inválido: {duration!r}")
    duration = int(duration)

    if spec.get("warmup_min") is not None:
        warmup = spec["warmup_min"]
    else:
        warmup = _clamp(duration * spec["warmup_frac"], *spec["warmup_range"])
    cooldown = _clamp(duration * spec["cooldown_frac"], *spec["cooldown_range"])
    main = max(duration - warmup - cooldown, 5)

    z1 = _zone_range(hr_zones, "Z1")
    z_main = _zone_range(hr_zones, spec["zone_key"])

    steps = [
        _hr_step(warmup, f"{warmup} min | {spec['warmup_desc']}" + (f" | FC: {z1[0]}–{z1[1]} bpm (Z1)" if z1 else ""), z1, 1),
        {
            **_hr_step(main, f"{main} min | {spec['main_desc']}" + (f" | FC: {z_main[0]}–{z_main[1]} bpm ({spec['zone_key']})" if z_main else ""), z_main, 2),
            "stepType": {"stepTypeKey": "interval"},
        },
        {
            **_hr_step(cooldown, f"{cooldown} min | {spec['cooldown_desc']}" + (f" | FC: {z1[0]}–{z1[1]} bpm (Z1)" if z1 else ""), z1, 3),
            "stepType": {"stepTypeKey": "cooldown"},
        },
    ]

    description = f"{spec['route_desc']} Objetivo: {session.get('rationale', '')}"

    garmin_workout = {
        "workoutName": spec["name"],
        "description": description,
        "sportType": {"sportTypeId": 2, "sportTypeKey": "cycling"},
        "workoutSegments": [
            {
                "segmentOrder": 1,
                "sportType": {"sportTypeId": 2, "sportTypeKey": "cycling"},
                "workoutSteps": steps,
            }
        ],
    }

    return {"name": spec["name"], "garmin_workout": garmin_workout, "primary_zone": spec["zone_key"]}

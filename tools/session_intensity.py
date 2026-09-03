"""
Clasifica la intensidad real de una sesión de Runna a partir de su
garmin_workout (pasos, zonas, repeticiones) o, si no hay detalle, del texto
del nombre. Es un puerto a Python de la misma lógica que ya usa el frontend en
altitude-athlete-aid/src/lib/workout-steps.ts y spotify-intensity.ts, para que
generate_plan.py pueda pasarle a Claude una señal real de qué sesiones son
intensas — sin esa señal es imposible cumplir la regla "nunca ciclismo el día
de una sesión intensa de Runna", porque el nombre solo no lo dice.

Los workouts de Runna en Garmin describen esfuerzo por RITMO (pace.zone), no
por FC, así que casi nunca hay zona de pulso legible — eso es esperado, no un
bug: se cae al texto y a la estructura (repeticiones) como señal.
"""
import re

# ── Lectura de pasos (igual que workout-steps.ts) ──────────────────────────


def _extract_steps(item: dict) -> list[dict]:
    """Pasos aplanados a nivel de segmento — sin recursar dentro de un 'repeat'."""
    workout = item.get("garmin_workout") or {}
    segments = workout.get("workoutSegments") or []
    steps = []
    for seg in segments:
        steps.extend(seg.get("workoutSteps") or [])
    return steps


def _step_type_key(step: dict) -> str:
    t = step.get("stepType")
    if isinstance(t, dict):
        return str(t.get("stepTypeKey") or "").lower()
    return str(t or "").lower()


def _zone_from_bpm(max_bpm: float) -> int:
    """Umbrales de FC en altitud (Bogotá, 2.600 m) — igual que zoneFromBpm()."""
    if max_bpm > 165:
        return 5
    if max_bpm > 145:
        return 4
    if max_bpm > 125:
        return 3
    return 2 if max_bpm > 110 else 1


_ZONE_RANGE_RE = re.compile(r"z\s?([1-5])\s?[/-]\s?z?\s?([1-5])", re.I)
_ZONE_SINGLE_RE = re.compile(r"\bz\s?([1-5])\b", re.I)
_BPM_RANGE_RE = re.compile(r"(\d{2,3})\s?[–-]\s?(\d{2,3})\s*bpm", re.I)


def _step_max_zone(step: dict) -> int | None:
    """Zona máxima que exige un paso — misma prioridad que stepMaxZone()."""
    desc = str(step.get("description") or "")
    m = _ZONE_RANGE_RE.search(desc)
    if m:
        return max(int(m.group(1)), int(m.group(2)))
    m = _ZONE_SINGLE_RE.search(desc)
    if m:
        return int(m.group(1))

    target_type = step.get("targetType") or {}
    is_heart_rate = "heart" in str(target_type.get("workoutTargetTypeKey") or "").lower() and "rate" in str(
        target_type.get("workoutTargetTypeKey") or ""
    ).lower()
    hi = step.get("targetValueTwo")
    if is_heart_rate and isinstance(hi, (int, float)) and hi > 0:
        return _zone_from_bpm(hi)

    m = _BPM_RANGE_RE.search(desc)
    return _zone_from_bpm(float(m.group(2))) if m else None


def _level_from_steps(steps: list[dict]) -> str | None:
    """Misma lógica que levelFromSteps(): zona de los pasos > repetición real."""
    if not steps:
        return None

    body = [s for s in steps if not re.search(r"warmup|cooldown|rest|recovery", _step_type_key(s))]
    zones = [z for z in (_step_max_zone(s) for s in body) if z is not None]

    if zones:
        m = max(zones)
        return "alta" if m >= 4 else "moderada" if m >= 2 else "baja"

    has_real_repeat = any(
        _step_type_key(s) == "repeat" and isinstance(s.get("numberOfIterations"), (int, float)) and s["numberOfIterations"] > 1
        for s in body
    )
    if has_real_repeat:
        return "alta"

    if all(not _step_type_key(s) or re.search(r"warmup|cooldown|rest|recovery", _step_type_key(s)) for s in steps):
        return "baja"
    return None


_TEXT_ALTA_RE = re.compile(
    r"interval|repeat|vo2|series|sprint|strides?|fartlek|hill|subida|cuestas|fast\b", re.I
)
_TEXT_MODERADA_LARGO_RE = re.compile(r"long run|largo\b|salida larga|endurance|resistencia", re.I)
_TEXT_ALTA_TEMPO_RE = re.compile(
    r"tempo|threshold|umbral|progresivo|steady|race practice|marathon pace", re.I
)
_TEXT_BAJA_RE = re.compile(
    r"easy|recuperaci[oó]n|recovery|regenerativ|conversacional|suave|rodaje", re.I
)
_TEXT_MODERADA_AEROBICO_RE = re.compile(r"aer[oó]bico", re.I)


def _level_from_text(text: str) -> str | None:
    """Misma lógica que levelFromText(), de más específico a más genérico."""
    if _TEXT_ALTA_RE.search(text):
        return "alta"
    if _TEXT_MODERADA_LARGO_RE.search(text):
        return "moderada"
    if _TEXT_ALTA_TEMPO_RE.search(text):
        return "alta"
    if _TEXT_BAJA_RE.search(text):
        return "baja"
    if _TEXT_MODERADA_AEROBICO_RE.search(text):
        return "moderada"
    return None


# ── Estructura resumida (nuevo — no existe en el frontend) ─────────────────


def _step_measure(step: dict) -> str | None:
    """Distancia o mm:ss de un paso — igual que stepMeasure()."""
    value = step.get("endConditionValue")
    if not isinstance(value, (int, float)) or value <= 0:
        return None
    cond = step.get("endCondition") or {}
    key = str(cond.get("conditionTypeKey") or "").lower()
    if "distance" in key:
        km = value / 1000
        return f"{km:.2f}".rstrip("0").rstrip(".") + "km" if km >= 1 else f"{round(value)}m"
    if "lap" in key or "iteration" in key:
        return None
    total = round(value)
    return f"{total // 60}:{total % 60:02d}"


def _describe_step(step: dict) -> str | None:
    key = _step_type_key(step)
    if key == "repeat":
        n = step.get("numberOfIterations")
        if not isinstance(n, (int, float)) or n <= 0:
            return None
        children = step.get("workoutSteps") or []
        parts = []
        for c in children:
            ck = _step_type_key(c)
            if "rest" in ck or "recovery" in ck:
                continue
            m = _step_measure(c)
            if m and m not in parts:
                parts.append(m)
        body = " + ".join(parts)
        return f"{int(n)}× ({body})" if body else f"{int(n)}× repeticiones"
    if "warmup" in key:
        m = _step_measure(step)
        return f"calentamiento {m}" if m else "calentamiento"
    if "cooldown" in key:
        m = _step_measure(step)
        return f"enfriamiento {m}" if m else "enfriamiento"
    if "rest" in key or "recovery" in key:
        return None
    return _step_measure(step)


def _estimate_step_seconds(step: dict) -> float:
    """Duración de un paso; para pasos por distancia, estima con el ritmo objetivo."""
    cond = str((step.get("endCondition") or {}).get("conditionTypeKey") or "").lower()
    value = step.get("endConditionValue")
    if not isinstance(value, (int, float)) or value <= 0:
        return 0.0
    if "time" in cond:
        return float(value)
    if "distance" in cond:
        target_type = str((step.get("targetType") or {}).get("workoutTargetTypeKey") or "").lower()
        v1, v2 = step.get("targetValueOne"), step.get("targetValueTwo")
        if "pace" in target_type and isinstance(v1, (int, float)) and isinstance(v2, (int, float)):
            avg_speed = (v1 + v2) / 2  # m/s
            if avg_speed > 0:
                return value / avg_speed
        return value / 2.78  # ritmo conversacional ~6 min/km, de respaldo
    return 0.0


def _total_minutes(steps: list[dict]) -> int:
    total = 0.0
    for step in steps:
        key = _step_type_key(step)
        if key == "repeat":
            n = step.get("numberOfIterations") or 0
            children = step.get("workoutSteps") or []
            total += n * sum(_estimate_step_seconds(c) for c in children)
        else:
            total += _estimate_step_seconds(step)
    return round(total / 60)


# ── Entrada pública ──────────────────────────────────────────────────────────


def summarise_session(item: dict) -> dict:
    """
    Devuelve {intensity, max_zone, duration_min, structure} para una sesión de
    weekly_plan. Tolerante: si no hay garmin_workout, clasifica solo por texto
    y deja duration_min/structure en None.
    """
    text = " ".join(
        filter(None, [item.get("name"), (item.get("garmin_workout") or {}).get("description")])
    )
    steps = _extract_steps(item)

    level = _level_from_steps(steps) or _level_from_text(text) or "moderada"
    specified = _level_from_steps(steps) is not None or _level_from_text(text) is not None

    max_zone = None
    if steps:
        body = [s for s in steps if not re.search(r"warmup|cooldown|rest|recovery", _step_type_key(s))]
        zones = [z for z in (_step_max_zone(s) for s in body) if z is not None]
        max_zone = max(zones) if zones else None

    structure = " + ".join(filter(None, (_describe_step(s) for s in steps))) if steps else None

    return {
        "intensity": level if specified else None,
        "max_zone": max_zone,
        "duration_min": _total_minutes(steps) if steps else None,
        "structure": structure,
    }

"""
Aplica un ajuste estructurado a un workout de Runna y devuelve un workout nuevo,
listo para subir a Garmin como «Ajustado · <nombre>».

El de Runna no se toca: Runna es dueño de sus workouts y los vuelve a mandar
cuando sincroniza, así que editarlo sería pelear con él. El ajustado va al lado,
el mismo día, y upload_workouts.py lo borra y lo vuelve a crear en cada
actualización: si el ajuste desaparece, desaparece también del reloj.

El modelo no escribe workouts: devuelve operaciones acotadas (`ops`) y el código
las aplica sobre la estructura real que Runna mandó a Garmin (pasos, ritmos,
repeticiones), que fetch_garmin.py ya descarga.

  {"op": "set_distance_km", "km": 18.5}   recorta/estira los pasos por distancia
                                          fuera de las repeticiones
  {"op": "set_reps", "reps": 4}           repeticiones del primer bloque
  {"op": "hr_cap", "bpm": 160}            cambia ritmo por FC con ese techo
  {"op": "easy_run", "km": 8, "bpm": 150} reemplaza todo por un rodaje Z1
"""
from __future__ import annotations

import copy

from upload_workouts import ADJUSTED_PREFIX as PREFIX
from upload_workouts import SPORT_TYPES, TARGET_TYPES, enrich_workout

# Rangos sanos: lo que quede por fuera es un error del modelo, no un ajuste.
_LIMITS = {"km": (2.0, 30.0), "reps": (1, 20), "bpm": (100, 200)}
_OP_FIELDS = {
    "set_distance_km": ("km",),
    "set_reps": ("reps",),
    "hr_cap": ("bpm",),
    "easy_run": ("km",),  # bpm opcional: si falta, el techo de Z2
}


def clean_ops(raw: object) -> list[dict]:
    """Solo las operaciones conocidas, con números dentro de rango."""
    out = []
    for op in raw if isinstance(raw, list) else []:
        if not isinstance(op, dict) or op.get("op") not in _OP_FIELDS:
            continue
        clean = {"op": op["op"]}
        ok = True
        for field in (*_OP_FIELDS[op["op"]], "bpm"):
            value = op.get(field)
            if value is None and field not in _OP_FIELDS[op["op"]]:
                continue  # opcional y ausente
            lo, hi = _LIMITS[field]
            if not isinstance(value, (int, float)) or not lo <= value <= hi:
                ok = False
                break
            clean[field] = int(value) if field in ("reps", "bpm") else round(float(value), 1)
        if ok:
            out.append(clean)
    return out


# ── Recorrido de pasos ────────────────────────────────────────────────────────


def _steps(workout: dict) -> list[dict]:
    return [st for seg in workout.get("workoutSegments") or [] for st in seg.get("workoutSteps") or []]


def _is_repeat(step: dict) -> bool:
    return step.get("type") == "RepeatGroupDTO" or (step.get("stepType") or {}).get("stepTypeKey") == "repeat"


def _is_rest(step: dict) -> bool:
    return (step.get("stepType") or {}).get("stepTypeKey") in ("rest", "recover", "recovery")


def _is_distance(step: dict) -> bool:
    return (step.get("endCondition") or {}).get("conditionTypeKey") == "distance"


def _walk(steps: list[dict]):
    for st in steps:
        yield st
        yield from _walk(st.get("workoutSteps") or [])


# ── Operaciones ───────────────────────────────────────────────────────────────


def _set_distance_km(workout: dict, km: float) -> bool:
    """Lleva la distancia total a `km` escalando los pasos por distancia que están
    fuera de las repeticiones (calentamiento, bloques continuos, enfriamiento).
    Las series no se tocan: para eso está set_reps."""
    top = _steps(workout)
    free = [st for st in top if not _is_repeat(st) and _is_distance(st)]
    if not free:
        return False
    in_reps = sum(
        (st.get("numberOfIterations") or 1)
        * sum(c.get("endConditionValue") or 0 for c in st.get("workoutSteps") or [] if _is_distance(c))
        for st in top if _is_repeat(st)
    )
    free_total = sum(st.get("endConditionValue") or 0 for st in free)
    # Nunca un paso de menos de 500 m: si las series ya se comen el objetivo,
    # los pasos libres quedan en su mínimo y el recorte es lo que alcance.
    target_free = max(km * 1000 - in_reps, 500 * len(free))
    factor = target_free / free_total
    for st in free:
        st["endConditionValue"] = max(round(st["endConditionValue"] * factor / 100) * 100, 500)
    return True


def _set_reps(workout: dict, reps: int) -> bool:
    for st in _steps(workout):
        if _is_repeat(st):
            st["numberOfIterations"] = reps
            if (st.get("endCondition") or {}).get("conditionTypeKey") == "iterations":
                st["endConditionValue"] = float(reps)
            return True
    return False


def _hr_cap(workout: dict, bpm: int, floor: int) -> bool:
    """Cambia el objetivo de cada paso activo a FC entre `floor` y `bpm`. En
    altitud el ritmo de Runna puede sacar un rodaje de Z1 o una serie por encima
    del umbral; la FC mide el estímulo que se busca."""
    changed = False
    for st in _walk(_steps(workout)):
        if _is_repeat(st) or _is_rest(st):
            continue
        st["targetType"] = dict(TARGET_TYPES["heart.rate.zone"])
        st["targetValueOne"] = float(floor)
        st["targetValueTwo"] = float(bpm)
        st["zoneNumber"] = None
        desc = (st.get("description") or "").strip()
        st["description"] = f"{desc} · FC ≤ {bpm}".strip(" ·")
        changed = True
    return changed


def _easy_run(name: str, km: float, bpm: int, floor: int) -> dict:
    raw = {
        "workoutName": name,
        "sportType": {"sportTypeKey": "running"},
        "workoutSegments": [{
            "sportType": {"sportTypeKey": "running"},
            "workoutSteps": [{
                "stepType": {"stepTypeKey": "interval"},
                "endCondition": {"conditionTypeKey": "distance"},
                "endConditionValue": km * 1000,
                "targetType": {"workoutTargetTypeKey": "heart.rate.zone"},
                "targetValueOne": floor,
                "targetValueTwo": bpm,
                "description": f"{km:g} km suaves · FC ≤ {bpm}",
            }],
        }],
    }
    payload = enrich_workout(raw)
    # enrich_workout suma endConditionValue como segundos (piensa en ciclismo por
    # tiempo); para un paso por distancia ese número sería falso.
    payload["estimatedDurationInSecs"] = None
    return payload


# ── Entrada pública ───────────────────────────────────────────────────────────


def _zone(hr_zones: dict, key: str, bound: str) -> int | None:
    value = (hr_zones.get(key) or {}).get(bound)
    return int(value) if isinstance(value, (int, float)) else None


def build(session: dict, adjustment: dict, hr_zones: dict) -> dict | None:
    """El payload de Garmin del workout ajustado, o None si no hay nada aplicable
    (sin ops, sin workout de Runna descargado, o ninguna op encajó)."""
    ops = clean_ops(adjustment.get("ops"))
    runna = session.get("garmin_workout")
    if not ops or not isinstance(runna, dict):
        return None

    name = f"{PREFIX}{session.get('name') or runna.get('workoutName') or 'Carrera'}"[:80]
    floor = _zone(hr_zones, "Z1", "min") or 100
    description = f"{adjustment.get('change', '')} — Runna: {runna.get('workoutName', '')}".strip(" —")

    easy = next((op for op in ops if op["op"] == "easy_run"), None)
    if easy:
        bpm = easy.get("bpm") or _zone(hr_zones, "Z2", "max") or 150
        payload = _easy_run(name, easy["km"], bpm, min(floor, bpm - 10))
        payload["description"] = description
        return payload

    # Mismos campos de primer nivel que enrich_workout (los del ciclismo, que
    # Garmin ya acepta cada semana); los pasos se copian de Runna tal cual.
    workout = {
        "workoutName": name,
        "description": description,
        "sportType": dict(SPORT_TYPES["running"]),
        "subSportType": None,
        "trainingPlanId": None,
        "estimatedDurationInSecs": None,
        "estimatedDistanceInMeters": None,
        "workoutSegments": copy.deepcopy(runna.get("workoutSegments") or []),
        "poolLength": None,
        "poolLengthUnit": None,
        "locale": None,
        "avgTrainingSpeed": 0.0,
        "estimateType": None,
        "estimatedDistanceUnit": {"unitId": None, "unitKey": None, "factor": None},
        "workoutThumbnailUrl": None,
        "isSessionTransitionEnabled": None,
        "shared": False,
    }
    applied = False
    for op in ops:
        if op["op"] == "set_distance_km":
            applied |= _set_distance_km(workout, op["km"])
        elif op["op"] == "set_reps":
            applied |= _set_reps(workout, op["reps"])
        elif op["op"] == "hr_cap":
            applied |= _hr_cap(workout, op["bpm"], min(floor, op["bpm"] - 10))
    if not applied:
        return None

    # Workout nuevo: sin los ids del de Runna, o Garmin lo trataría como el mismo.
    for st in _walk(_steps(workout)):
        st["stepId"] = None
    for seg in workout["workoutSegments"]:
        seg.pop("segmentId", None)
    return workout

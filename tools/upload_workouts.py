"""
Uploads cycling workout JSONs from .tmp/workouts/ to Garmin Connect and schedules
them on their target dates. Completed workouts sync to Garmin → Runna reads them.

Usage:
  python tools/upload_workouts.py           # upload & schedule
  python tools/upload_workouts.py --dry-run # preview only
"""
import json
import os
import sys
import time
import argparse
from pathlib import Path

import garminconnect
from dotenv import load_dotenv

ROOT = Path(__file__).parent.parent
load_dotenv(ROOT / ".env")
WORKOUTS_DIR = ROOT / ".tmp" / "workouts"

# ── Garmin API lookup tables ───────────────────────────────────────────────────
STEP_TYPES = {
    "warmup":   {"stepTypeId": 1, "stepTypeKey": "warmup",   "displayOrder": 1},
    "cooldown": {"stepTypeId": 2, "stepTypeKey": "cooldown",  "displayOrder": 2},
    "interval": {"stepTypeId": 3, "stepTypeKey": "interval",  "displayOrder": 3},
    "rest":     {"stepTypeId": 4, "stepTypeKey": "rest",      "displayOrder": 4},
    "recover":  {"stepTypeId": 5, "stepTypeKey": "recover",   "displayOrder": 5},
}
CONDITION_TYPES = {
    "lap.button": {"conditionTypeId": 1, "conditionTypeKey": "lap.button", "displayOrder": 1, "displayable": False},
    "time":       {"conditionTypeId": 2, "conditionTypeKey": "time",       "displayOrder": 2, "displayable": True},
    "distance":   {"conditionTypeId": 3, "conditionTypeKey": "distance",   "displayOrder": 3, "displayable": True},
    "calories":   {"conditionTypeId": 4, "conditionTypeKey": "calories",   "displayOrder": 4, "displayable": True},
    "heart.rate": {"conditionTypeId": 5, "conditionTypeKey": "heart.rate", "displayOrder": 5, "displayable": True},
}
TARGET_TYPES = {
    "no.target":       {"workoutTargetTypeId": 1, "workoutTargetTypeKey": "no.target",       "displayOrder": 1},
    "power.zone":      {"workoutTargetTypeId": 2, "workoutTargetTypeKey": "power.zone",      "displayOrder": 2},
    "cadence.zone":    {"workoutTargetTypeId": 3, "workoutTargetTypeKey": "cadence.zone",    "displayOrder": 3},
    "heart.rate.zone": {"workoutTargetTypeId": 4, "workoutTargetTypeKey": "heart.rate.zone", "displayOrder": 4},
    "speed.zone":      {"workoutTargetTypeId": 5, "workoutTargetTypeKey": "speed.zone",      "displayOrder": 5},
    "pace.zone":       {"workoutTargetTypeId": 6, "workoutTargetTypeKey": "pace.zone",       "displayOrder": 6},
}
SPORT_TYPES = {
    "cycling": {"sportTypeId": 2, "sportTypeKey": "cycling", "displayOrder": 2},
    "running": {"sportTypeId": 1, "sportTypeKey": "running", "displayOrder": 1},
}
NULL_FIELDS = {
    "childStepId": None, "description": None, "endConditionCompare": None,
    "targetValueUnit": None, "zoneNumber": None,
    "secondaryTargetType": None, "secondaryTargetValueOne": None,
    "secondaryTargetValueTwo": None, "secondaryTargetValueUnit": None,
    "secondaryZoneNumber": None, "endConditionZone": None,
    "strokeType": {"strokeTypeId": 0, "strokeTypeKey": None, "displayOrder": 0},
    "equipmentType": {"equipmentTypeId": 0, "equipmentTypeKey": None, "displayOrder": 0},
    "category": None, "exerciseName": None, "workoutProvider": None,
    "providerExerciseSourceId": None, "weightValue": None, "weightUnit": None,
    "preferredEndConditionUnit": None,
}


def enrich_workout(raw: dict) -> dict:
    """
    Transform the simplified workout JSON Claude generates into the full
    format the Garmin Connect API requires (with numeric IDs, displayOrders, etc).
    """
    sport_key = raw.get("sportType", {}).get("sportTypeKey", "cycling")
    sport_type = SPORT_TYPES.get(sport_key, SPORT_TYPES["cycling"])

    enriched_segments = []
    for seg in raw.get("workoutSegments", []):
        seg_sport_key = seg.get("sportType", {}).get("sportTypeKey", sport_key)
        seg_sport = SPORT_TYPES.get(seg_sport_key, sport_type)

        enriched_steps = []
        for i, step in enumerate(seg.get("workoutSteps", []), start=1):
            step_key = step.get("stepType", {}).get("stepTypeKey", "interval")
            cond_key = step.get("endCondition", {}).get("conditionTypeKey", "time")
            tgt_key  = step.get("targetType", {}).get("workoutTargetTypeKey", "no.target")

            enriched_step = {
                "type": "ExecutableStepDTO",
                "stepId": None,
                "stepOrder": step.get("stepOrder", i),
                "stepType": STEP_TYPES.get(step_key, STEP_TYPES["interval"]),
                "description": step.get("description"),
                "endCondition": CONDITION_TYPES.get(cond_key, CONDITION_TYPES["time"]),
                "endConditionValue": step.get("endConditionValue"),
                "targetType": TARGET_TYPES.get(tgt_key, TARGET_TYPES["no.target"]),
                "targetValueOne": step.get("targetValueOne"),
                "targetValueTwo": step.get("targetValueTwo"),
                **{k: v for k, v in NULL_FIELDS.items() if k != "description"},
            }
            enriched_steps.append(enriched_step)

        enriched_segments.append({
            "segmentOrder": seg.get("segmentOrder", 1),
            "sportType": seg_sport,
            "poolLengthUnit": None,
            "poolLength": None,
            "avgTrainingSpeed": None,
            "estimatedDurationInSecs": None,
            "estimatedDistanceInMeters": None,
            "estimatedDistanceUnit": None,
            "estimateType": None,
            "description": None,
            "workoutSteps": enriched_steps,
        })

    return {
        "workoutName": raw.get("workoutName", "Ciclismo"),
        "description": raw.get("description", ""),
        "sportType": sport_type,
        "subSportType": None,
        "trainingPlanId": None,
        "estimatedDurationInSecs": sum(
            s.get("endConditionValue", 0) or 0
            for seg in raw.get("workoutSegments", [])
            for s in seg.get("workoutSteps", [])
        ) or None,
        "estimatedDistanceInMeters": None,
        "workoutSegments": enriched_segments,
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


def login() -> garminconnect.Garmin:
    email    = os.environ.get("GARMIN_EMAIL")
    password = os.environ.get("GARMIN_PASSWORD")
    if not email or not password:
        print("ERROR: GARMIN_EMAIL y GARMIN_PASSWORD deben estar en .env", file=sys.stderr)
        sys.exit(1)
    client = garminconnect.Garmin(email, password)
    client.login()
    return client


def _fetch_calendar_months(client: garminconnect.Garmin, num_months: int = 3) -> list[dict]:
    """
    OPT-3: Fetch calendar data ONCE and return all items.
    Shared between cleanup and running-date detection — eliminates duplicate fetches.
    """
    from datetime import date
    all_items = []
    today = date.today()
    for offset in range(num_months):
        m = (today.month - 1 + offset) % 12 + 1
        y = today.year + (today.month - 1 + offset) // 12
        try:
            cal = client.get_scheduled_workouts(y, m)
            all_items.extend(cal.get("calendarItems", []))
        except Exception:
            pass
    return all_items


def delete_our_cycling_workouts(client: garminconnect.Garmin,
                                dry_run: bool,
                                calendar_items: list[dict]) -> set[str]:
    """
    Delete all cycling workouts we uploaded. Returns set of running dates
    extracted from the same calendar fetch — no extra API calls needed.
    """
    print("Limpiando workouts de ciclismo anteriores...")
    workouts = client.get_workouts(0, 100)
    deleted_ids = set()

    for w in workouts:
        sport = w.get("sportType", {}).get("sportTypeKey", "")
        if sport == "cycling" and w.get("workoutProvider") != "Runna":
            wid = w["workoutId"]
            if dry_run:
                print(f"  [DRY RUN] Borraría: {w['workoutName']} (id={wid})")
                deleted_ids.add(wid)
            else:
                try:
                    client.delete_workout(wid)
                    print(f"  ✓ Borrado: {w['workoutName']} (id={wid})")
                    deleted_ids.add(wid)
                except Exception as e:
                    print(f"  Error borrando {wid}: {e}", file=sys.stderr)

    # Unschedule orphaned calendar entries using already-fetched items
    for item in calendar_items:
        if item.get("sportTypeKey") == "cycling" and item.get("workoutId") not in deleted_ids:
            sid = item["id"]
            if dry_run:
                print(f"  [DRY RUN] Desprogramaría: {item.get('title')} el {item.get('date')}")
            else:
                try:
                    client.unschedule_workout(sid)
                    print(f"  ✓ Desprogramado: {item.get('title')} el {item.get('date')}")
                except Exception as e:
                    print(f"  Error desprogramando {sid}: {e}", file=sys.stderr)


def extract_running_dates(calendar_items: list[dict]) -> set[str]:
    """Extract running session dates from already-fetched calendar items."""
    return {
        item["date"][:10]
        for item in calendar_items
        if item.get("sportTypeKey") == "running" and item.get("date")
    }


def upload_and_schedule(client: garminconnect.Garmin, workout_path: Path,
                        dry_run: bool, running_dates: set[str]):
    raw      = json.loads(workout_path.read_text(encoding="utf-8"))
    payload  = enrich_workout(raw)
    name     = payload["workoutName"]
    date_str = workout_path.stem[:10]

    # Hard block: never put cycling on a day with running
    if date_str in running_dates:
        print(f"  ⛔ SALTADO: {name} el {date_str} — ese día ya tiene carrera de Runna.")
        return

    if dry_run:
        print(f"  [DRY RUN] Subiría: {name} → programado el {date_str}")
        return

    try:
        response   = client.upload_workout(payload)
        workout_id = response.get("workoutId")
        if not workout_id:
            print(f"  ERROR: Garmin no devolvió workoutId para '{name}'", file=sys.stderr)
            return
        print(f"  ✓ Subido: {name} (id={workout_id})")

        client.schedule_workout(workout_id, date_str)
        print(f"  ✓ Programado: {date_str}")

    except garminconnect.GarminConnectConnectionError as e:
        print(f"  ERROR de conexión para '{name}': {e}", file=sys.stderr)
    except Exception as e:
        print(f"  ERROR para '{name}': {e}", file=sys.stderr)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Preview sin subir")
    args = parser.parse_args()

    workout_files = sorted(WORKOUTS_DIR.glob("*_cycling.json"))
    if not workout_files:
        print(f"No hay workouts en {WORKOUTS_DIR}. Ejecuta tools/generate_plan.py primero.")
        sys.exit(0)

    print("Conectando a Garmin Connect...")
    client = login() if not args.dry_run else None
    if not args.dry_run:
        print("Conectado.\n")

    # Always clean previous uploads first to avoid duplicates
    real_client = client or login()

    # OPT-3: Single calendar fetch shared by cleanup + running-date check
    print("Leyendo calendario de Garmin...")
    calendar_items = _fetch_calendar_months(real_client)
    running_dates  = extract_running_dates(calendar_items)
    if running_dates:
        print(f"  → Días con running: {sorted(running_dates)}")

    delete_our_cycling_workouts(real_client, args.dry_run, calendar_items)
    print()

    print(f"Subiendo {len(workout_files)} workout(s) de ciclismo...")
    for wf in workout_files:
        print(f"\nProcesando: {wf.name}")
        upload_and_schedule(real_client, wf, args.dry_run, running_dates)

    print("\nListo. Sincroniza tu reloj Garmin para ver los workouts en Runna.")


if __name__ == "__main__":
    main()

"""
Fetches all required training and health data from Garmin Connect.
Output: .tmp/garmin_data.json

Opt-1: Health series fetched in parallel (ThreadPoolExecutor) — 63 sequential
        API calls reduced to ~5s concurrent batches.
"""
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, timedelta
from pathlib import Path

from dotenv import load_dotenv
import garminconnect
from garminconnect import GarminConnectTooManyRequestsError

ROOT = Path(__file__).parent.parent
load_dotenv(ROOT / ".env")

OUTPUT = ROOT / ".tmp" / "garmin_data.json"


def login() -> garminconnect.Garmin:
    email = os.environ.get("GARMIN_EMAIL")
    password = os.environ.get("GARMIN_PASSWORD")
    if not email or not password:
        print("ERROR: GARMIN_EMAIL and GARMIN_PASSWORD must be set in .env", file=sys.stderr)
        sys.exit(1)
    client = garminconnect.Garmin(email, password)
    try:
        client.login()
    except garminconnect.GarminConnectAuthenticationError as e:
        print(f"Authentication failed: {e}", file=sys.stderr)
        sys.exit(1)
    return client


def fetch_activities(client: garminconnect.Garmin, days: int = 21) -> list:
    activities = client.get_activities(0, 50)
    cutoff = date.today() - timedelta(days=days)
    result = []
    for a in activities:
        a_date_str = (a.get("startTimeLocal") or "")[:10]
        try:
            a_date = date.fromisoformat(a_date_str)
        except ValueError:
            continue
        if a_date >= cutoff:
            result.append({
                "activity_id": a.get("activityId"),
                "date": a_date_str,
                "type": a.get("activityType", {}).get("typeKey", "unknown"),
                "name": a.get("activityName", ""),
                "duration_sec": a.get("duration", 0),
                "distance_m": a.get("distance", 0),
                "avg_hr": a.get("averageHR"),
                "max_hr": a.get("maxHR"),
                "training_load": a.get("activityTrainingLoad"),
                "aerobic_effect": a.get("aerobicTrainingEffect"),
                "anaerobic_effect": a.get("anaerobicTrainingEffect"),
            })
    return result


def fetch_scheduled_workouts(client: garminconnect.Garmin, days_ahead: int = 60) -> list:
    """
    Fetch Runna-synced scheduled workouts using the calendar API.

    OJO — deduplicación obligatoria: el endpoint de calendario devuelve la
    *rejilla* completa del mes, no el mes exacto, así que incluye días de los
    meses vecinos. Meses consecutivos se solapan (p. ej. la rejilla de agosto
    2026 llega hasta el 3 de septiembre y la de septiembre arranca el 25 de
    agosto), y sin filtrar por identidad la misma sesión entraba dos veces al
    plan. En el frontend eso se veía como sesiones duplicadas en el calendario,
    aunque en Garmin solo existiera una.
    """
    today = date.today()
    cutoff = today + timedelta(days=days_ahead)
    result = []
    seen = set()

    months_to_fetch = set()
    d = today.replace(day=1)
    while d <= cutoff:
        months_to_fetch.add((d.year, d.month))
        d = (d.replace(day=28) + timedelta(days=4)).replace(day=1)

    for year, month in sorted(months_to_fetch):
        try:
            cal = client.get_scheduled_workouts(year, month)
            for item in cal.get("calendarItems", []):
                if item.get("itemType") != "workout":
                    continue
                item_date_str = item.get("date", "")
                try:
                    item_date = date.fromisoformat(item_date_str)
                except ValueError:
                    continue
                if not (today <= item_date <= cutoff):
                    continue
                # `id` es el id de la programación en el calendario: identifica
                # una sesión concreta en un día concreto. Si faltara, la terna
                # fecha+workout+título alcanza para no repetir.
                key = item.get("id") or (item_date_str, item.get("workoutId"), item.get("title", ""))
                if key in seen:
                    continue
                seen.add(key)
                result.append({
                    "date": item_date_str,
                    "name": item.get("title", ""),
                    "sport": item.get("sportTypeKey", ""),
                    "workout_id": item.get("workoutId"),
                    "schedule_id": item.get("id"),
                })
        except Exception as e:
            print(f"  WARNING: Could not fetch calendar for {year}-{month:02d}: {e}", file=sys.stderr)

    return sorted(result, key=lambda x: x["date"])


def fetch_workout_details(client: garminconnect.Garmin, scheduled: list) -> list:
    """
    Descarga el detalle (pasos, descripción, zonas) de cada workout agendado usando
    su workout_id. Garmin guarda el contenido completo que Runna sincronizó —
    repeticiones, ritmos objetivo, descansos, distancias de calentamiento/enfriamiento—
    pero solo se obtiene pidiéndolo por id; el calendario solo trae el título.

    Es tolerante a fallos: si un workout no baja (rate limit, id inválido, error
    de red), la sesión se conserva sin detalle y el resto sigue. Garmin hace
    rate-limit agresivo (429), así que entre llamada hay una pausa de 1.5 s y,
    ante un 429, un backoff exponencial con pocos reintentos.
    """
    def _download(workout_id: int) -> dict | None:
        for attempt in range(3):
            try:
                return client.get_workout_by_id(workout_id)
            except GarminConnectTooManyRequestsError:
                wait = 5 * (attempt + 1)
                print(f"    429 rate limit, esperando {wait}s (intento {attempt + 1}/3)", file=sys.stderr)
                time.sleep(wait)
            except Exception as e:
                print(f"    No se pudo descargar workout {workout_id}: {e}", file=sys.stderr)
                return None
        print(f"    Workout {workout_id} omitido tras 3 intentos (rate limit).", file=sys.stderr)
        return None

    for item in scheduled:
        workout_id = item.get("workout_id")
        if not workout_id or "garmin_workout" in item:
            # Sin id utilizable, o ya trae workout (ciclismo generado localmente).
            continue
        workout = _download(workout_id)
        if workout:
            item["garmin_workout"] = workout
        # Pausa corta entre llamadas para no irritar el rate limiter de Garmin.
        time.sleep(1.5)

    downloaded = sum(1 for s in scheduled if s.get("garmin_workout"))
    print(f"  → {downloaded}/{len(scheduled)} sesiones con detalle de workout")
    return scheduled


# ── OPT-1: Parallel health fetch ──────────────────────────────────────────────

def _fetch_hrv(client: garminconnect.Garmin, d: str) -> tuple[str, object]:
    try:
        data = client.get_hrv_data(d)
        if isinstance(data, dict):
            s = data.get("hrvSummary", {})
            return d, s.get("lastNightAvg") or s.get("weeklyAvg")
    except Exception:
        pass
    return d, None


def _fetch_rhr(client: garminconnect.Garmin, d: str) -> tuple[str, object]:
    try:
        data = client.get_heart_rates(d)
        if isinstance(data, dict):
            return d, data.get("restingHeartRate")
    except Exception:
        pass
    return d, None


def _fetch_sleep(client: garminconnect.Garmin, d: str) -> tuple[str, object]:
    try:
        data = client.get_sleep_data(d)
        if isinstance(data, dict):
            daily = data.get("dailySleepDTO", {})
            val = (
                daily.get("sleepScores", {}).get("overall", {}).get("value")
                or daily.get("sleepScore")
            )
            return d, val
    except Exception:
        pass
    return d, None


def fetch_health_series(client: garminconnect.Garmin, days: int = 21) -> dict:
    today = date.today()
    dates = [(today - timedelta(days=i)).isoformat() for i in range(days)]

    hrv_map: dict[str, object] = {}
    rhr_map: dict[str, object] = {}
    sleep_map: dict[str, object] = {}

    # Submit all 63 calls concurrently (21 days × 3 metrics)
    with ThreadPoolExecutor(max_workers=12) as ex:
        hrv_futs   = {ex.submit(_fetch_hrv,   client, d): d for d in dates}
        rhr_futs   = {ex.submit(_fetch_rhr,   client, d): d for d in dates}
        sleep_futs = {ex.submit(_fetch_sleep, client, d): d for d in dates}

        for fut in as_completed(hrv_futs):
            d, val = fut.result()
            hrv_map[d] = val
        for fut in as_completed(rhr_futs):
            d, val = fut.result()
            rhr_map[d] = val
        for fut in as_completed(sleep_futs):
            d, val = fut.result()
            sleep_map[d] = val

    sorted_dates = sorted(dates)
    return {
        "hrv":        [{"date": d, "hrv":         hrv_map.get(d)}   for d in sorted_dates],
        "sleep":      [{"date": d, "sleep_score":  sleep_map.get(d)} for d in sorted_dates],
        "resting_hr": [{"date": d, "resting_hr":   rhr_map.get(d)}  for d in sorted_dates],
    }


def fetch_hr_zones(client: garminconnect.Garmin, activities: list) -> dict:
    custom = os.environ.get("HR_ZONES", "").strip()
    if custom:
        try:
            zones = {}
            for i, pair in enumerate(custom.split(","), start=1):
                lo, hi = pair.strip().split("-")
                zones[f"Z{i}"] = {"min": int(lo), "max": int(hi)}
            print(f"  → Usando zonas personalizadas (.env): {list(zones.keys())}")
            return zones
        except Exception as e:
            print(f"  WARNING: HR_ZONES inválido ({e}), usando Garmin.", file=sys.stderr)

    run_activities = [a for a in activities if "run" in a.get("type", "").lower() and a.get("activity_id")]
    if not run_activities:
        print("  WARNING: No recent running activities to derive HR zones from.", file=sys.stderr)
        return _empty_zones()

    activity_id = run_activities[0]["activity_id"]
    try:
        raw_zones = client.get_activity_hr_in_timezones(activity_id)
        if not raw_zones:
            return _empty_zones()
        raw_zones = sorted(raw_zones, key=lambda z: z.get("zoneNumber", 0))
        zones = {}
        for i, z in enumerate(raw_zones):
            zone_key = f"Z{z['zoneNumber']}"
            low = z.get("zoneLowBoundary")
            high = raw_zones[i + 1].get("zoneLowBoundary", low + 20) - 1 if i + 1 < len(raw_zones) else 220
            zones[zone_key] = {"min": low, "max": high}
        return zones
    except Exception as e:
        print(f"  WARNING: Could not fetch HR zones: {e}", file=sys.stderr)
        return _empty_zones()


def _empty_zones() -> dict:
    return {f"Z{i}": {"min": None, "max": None} for i in range(1, 6)}


def main():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    print("Connecting to Garmin Connect...")
    client = login()
    print("Connected.\n")

    print("Fetching activities (last 21 days)...")
    activities = fetch_activities(client)
    print(f"  → {len(activities)} activity(ies)")

    print("Fetching scheduled workouts (Runna plan, próximos 60 días)...")
    weekly_plan = fetch_scheduled_workouts(client)
    print(f"  → {len(weekly_plan)} scheduled workout(s)")

    print("Downloading workout details (pasos, ritmos, zonas objetivo)...")
    weekly_plan = fetch_workout_details(client, weekly_plan)

    print("Fetching health data in parallel (HRV + RHR + sleep, 21 days)...")
    health = fetch_health_series(client)
    hrv_count = sum(1 for h in health["hrv"] if h["hrv"] is not None)
    rhr_count = sum(1 for h in health["resting_hr"] if h["resting_hr"] is not None)
    print(f"  → HRV: {hrv_count} days | RHR: {rhr_count} days")

    print("Deriving HR zones...")
    hr_zones = fetch_hr_zones(client, activities)
    non_null = [k for k, v in hr_zones.items() if v["min"] is not None]
    print(f"  → Zones: {non_null}")

    output = {
        "extracted_at": date.today().isoformat(),
        "weekly_plan": weekly_plan,
        "activities_last_3_weeks": activities,
        "health": health,
        "hr_zones": hr_zones,
    }

    OUTPUT.write_text(json.dumps(output, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nSaved → {OUTPUT}")


if __name__ == "__main__":
    main()

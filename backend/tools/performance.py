"""
Tablero de rendimiento: métricas del historial de carreras de Garmin.

Lo consumen dos lados, con los mismos números:
  - api.py GET /performance → la página Rendimiento de la app
  - generate_plan.py → un resumen en el prompt, para que la revisión semanal
    del plan de Runna sepa cómo corre José de verdad, no solo qué dice Runna

Fuente: activity_history.json, que fetch_garmin.py escribe con los resúmenes de
las últimas ~26 semanas. Cada resumen de Garmin trae el tiempo en cada una de
sus 5 zonas de FC (hrTimeInZone_1..5), así que no hace falta bajar la serie de
pulsaciones de cada carrera.

Zonas — OJO, hay dos juegos distintos en juego:
  - Garmin (reloj, % de FC máx ~196): Z1 98 · Z2 117 · Z3 137 · Z4 156 · Z5 176
  - La app (HR_ZONES, las mismas de Strava): Z2 126–156 · Z3 157–171 · Z4 172–186
Un rodaje a 145 lpm es "Z3" para el reloj y "Z2" para la app. Aquí se agrupan
las 5 de Garmin en 3 que sí coinciden con la app: BAJO = Z1–Z3 (<156, el techo
de Z2 de la app), UMBRAL = Z4 (156–175), ALTO = Z5 (≥176, por encima del umbral
de lactato estimado para medio maratón).
"""
from __future__ import annotations

import statistics
from collections import defaultdict
from datetime import date, datetime, timedelta

EASY_HR_CEILING = 156       # techo de "bajo": Z3 de Garmin / Z2 de la app
LOW_TARGET_PCT = 75         # evidencia: ≥75–80 % del tiempo en baja intensidad
BOGOTA_MIN_ELEVATION = 2000  # para comparar eficiencia a la misma altitud
_EASY_WORDS = ("easy", "rodaje", "conversational", "recovery", "recuperación", "suave")


def compact(activity: dict) -> dict | None:
    """Lo que el tablero usa de un resumen de Garmin, o None si no es carrera."""
    kind = ((activity.get("activityType") or {}).get("typeKey") or "").lower()
    if "run" not in kind or not activity.get("distance"):
        return None
    zones = [float(activity.get(f"hrTimeInZone_{i}") or 0) for i in range(1, 6)]
    return {
        "date": (activity.get("startTimeLocal") or "")[:10],
        "name": activity.get("activityName") or "",
        "km": round(activity["distance"] / 1000, 2),
        "min": round((activity.get("duration") or 0) / 60, 1),
        "avg_hr": activity.get("averageHR"),
        "max_hr": activity.get("maxHR"),
        "zones_sec": zones,
        "vo2max": activity.get("vO2MaxValue"),
        "cadence": activity.get("averageRunningCadenceInStepsPerMinute"),
        "gct_ms": activity.get("avgGroundContactTime"),
        "vert_osc_cm": activity.get("avgVerticalOscillation"),
        "stride_cm": activity.get("avgStrideLength"),
        "min_elevation": activity.get("minElevation"),
    }


def _monday(d: date) -> date:
    return d - timedelta(days=d.weekday())


def _three(zones_sec: list[float]) -> tuple[float, float, float]:
    """(bajo, umbral, alto) en minutos."""
    z = zones_sec + [0.0] * (5 - len(zones_sec))
    return (sum(z[:3]) / 60, z[3] / 60, z[4] / 60)


def _pct(parts: tuple[float, float, float]) -> dict:
    total = sum(parts) or 1
    return {k: round(100 * v / total) for k, v in zip(("low", "mid", "high"), parts)}


def _is_easy(run: dict) -> bool:
    name = run["name"].lower()
    return any(w in name for w in _EASY_WORDS)


def _efficiency(run: dict) -> float | None:
    """Metros por minuto por latido, en rodajes suaves en Bogotá: sube cuando la
    base aeróbica mejora (mismo pulso, más rápido). Solo a la misma altitud y en
    el mismo rango de pulso, o se comparan cosas distintas."""
    hr = run.get("avg_hr")
    if not hr or not 135 <= hr <= EASY_HR_CEILING or run["km"] < 5 or not run["min"]:
        return None
    if (run.get("min_elevation") or 0) < BOGOTA_MIN_ELEVATION:
        return None
    return (run["km"] * 1000 / run["min"]) / hr


def _mean(values: list) -> float | None:
    values = [v for v in values if isinstance(v, (int, float))]
    return round(statistics.mean(values), 1) if values else None


def build(history: list[dict], today: date | None = None, weeks: int = 26) -> dict:
    """El tablero completo a partir de carreras ya compactadas."""
    today = today or date.today()
    start = _monday(today) - timedelta(weeks=weeks - 1)
    runs = sorted(
        (r for r in history if r and r.get("date") and date.fromisoformat(r["date"]) >= start),
        key=lambda r: r["date"],
    )

    # ── Semanas (lunes a domingo), incluidas las vacías: un hueco también es un dato
    by_week: dict[date, list[dict]] = defaultdict(list)
    for r in runs:
        by_week[_monday(date.fromisoformat(r["date"]))].append(r)
    weekly = []
    for i in range(weeks):
        wk = start + timedelta(weeks=i)
        rs = by_week.get(wk, [])
        low, mid, high = (sum(x) for x in zip(*(_three(r["zones_sec"]) for r in rs))) if rs else (0, 0, 0)
        weekly.append({
            "week": wk.isoformat(),
            "km": round(sum(r["km"] for r in rs), 1),
            "runs": len(rs),
            "low_min": round(low), "mid_min": round(mid), "high_min": round(high),
            "long_km": round(max((r["km"] for r in rs), default=0), 1),
        })

    # ── Meses: reparto, eficiencia y técnica
    by_month: dict[str, list[dict]] = defaultdict(list)
    for r in runs:
        by_month[r["date"][:7]].append(r)
    monthly = []
    for m in sorted(by_month):
        rs = by_month[m]
        parts = tuple(sum(x) for x in zip(*(_three(r["zones_sec"]) for r in rs)))
        eff = [e for e in (_efficiency(r) for r in rs) if e]
        monthly.append({
            "month": m,
            "km": round(sum(r["km"] for r in rs)),
            "zones_pct": _pct(parts),
            "efficiency": round(statistics.mean(eff), 3) if eff else None,
            "efficiency_n": len(eff),
            "cadence": _mean([r.get("cadence") for r in rs]),
            "gct_ms": _mean([r.get("gct_ms") for r in rs]),
            "stride_cm": _mean([r.get("stride_cm") for r in rs]),
            "vo2max": max((r["vo2max"] for r in rs if r.get("vo2max")), default=None),
        })

    # ── Últimas 12 semanas: lo que pesa para planear
    recent = weekly[-12:]
    recent_runs = [r for r in runs if date.fromisoformat(r["date"]) >= date.fromisoformat(recent[0]["week"])]
    parts12 = (sum(w["low_min"] for w in recent), sum(w["mid_min"] for w in recent), sum(w["high_min"] for w in recent))
    kms = [w["km"] for w in recent]
    easy = [r for r in recent_runs if _is_easy(r) and r.get("avg_hr")]
    vo2 = [(r["date"], r["vo2max"]) for r in runs if r.get("vo2max")]
    max_hrs = sorted((r["max_hr"] for r in runs if r.get("max_hr")), reverse=True)
    mean_km = statistics.mean(kms) if kms else 0
    # De dónde sale el tiempo duro: las carreras con más minutos sobre 156 lpm.
    hardest = sorted(recent_runs, key=lambda r: -sum(_three(r["zones_sec"])[1:]))[:3]

    kpis = {
        "weekly_km_12w": round(mean_km, 1),
        # Coeficiente de variación: 0 = todas las semanas iguales. >0,5 es un
        # volumen que va y viene, que es lo contrario de lo que construye base.
        "weekly_km_cv": round(statistics.pstdev(kms) / mean_km, 2) if mean_km else None,
        "weeks_3plus_runs": sum(1 for w in recent if w["runs"] >= 3),
        "weeks_counted": len(recent),
        "zones_pct_12w": _pct(parts12),
        "easy_runs": len(easy),
        "easy_runs_in_zone": sum(1 for r in easy if r["avg_hr"] <= EASY_HR_CEILING),
        "longest_km_12w": round(max((r["km"] for r in recent_runs), default=0), 1),
        "vo2max": vo2[-1][1] if vo2 else None,
        "vo2max_date": vo2[-1][0] if vo2 else None,
        # El segundo más alto: el máximo suele ser un pico falso del sensor.
        "max_hr_observed": max_hrs[1] if len(max_hrs) > 1 else (max_hrs[0] if max_hrs else None),
        "hardest_12w": [
            {"date": r["date"], "name": r["name"], "km": r["km"],
             "hard_min": round(sum(_three(r["zones_sec"])[1:]))}
            for r in hardest if sum(_three(r["zones_sec"])[1:]) > 0
        ],
    }

    return {
        "generated_at": today.isoformat(),
        "weeks": weeks,
        "zone_model": {
            "garmin_bounds": [98, 117, 137, 156, 176],
            "three_zones": {"low": "< 156 lpm", "mid": "156–175 lpm", "high": "≥ 176 lpm"},
            "low_target_pct": LOW_TARGET_PCT,
        },
        "kpis": kpis,
        "weekly": weekly,
        "monthly": monthly,
        "insights": insights(kpis, monthly),
    }


def insights(kpis: dict, monthly: list[dict]) -> list[dict]:
    """Lecturas concretas, en español, con el principio que las respalda. Cada
    una con nivel: "ok" (va bien), "watch" (vigilar), "act" (hay que cambiar)."""
    out = []
    z = kpis["zones_pct_12w"]
    if z["low"] < LOW_TARGET_PCT:
        easy_ok = not kpis["easy_runs"] or kpis["easy_runs_in_zone"] / kpis["easy_runs"] >= 0.8
        top = kpis.get("hardest_12w") or []
        where = (
            "Los rodajes fáciles sí van suaves; el tiempo duro sale de otras sesiones"
            + (f", sobre todo {top[0]['name']} ({top[0]['date']}, {top[0]['hard_min']} min sobre {EASY_HR_CEILING} lpm)" if top else "")
            + ". Tiradas largas y sesiones que se corren más fuerte de lo prescrito."
            if easy_ok else "Los rodajes fáciles se están yendo a umbral: necesitan techo de FC."
        )
        out.append({
            "level": "act" if z["low"] < 65 else "watch",
            "title": f"Solo el {z['low']} % del tiempo es suave",
            "detail": (f"La meta con más evidencia es ≥{LOW_TARGET_PCT} % bajo {EASY_HR_CEILING} lpm. "
                       f"Hoy el {z['mid']} % va en umbral y el {z['high']} % por encima. {where}"),
        })
    else:
        out.append({"level": "ok", "title": f"{z['low']} % del tiempo en baja intensidad",
                    "detail": "Dentro de la distribución que recomienda la evidencia."})

    if kpis["easy_runs"]:
        share = kpis["easy_runs_in_zone"] / kpis["easy_runs"]
        if share < 0.8:
            out.append({
                "level": "act" if share < 0.6 else "watch",
                "title": f"{kpis['easy_runs_in_zone']} de {kpis['easy_runs']} rodajes fáciles fueron fáciles",
                "detail": f"Un rodaje fácil con FC media sobre {EASY_HR_CEILING} lpm ya es trabajo de umbral: suma fatiga sin la adaptación que busca.",
            })

    cv = kpis["weekly_km_cv"]
    if cv is not None and cv > 0.4:
        out.append({
            "level": "act" if cv > 0.6 else "watch",
            "title": "El volumen semanal va y viene",
            "detail": (f"{kpis['weeks_3plus_runs']} de {kpis['weeks_counted']} semanas con 3 o más carreras. "
                       "La constancia del volumen fácil es la palanca que más pesa en el rendimiento."),
        })

    eff = [m for m in monthly if m["efficiency"] and m["efficiency_n"] >= 2]
    if len(eff) >= 4:
        # Promedio de los dos primeros meses contra los dos últimos: un mes suelto
        # con pocas carreras (o una semana de calor) movía la tendencia sola.
        first = statistics.mean(m["efficiency"] for m in eff[:2])
        last = statistics.mean(m["efficiency"] for m in eff[-2:])
        change = 100 * (last - first) / first
        out.append({
            "level": "ok" if change >= 3 else "watch",
            "title": f"Eficiencia aeróbica {'+' if change >= 0 else ''}{change:.0f} % en {len(eff)} meses",
            "detail": "Metros por minuto por latido en rodajes suaves en Bogotá. Si no sube, la base aeróbica no está creciendo.",
        })

    cad = [m["cadence"] for m in monthly[-3:] if m["cadence"]]
    if cad and statistics.mean(cad) < 165:
        out.append({
            "level": "watch",
            "title": f"Cadencia de {statistics.mean(cad):.0f} pasos/min",
            "detail": "Por debajo de 165 suele ir con zancada larga y más tiempo de contacto; subirla un 5 % reduce la carga por paso.",
        })
    return out


def prompt_block(perf: dict) -> str:
    """El tablero en pocas líneas para el prompt de generate_plan."""
    k = perf["kpis"]
    z = k["zones_pct_12w"]
    lines = [
        f"  Volumen: {k['weekly_km_12w']} km/sem de media (12 sem), variación {k['weekly_km_cv']}; "
        f"{k['weeks_3plus_runs']}/{k['weeks_counted']} semanas con ≥3 carreras; tirada más larga {k['longest_km_12w']} km.",
        f"  Intensidad real (12 sem): {z['low']} % bajo {EASY_HR_CEILING} lpm · {z['mid']} % umbral (156–175) · "
        f"{z['high']} % alto (≥176). Meta ≥{LOW_TARGET_PCT} % bajo.",
        f"  Rodajes fáciles en zona: {k['easy_runs_in_zone']}/{k['easy_runs']}. VO2máx {k['vo2max']}. "
        f"FC máx observada {k['max_hr_observed']}.",
    ]
    for i in perf["insights"]:
        if i["level"] != "ok":
            lines.append(f"  [{i['level'].upper()}] {i['title']}: {i['detail']}")
    return "\n".join(lines)

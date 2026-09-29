"""
Chequeos deterministas sobre las carreras de Runna: se calculan antes de llamar a
Claude para que el modelo reciba el dato hecho y no tenga que hacer aritmética, y
se vuelven a aplicar después para validar los ajustes que devuelve.

- Sesión pico: una carrera que supera en más de 10 % a la más larga de los 30
  días previos. En el estudio Garmin-RUNSAFE (5.205 corredores, 2025) fue el
  mejor predictor de lesión: +64 % de riesgo entre 10 y 30 %, +128 % por encima
  de 100 %. Pesa más que el aumento semanal de kilómetros.
- Semanas para la carrera: la semana de carrera no se ajusta (manda el taper de
  Runna) y la anterior solo admite recortes (eso último lo pide el prompt).

Los ajustes no reescriben nada en Garmin: Runna es dueño de sus workouts y los
pisaría al reprogramar. Se adjuntan a la sesión como sugerencia.
"""
from __future__ import annotations

import math
import re
from datetime import date

SPIKE_THRESHOLD = 0.10
VERDICTS = ("ajustar", "cambiar_a_facil")
# La bici como alternativa a un rodaje: entre 1 y 1,3 veces su duración (por
# minuto carga menos que correr, así que un poco más larga equivale, no suma).
ALT_MIN_FACTOR, ALT_MAX_FACTOR = 1.0, 1.3
# Ritmo de respaldo para estimar la duración de un rodaje sin pasos en Garmin
# (~6 min/km, el mismo que usa session_intensity).
EASY_MIN_PER_KM = 6

# Runna escribe la distancia en el nombre ("... Long Run (19km)") y en el resumen
# del feed ("🏃 1km Repeats • 10,5km"). Una sola definición para los dos lectores.
KM_RE = re.compile(r"(\d+(?:[.,]\d+)?)\s*km\b", re.I)


def km_in(text: str) -> float | None:
    """La última distancia en km que aparezca en el texto, con punto o coma decimal."""
    found = KM_RE.findall(text or "")
    return float(found[-1].replace(",", ".")) if found else None


def is_run(item: dict) -> bool:
    return "run" in str(item.get("sport") or item.get("type") or "").lower()


def planned_km(item: dict) -> float | None:
    """Distancia de una carrera de Runna: la del feed si viene, o la última
    mención del nombre (las de Garmin solo traen el nombre)."""
    km = item.get("distance_km")
    if isinstance(km, (int, float)) and km > 0:
        return float(km)
    return km_in(str(item.get("name") or ""))


def longest_run_km(activities: list[dict]) -> float | None:
    """La carrera más larga de una lista de actividades de Garmin, en km."""
    best = max(((a.get("distance_m") or 0) / 1000 for a in activities if is_run(a)), default=0)
    return round(best, 1) if best > 0 else None


def longest_recent_run_km(garmin: dict) -> float | None:
    """La carrera más larga de los últimos 30 días.

    fetch_garmin.py la calcula aparte (`longest_run_30d_km`) porque la lista de
    actividades que viaja al frontend es de 21 días. Con un garmin_data.json
    anterior a ese campo se cae a esa lista: la base queda algo más corta, que
    solo puede sobrar en banderas, nunca esconder una.
    """
    value = garmin.get("longest_run_30d_km")
    if isinstance(value, (int, float)) and value > 0:
        return float(value)
    return longest_run_km(garmin.get("activities_last_3_weeks", []))


def weeks_to_race(d: date, race_date: date) -> int:
    """0 = los 7 días que terminan en la carrera, 1 = los 7 anteriores (taper),
    negativo = ya pasó.

    Se cuenta hacia atrás desde el día de la carrera y no por semanas de
    calendario: las de la app van de domingo a sábado y las de Runna de lunes a
    domingo, y con una carrera en domingo cualquiera de las dos convenciones
    dejaba el martes previo en la semana "anterior".
    """
    days = (race_date - d).days
    return days // 7 if days >= 0 else -1


def phase_label(d: date, race_date: date) -> str | None:
    n = weeks_to_race(d, race_date)
    if n < 0:
        return None
    if n == 0:
        return "SEMANA DE CARRERA"
    if n == 1:
        return "TAPER"
    return f"faltan {n} semanas"


def _short(description: str, limit: int = 160) -> str:
    """Cuerpo de la sesión en una línea, sin la cabecera "Tempo • 9km • 50m - 55m"
    ni el enfriamiento, que siempre es el mismo."""
    lines = [l.strip() for l in description.splitlines()[1:] if l.strip()]
    lines = [l for l in lines if "cool down" not in l.lower() and not set(l) <= {"-"}]
    text = " / ".join(lines)
    return text if len(text) <= limit else text[: limit - 1] + "…"


def macro_summary(sessions: list[dict], race_date: date) -> str:
    """El ciclo entero de Runna, una línea por semana: volumen, la sesión de
    calidad y la tirada larga. Es lo que Garmin no deja ver (solo trae ~2
    semanas) y lo que hace falta para juzgar progresión, descargas y taper."""
    weeks: dict[int, list[dict]] = {}
    for s in sessions:
        if is_run(s) and isinstance(s.get("week"), int):
            weeks.setdefault(s["week"], []).append(s)

    lines = []
    for n in sorted(weeks):
        runs = sorted(weeks[n], key=lambda s: s["date"])
        total = sum(planned_km(s) or 0 for s in runs)
        phase = phase_label(date.fromisoformat(runs[0]["date"]), race_date) or ""
        head = f"  W{n} ({runs[0]['date']}, {phase}): {total:g} km en {len(runs)} carreras"
        parts = []
        for s in runs:
            if s.get("kind") == "EASY_RUN":
                continue
            detail = _short(str(s.get("description") or ""))
            parts.append(f"{s['date']} {s.get('kind')} {planned_km(s) or '?'} km: {detail}")
        lines.append(head + ("\n    " + "\n    ".join(parts) if parts else ""))
    return "\n".join(lines)


def spike_cap(base_km: float) -> float:
    """El máximo permitido sobre una base: +10 %, bajado al medio kilómetro
    (un tope de 15,4 km se corre como 15)."""
    return math.floor(base_km * (1 + SPIKE_THRESHOLD) * 2) / 2


def spike_flags(sessions: list[dict], base_km: float | None, race_date: date) -> dict[str, dict]:
    """{fecha: {km, base_km, cap_km, pct}} de cada carrera planificada que se dispara.

    La base arranca en la más larga de los últimos 30 días y va subiendo con las
    carreras planificadas anteriores: si la semana 1 ya trae 16 km, la semana 2
    se mide contra 16. Si una carrera se marcó, la base sube solo hasta el tope
    recortado, que es lo que el atleta va a correr: medir la siguiente contra los
    km que se le dijo que no corriera escondería justo el segundo salto de una
    progresión. El día de la carrera no se marca (es el objetivo, no un
    entrenamiento), pero sí cuenta como base para lo que venga después.
    """
    base = base_km or 0.0
    flags: dict[str, dict] = {}
    runs = sorted(
        (s for s in sessions if is_run(s) and s.get("date") and planned_km(s)),
        key=lambda s: s["date"],
    )
    for s in runs:
        km = planned_km(s)
        if s["date"] != race_date.isoformat() and base > 0 and km > base * (1 + SPIKE_THRESHOLD):
            cap = spike_cap(base)
            flags[s["date"]] = {
                "km": km, "base_km": round(base, 1), "cap_km": cap, "pct": round((km / base - 1) * 100),
            }
            base = max(base, cap)
        else:
            base = max(base, km)
    return flags


def spike_adjustment(session: dict, flag: dict) -> dict:
    """El recorte que exige la regla."""
    cap = flag.get("cap_km") or spike_cap(flag["base_km"])
    cap_txt = f"{cap:g}".replace(".", ",")
    base_txt = f"{flag['base_km']:g}".replace(".", ",")
    km_txt = f"{flag['km']:g}".replace(".", ",")
    return {
        "date": session["date"],
        "runna_name": session.get("name"),
        "verdict": "ajustar",
        "change": f"Correr {cap_txt} km en vez de {km_txt} km, con la misma estructura e intensidad.",
        "rationale": (
            f"Son {flag['pct']} % más que tu carrera más larga de los últimos 30 días "
            f"({base_txt} km). Una sola sesión que supera en más de 10 % a esa base es "
            "el predictor de lesión más claro que se conoce (Garmin-RUNSAFE, 2025)."
        ),
        "source": "regla",
        "cap_km": cap,
    }


def validate_adjustments(
    raw: object,
    sessions: list[dict],
    race_date: date,
    flags: dict[str, dict],
) -> list[dict]:
    """Deja solo ajustes aplicables y completa los recortes por pico que falten.

    Se descarta cualquier ajuste que: no sea un dict, apunte a una fecha sin
    carrera de Runna, traiga un veredicto desconocido o un `change` vacío, o caiga
    en la semana de carrera. Uno por fecha (gana el primero). El nombre de la
    sesión lo pone el código, no el modelo.
    """
    runs_by_date: dict[str, dict] = {}
    for s in sessions:
        if is_run(s) and s.get("date"):
            runs_by_date.setdefault(s["date"], s)

    def in_race_week(d: str) -> bool:
        return weeks_to_race(date.fromisoformat(d), race_date) == 0

    out: dict[str, dict] = {}
    for adj in raw if isinstance(raw, list) else []:
        if not isinstance(adj, dict):
            continue
        d = adj.get("date")
        change = str(adj.get("change") or "").strip()
        if d not in runs_by_date or adj.get("verdict") not in VERDICTS or not change or d in out:
            continue
        if in_race_week(d):
            continue
        out[d] = {
            "date": d,
            "runna_name": runs_by_date[d].get("name"),
            "verdict": adj["verdict"],
            "change": change,
            "rationale": str(adj.get("rationale") or "").strip(),
            "source": "modelo",
        }

    # El recorte por pico no es negociable: si el modelo propuso otra cosa ese día
    # (un techo de FC, por ejemplo), se suma al recorte en vez de reemplazarlo.
    for d, flag in flags.items():
        if d not in runs_by_date or in_race_week(d):
            continue
        rule = spike_adjustment(runs_by_date[d], flag)
        model = out.get(d)
        if model is None:
            out[d] = rule
        elif model["verdict"] == "cambiar_a_facil":
            cap_txt = f"{rule['cap_km']:g}".replace(".", ",")
            model["change"] = f"{model['change']} Máximo {cap_txt} km."
            model["rationale"] = f"{model['rationale']} {rule['rationale']}".strip()
            model["source"] = "regla"
        else:
            model["change"] = f"{rule['change']} Además: {model['change']}"
            model["rationale"] = f"{rule['rationale']} {model['rationale']}".strip()
            model["source"] = "regla"

    return [out[d] for d in sorted(out)]


def reconcile_cycling(cycling: list[dict], sessions: list[dict]) -> tuple[list[dict], list[str]]:
    """Ciclismo contra las carreras de Runna del mismo día. Devuelve (se quedan, fechas descartadas).

    - Día sin carrera: sesión normal.
    - Día con rodaje fácil (intensidad BAJA): se queda como ALTERNATIVA. El rodaje
      no se toca; el atleta elige uno de los dos. Se fuerza ciclorruta en plano
      (Z1): la alternativa a un rodaje fácil no puede ser más dura que el rodaje.
    - Día con tirada larga, tempo o series (o intensidad sin especificar): fuera.

    El prompt ya lo pide, pero el modelo se ha saltado reglas de calendario
    cuando la semana queda apretada (ver attach_strength), y aquí el costo de un
    error es una bici encima de las series.
    """
    from session_intensity import summarise_session

    runs_by_date: dict[str, list[dict]] = {}
    for s in sessions:
        if is_run(s) and s.get("date"):
            runs_by_date.setdefault(s["date"], []).append(s)

    kept, dropped = [], []
    for c in cycling:
        runs = runs_by_date.get(c.get("date"), [])
        if not runs:
            c["alternative_to_easy_run"] = False
            kept.append(c)
        elif all(summarise_session(r)["intensity"] == "baja" for r in runs):
            c["alternative_to_easy_run"] = True
            c["alternative_to"] = runs[0].get("name")
            c["type"] = "ciclorruta_en_plano"
            run_min = summarise_session(runs[0])["duration_min"] or (
                (planned_km(runs[0]) or 0) * EASY_MIN_PER_KM
            )
            if run_min:
                # La alternativa tiene que costar lo mismo que el rodaje que
                # reemplaza, no el triple: se encaja en 1–1,3× su duración.
                lo, hi = round(run_min * ALT_MIN_FACTOR), round(run_min * ALT_MAX_FACTOR)
                c["duration_min"] = min(max(int(c.get("duration_min") or lo), lo), hi)
            kept.append(c)
        else:
            dropped.append(c.get("date"))
    return kept, dropped


def attach_adjustments(sessions: list[dict], adjustments: list[dict]) -> None:
    """Cuelga cada ajuste de su carrera, para que cualquier vista que ya muestra
    la sesión lo muestre sin buscarlo por fecha. Una sola carrera por fecha."""
    by_date = {a["date"]: a for a in adjustments}
    for s in sessions:
        adj = by_date.get(s.get("date")) if is_run(s) else None
        if adj:
            s["adjustment"] = {k: adj[k] for k in ("verdict", "change", "rationale", "source")}
            by_date.pop(s["date"])

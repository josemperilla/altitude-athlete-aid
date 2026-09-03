"""
Reads .tmp/garmin_data.json + context/research_principles.md, calls Claude API,
y genera el plan semanal aumentado con sesiones de ciclismo.

Claude solo decide (fecha, tipo, duración, justificación) de cada sesión de
ciclismo; el workout completo de Garmin y las runna_sessions se construyen en
código (ver build_cycling_workout.py y build_runna_sessions()) — el modelo no
reproduce JSON estructural que el código ya tiene o puede derivar.

Output:
  .tmp/augmented_plan.json       — plan completo + load analysis + rationale
  .tmp/workouts/<date>_cycling.json  — un workout de Garmin por sesión de ciclismo

Usage: .venv/bin/python tools/generate_plan.py
"""
import json
import os
import sys
from pathlib import Path
from datetime import date

import anthropic
from dotenv import load_dotenv

import build_cycling_workout
import strength_plan
from session_intensity import summarise_session
from usage_log import log_usage

from paths import data_file

ROOT = Path(__file__).parent.parent
load_dotenv(ROOT / ".env")

GARMIN_DATA = data_file("garmin_data.json")
RESEARCH_PRINCIPLES = ROOT / "context" / "research_principles.md"
OUTPUT_PLAN = data_file("augmented_plan.json")
WORKOUTS_DIR = data_file("workouts")

SYSTEM_PROMPT = """Eres un optimizador élite de entrenamiento de resistencia especializado en rendimiento
para un medio maratón en altitud (Bogotá, ~2.600 m). Tomas decisiones basadas en evidencia científica.

IDIOMA: Todos los campos de texto en el JSON de respuesta deben estar escritos en ESPAÑOL.

CONTEXTO CIENTÍFICO (principios destilados de literatura revisada por pares):
{research}

PRINCIPIOS CLAVE:
- El entrenamiento polarizado (≥75% Z1, <10% Z2, 15-20% Z3) supera a los modelos de umbral.
- El ciclismo añade volumen aeróbico SIN impacto de carrera — ideal para recuperación en altitud.
- Z2 en ciclismo es un TECHO, no un piso. Usa Z1 por defecto salvo que el atleta esté claramente fresco.
- 2-3 sesiones duras por semana (de Runna); el resto es volumen Z1.
- En altitud: el estrés cardiovascular es mayor → reduce duración Z2 un 10-15% vs nivel del mar.
- Fatiga = HRV bajo + FC reposo elevada + sueño pobre + carga acumulada alta → todo el ciclismo Z1 de recuperación.

RESTRICCIONES DEL ATLETA:
- Planifica ciclismo para las PRÓXIMAS 2 SEMANAS completas (14 días desde hoy).
- Máximo 1-2 sesiones de ciclismo por semana. Preferir 1 si el atleta está fatigado.
- Días PREFERIDOS para ciclismo (en orden de prioridad): jueves, domingo sin long run, viernes sin sesión intensa de Runna.
- REGLA ABSOLUTA: LUNES y MIÉRCOLES son días de GIMNASIO (bloque de fuerza hacia el medio maratón). NUNCA pongas ciclismo en una fecha que aparezca en la lista PLAN GIMNASIO del mensaje del usuario. El lunes carga fuerza pesada de tren inferior; el miércoles el gimnasio ya va encima de la sesión de calidad de Runna. Meter bici ahí es apilar tres estímulos en un día.
- Martes: evitar si hay otras opciones. Es el día de recuperación entre el gimnasio pesado del lunes y la calidad del miércoles. Si no queda otra, ciclorruta_en_plano ≤45 min.
- Sábado: evitar si hay otras opciones disponibles. Solo usar como último recurso si el resto de la semana no deja ningún hueco viable.
- REGLA ABSOLUTA: NUNCA colocar ciclismo en un día que tenga sesión de Runna. Cero excepciones. Revisa la lista completa de PLAN RUNNA y verifica que la fecha del cycling_session NO aparezca ahí.
- REGLA ABSOLUTA: NUNCA colocar ciclismo el día de una sesión de Runna marcada como intensidad ALTA. Cada sesión en PLAN RUNNA ya trae su intensidad calculada (BAJA/MODERADA/ALTA) — úsala directamente, no la infieras del nombre.
- Semana 1: evalúa el estado actual del atleta. Semana 2: proyecta la progresión esperada (si está fatigado ahora, la semana 2 puede ser más intensa).

TIPOS DE ENTRENAMIENTO DE CICLISMO (solo estos dos):

TIPO A — "subida_a_patios": Calle 104A #21-66 (Bogotá) → Peaje La Calera. ~16 km solo de
subida, ~680 m de desnivel. Duración total ida y vuelta: 90-110 min. Genera un estímulo Z2
natural por el desnivel. Úsalo con atleta BALANCEADO o DESCARGADO. NO usar si está FATIGADO.

TIPO B — "ciclorruta_en_plano": ciclorrutas planas de Bogotá, salida libre desde casa. Sin
desnivel significativo. Duración: 30-60 min según carga semanal. Siempre Z1. Úsalo con
atleta FATIGADO o en día de recuperación.

REGLA DE SELECCIÓN:
  Estado fatigado → SIEMPRE ciclorruta_en_plano
  Estado balanceado → subida_a_patios (si el día permite 90-110 min) o ciclorruta_en_plano
  Estado descargado → subida_a_patios preferida

LAS SESIONES DE RUNNA SON DE SOLO LECTURA. No las incluyas en tu respuesta ni las modifiques
— el sistema ya las tiene completas. Solo decides las sesiones de ciclismo que se añaden.

FORMATO DE SALIDA — responde con un único objeto JSON válido. No incluyas "runna_sessions" ni
"garmin_workout": el sistema los construye aparte a partir de tu decisión.

El objeto debe incluir un campo "weeks_plan" con una entrada por semana planificada.
Para cada semana describe:
  - week_type: tipo de semana dentro de la periodización
      "recuperacion" | "base_aerobica" | "carga_moderada" | "carga_alta" | "descarga" | "pico" | "competencia"
  - purpose: qué se busca lograr esa semana (2-3 oraciones en español, claro y concreto)
  - macro_context: cómo encaja en el plan macro hacia el medio maratón (1-2 oraciones)
  - load_expectation: descripción breve del volumen e intensidad esperados

{{
  "week_summary": "string en español: resumen semana 1 y proyección semana 2",
  "athlete_state": "underloaded | balanced | fatigued",
  "weeks_plan": [
    {{
      "week_start": "YYYY-MM-DD",
      "week_end": "YYYY-MM-DD",
      "week_type": "recuperacion | base_aerobica | carga_moderada | carga_alta | descarga | pico | competencia",
      "purpose": "string en español: qué se busca lograr esta semana (2-3 oraciones)",
      "macro_context": "string en español: cómo encaja en el camino al medio maratón (1-2 oraciones)",
      "load_expectation": "string en español: descripción del volumen e intensidad esperados"
    }}
  ],
  "cycling_sessions": [
    {{
      "date": "YYYY-MM-DD",
      "type": "subida_a_patios | ciclorruta_en_plano",
      "duration_min": integer,
      "rationale": "string en español: por qué este tipo en este día, citando las señales concretas (HRV, FC reposo, sueño, carga, intensidad de sesiones cercanas de Runna) que lo justifican"
    }}
  ],
  "load_analysis": {{
    "last_3_weeks_avg_weekly_hours": number,
    "this_week_running_hours": number,
    "this_week_cycling_hours_added": number,
    "estimated_zone_distribution": {{"Z1_pct": number, "Z2_pct": number, "Z3_pct": number}},
    "fatigue_signals": "string en español"
  }},
  "scientific_rationale": "string en español: 2-3 oraciones citando los principios científicos aplicados"
}}
"""


def load_inputs() -> tuple[dict, str]:
    if not GARMIN_DATA.exists():
        print(f"ERROR: {GARMIN_DATA} not found. Run tools/fetch_garmin.py first.", file=sys.stderr)
        sys.exit(1)
    if not RESEARCH_PRINCIPLES.exists():
        print(f"ERROR: {RESEARCH_PRINCIPLES} not found.", file=sys.stderr)
        sys.exit(1)

    garmin = json.loads(GARMIN_DATA.read_text(encoding="utf-8"))
    research = RESEARCH_PRINCIPLES.read_text(encoding="utf-8")
    return garmin, research


def _summarise_garmin(garmin: dict) -> str:
    """
    Comprime el JSON de Garmin a un resumen conciso y relevante para decidir
    el plan. V1: cada sesión de Runna trae su intensidad real ya calculada
    (session_intensity.py), no solo el nombre. V2: incluye sueño y carga de
    entrenamiento acumulada, antes descargados y nunca usados.
    """
    from statistics import mean

    zones = garmin.get("hr_zones", {})
    zones_str = " | ".join(f"{k}: {v['min']}–{v['max']} bpm" for k, v in zones.items() if v.get("min") is not None)

    health = garmin.get("health", {})

    def recent(series, key, n=7):
        return [h[key] for h in series[-n:] if h.get(key) is not None]

    def fmt_series(vals):
        avg = round(mean(vals), 1) if vals else "N/A"
        trend = "→"
        if len(vals) >= 2:
            trend = "↑" if vals[-1] > vals[0] else "↓" if vals[-1] < vals[0] else "→"
        return avg, trend, ", ".join(str(v) for v in vals)

    hrv_avg, hrv_trend, hrv_series_str = fmt_series(recent(health.get("hrv", []), "hrv"))
    rhr_avg, rhr_trend, rhr_series_str = fmt_series(recent(health.get("resting_hr", []), "resting_hr"))
    sleep_avg, sleep_trend, sleep_series_str = fmt_series(recent(health.get("sleep", []), "sleep_score"))

    # Actividades — resumen compacto + carga acumulada real (V2, antes descargada y sin usar)
    acts = garmin.get("activities_last_3_weeks", [])
    act_lines = []
    total_load = 0.0
    for a in acts:
        dur = int((a.get("duration_sec") or 0) // 60)
        km = round((a.get("distance_m") or 0) / 1000, 1)
        hr = a.get("avg_hr", "—")
        load = a.get("training_load")
        aerobic = a.get("aerobic_effect")
        if isinstance(load, (int, float)):
            total_load += load
        extra = " | ".join(
            filter(None, [f"carga {load}" if load is not None else None, f"efecto aer. {aerobic}" if aerobic is not None else None])
        )
        act_lines.append(f"  {a['date']} | {a['type']:<22} | {dur} min | {km} km | HR avg {hr}" + (f" | {extra}" if extra else ""))
    acts_str = "\n".join(act_lines) if act_lines else "  (ninguna)"

    # Plan Runna — con intensidad real por sesión (V1, antes solo llegaba el nombre)
    plan = garmin.get("weekly_plan", [])
    plan_lines = []
    for s in plan:
        info = summarise_session(s)
        label = (info["intensity"] or "sin especificar").upper()
        parts = [f"  {s.get('date')} | {s.get('sport', ''):<10} | {s.get('name', ''):<45} | {label}"]
        if info["duration_min"]:
            parts.append(f"~{info['duration_min']}min")
        if info["max_zone"]:
            parts.append(f"Z{info['max_zone']} máx")
        if info["structure"]:
            parts.append(info["structure"])
        plan_lines.append(" | ".join(parts))
    plan_str = "\n".join(plan_lines) if plan_lines else "  (sin sesiones)"

    return f"""ZONAS FC: {zones_str}

SALUD — últimos 7 días:
  HRV:      avg={hrv_avg} ms | tendencia={hrv_trend} | serie=[{hrv_series_str}]
  FC reposo: avg={rhr_avg} bpm | tendencia={rhr_trend} | serie=[{rhr_series_str}]
  Sueño:    avg={sleep_avg}/100 | tendencia={sleep_trend} | serie=[{sleep_series_str}]

ACTIVIDADES — últimas 3 semanas (carga de entrenamiento acumulada: {round(total_load)}):
{acts_str}

PLAN RUNNA — próximas semanas (intensidad ya calculada, no la infieras del nombre):
{plan_str}"""


def build_user_message(garmin: dict) -> str:
    from datetime import timedelta
    today = date.today()
    days_since_sunday = (today.weekday() + 1) % 7
    week1_sun = today - timedelta(days=days_since_sunday)
    week1_sat = week1_sun + timedelta(days=6)
    week2_sun = week1_sun + timedelta(days=7)
    week2_sat = week2_sun + timedelta(days=6)

    return f"""Fecha de hoy: {today.isoformat()}
Altitud: Bogotá (~2.600 m.s.n.m.)

HORIZONTE DE PLANIFICACIÓN (semanas de domingo a sábado):
  Semana 1: {week1_sun.isoformat()} (dom) → {week1_sat.isoformat()} (sáb)
  Semana 2: {week2_sun.isoformat()} (dom) → {week2_sat.isoformat()} (sáb)

IMPORTANTE: En el campo weeks_plan, usa exactamente estas fechas:
  Semana 1 → "week_start": "{week1_sun.isoformat()}", "week_end": "{week1_sat.isoformat()}"
  Semana 2 → "week_start": "{week2_sun.isoformat()}", "week_end": "{week2_sat.isoformat()}"

{_summarise_garmin(garmin)}

PLAN GIMNASIO — fechas bloqueadas, NO pongas ciclismo en ninguna de ellas:
{strength_plan.prompt_block()}

Genera el plan para las PRÓXIMAS 2 SEMANAS. Devuelve únicamente el objeto JSON."""


def _strip_fences(raw: str) -> str:
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    if raw.endswith("```"):
        raw = raw[: raw.rfind("```")]
    return raw.strip()


def call_claude(garmin: dict, research: str) -> dict:
    """
    Llamada única a Claude, sin caché (las actualizaciones son demasiado
    espaciadas para que un TTL de 5 min llegue a leerse — solo pagaría el
    recargo de escritura sin contrapartida) y con un solo reintento, activado
    únicamente si la respuesta se truncó. Con el output reducido (Claude ya
    no genera runna_sessions ni el workout completo de ciclismo) 8.000 tokens
    alcanzan de sobra, así que no hay una tercera llamada de "reparación".
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("ERROR: ANTHROPIC_API_KEY not set in .env", file=sys.stderr)
        sys.exit(1)

    client = anthropic.Anthropic(api_key=api_key)
    system_text = SYSTEM_PROMPT.format(research=research)
    user_msg = build_user_message(garmin)

    max_tokens = 8000
    for attempt in range(2):
        print(f"Llamando a Claude API (max_tokens={max_tokens})...")
        message = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=max_tokens,
            system=system_text,
            messages=[{"role": "user", "content": user_msg}],
        )
        log_usage(message.usage, "generate_plan")

        if message.stop_reason == "max_tokens":
            print("  Respuesta truncada, reintentando con más tokens...")
            max_tokens = 16000
            continue

        raw = _strip_fences(message.content[0].text.strip())
        try:
            return json.loads(raw)
        except json.JSONDecodeError as e:
            print(f"ERROR: JSON inválido en la respuesta de Claude: {e}", file=sys.stderr)
            raise

    raise RuntimeError("La respuesta de Claude se truncó incluso con max_tokens=16000.")


def build_runna_sessions(garmin: dict) -> list[dict]:
    """
    Construye la lista de sesiones de Runna directamente desde
    garmin['weekly_plan'] — Claude ya no las genera (antes las resumía a
    partir del texto plano que recibía y no reproducía fielmente el detalle;
    el código ya tiene el workout real descargado por fetch_garmin.py).

    OJO: incluye también las sesiones de ciclismo que ya estén programadas en
    el calendario de Garmin (de una ejecución anterior) — así lo hacía la
    versión anterior y el frontend depende de eso (ver
    src/lib/session-dates.ts: dedupeSessions, que existe justamente porque
    una sesión de ciclismo puede aparecer aquí Y en cycling_sessions).
    """
    sessions = []
    for item in garmin.get("weekly_plan", []):
        session = {
            "date": item.get("date"),
            "name": item.get("name"),
            "sport": item.get("sport"),
        }
        if item.get("workout_id"):
            session["workout_id"] = item["workout_id"]
        if item.get("garmin_workout"):
            session["garmin_workout"] = item["garmin_workout"]
        sessions.append(session)
    return sessions


def save_outputs(plan: dict, garmin: dict) -> None:
    """
    Construye el garmin_workout completo de cada sesión de ciclismo a partir
    de la decisión de Claude (date/type/duration_min/rationale) antes de
    guardar — ver build_cycling_workout.py.
    """
    hr_zones = garmin.get("hr_zones", {})
    for session in plan.get("cycling_sessions", []):
        built = build_cycling_workout.build(session, hr_zones)
        session["name"] = built["name"]
        session["primary_zone"] = built["primary_zone"]
        session["garmin_workout"] = built["garmin_workout"]

    WORKOUTS_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_PLAN.write_text(json.dumps(plan, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Saved plan → {OUTPUT_PLAN}")

    for session in plan.get("cycling_sessions", []):
        workout = session.get("garmin_workout")
        if not workout:
            continue
        session_date = session.get("date", "unknown")
        fname = WORKOUTS_DIR / f"{session_date}_cycling.json"
        fname.write_text(json.dumps(workout, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"Saved workout → {fname}")


def attach_strength(plan: dict) -> list[str]:
    """
    Añade las sesiones de gimnasio al plan y saca del ciclismo cualquier día que
    choque con ellas.

    El filtro no sobra aunque el prompt ya lo prohíba: el modelo se lo saltó en
    pruebas cuando la semana quedaba apretada, y una bici encima de la sesión
    pesada del lunes es justo lo que este bloque intenta evitar. Devuelve la lista
    de fechas descartadas para que main() las reporte en vez de perderlas en
    silencio.
    """
    gym = strength_plan.gym_dates()
    plan["strength_sessions"] = [
        {
            "date": d,
            "session": code,
            "title": strength_plan.SESSIONS[code]["title"],
            "duration_min": strength_plan.SESSIONS[code]["duration_min"],
        }
        for d, code in sorted(gym.items())
    ]

    dropped = []
    kept = []
    for s in plan.get("cycling_sessions", []):
        if s.get("date") in gym:
            dropped.append(s["date"])
        else:
            kept.append(s)
    plan["cycling_sessions"] = kept
    return dropped


def main():
    garmin, research = load_inputs()
    plan = call_claude(garmin, research)
    plan["runna_sessions"] = build_runna_sessions(garmin)
    dropped = attach_strength(plan)
    if dropped:
        print(f"⚠ Ciclismo descartado por chocar con gimnasio: {', '.join(dropped)}")
    save_outputs(plan, garmin)

    print("\n=== WEEK SUMMARY ===")
    print(plan.get("week_summary", ""))
    print(f"\nAthlete state: {plan.get('athlete_state', '—')}")

    sessions = plan.get("cycling_sessions", [])
    print(f"\nCycling sessions added: {len(sessions)}")
    for s in sessions:
        print(f"  {s['date']} — {s['name']} ({s['duration_min']} min, {s['primary_zone']})")

    strength = plan.get("strength_sessions", [])
    print(f"\nStrength sessions: {len(strength)}")
    for s in strength:
        print(f"  {s['date']} — Gimnasio {s['session']}: {s['title']} ({s['duration_min']} min)")

    la = plan.get("load_analysis", {})
    dist = la.get("estimated_zone_distribution", {})
    print(f"\nZone distribution: Z1={dist.get('Z1_pct')}%  Z2={dist.get('Z2_pct')}%  Z3={dist.get('Z3_pct')}%")
    print(f"\nScientific rationale:\n{plan.get('scientific_rationale', '')}")


if __name__ == "__main__":
    main()

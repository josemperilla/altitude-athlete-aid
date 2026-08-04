"""
Reads .tmp/garmin_data.json + context/research_insights.md, calls Claude API,
and generates the augmented weekly training plan with cycling sessions.

Output:
  .tmp/augmented_plan.json       — full plan + load analysis + rationale
  .tmp/workouts/<date>_cycling.json  — one Garmin workout JSON per cycling session

Usage: python tools/generate_plan.py
"""
import json
import os
import sys
from pathlib import Path
from datetime import date

import anthropic
from dotenv import load_dotenv

ROOT = Path(__file__).parent.parent
load_dotenv(ROOT / ".env")

GARMIN_DATA = ROOT / ".tmp" / "garmin_data.json"
RESEARCH_CTX = ROOT / "context" / "research_insights.md"
OUTPUT_PLAN = ROOT / ".tmp" / "augmented_plan.json"
WORKOUTS_DIR = ROOT / ".tmp" / "workouts"

SYSTEM_PROMPT = """Eres un optimizador élite de entrenamiento de resistencia especializado en rendimiento
para un medio maratón en altitud (Bogotá, ~2.600 m). Tomas decisiones basadas en evidencia científica.

IDIOMA: Todos los campos de texto en el JSON de respuesta deben estar escritos en ESPAÑOL.

CONTEXTO CIENTÍFICO (artículos revisados por pares):
{research}

PRINCIPIOS CLAVE DE LA LITERATURA:
- El entrenamiento polarizado (≥75% Z1, <10% Z2, 15-20% Z3) supera a los modelos de umbral.
- El ciclismo añade volumen aeróbico SIN impacto de carrera — ideal para recuperación en altitud.
- Z2 en ciclismo es un TECHO, no un piso. Usa Z1 por defecto salvo que el atleta esté claramente fresco.
- 2-3 sesiones duras por semana (de Runna); el resto es volumen Z1.
- En altitud: el estrés cardiovascular es mayor → reduce duración Z2 un 10-15% vs nivel del mar.
- HRV bajo + FC reposo elevada = fatiga → todo el ciclismo debe ser Z1 de recuperación.

RESTRICCIONES DEL ATLETA:
- Planifica ciclismo para las PRÓXIMAS 2 SEMANAS completas (14 días desde hoy).
- Máximo 1-2 sesiones de ciclismo por semana. Preferir 1 si el atleta está fatigado.
- Días PREFERIDOS para ciclismo (en orden de prioridad): lunes, domingo sin long run, miércoles sin sesión intensa de Runna, viernes sin sesión intensa de Runna.
- Martes y jueves son días de fuerza: evitar si hay otras opciones. Si no queda otra opción, se puede poner ciclismo ligero (Z1, máx 45 min).
- Sábado: evitar si hay otras opciones disponibles. Solo usar como último recurso si el resto de la semana no deja ningún hueco viable.
- REGLA ABSOLUTA: NUNCA colocar ciclismo en un día que tenga sesión de Runna. Cero excepciones. Primero revisa la lista completa de runna_sessions y verifica que la fecha del cycling_session NO aparezca en ninguna de ellas.
- Semana 1: evalúa el estado actual del atleta. Semana 2: proyecta la progresión esperada (si está fatigado ahora, la semana 2 puede ser más intensa).

TIPOS DE ENTRENAMIENTO DE CICLISMO (solo estos dos):

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TIPO A — "Subida a Patios"
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Ruta: Calle 104A #21-66 (Bogotá) → Peaje La Calera
Distancia solo subida: ~16 km
Desnivel positivo: ~680 m
Duración estimada total (ida y vuelta): 90-110 min

Cuándo usarlo: atleta BALANCEADO o DESCARGADO. Buen estímulo Z2 natural por el desnivel.
NO usar si el atleta está FATIGADO.

Estructura de fases:
  Calentamiento (10 min): FC [Z1_min]–[Z1_max] bpm | Pedalea suave desde casa en plano
  Subida principal (60–75 min): FC [Z2_min]–[Z2_max] bpm | Ritmo constante y controlado en la subida
  Descenso / vuelta (15–20 min): FC [Z1_min]–[Z1_max] bpm | Baja controlado, sin esfuerzo

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TIPO B — "Ciclorruta en plano"
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Ruta: Ciclorrutas planas de Bogotá (salida libre desde casa)
Terreno: plano, sin desnivel significativo
Duración: 30–60 min según carga semanal

Cuándo usarlo: atleta FATIGADO o día de recuperación. Siempre Z1.

Estructura de fases:
  Calentamiento (5–10 min): FC [Z1_min]–[Z1_max] bpm | Pedaleo suave hasta encontrar ritmo
  Parte principal (20–45 min): FC [Z1_min]–[Z1_max] bpm | Ritmo conversacional, sin superar Z1
  Vuelta / enfriamiento (5–10 min): FC [Z1_min]–[Z1_max] bpm | Reduce cadencia gradualmente

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

REGLA DE SELECCIÓN:
  Estado fatigado → SIEMPRE Ciclorruta en plano
  Estado balanceado → Subida a Patios (si el día permite 90-110 min) o Ciclorruta en plano
  Estado descargado → Subida a Patios preferida

LAS SESIONES DE RUNNA SON DE SOLO LECTURA. Nunca modificarlas. Solo añadir ciclismo.

FORMATO DE SALIDA — responde con un único objeto JSON válido.

El objeto debe incluir un campo "weeks_plan" con una entrada por semana planificada.
Para cada semana describe:
  - week_type: tipo de semana dentro de la periodización
      "recuperacion" | "base_aerobica" | "carga_moderada" | "carga_alta" | "descarga" | "pico" | "competencia"
  - purpose: qué se busca lograr esa semana (2-3 oraciones en español, claro y concreto)
  - macro_context: cómo encaja en el plan macro hacia el medio maratón (1-2 oraciones)
  - load_expectation: descripción breve del volumen e intensidad esperados

Reglas de los campos "description" en el workout de Garmin:
  - workout description: resumen de la sesión con ruta, distancia, desnivel (si aplica) y objetivo
  - step description de cada paso: debe incluir duración, objetivo de FC en bpm ("FC: X–Y bpm"), zona ("Z1"/"Z2"), e instrucción concreta de qué hacer

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
  "runna_sessions": [...],
  "cycling_sessions": [
    {{
      "date": "YYYY-MM-DD",
      "name": "Subida a Patios | Ciclorruta en plano",
      "type": "subida_a_patios | ciclorruta_en_plano",
      "duration_min": integer,
      "primary_zone": "Z1 | Z2",
      "rationale": "string en español: por qué este tipo en este día",
      "garmin_workout": {{
        "workoutName": "Subida a Patios | Ciclorruta en plano",
        "description": "string: descripción completa con ruta, desnivel, objetivo y fases resumidas",
        "sportType": {{"sportTypeId": 2, "sportTypeKey": "cycling"}},
        "workoutSegments": [
          {{
            "segmentOrder": 1,
            "sportType": {{"sportTypeId": 2, "sportTypeKey": "cycling"}},
            "workoutSteps": [
              {{
                "stepOrder": 1,
                "stepType": {{"stepTypeKey": "warmup"}},
                "description": "string: instrucción detallada con FC objetivo en bpm, zona y qué hacer",
                "endCondition": {{"conditionTypeKey": "time"}},
                "endConditionValue": <segundos>,
                "targetType": {{"workoutTargetTypeKey": "heart.rate.zone"}},
                "targetValueOne": <Z1_min_bpm>,
                "targetValueTwo": <Z1_max_bpm>
              }},
              {{
                "stepOrder": 2,
                "stepType": {{"stepTypeKey": "interval"}},
                "description": "string: instrucción detallada con FC objetivo en bpm, zona y qué hacer",
                "endCondition": {{"conditionTypeKey": "time"}},
                "endConditionValue": <segundos>,
                "targetType": {{"workoutTargetTypeKey": "heart.rate.zone"}},
                "targetValueOne": <zone_min_bpm>,
                "targetValueTwo": <zone_max_bpm>
              }},
              {{
                "stepOrder": 3,
                "stepType": {{"stepTypeKey": "cooldown"}},
                "description": "string: instrucción detallada con FC objetivo en bpm, zona y qué hacer",
                "endCondition": {{"conditionTypeKey": "time"}},
                "endConditionValue": <segundos>,
                "targetType": {{"workoutTargetTypeKey": "heart.rate.zone"}},
                "targetValueOne": <Z1_min_bpm>,
                "targetValueTwo": <Z1_max_bpm>
              }}
            ]
          }}
        ]
      }}
    }}
  ],
  "load_analysis": {{
    "last_3_weeks_avg_weekly_hours": number,
    "this_week_running_hours": number,
    "this_week_cycling_hours_added": number,
    "estimated_zone_distribution": {{"Z1_pct": number, "Z2_pct": number, "Z3_pct": number}},
    "fatigue_signals": "string en español"
  }},
  "scientific_rationale": "string en español: 2-3 oraciones citando artículos"
}}

Usa los BPM EXACTOS de hr_zones del input. No inventes límites de zonas.
"""


def load_inputs() -> tuple[dict, str]:
    if not GARMIN_DATA.exists():
        print(f"ERROR: {GARMIN_DATA} not found. Run tools/fetch_garmin.py first.", file=sys.stderr)
        sys.exit(1)
    if not RESEARCH_CTX.exists():
        print(f"ERROR: {RESEARCH_CTX} not found. Run tools/extract_papers.py first.", file=sys.stderr)
        sys.exit(1)

    garmin = json.loads(GARMIN_DATA.read_text(encoding="utf-8"))
    research = RESEARCH_CTX.read_text(encoding="utf-8")
    return garmin, research


def _summarise_garmin(garmin: dict) -> str:
    """OPT-6: Compress Garmin JSON to a concise summary to reduce input tokens."""
    from statistics import mean

    # HR zones — just boundaries
    zones = garmin.get("hr_zones", {})
    zones_str = " | ".join(f"{k}: {v['min']}–{v['max']} bpm" for k, v in zones.items() if v.get("min"))

    # Health: last 7 days trends + averages
    health = garmin.get("health", {})

    def recent(series, key, n=7):
        vals = [h[key] for h in series[-n:] if h.get(key) is not None]
        return vals

    hrv_vals = recent(health.get("hrv", []), "hrv")
    rhr_vals = recent(health.get("resting_hr", []), "resting_hr")

    hrv_avg  = round(mean(hrv_vals), 1)  if hrv_vals  else "N/A"
    rhr_avg  = round(mean(rhr_vals), 1)  if rhr_vals  else "N/A"
    hrv_trend = "↑" if len(hrv_vals) >= 2 and hrv_vals[-1] > hrv_vals[0] else ("↓" if len(hrv_vals) >= 2 and hrv_vals[-1] < hrv_vals[0] else "→")
    rhr_trend = "↑" if len(rhr_vals) >= 2 and rhr_vals[-1] > rhr_vals[0] else ("↓" if len(rhr_vals) >= 2 and rhr_vals[-1] < rhr_vals[0] else "→")

    hrv_series_str = ", ".join(str(v) for v in hrv_vals)
    rhr_series_str = ", ".join(str(v) for v in rhr_vals)

    # Activities: compact list
    acts = garmin.get("activities_last_3_weeks", [])
    act_lines = []
    for a in acts:
        dur = int((a.get("duration_sec") or 0) // 60)
        km  = round((a.get("distance_m") or 0) / 1000, 1)
        hr  = a.get("avg_hr", "—")
        act_lines.append(f"  {a['date']} | {a['type']:<22} | {dur} min | {km} km | HR avg {hr}")
    acts_str = "\n".join(act_lines) if act_lines else "  (ninguna)"

    # Runna plan
    plan = garmin.get("weekly_plan", [])
    plan_lines = [f"  {s['date']} | {s['sport']:<10} | {s['name']}" for s in plan]
    plan_str = "\n".join(plan_lines) if plan_lines else "  (sin sesiones)"

    return f"""ZONAS FC: {zones_str}

SALUD — últimos 7 días:
  HRV:      avg={hrv_avg} ms | tendencia={hrv_trend} | serie=[{hrv_series_str}]
  FC reposo: avg={rhr_avg} bpm | tendencia={rhr_trend} | serie=[{rhr_series_str}]

ACTIVIDADES — últimas 3 semanas:
{acts_str}

PLAN RUNNA — próximas semanas:
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
    OPT-2: Prompt caching — the large research context (~40KB) is sent with
    cache_control so Anthropic caches it for 5 min. Repeat calls (retries,
    re-runs within the same window) pay only ~10% of the token cost.
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("ERROR: ANTHROPIC_API_KEY not set in .env", file=sys.stderr)
        sys.exit(1)

    client = anthropic.Anthropic(api_key=api_key)
    system_text = SYSTEM_PROMPT.format(research=research[:40000])
    user_msg = build_user_message(garmin)

    # System prompt as list with cache_control on the large research block
    system_blocks = [
        {
            "type": "text",
            "text": system_text,
            "cache_control": {"type": "ephemeral"},
        }
    ]

    for max_tokens in [8000, 16000]:
        print(f"Llamando a Claude API (max_tokens={max_tokens})...")
        message = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=max_tokens,
            system=system_blocks,
            messages=[{"role": "user", "content": user_msg}],
        )

        raw = _strip_fences(message.content[0].text.strip())

        # Log cache usage if available
        usage = message.usage
        if hasattr(usage, "cache_read_input_tokens") and usage.cache_read_input_tokens:
            print(f"  → Caché hit: {usage.cache_read_input_tokens} tokens leídos del caché")
        elif hasattr(usage, "cache_creation_input_tokens") and usage.cache_creation_input_tokens:
            print(f"  → Caché creado: {usage.cache_creation_input_tokens} tokens almacenados")

        if message.stop_reason == "max_tokens":
            print(f"  Respuesta truncada, reintentando con más tokens...")
            continue

        try:
            return json.loads(raw)
        except json.JSONDecodeError as e:
            print(f"  JSON inválido con max_tokens={max_tokens}: {e}. Reintentando...")

    # Last resort: fix truncated JSON
    print("  Solicitando corrección del JSON truncado...")
    fix_msg = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=16000,
        system=[{"type": "text", "text": "Eres un asistente que corrige JSON incompleto. Devuelve únicamente el JSON completo y válido, sin texto adicional."}],
        messages=[
            {"role": "user", "content": user_msg},
            {"role": "assistant", "content": raw},
            {"role": "user", "content": "El JSON está incompleto/truncado. Complétalo y devuelve el objeto JSON completo y válido."},
        ],
    )
    return json.loads(_strip_fences(fix_msg.content[0].text.strip()))


def _attach_runna_workouts(plan: dict, garmin: dict) -> dict:
    """
    Pega el garmin_workout descargado (con pasos, ritmos y zonas objetivo) a cada
    sesión de running del plan. Claude genera runna_sessions a partir del resumen
    plano que recibe, y no reproduce fielmente la estructura del workout; en cambio,
    fetch_garmin.py ya descargó el workout real de Garmin por workout_id. Aquí lo
    casamos por fecha + nombre y lo adjuntamos, así el frontend (y el clasificador
    de intensidad) ven el detalle real sin depender de que Claude lo copie.

    Es tolerante: si no hay match, la sesión queda intacta (sin garmin_workout).
    """
    scheduled = garmin.get("weekly_plan", [])
    # Índice por fecha → garmin_workout (la primera sesión con workout esa fecha).
    by_date: dict[str, dict] = {}
    for item in scheduled:
        d = item.get("date")
        if d and item.get("garmin_workout") and d not in by_date:
            by_date[d] = item["garmin_workout"]

    matched = 0
    for session in plan.get("runna_sessions", []):
        d = session.get("date")
        if d and d in by_date and "garmin_workout" not in session:
            session["garmin_workout"] = by_date[d]
            session["workout_id"] = next(
                (s.get("workout_id") for s in scheduled if s.get("date") == d and s.get("workout_id")),
                None,
            )
            matched += 1

    if matched:
        print(f"Attached garmin_workout to {matched} runna session(s)")
    return plan


def save_outputs(plan: dict):
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


def main():
    garmin, research = load_inputs()
    plan = call_claude(garmin, research)
    plan = _attach_runna_workouts(plan, garmin)
    save_outputs(plan)

    print("\n=== WEEK SUMMARY ===")
    print(plan.get("week_summary", ""))
    print(f"\nAthlete state: {plan.get('athlete_state', '—')}")

    sessions = plan.get("cycling_sessions", [])
    print(f"\nCycling sessions added: {len(sessions)}")
    for s in sessions:
        print(f"  {s['date']} — {s['name']} ({s['duration_min']} min, {s['primary_zone']})")

    la = plan.get("load_analysis", {})
    dist = la.get("estimated_zone_distribution", {})
    print(f"\nZone distribution: Z1={dist.get('Z1_pct')}%  Z2={dist.get('Z2_pct')}%  Z3={dist.get('Z3_pct')}%")
    print(f"\nScientific rationale:\n{plan.get('scientific_rationale', '')}")


if __name__ == "__main__":
    main()

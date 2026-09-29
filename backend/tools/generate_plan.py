"""
Reads .tmp/garmin_data.json + context/research_principles.md (+ runna_plan.json
si existe), calls Claude API, y genera el plan semanal aumentado: sesiones de
ciclismo y la revisión de las carreras de Runna.

Claude solo decide (fecha, tipo, duración, justificación) de cada sesión de
ciclismo; el workout completo de Garmin y las runna_sessions se construyen en
código (ver build_cycling_workout.py y build_runna_sessions()) — el modelo no
reproduce JSON estructural que el código ya tiene o puede derivar.

Las carreras de Runna no se reescriben: el modelo propone ajustes, runna_checks
los valida (y añade los recortes por sesión pico que olvide) y cada uno queda en
su sesión como `adjustment`. Runna es dueño de sus workouts en Garmin.

Output:
  .tmp/augmented_plan.json       — plan completo + load analysis + rationale
  .tmp/workouts/<date>_cycling.json  — un workout de Garmin por sesión de ciclismo

Usage: .venv/bin/python tools/generate_plan.py
"""
import json
import os
import sys
from pathlib import Path
from datetime import date, timedelta

import anthropic
from dotenv import load_dotenv

import adjust_workout
import build_cycling_workout
import runna_checks
import strength_plan
from athletes import RACE
from session_intensity import summarise_session
from usage_log import log_usage

from paths import data_file

ROOT = Path(__file__).parent.parent
load_dotenv(ROOT / ".env")

GARMIN_DATA = data_file("garmin_data.json")
RESEARCH_PRINCIPLES = ROOT / "context" / "research_principles.md"
RUNNA_PLAN = data_file("runna_plan.json")
OUTPUT_PLAN = data_file("augmented_plan.json")
WORKOUTS_DIR = data_file("workouts")

SYSTEM_PROMPT = """Eres un optimizador élite de entrenamiento de resistencia especializado en rendimiento
para un medio maratón en altitud (Bogotá, ~2.600 m). Tomas decisiones basadas en evidencia científica.

IDIOMA: Todos los campos de texto en el JSON de respuesta deben estar escritos en ESPAÑOL.

CONTEXTO CIENTÍFICO (principios destilados de literatura revisada por pares):
{research}

PRINCIPIOS CLAVE:
- La base es el volumen fácil (Z1) y la constancia. En corredores aficionados, polarizado y piramidal
  rinden igual; el trabajo de umbral (Z2 del modelo de 3 zonas) es el más específico del medio maratón.
  El error no es la Z2 con intención, sino correr los rodajes fáciles a ritmo de tempo.
- El ciclismo añade volumen aeróbico SIN impacto de carrera — ideal para recuperación en altitud.
- Z2 en ciclismo es un TECHO, no un piso. Usa Z1 por defecto salvo que el atleta esté claramente fresco.
- 2-3 sesiones duras por semana (de Runna); el resto es volumen Z1.
- En altitud: el estrés cardiovascular es mayor → reduce duración Z2 un 10-15% vs nivel del mar.
- Fatiga = HRV bajo + FC reposo elevada + sueño pobre + carga acumulada alta → todo el ciclismo Z1 de recuperación.

RESTRICCIONES DEL ATLETA:
- Planifica ciclismo para las PRÓXIMAS 2 SEMANAS completas (14 días desde hoy).
- Máximo 1-2 sesiones de ciclismo por semana (alternativas incluidas). Preferir 1 si el atleta está fatigado.
- REGLA ABSOLUTA: NUNCA pongas ciclismo en una fecha que aparezca en la lista PLAN GIMNASIO del mensaje
  del usuario (lunes y miércoles). El lunes carga fuerza pesada; el miércoles va el día antes de la calidad
  de Runna. Meter bici ahí es apilar estímulos.
- REGLA ABSOLUTA: NUNCA pongas ciclismo el día de una carrera de Runna de intensidad MODERADA o ALTA (tirada
  larga, tempo, series). Cada sesión en PLAN RUNNA ya trae su intensidad calculada — úsala, no la infieras del nombre.
- ALTERNATIVA A UN RODAJE: en un día con una carrera de Runna de intensidad BAJA (easy run) SÍ puedes poner
  ciclismo, pero como ALTERNATIVA: el rodaje NO se quita, el atleta elige cuál de los dos hace ese día.
  Márcalo con "alternative_to_easy_run": true. Siempre "ciclorruta_en_plano", Z1, con una duración entre 1 y
  1,3 veces la del rodaje (la bici carga menos por minuto). Es la mejor opción cuando hay fatiga o molestias
  de impacto, o el día después de la calidad de Runna. Justifica en "rationale" cuándo conviene elegir la bici.
- Día sin Runna ni gimnasio (hoy suele ser solo el sábado, víspera de la tirada larga): solo
  ciclorruta_en_plano ≤45 min, y solo si no hay un rodaje fácil mejor para la alternativa.
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

REVISIÓN DE LAS CARRERAS DE RUNNA (semana a semana):
Runna es el esqueleto: su periodización y sus ritmos se respetan por defecto. Tú revisas cada carrera
de PLAN RUNNA dentro del horizonte de 2 semanas contra los principios de arriba, las señales de Garmin
y el CICLO COMPLETO DE RUNNA, y propones un ajuste SOLO donde la evidencia o las señales lo pidan.
Cada ajuste llega al reloj: el sistema toma el workout real de Runna, le aplica tus "ops" y lo sube a
Garmin como «Ajustado · <nombre>», al lado del original. Una sesión que está bien NO se incluye
(ausencia = mantener).

Veredictos:
  "ajustar"          — misma sesión con un cambio concreto: recortar distancia, poner techo de FC a un
                       rodaje, controlar las series de umbral por FC en vez de por ritmo, quitar repeticiones.
  "cambiar_a_facil"  — reemplazar por rodaje fácil Z1 (di cuántos km y el techo de FC). SOLO con fatiga
                       objetiva: al menos dos de HRV bajo, FC en reposo elevada o sueño pobre. Cítalas.

Reglas de ajuste:
  - SEMANA DE CARRERA (así marcada en PLAN RUNNA): ningún ajuste. El sistema los descarta.
  - TAPER: solo recortes de volumen. La intensidad de las sesiones clave y el número de días de carrera
    se mantienen.
  - Sesión marcada "PICO": propón siempre el recorte a ≤10 % sobre la base indicada.
  - Altitud (Bogotá): si un ritmo de Runna puede sacar un rodaje de Z1 o una serie de umbral por encima
    del segundo umbral, el ajuste es por FC usando ZONAS FC, no bajar el ritmo a ojo.
  - Pocos y bien justificados: máximo 2 ajustes por semana. Runna ya periodiza.
  - "change" es una instrucción que el atleta ejecuta sin pensar: km, minutos, bpm.

Operaciones ("ops") — lo que el sistema aplica al workout de Runna. Solo estas cuatro; "change" debe
describir exactamente lo mismo que las ops, con palabras:
  {{"op": "set_distance_km", "km": 18.5}}    distancia total; se escalan calentamiento, bloques continuos y
                                           enfriamiento (las series no se tocan)
  {{"op": "set_reps", "reps": 4}}            número de repeticiones del bloque de series
  {{"op": "hr_cap", "bpm": 160}}             cambia el objetivo de ritmo por un techo de FC (usa ZONAS FC)
  {{"op": "easy_run", "km": 8, "bpm": 150}}  reemplaza toda la sesión por un rodaje fácil; obligatoria con
                                           "cambiar_a_facil"
  Si un ajuste no cabe en estas ops (p. ej., "añade 4 aceleraciones"), no lo propongas: el atleta no lo
  vería en el reloj.

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
      "alternative_to_easy_run": boolean,
      "rationale": "string en español: por qué este tipo en este día, citando las señales concretas (HRV, FC reposo, sueño, carga, intensidad de sesiones cercanas de Runna) que lo justifican"
    }}
  ],
  "running_adjustments": [
    {{
      "date": "YYYY-MM-DD",
      "verdict": "ajustar | cambiar_a_facil",
      "change": "string en español: la instrucción concreta, con km, minutos o bpm",
      "rationale": "string en español: la señal o el principio que lo justifica (1-2 oraciones)",
      "ops": [{{"op": "set_distance_km | set_reps | hr_cap | easy_run", "...": "ver Operaciones"}}]
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


def load_inputs() -> tuple[dict, str, dict]:
    if not GARMIN_DATA.exists():
        print(f"ERROR: {GARMIN_DATA} not found. Run tools/fetch_garmin.py first.", file=sys.stderr)
        sys.exit(1)
    if not RESEARCH_PRINCIPLES.exists():
        print(f"ERROR: {RESEARCH_PRINCIPLES} not found.", file=sys.stderr)
        sys.exit(1)

    garmin = json.loads(GARMIN_DATA.read_text(encoding="utf-8"))
    research = RESEARCH_PRINCIPLES.read_text(encoding="utf-8")
    # Opcional: sin RUNNA_ICS_URL no existe, y el plan sale sin la vista macro.
    runna_plan = json.loads(RUNNA_PLAN.read_text(encoding="utf-8")) if RUNNA_PLAN.exists() else {}
    return garmin, research, runna_plan


def runna_context(garmin: dict, runna_plan: dict) -> dict:
    """Fecha de carrera, banderas de pico y ciclo completo, calculados una vez y
    usados dos: para el prompt y para validar lo que devuelve el modelo.

    La fecha de carrera es una sola: la de athletes.RACE. El evento RACE del feed
    solo se usa para comprobar que el feed es de este ciclo: si no coincide (el
    feed se cayó y quedó el runna_plan.json de un plan anterior, o Runna apunta a
    otra carrera), se avisa y el feed se ignora entero, en vez de mezclar la
    carrera de un plan con las sesiones de otro.
    """
    race_date = RACE["race_date"]
    feed_race = runna_plan.get("race_date")
    if runna_plan and feed_race != race_date.isoformat():
        print(
            f"⚠ El feed de Runna apunta a la carrera del {feed_race or '—'} y athletes.py a la del "
            f"{race_date.isoformat()}: se ignora el feed. Si cambiaste de carrera, actualiza athletes.py.",
            file=sys.stderr,
        )
        runna_plan = {}
    # El feed ve el ciclo entero; sin él, las ~2 semanas que trae Garmin.
    horizon = runna_plan.get("sessions") or garmin.get("weekly_plan", [])
    flags = runna_checks.spike_flags(horizon, runna_checks.longest_recent_run_km(garmin), race_date)
    macro = runna_checks.macro_summary(runna_plan.get("sessions") or [], race_date)
    return {"race_date": race_date, "flags": flags, "macro": macro}


def _summarise_garmin(garmin: dict, ctx: dict) -> str:
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
        if runna_checks.is_run(s) and s.get("date"):
            phase = runna_checks.phase_label(date.fromisoformat(s["date"]), ctx["race_date"])
            if phase in ("SEMANA DE CARRERA", "TAPER"):
                parts.append(phase)
            flag = ctx["flags"].get(s["date"])
            if flag:
                parts.append(f"PICO +{flag['pct']} % sobre la más larga de 30 días ({flag['base_km']:g} km)")
        plan_lines.append(" | ".join(parts))
    plan_str = "\n".join(plan_lines) if plan_lines else "  (sin sesiones)"

    longest = runna_checks.longest_recent_run_km(garmin)
    race_date = ctx["race_date"]
    race = RACE
    days_left = (race_date - date.today()).days
    race_str = (
        f"{race['name']} — {race_date.isoformat()} en {race['race_location']} "
        f"({race['race_altitude_m']} m), faltan {days_left} días"
        if days_left >= 0 else "ninguna carrera por delante (la última ya pasó)"
    )
    macro_str = ctx["macro"] or "  (sin el feed de Runna: solo se conoce lo que trae PLAN RUNNA)"

    return f"""ZONAS FC: {zones_str}

SALUD — últimos 7 días:
  HRV:      avg={hrv_avg} ms | tendencia={hrv_trend} | serie=[{hrv_series_str}]
  FC reposo: avg={rhr_avg} bpm | tendencia={rhr_trend} | serie=[{rhr_series_str}]
  Sueño:    avg={sleep_avg}/100 | tendencia={sleep_trend} | serie=[{sleep_series_str}]

ACTIVIDADES — últimas 3 semanas (carga de entrenamiento acumulada: {round(total_load)}):
{acts_str}
Carrera más larga de los últimos 30 días: {f"{longest:g} km" if longest else "sin dato"}

CARRERA OBJETIVO: {race_str}

CICLO COMPLETO DE RUNNA — contexto para juzgar progresión, descargas y taper (NO se ajusta desde aquí):
{macro_str}

PLAN RUNNA — próximas semanas, lo que se revisa (intensidad ya calculada, no la infieras del nombre):
{plan_str}"""


def build_user_message(garmin: dict, ctx: dict) -> str:
    today = date.today()
    week1_sun = strength_plan.week_start(today)
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

{_summarise_garmin(garmin, ctx)}

PLAN GIMNASIO — fechas bloqueadas, NO pongas ciclismo en ninguna de ellas:
{strength_plan.prompt_block(week1_sun)}

Genera el plan para las PRÓXIMAS 2 SEMANAS y revisa las carreras de PLAN RUNNA. Devuelve únicamente el objeto JSON."""


def _strip_fences(raw: str) -> str:
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    if raw.endswith("```"):
        raw = raw[: raw.rfind("```")]
    return raw.strip()


def call_claude(garmin: dict, research: str, ctx: dict) -> dict:
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
    user_msg = build_user_message(garmin, ctx)

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
    # Los workouts de ejecuciones anteriores se borran: upload_workouts sube todo
    # lo que haya en la carpeta, y un archivo viejo marcado como alternativa
    # llegaría a Garmin aunque ese día Runna ya tenga series.
    WORKOUTS_DIR.mkdir(parents=True, exist_ok=True)
    for pattern in ("*_cycling.json", "*_ajustado.json"):
        for old in WORKOUTS_DIR.glob(pattern):
            old.unlink()

    # Carreras de Runna con ajuste: el workout real de Runna con las ops
    # aplicadas, listo para subir tal cual (ya viene en el formato de Garmin).
    for session in plan.get("runna_sessions", []):
        adjustment = session.get("adjustment")
        if not adjustment:
            continue
        payload = adjust_workout.build(session, adjustment, hr_zones)
        adjustment["pushed"] = payload is not None
        if payload:
            fname = WORKOUTS_DIR / f"{session['date']}_ajustado.json"
            fname.write_text(
                json.dumps({"payload_ready": True, "payload": payload}, indent=2, ensure_ascii=False),
                encoding="utf-8",
            )
            print(f"Saved workout → {fname}")

    for session in plan.get("cycling_sessions", []):
        built = build_cycling_workout.build(session, hr_zones)
        session["name"] = built["name"]
        session["primary_zone"] = built["primary_zone"]
        session["garmin_workout"] = built["garmin_workout"]
        if session.get("alternative_to_easy_run"):
            # Mismo nombre en Garmin a propósito: la app deduplica por fecha+nombre,
            # y un nombre distinto la pintaría dos veces cuando vuelva desde Garmin.
            # El aviso va en la descripción, que es lo que se lee en el reloj.
            workout = session["garmin_workout"]
            workout["description"] = (
                f"ALTERNATIVA al rodaje de Runna de hoy ({session.get('alternative_to')}): "
                f"haz uno de los dos. {workout['description']}"
            )
            # Marca interna para upload_workouts.py (enrich_workout no la envía a Garmin).
            workout["alternative_to_easy_run"] = True

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
    # Del domingo de esta semana en adelante. Con el bloque entero, el plan que
    # se sirve el 14 de septiembre seguía anunciando el gimnasio del 7 y del 9
    # como parte de "lo que viene".
    gym = strength_plan.gym_dates_from(strength_plan.week_start())
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
    garmin, research, runna_plan = load_inputs()
    ctx = runna_context(garmin, runna_plan)
    plan = call_claude(garmin, research, ctx)
    plan["runna_sessions"] = build_runna_sessions(garmin)
    # Los ajustes se cuelgan de su carrera en runna_sessions (session.adjustment)
    # y no quedan como lista suelta: así cualquier vista que ya muestra la
    # sesión los muestra, sin buscarlos por fecha.
    adjustments = runna_checks.validate_adjustments(
        plan.pop("running_adjustments", None), plan["runna_sessions"], ctx["race_date"], ctx["flags"]
    )
    runna_checks.attach_adjustments(plan["runna_sessions"], adjustments)
    dropped = attach_strength(plan)
    if dropped:
        print(f"⚠ Ciclismo descartado por chocar con gimnasio: {', '.join(dropped)}")
    plan["cycling_sessions"], dropped = runna_checks.reconcile_cycling(
        plan.get("cycling_sessions", []), plan["runna_sessions"]
    )
    if dropped:
        print(f"⚠ Ciclismo descartado por caer en tirada larga, tempo o series: {', '.join(dropped)}")
    save_outputs(plan, garmin)

    print("\n=== WEEK SUMMARY ===")
    print(plan.get("week_summary", ""))
    print(f"\nAthlete state: {plan.get('athlete_state', '—')}")

    sessions = plan.get("cycling_sessions", [])
    print(f"\nCycling sessions added: {len(sessions)}")
    for s in sessions:
        alt = f" · alternativa a {s['alternative_to']}" if s.get("alternative_to_easy_run") else ""
        print(f"  {s['date']} — {s['name']} ({s['duration_min']} min, {s['primary_zone']}){alt}")

    print(f"\nRunna adjustments: {len(adjustments)}")
    for a in adjustments:
        print(f"  {a['date']} — {a['runna_name']}: [{a['verdict']}, {a['source']}] {a['change']}")

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

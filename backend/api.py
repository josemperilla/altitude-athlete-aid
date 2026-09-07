"""
FastAPI backend — expone los datos del Entrenador como REST API.
Lovable (u otro frontend) se conecta aquí.

Endpoints (los de datos aceptan ?athlete=jose|andrea; por defecto, jose):
  GET  /plan          → plan aumentado actual (sesiones Runna + ciclismo)
  GET  /garmin        → datos de Garmin (actividades, salud, zonas)
  GET  /diagnosis     → último diagnóstico guardado
  GET  /gym           → bloque de fuerza compartido + carrera del atleta
  GET/POST /gym/done  → sesiones de gimnasio marcadas como hechas, por atleta
  GET  /insights      → insights educativos por categoría
  POST /update        → corre fetch + generate + upload (actualiza el plan)
  POST /diagnose      → analiza una molestia física
  GET  /health        → latido del trabajo semanal (last_run o null), sin token

Usage: .venv/bin/python -m uvicorn api:app --reload --port 8503
"""
import json
import os
import subprocess
import sys
from datetime import date, datetime
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

ROOT = Path(__file__).parent
load_dotenv(ROOT / ".env")

# En Railway el disco del contenedor es efímero: cada deploy lo borra. DATA_DIR
# apunta al volumen montado allí y cae a .tmp/ en local, así que el mismo código
# sirve en los dos sitios sin ramas.
DATA_DIR = Path(os.environ.get("DATA_DIR") or (ROOT / ".tmp"))
DATA_DIR.mkdir(parents=True, exist_ok=True)

GARMIN_DATA = DATA_DIR / "garmin_data.json"
PLAN_DATA   = DATA_DIR / "augmented_plan.json"

# Compartido con el resto de herramientas, que leen .tmp/ por su cuenta.
os.environ.setdefault("DATA_DIR", str(DATA_DIR))

# Después de fijar DATA_DIR en el entorno: paths.py lo resuelve al importarse.
sys.path.insert(0, str(ROOT / "tools"))

from athletes import (  # noqa: E402
    DEFAULT_ATHLETE,
    RACES,
    TRAINING_ALTITUDE_M,
    TRAINING_LOCATION,
    resolve_athlete,
)
from paths import data_file  # noqa: E402


def diagnosis_path(athlete: str) -> Path:
    return data_file(f"diagnosis_{athlete}.json")


def gym_done_path(athlete: str) -> Path:
    return data_file(f"gym_done_{athlete}.json")


# Migración (una sola vez): el volumen de Railway ya tiene un diagnosis.json
# real de Jose. Al particionar por atleta hay que traerlo a
# diagnosis_jose.json, o su historial desaparece de /diagnosis.
_LEGACY_DIAGNOSIS = DATA_DIR / "diagnosis.json"
if not diagnosis_path("jose").exists() and _LEGACY_DIAGNOSIS.exists():
    diagnosis_path("jose").write_text(
        _LEGACY_DIAGNOSIS.read_text(encoding="utf-8"), encoding="utf-8"
    )

app = FastAPI(title="Entrenador API", version="1.0")

# Con la API pública, el origen ya no basta como control: cualquiera con la URL
# podría leer datos de salud o disparar /update, que gasta tokens de Anthropic y
# golpea el rate limit de Garmin. Si API_TOKEN está definido se exige en cada
# petición; sin él la API queda abierta, que es lo correcto en local.
API_TOKEN = os.environ.get("API_TOKEN")

ALLOWED_ORIGINS = [o for o in (os.environ.get("ALLOWED_ORIGINS") or "").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS or ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def require_token(request, call_next):
    # El preflight de CORS nunca lleva cabeceras propias: si se le exige el token
    # el navegador falla antes de mandar la petición real.
    open_paths = {"/", "/health"}
    if API_TOKEN and request.method != "OPTIONS" and request.url.path not in open_paths:
        sent = request.headers.get("x-api-token") or request.query_params.get("token")
        if sent != API_TOKEN:
            from fastapi.responses import JSONResponse
            return JSONResponse({"detail": "Token inválido o ausente."}, status_code=401)
    return await call_next(request)


# ── Helpers ────────────────────────────────────────────────────────────────────

def _read(path: Path) -> dict | None:
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            return None
    return None


def _run_tool(script: str) -> tuple[bool, str]:
    # sys.executable y no .venv/bin/python: en Railway no hay venv, el intérprete
    # es el del contenedor. En local sigue siendo el del venv porque uvicorn
    # arranca desde ahí.
    python = sys.executable
    result = subprocess.run(
        [python, str(ROOT / "tools" / script)],
        capture_output=True, text=True, cwd=str(ROOT),
    )
    return result.returncode == 0, result.stderr or result.stdout


# ── Models ─────────────────────────────────────────────────────────────────────

class DiagnoseRequest(BaseModel):
    location: str
    severity: int           # 1-10
    pain_type: str
    when_occurs: str
    duration: str
    swelling: str = "No"
    additional_notes: str = ""


class GymDoneRequest(BaseModel):
    date: str
    code: str
    done: bool = True
    note: str = ""
    weights: dict[str, str] = {}


# ── Endpoints ──────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"status": "ok", "service": "Entrenador API", "date": date.today().isoformat()}


def _write_heartbeat(steps: list[str]) -> None:
    """Deja constancia de que el trabajo semanal terminó bien.

    Lo escriben DOS caminos y por eso vive aquí y no solo en run_weekly.sh:
    el cron del Mac corre el script, pero el disparador de GitHub Actions hace
    POST /update, que ejecuta las herramientas por su cuenta y nunca pasa por
    el script. Sin esto, el latido se quedaría en null para siempre por esa vía
    y el aviso de "plan viejo" no saltaría nunca — justo lo contrario de para
    lo que existe.

    Nunca propaga: que falle el latido no puede tumbar un /update que sí
    funcionó.
    """
    try:
        path = data_file("last_run.json")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps(
                {"last_run": datetime.now().isoformat(timespec="seconds"), "steps_ok": steps},
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )
    except Exception as e:  # noqa: BLE001
        print(f"aviso: no se pudo escribir el latido ({e})", file=sys.stderr)


@app.get("/health")
def health() -> dict:
    """Latido del trabajo semanal: cuándo terminó bien run_weekly.sh por última vez.

    200 siempre — es un endpoint de salud, no puede fallar. Sin archivo de
    latido todavía, `last_run` va null y el frontend no avisa nada (así lee
    planStale en src/routes/index.tsx). No exige token: está en open_paths del
    middleware, junto a "/", para poder consultarlo sin credenciales.
    """
    data = _read(data_file("last_run.json")) or {}
    return {"last_run": data.get("last_run")}


@app.get("/plan")
def get_plan(athlete: str = Query(DEFAULT_ATHLETE)) -> dict:
    athlete = resolve_athlete(athlete)
    if not RACES[athlete]["has_garmin"]:
        # "Sin Garmin todavía" es un estado esperado, no un error: el frontend
        # ya tiene estado vacío para esto y un 404 dispararía su error genérico.
        return {}
    data = _read(PLAN_DATA)
    if not data:
        raise HTTPException(404, "Plan no encontrado. Ejecuta /update primero.")
    return data


@app.get("/garmin")
def get_garmin(athlete: str = Query(DEFAULT_ATHLETE)) -> dict:
    athlete = resolve_athlete(athlete)
    if not RACES[athlete]["has_garmin"]:
        # Ídem /plan: vacío con 200, nunca 404.
        return {}
    data = _read(GARMIN_DATA)
    if not data:
        raise HTTPException(404, "Datos de Garmin no encontrados. Ejecuta /update primero.")
    return data


@app.get("/diagnosis")
def get_diagnosis(athlete: str = Query(DEFAULT_ATHLETE)) -> dict:
    """Último diagnóstico guardado del atleta, o {} si nunca ha consultado.

    Vacío con 200, nunca 404 — misma regla que /garmin y /plan para un atleta
    sin datos. Antes devolvía 404 y eso dejaba un error rojo permanente en la
    consola de quien todavía no ha reportado ninguna molestia, que es el estado
    normal de alguien que acaba de entrar, no un fallo.
    """
    athlete = resolve_athlete(athlete)
    return _read(diagnosis_path(athlete)) or {}


@app.get("/gym")
def get_gym(athlete: str = Query(DEFAULT_ATHLETE)) -> dict:
    """El bloque de fuerza: sesiones, semanas, reglas y el calendario de la semana.

    El bloque en sí es estático (vive en tools/strength_plan.py), así que este
    endpoint responde aunque Garmin esté caído o no se haya corrido /update: en
    ese caso el calendario va sin las sesiones de carrera, pero la guía de
    gimnasio —que es lo que se consulta entre series— sirve igual.

    Sesiones, semanas y reglas son compartidas (el gimnasio es conjunto); lo
    único que cambia por atleta es `race` y, para quien no tiene Garmin, el
    calendario de carrera/ciclismo va vacío.
    """
    athlete = resolve_athlete(athlete)
    import export_gym_plan
    return export_gym_plan.build(athlete)


@app.get("/gym/done")
def get_gym_done() -> dict:
    """Vista conjunta: lo que cada atleta marcó, para todo el bloque."""
    return {a: (_read(gym_done_path(a)) or {}) for a in RACES}


@app.post("/gym/done")
def post_gym_done(body: GymDoneRequest, athlete: str = Query(DEFAULT_ATHLETE)) -> dict:
    athlete = resolve_athlete(athlete)
    path = gym_done_path(athlete)
    data = _read(path) or {}
    if body.done:
        data[body.date] = {
            "code": body.code, "note": body.note, "weights": body.weights,
            "updated_at": datetime.now().isoformat(timespec="seconds"),
        }
    else:
        data.pop(body.date, None)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    return data


@app.get("/insights")
def get_insights() -> list:
    sys.path.insert(0, str(ROOT / "context"))
    from education_insights import CATEGORIES
    return CATEGORIES


@app.post("/update")
def update_plan() -> dict:
    """Runs fetch_garmin → generate_plan → upload_workouts sequentially."""
    steps = [
        ("fetch_garmin.py",    "Conectando a Garmin"),
        ("generate_plan.py",   "Generando plan"),
        ("upload_workouts.py", "Subiendo workouts"),
    ]
    results = []
    for script, label in steps:
        ok, msg = _run_tool(script)
        results.append({"step": label, "ok": ok, "message": msg[:500]})
        if not ok:
            raise HTTPException(500, detail={"error": f"Falló: {label}", "steps": results})

    # Solo aquí: el bucle de arriba lanza en cuanto un paso falla, así que
    # llegar a esta línea significa que los tres salieron bien.
    _write_heartbeat([s for s, _ in steps])

    plan = _read(PLAN_DATA) or {}
    return {"success": True, "steps": results, "plan": plan}


@app.post("/diagnose")
def diagnose(body: DiagnoseRequest, athlete: str = Query(DEFAULT_ATHLETE)) -> dict:
    """Calls Claude to analyze a physical complaint."""
    import anthropic
    sys.path.insert(0, str(ROOT / "tools"))
    from usage_log import log_usage

    athlete = resolve_athlete(athlete)
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(500, "ANTHROPIC_API_KEY no configurada.")

    research_path = ROOT / "context" / "research_insights.md"
    research = research_path.read_text(encoding="utf-8")[:25000] if research_path.exists() else ""
    # El plan de ciclismo que sirve de contexto es de Jose; Andrea no tiene
    # plan generado todavía.
    plan_ctx = json.dumps(_read(PLAN_DATA) or {})[:3000] if athlete == "jose" else ""

    race = RACES[athlete]
    system = f"""Eres un asesor de entrenamiento con conocimiento en medicina deportiva.
Evalúa la molestia física de un atleta que entrena en {TRAINING_LOCATION} ({TRAINING_ALTITUDE_M} m) y prepara {race['distance_label']}; la carrera es en {race['race_location']} ({race['race_altitude_m']} m).
Las sesiones de Runna son SOLO LECTURA — no las modifiques, solo emite advertencias.
Ante la duda, recomienda menos carga. No diagnostiques condiciones médicas.

CONTEXTO CIENTÍFICO:
{research}

RESPONDE con un JSON válido:
{{
  "pain_summary": "descripción clínica breve",
  "classification": "minor | moderate | severe",
  "classification_rationale": "por qué esta clasificación",
  "cycling_adjustments": [{{"date":"YYYY-MM-DD","original_session":"string","adjusted_session":"string","reason":"string"}}],
  "runna_warnings": [{{"date":"YYYY-MM-DD","session":"string","warning":"string"}}],
  "return_to_full_load_estimate": "string",
  "general_advice": "2-3 oraciones",
  "seek_professional_care": true | false
}}"""

    user_msg = f"""Fecha: {date.today().isoformat()} | Bogotá ~2.600 m

MOLESTIA:
{json.dumps(body.model_dump(), ensure_ascii=False)}

PLAN ACTUAL:
{plan_ctx}"""

    client = anthropic.Anthropic(api_key=api_key)
    msg = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1500,
        system=system,
        messages=[{"role": "user", "content": user_msg}],
    )
    log_usage(msg.usage, "diagnose")
    raw = msg.content[0].text.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    if raw.endswith("```"):
        raw = raw[:raw.rfind("```")]

    result = json.loads(raw.strip())

    # Save for later retrieval
    path = diagnosis_path(athlete)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")

    return result

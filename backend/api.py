"""
FastAPI backend — expone los datos del Entrenador como REST API.
Lovable (u otro frontend) se conecta aquí.

Endpoints:
  GET  /plan          → plan aumentado actual (sesiones Runna + ciclismo)
  GET  /garmin        → datos de Garmin (actividades, salud, zonas)
  GET  /diagnosis     → último diagnóstico guardado
  GET  /insights      → insights educativos por categoría
  POST /update        → corre fetch + generate + upload (actualiza el plan)
  POST /diagnose      → analiza una molestia física

Usage: .venv/bin/python -m uvicorn api:app --reload --port 8503
"""
import json
import os
import subprocess
import sys
from datetime import date
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
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
DIAGNOSIS   = DATA_DIR / "diagnosis.json"

# Compartido con el resto de herramientas, que leen .tmp/ por su cuenta.
os.environ.setdefault("DATA_DIR", str(DATA_DIR))

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


# ── Endpoints ──────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"status": "ok", "service": "Entrenador API", "date": date.today().isoformat()}


@app.get("/plan")
def get_plan() -> dict:
    data = _read(PLAN_DATA)
    if not data:
        raise HTTPException(404, "Plan no encontrado. Ejecuta /update primero.")
    return data


@app.get("/garmin")
def get_garmin() -> dict:
    data = _read(GARMIN_DATA)
    if not data:
        raise HTTPException(404, "Datos de Garmin no encontrados. Ejecuta /update primero.")
    return data


@app.get("/diagnosis")
def get_diagnosis() -> dict:
    data = _read(DIAGNOSIS)
    if not data:
        raise HTTPException(404, "Sin diagnóstico previo.")
    return data


@app.get("/gym")
def get_gym() -> dict:
    """El bloque de fuerza: sesiones, semanas, reglas y el calendario de la semana.

    El bloque en sí es estático (vive en tools/strength_plan.py), así que este
    endpoint responde aunque Garmin esté caído o no se haya corrido /update: en
    ese caso el calendario va sin las sesiones de carrera, pero la guía de
    gimnasio —que es lo que se consulta entre series— sirve igual.
    """
    sys.path.insert(0, str(ROOT / "tools"))
    import export_gym_plan
    return export_gym_plan.build()


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

    plan = _read(PLAN_DATA) or {}
    return {"success": True, "steps": results, "plan": plan}


@app.post("/diagnose")
def diagnose(body: DiagnoseRequest) -> dict:
    """Calls Claude to analyze a physical complaint."""
    import anthropic
    sys.path.insert(0, str(ROOT / "tools"))
    from usage_log import log_usage

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(500, "ANTHROPIC_API_KEY no configurada.")

    research_path = ROOT / "context" / "research_insights.md"
    research = research_path.read_text(encoding="utf-8")[:25000] if research_path.exists() else ""
    plan_ctx = json.dumps(_read(PLAN_DATA) or {})[:3000]

    system = f"""Eres un asesor de entrenamiento con conocimiento en medicina deportiva.
Evalúa la molestia física de un corredor que prepara un medio maratón en Bogotá (2.600 m).
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
    DIAGNOSIS.parent.mkdir(parents=True, exist_ok=True)
    DIAGNOSIS.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")

    return result

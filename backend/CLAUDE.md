# Agent Instructions

You're working inside the **WAT framework** (Workflows, Agents, Tools). This architecture separates concerns so that probabilistic AI handles reasoning while deterministic code handles execution. That separation is what makes this system reliable.

## The WAT Architecture

**Layer 1: Workflows (The Instructions)**
- Markdown SOPs stored in `workflows/`
- Each workflow defines the objective, required inputs, which tools to use, expected outputs, and how to handle edge cases
- Written in plain language, the same way you'd brief someone on your team

**Layer 2: Agents (The Decision-Maker)**
- This is your role. You're responsible for intelligent coordination.
- Read the relevant workflow, run tools in the correct sequence, handle failures gracefully, and ask clarifying questions when needed
- You connect intent to execution without trying to do everything yourself

**Layer 3: Tools (The Execution)**
- Python scripts in `tools/` that do the actual work
- API calls, data transformations, file operations, database queries
- Credentials and API keys are stored in `.env`
- These scripts are consistent, testable, and fast

**Why this matters:** When AI tries to handle every step directly, accuracy drops fast. By offloading execution to deterministic scripts, you stay focused on orchestration and decision-making where you excel.

## How to Operate

**1. Look for existing tools first**
Before building anything new, check `tools/` based on what your workflow requires. Only create new scripts when nothing exists for that task.

**2. Learn and adapt when things fail**
When you hit an error:
- Read the full error message and trace
- Fix the script and retest
- Document what you learned in the workflow
- Update the workflow so this never happens again

**3. Keep workflows current**
Workflows should evolve as you learn. Don't create or overwrite workflows without asking unless explicitly told to.

## The Self-Improvement Loop

Every failure is a chance to make the system stronger:
1. Identify what broke
2. Fix the tool
3. Verify the fix works
4. Update the workflow with the new approach
5. Move on with a more robust system

## Project: Entrenador — backend

Sistema de entrenamiento para un medio maratón en Bogotá (2.600 m), combinando carrera
y ciclismo. Este proyecto es el **backend**: trae datos de Garmin, genera el plan de
ciclismo con Claude, y lo sube de vuelta a Garmin.

### Los dos servicios

Backend y frontend viven en este mismo repo (`josemperilla/altitude-athlete-aid`)
y se despliegan por separado a Railway: el frontend desde la raíz, el API desde
`backend/`.

| | `backend/` (este) | raíz del repo |
|---|---|---|
| Rol | Datos, plan, integración con Garmin | La interfaz que usa el atleta |
| Stack | FastAPI + Python | React 19 / TanStack Start / TypeScript |
| Puerto local | 8503 | 5173 |

Son complementarios, no alternativos. `backend/entrenador.sh` arranca los dos y abre
el navegador en `http://127.0.0.1:5173`. Eso es lo que dispara `Entrenador.app` del
escritorio y el alias `Entrenador` del `.zshrc`. Se usa `127.0.0.1` y no `localhost`
porque Spotify (la generación de playlists en el frontend) exige la IP explícita
como redirect URI de OAuth.

El repo `josemperilla/Personal_trainer` fue el hogar original de este backend y de
una app de gimnasio en HTML plano. Todo lo vivo se trajo aquí; el repo queda en
GitHub, archivado de hecho, solo como historia. Si alguna vez hace falta el service
worker de aquella app (soporte sin señal, que esta todavía no tiene), está ahí en
`web/public/sw.js`.

La interfaz Streamlit vieja (`app.py`) se eliminó: duplicaba exactamente las cuatro
pestañas del frontend React. La única UI es la de React.

### Tools disponibles
- `tools/fetch_garmin.py` — trae actividades, salud y zonas de Garmin Connect → `.tmp/garmin_data.json`
- `tools/fetch_runna_plan.py` — lee el plan COMPLETO de Runna desde su feed iCalendar (`RUNNA_ICS_URL`) → `runna_plan.json`. Garmin solo trae ~2 semanas; el feed trae el ciclo entero con ritmos y la fecha de carrera. Sin URL o sin red, avisa y no falla
- `tools/generate_plan.py` — cruza Garmin + feed de Runna + investigación, llama a Claude, produce `.tmp/augmented_plan.json` (ciclismo + revisión de las carreras de Runna) y un JSON de workout por sesión de ciclismo
- `tools/runna_checks.py` — reglas deterministas: sesión pico (>10 % sobre la más larga de 30 días), semana de carrera/taper, validación de ajustes y ciclismo como alternativa a rodajes fáciles
- `tools/adjust_workout.py` — aplica las `ops` de un ajuste (`set_distance_km`, `set_reps`, `hr_cap`, `easy_run`) sobre el workout real de Runna y devuelve uno nuevo, «Ajustado · <nombre>», listo para Garmin
- `tools/upload_workouts.py` — borra lo que subió la vez anterior (ciclismo y «Ajustado · …») y sube y agenda lo nuevo. El workout de Runna nunca se toca: el ajustado va al lado, el mismo día
- `tools/diagnose.py` — evalúa una molestia física contra el plan de la semana
- `tools/extract_papers.py` — extrae `Running_papers/*.pdf` → `context/research_insights.md`, con caché por tamaño+mtime

### API (`api.py`, puerto 8503)
`GET /plan` · `GET /garmin` · `GET /diagnosis` · `GET /insights` · `POST /update` (corre
fetch Garmin → feed Runna → generate → upload) · `POST /diagnose`. CORS abierto para que el frontend consuma.

### Forma de los datos del plan
`augmented_plan.json` trae `runna_sessions` y `cycling_sessions`, y **no tienen la misma
forma**. Las de Runna traen `date`, `name`, `sport` (`"running"` / `"cycling"`),
`distance_km`; las de ciclismo generadas aquí traen además `duration_min`, `primary_zone`
(`"Z1"`…`"Z5"`) y `rationale`. `runna_sessions` puede incluir sesiones de ciclismo, así
que no asumas que un arreglo equivale a un deporte — usa el campo `sport`. El frontend
depende de esta forma; si la cambias, hay que ajustarlo allá también.

Una carrera de Runna puede traer `adjustment` (`verdict`, `change`, `rationale`, `source`):
un ajuste; si trae `ops` que encajan (`pushed: true`) se sube a Garmin como «Ajustado · <nombre>» al lado
del original, y fetch_garmin lo excluye del plan para no ajustar el ajuste. Runna nunca se reescribe. Una sesión de ciclismo
con `alternative_to_easy_run: true` va el mismo día que un rodaje fácil y el atleta elige
uno de los dos (upload la agenda igual, pese al bloqueo de días con carrera).

### File Structure
```
.tmp/           # Archivos temporales de procesamiento (regenerables)
tools/          # Scripts Python determinísticos
workflows/      # SOPs del proceso semanal
context/        # Insights educativos y research extraído de los papers
Running_papers/ # PDFs fuente
api.py          # API REST que consume el frontend
entrenador.sh   # Arranca backend + frontend juntos
run_weekly.sh   # Ejecución automática de los domingos (cron)
requirements.txt
.env            # Variables de entorno (NUNCA en git)
```

## gstack

Use the `/browse` skill from gstack for all web browsing. Never use `mcp__claude-in-chrome__*` tools.

Available skills: `/office-hours`, `/plan-ceo-review`, `/plan-eng-review`, `/plan-design-review`, `/design-consultation`, `/design-shotgun`, `/design-html`, `/review`, `/ship`, `/land-and-deploy`, `/canary`, `/benchmark`, `/browse`, `/connect-chrome`, `/qa`, `/qa-only`, `/design-review`, `/setup-browser-cookies`, `/setup-deploy`, `/setup-gbrain`, `/retro`, `/investigate`, `/document-release`, `/document-generate`, `/codex`, `/cso`, `/autoplan`, `/plan-devex-review`, `/devex-review`, `/careful`, `/freeze`, `/guard`, `/unfreeze`, `/gstack-upgrade`, `/learn`.


## Bottom Line

You sit between what I want (workflows) and what actually gets done (tools). Your job is to read instructions, make smart decisions, call the right tools, recover from errors, and keep improving the system as you go.

Stay pragmatic. Stay reliable. Keep learning.

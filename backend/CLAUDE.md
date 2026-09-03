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

### Los dos proyectos

| | Este proyecto (`Personal_trainer`) | `../altitude-athlete-aid` |
|---|---|---|
| Rol | Backend: datos, plan, integración con Garmin | Frontend: la interfaz que usa el atleta |
| Stack | FastAPI + Python | React 19 / TanStack Start / TypeScript |
| Puerto | 8503 | 5173 |
| Git | Sin repo (local) | GitHub `josemperilla/altitude-athlete-aid` |

Son complementarios, no alternativos. `entrenador.sh` arranca los dos y abre el
navegador en `http://127.0.0.1:5173`. Eso es lo que dispara `Entrenador.app` del
escritorio. Se usa `127.0.0.1` y no `localhost` porque Spotify (la generación de
playlists en el frontend) exige la IP explícita como redirect URI de OAuth.

La interfaz Streamlit vieja (`app.py`) se eliminó: duplicaba exactamente las cuatro
pestañas del frontend React. La única UI es la de React.

### Tools disponibles
- `tools/fetch_garmin.py` — trae actividades, salud y zonas de Garmin Connect → `.tmp/garmin_data.json`
- `tools/generate_plan.py` — cruza Garmin + investigación, llama a Claude, produce `.tmp/augmented_plan.json` y un JSON de workout por sesión de ciclismo
- `tools/upload_workouts.py` — sube y agenda esos workouts en Garmin (Runna los lee de ahí)
- `tools/diagnose.py` — evalúa una molestia física contra el plan de la semana
- `tools/extract_papers.py` — extrae `Running_papers/*.pdf` → `context/research_insights.md`, con caché por tamaño+mtime

### API (`api.py`, puerto 8503)
`GET /plan` · `GET /garmin` · `GET /diagnosis` · `GET /insights` · `POST /update` (corre
fetch → generate → upload) · `POST /diagnose`. CORS abierto para que el frontend consuma.

### Forma de los datos del plan
`augmented_plan.json` trae `runna_sessions` y `cycling_sessions`, y **no tienen la misma
forma**. Las de Runna traen `date`, `name`, `sport` (`"running"` / `"cycling"`),
`distance_km`; las de ciclismo generadas aquí traen además `duration_min`, `primary_zone`
(`"Z1"`…`"Z5"`) y `rationale`. `runna_sessions` puede incluir sesiones de ciclismo, así
que no asumas que un arreglo equivale a un deporte — usa el campo `sport`. El frontend
depende de esta forma; si la cambias, hay que ajustarlo allá también.

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

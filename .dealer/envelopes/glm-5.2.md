## ENVELOPE glm-5.2
status: done
files_changed:
  - backend/tools/athletes.py
  - backend/tools/strength_plan.py
  - backend/tools/export_gym_plan.py
  - backend/api.py
contract_deviations:
  - ninguna
assumptions:
  - El `race_date` superior de /gym sigue siendo el de Jose (2026-10-04) para ambos atletas, por compatibilidad con el contrato existente; la carrera real por atleta viaja en `race.race_date`.
  - El user_msg de /diagnose conserva "Bogotá ~2.600 m" (ahí entrena la pareja); el cambio pedido era solo el system prompt.
  - `gym_done_{athlete}.json` y `diagnosis_{athlete}.json` viven en DATA_DIR (.tmp local, volumen en Railway) y no se versionan.
  - generate_plan.py y fetch_garmin.py quedan mono-atleta (Jose): Andrea no tiene Garmin ni plan de running todavía, y el contrato no los incluía.
tests_added:
  - ninguno persistente; verificación ad-hoc corrida y pasada localmente: `python tools/strength_plan.py` (JSON válido, W16 con sessions [], regla nueva) y batería de endpoints contra uvicorn (gym/garmin/plan/diagnosis/gym-done por atleta, migración legacy de diagnosis, done=false)
blocked_on:
  - ninguno
confidence: high — contrato implementado tal cual y verificado endpoint por endpoint con el servidor levantado

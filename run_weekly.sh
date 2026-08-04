#!/bin/zsh
# Ejecución automática semanal — domingos 3pm
# Genera el plan de ciclismo para las próximas 2 semanas y lo sube a Garmin

APP_DIR="/Users/joseperilla/Documents/Personal_trainer"
PYTHON="$APP_DIR/.venv/bin/python"
LOG="$APP_DIR/.tmp/weekly_run.log"

mkdir -p "$APP_DIR/.tmp"

echo "\n========================================" >> "$LOG"
echo "$(date '+%Y-%m-%d %H:%M:%S') — Inicio ejecución automática" >> "$LOG"
echo "========================================" >> "$LOG"

cd "$APP_DIR" || exit 1

run_step() {
    local name="$1"
    local script="$2"
    echo "\n--- $name ---" >> "$LOG"
    if $PYTHON "tools/$script" >> "$LOG" 2>&1; then
        echo "✓ $name completado" >> "$LOG"
    else
        echo "✗ ERROR en $name" >> "$LOG"
        echo "$(date '+%Y-%m-%d %H:%M:%S') — Falló: $name. Revisa $LOG" | mail -s "⚠️ Entrenador: error en actualización automática" jm.perilla.o@gmail.com 2>/dev/null
        exit 1
    fi
}

run_step "Fetch Garmin"     "fetch_garmin.py"
run_step "Generar plan"     "generate_plan.py"
run_step "Subir workouts"   "upload_workouts.py"

echo "\n✓ Ejecución completada — $(date '+%Y-%m-%d %H:%M:%S')" >> "$LOG"

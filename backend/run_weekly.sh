#!/bin/zsh
# Ejecución automática semanal — domingos 3pm
# Genera el plan de ciclismo para las próximas 2 semanas y lo sube a Garmin

APP_DIR="/Users/joseperilla/Documents/altitude-athlete-aid/backend"
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

run_step "Fetch Garmin"      "fetch_garmin.py"
run_step "Generar plan"      "generate_plan.py"
run_step "Subir workouts"    "upload_workouts.py"
# El gimnasio ya no se exporta: /gym lo construye al vuelo desde
# tools/strength_plan.py, así que se refresca solo con este mismo run.

# ── Publicación ───────────────────────────────────────────────────────────────
# Todo lo que sigue puede fallar sin romper la semana: el plan local ya quedó
# bien y los servicios siguen sirviendo la versión anterior. Por eso va fuera de
# run_step, que aborta con exit 1.

# El backend de Railway lee sus datos de un volumen. Se suben desde aquí y no se
# regeneran allá a propósito: Garmin hace rate-limit por IP y desde un datacenter
# el login se cae con 429 mucho antes que desde casa. El servidor nunca llama a
# Garmin; solo sirve lo que este script le deja.
echo "\n--- Sincronizar datos con el backend ---" >> "$LOG"
sync_ok=1
for f in garmin_data.json augmented_plan.json; do
    if railway volume files --volume api-volume upload --overwrite \
        "$APP_DIR/.tmp/$f" "/$f" >> "$LOG" 2>&1; then
        echo "✓ $f subido al volumen" >> "$LOG"
    else
        echo "⚠ No se pudo subir $f" >> "$LOG"
        sync_ok=0
    fi
done
[ "$sync_ok" = "1" ] || echo "⚠ El backend seguirá con los datos de la semana pasada." >> "$LOG"

# Ya no se publica nada más. La app del gimnasio era un servicio aparte que había
# que redesplegar para que viera el plan nuevo; ahora es una pestaña del frontend
# que lo pide a /gym, y ese endpoint lo construye al vuelo desde strength_plan.py.
# Con subir los datos al volumen basta.

echo "\n✓ Ejecución completada — $(date '+%Y-%m-%d %H:%M:%S')" >> "$LOG"

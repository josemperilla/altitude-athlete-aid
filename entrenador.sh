#!/bin/zsh
TRAINER_DIR="/Users/joseperilla/Documents/Personal_trainer"
REACT_DIR="/Users/joseperilla/Documents/altitude-athlete-aid"
API_PORT=8503
REACT_PORT=5173

# Matar instancias anteriores
lsof -ti tcp:$API_PORT | xargs kill -9 2>/dev/null
lsof -ti tcp:$REACT_PORT | xargs kill -9 2>/dev/null
sleep 1

echo "Iniciando API..."
cd "$TRAINER_DIR"
"$TRAINER_DIR/.venv/bin/python" -m uvicorn api:app \
  --host 0.0.0.0 --port $API_PORT \
  &>/tmp/entrenador_api.log &
API_PID=$!

echo "Iniciando interfaz React..."
cd "$REACT_DIR"
~/.bun/bin/bun run dev --port $REACT_PORT \
  &>/tmp/entrenador_react.log &
REACT_PID=$!

# Esperar a que ambos estén listos
# Se usa 127.0.0.1 y no localhost porque Spotify solo acepta la IP explícita como
# redirect URI, y el verifier PKCE vive en sessionStorage (que es por origen):
# si la app se abre en localhost y Spotify devuelve a 127.0.0.1, el login falla.
echo "Cargando..."
for i in {1..20}; do
  API_OK=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:$API_PORT/ 2>/dev/null)
  REACT_OK=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:$REACT_PORT/ 2>/dev/null)
  if [[ "$API_OK" == "200" && "$REACT_OK" == "200" ]]; then
    open "http://127.0.0.1:$REACT_PORT"
    echo "✓ Entrenador listo en http://127.0.0.1:$REACT_PORT"
    exit 0
  fi
  sleep 1
done

echo "Error al iniciar. Logs:"
echo "  API:   /tmp/entrenador_api.log"
echo "  React: /tmp/entrenador_react.log"
exit 1

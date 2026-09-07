## ENVELOPE claude-opus

status: done

files_changed:
  - src/components/entrenador/gym/GymSessionCard.tsx
  - src/routes/gimnasio.tsx

contract_deviations:
  - Los inputs de peso NO viven dentro de cada `GymExercise` (como sugería el
    plan) sino en un panel «Qué cargaste hoy» dentro de `GymSessionCard`, que
    lista solo los ejercicios con guía de peso en `WEIGHT_GUIDE`. Razón de
    propiedad: `GymExercise.tsx` no es de este carril y no se puede tocar.
    Efecto secundario: se registra todo en un sitio al terminar, en vez de
    campos dispersos por una tarjeta de seis pantallas.
  - `gimnasio.tsx` ahora llama `gymQO(athlete)` con `useAthleteId()`. El plan lo
    listaba en el Carril B, pero `gimnasio.tsx` es de este carril: sin esto la
    página seguiría pidiendo siempre el gimnasio de Jose.

assumptions:
  - `gym.weeks[]` trae `{start, end, sessions:[{date, session}]}` con fechas
    ISO. Verificado contra `strength_plan.py::as_dict()` en la rama base; el
    carril de GLM no cambia esa forma según su contrato. `schemas.ts` lo deja
    como `unknown[]`, así que se estrecha campo a campo en `gimnasio.tsx` y lo
    que no calce se descarta en silencio.
  - `gym_done_<atleta>.json` se indexa por fecha, UNA entrada por día: marcar
    una sesión reemplaza la que hubiera ese día. Es lo que implica el
    `data[body.date] = {...}` del contrato de `api.py`.
  - Las claves de `weights` son `item.id` (la clave de `EXERCISES`), no `anim`.
  - `GET /gym/done` devuelve las dos claves de atleta siempre, incluso vacías.

tests_added:
  - ninguno. La lógica pura de este carril (`parseSemana`/`semanaVigente`) vive
    dentro de `gimnasio.tsx` y no es importable sin exportarla; el Carril D
    decide si vale la pena moverla a `src/lib/gym/` (archivo de nadie) para
    testearla.

blocked_on:
  - REQUEST 1 (`.dealer/requests/claude-opus.md`): `/gym/done` no está en
    `API_PATHS` de `src/server.ts` ni en el proxy de `vite.config.ts`. Funciona
    en dev, se rompe desplegado. No bloquea el merge del código, sí bloquea que
    la feature sirva en Railway.

confidence: high — `tsc --noEmit`, `eslint` y `npm run build` limpios; la única
incógnita real es el hueco de proxy, que está documentado como request en vez de
parcheado a escondidas en un archivo ajeno.

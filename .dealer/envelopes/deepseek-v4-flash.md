## ENVELOPE deepseek-v4-flash
status: done
files_changed:
  - src/components/entrenador/Sidebar.tsx
  - src/components/entrenador/MobileNav.tsx
  - src/routes/index.tsx
  - src/lib/config.ts
contract_deviations:
  - ninguna
assumptions:
  - gym.race llega con race_date en ISO fecha local "YYYY-MM-DD" (igual que el RACE_DATE que ya servía strength_plan.py vía .isoformat()); lo parseo con +"T00:00:00" como hacía la constante vieja.
  - /gym?athlete= resuelve race server-side para el perfil activo (el carril de backend lo implementa; no pude probar contra el backend real). Para Jose asumo que es la misma carrera que tenía config.ts (Media Maratón Bogotá, 2026-10-04).
  - BLOCK_START = 2026-09-07 fijo y compartido, como pidió la tarea; si la fecha de carrera cae en/antes de BLOCK_START la barra queda en 0 (guard).
  - Si gym.race no ha cargado o el atleta no tiene race, la tarjeta de cuenta regresiva simplemente no se pinta (degradación silenciosa, nunca NaN) — mismo patrón de datos-en-vuelo que ya usa la página.
  - No gateé el botón "Actualizar plan" de la sección Acciones de la página Hoy (la tarea solo pidió el de Sidebar).
  - eslint reporta 2 errores prettier pre-existentes en src/lib/api.ts (commit base) — archivo de otro carril, no los toqué.
tests_added:
  - ninguno
blocked_on:
  - ninguno
confidence: high — tsc, build y lint (archivos propios) limpios; los 4 archivos son exactamente la zona asignada y los contratos (store, useAthleteId, gymQO, schemas) se usan tal cual.
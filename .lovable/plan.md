
# Entrenador — Plan de construcción

App de entrenamiento para corredor de medio maratón en Bogotá. Estética de club deportivo premium: fondo negro profundo, acentos dorado arena, tipografía Hanken Grotesk.

## Stack y fundación

- TanStack Start (ya configurado), TanStack Query para fetching/cache, recharts para gráficas.
- Cliente API centralizado apuntando a `https://puppet-wincing-frenzied.ngrok-free.dev` con header `ngrok-skip-browser-warning`.
- Google Fonts: Hanken Grotesk (400–800) cargada vía `<link>` en `__root.tsx`.
- Design tokens en `src/styles.css` (oklch equivalentes de la paleta) — fondo `#020101`, card `#111111`, card-2 `#1A1A1A`, primario `#E9CEA9`, dorado intenso `#CEA970`, dorado claro `#FFBC7D`, texto `#FFFFFF`/`#9A9A9A`, borde `rgba(233,206,169,0.15)`, running `#3B82F6`, ciclismo `#10B981`, error `#EF4444`. Radios 8px/6px, sombra `0 4px 20px rgba(0,0,0,0.4)`.
- Tema dark forzado en `<html>`.

## Estructura de archivos

```
src/
  lib/api.ts                 # fetcher + tipos + endpoints
  routes/
    __root.tsx               # shell + fonts + QueryClientProvider
    _app.tsx                 # layout con Sidebar + <Outlet/>
    _app.index.tsx           # redirect a /plan
    _app.plan.tsx            # Tab 1
    _app.historial.tsx       # Tab 2
    _app.diagnostico.tsx     # Tab 3
    _app.aprende.tsx         # Tab 4
  components/
    Sidebar.tsx              # nav + HRV/FC + estado + botón actualizar
    Card.tsx, Badge.tsx, Button.tsx, StatPill.tsx
    plan/WeekBlock.tsx, DayColumn.tsx, SessionCard.tsx
    historial/MetricChart.tsx, WeekSummaryCard.tsx
    diagnostico/DiagnoseForm.tsx, DiagnoseResult.tsx
    aprende/InsightCard.tsx
```

## Sidebar (260px, fondo `#0D0D0D`)

- Header `⚡ ENTRENADOR` (Hanken 800 uppercase dorado) + badge `📍 BOGOTÁ · 2.600 M`.
- Bloque salud (de `GET /garmin` → `health`): HRV y FC reposo del día, números grandes dorados, label gris.
- Badge `athlete_state` (de `GET /plan`): FATIGADO/BALANCEADO/DESCARGADO con colores indicados.
- Nav vertical: Plan / Historial / Diagnóstico / Aprende — activo con fondo `rgba(233,206,169,0.08)` y barra dorada izquierda.
- Botón `ACTUALIZAR PLAN` (POST /update body vacío) full-width dorado, spinner durante mutación, invalida queries `/garmin` y `/plan` al éxito, toast con sonner.

## Tab 1 — Plan (`/plan`)

- Consume `GET /plan`: `weeks_plan`, `week_summary`, `runna_sessions`, `cycling_sessions`.
- Render por semana (`WeekBlock`):
  - Pill dorado con tipo de semana (RECUPERACIÓN / BASE AERÓBICA / CARGA ALTA…).
  - Texto propósito en `#9A9A9A`.
  - Grid 7 columnas Dom→Sáb. Día actual con borde dorado `#E9CEA9`.
  - Cada celda agrupa sesiones de running y ciclismo de ese día (merge por fecha).
  - `SessionCard` running: borde-left 3px `#3B82F6`, fondo `#111`, título blanco, duración + zona/ritmo en `#9A9A9A`.
  - `SessionCard` ciclismo: borde-left 3px `#10B981`.
- Scroll horizontal en mobile.

## Tab 2 — Historial (`/historial`)

- De `GET /garmin`: serie HRV y FC reposo (últimos ~30 días) en dos `MetricChart` (recharts LineChart, fondo `#111`, línea `#E9CEA9`, grid muy tenue, tooltip oscuro).
- De `GET /plan` `week_summary`: cards por semana con `🏃 min running`, `📏 km`, `🚴 min ciclismo`. Números grandes dorados, etiquetas grises.

## Tab 3 — Diagnóstico (`/diagnostico`)

- Formulario controlado:
  - `location` (select), `pain_type` (select), `when_occurs` (select), `duration` (input/select), `swelling` (switch/select), `additional_notes` (textarea).
  - `severity` slider 1–10 con track dorado y thumb dorado intenso, valor visible.
  - Inputs `bg #1A1A1A`, borde `rgba(233,206,169,0.2)`, focus borde `#E9CEA9`.
- Botón `ANALIZAR` (primario dorado) → mutation POST /diagnose.
- `DiagnoseResult`:
  - Badge clasificación con bordes 🟡 `#E9CEA9` / 🟠 `#FFBC7D` / 🔴 `#EF4444`.
  - Ajustes ciclismo: cards borde-left dorado.
  - Advertencias Runna: cards borde-left rojo `#EF4444`.
  - Render flexible de campos extra que retorne la API.

## Tab 4 — Aprende (`/aprende`)

- `GET /insights` → grid 2 columnas (1 en mobile) de `InsightCard`:
  - Fuente/paper arriba en `#9A9A9A` pequeño.
  - Header categoría: emoji + nombre uppercase dorado.
  - Stat destacado en pill dorado (`bg #E9CEA9`, `text #020101`).
  - Línea divisora tenue dorada.
  - Sección "¿Qué significa para ti?" debajo.

## Detalles de implementación

- Todas las queries con `staleTime: 60_000`. Mutaciones (`/update`, `/diagnose`) muestran spinner inline + sonner toast.
- Manejo de errores: `errorComponent` por ruta con botón reintentar (`router.invalidate()`).
- Tipos TS laxos (`unknown` + narrowing) ya que el shape exacto de la API no está documentado; el código tolera campos faltantes (optional chaining + fallbacks "—").
- SEO: cada ruta con `head()` propio (título "Plan · Entrenador", etc.).
- Sin placeholder en index — redirección directa a `/plan`.

## Detalles técnicos

- `src/lib/api.ts` exporta `apiFetch<T>(path, init?)` que añade `ngrok-skip-browser-warning: true` y maneja JSON/errores.
- `queryOptions` reutilizables: `garminQO()`, `planQO()`, `insightsQO()`.
- Sidebar es client-side (`useQuery`), no loader, para evitar bloqueos en SSR si la API ngrok no responde.
- Recharts importado dinámicamente en componentes de Historial para evitar peso en SSR del shell.
- Botón actualizar usa `useMutation` → `queryClient.invalidateQueries({queryKey:['garmin']})` y `['plan']`.

¿Procedo con la implementación?

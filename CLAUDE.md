# Altitude Athlete Aid — Sports Performance Web App

TanStack Start (React/TypeScript) app for altitude training and athlete performance
management, plus the FastAPI backend that feeds it. Both deploy to Railway from this
repo: the frontend from the root, the API from `backend/`.

## Stack

- **Frontend**: React 19, TanStack Start, TypeScript, Tailwind v4 (tokens propios)
- **Backend**: FastAPI (Python) en `backend/`
- **Deploy**: Railway, dos servicios. `railway up` desde la raíz publica el
  frontend (`server/index.js` sirve `dist/` sobre Node); desde `backend/`
  publica el API. Cada uno tiene su `.railwayignore`.

## Structure

La app es un copiloto diario: `/` es la cabina del día y el resto cuelga de ahí.

| Path                         | Description                                                                                                                                                            |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/server.ts`              | SSR entry + proxy al backend (desambiguado por `Accept`: navegación → SPA, JSON → API)                                                                                 |
| `src/router.tsx`             | Router (routeTree generado)                                                                                                                                            |
| `src/routes/`                | `/` Hoy · `/plan` calendario · `/cuerpo` señales+dolor · `/gimnasio` fuerza · `/aprende` papers · `/ajustes` Spotify/plan · redirects de `/historial` y `/diagnostico` |
| `src/components/entrenador/` | UI de la app (WeekBlock, SessionDetailModal, PlaylistControl, chrome Sidebar/MobileNav, gym/\*)                                                                        |
| `src/components/ui/`         | Primitivas (sonner, formularios Field/Select/Range)                                                                                                                    |
| `src/hooks/`                 | `useAthlete` (foto Garmin+plan), mutaciones, store reactivo de Spotify                                                                                                 |
| `src/lib/schemas.ts`         | Contratos zod del backend (alias normalizados, fallback gracioso) — la única puerta de tipado                                                                          |
| `src/lib/spotify/`           | auth (PKCE), client, storage reactivo, curation (playlists por fases), prune                                                                                           |
| `src/lib/`                   | Dominio: readiness, session-dates (dedupe), workout-steps, spotify-intensity, playlist-timeline (testeado), gym/\*                                                     |
| `src/styles.css`             | Design system v2: tokens semánticos en `:root` + registro en `@theme inline`; sin theme.ts ni paleta shadcn                                                            |

Convenciones: cero `any` en `src/`; colores SIEMPRE por token (`var(--gold)`,
`text-muted`, `bg-surface`) — nunca hex inline. El backend cambia nombres de
campos: toda tolerancia a aliases vive en `schemas.ts`, no en los componentes.

## Commands

```bash
npm run dev        # Local dev
npm run build      # Production build
npm run preview    # Preview build
npm run lint       # ESLint
```

## gstack

Use the `/browse` skill from gstack for all web browsing. Never use `mcp__claude-in-chrome__*` tools.

Available skills: `/office-hours`, `/plan-ceo-review`, `/plan-eng-review`, `/plan-design-review`, `/design-consultation`, `/design-shotgun`, `/design-html`, `/review`, `/ship`, `/land-and-deploy`, `/canary`, `/benchmark`, `/browse`, `/connect-chrome`, `/qa`, `/qa-only`, `/design-review`, `/setup-browser-cookies`, `/setup-deploy`, `/setup-gbrain`, `/retro`, `/investigate`, `/document-release`, `/document-generate`, `/codex`, `/cso`, `/autoplan`, `/plan-devex-review`, `/devex-review`, `/careful`, `/freeze`, `/guard`, `/unfreeze`, `/gstack-upgrade`, `/learn`.

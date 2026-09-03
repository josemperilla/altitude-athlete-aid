# Altitude Athlete Aid — Sports Performance Web App

TanStack Start (React/TypeScript) app for altitude training and athlete performance
management, plus the FastAPI backend that feeds it. Both deploy to Railway from this
repo: the frontend from the root, the API from `backend/`.

## Stack

- **Frontend**: React 19, TanStack Start, TypeScript, shadcn/ui
- **Backend**: FastAPI (Python) en `backend/`
- **Deploy**: Railway, dos servicios. `railway up` desde la raíz publica el
  frontend (`server/index.js` sirve `dist/` sobre Node); desde `backend/`
  publica el API. Cada uno tiene su `.railwayignore`.

## Structure

| Path | Description |
|------|-------------|
| `src/server.ts` | Server entry point with SSR error handling |
| `src/start.ts` | App bootstrap |
| `src/router.tsx` | Route definitions |
| `src/routes/` | Page components |
| `src/components/` | UI components (shadcn) |
| `src/hooks/` | Custom React hooks |
| `src/lib/` | Utility functions, error capture, error page |
| `src/styles.css` | Global styles |

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

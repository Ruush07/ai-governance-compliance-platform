# AI Governance & Compliance Platform — Frontend

A production-quality single-page app for the AI Governance & Compliance Platform,
built with Vite + React 18 + TypeScript + Tailwind CSS v3 + Recharts.

It is decision-support tooling: the AI produces structured compliance findings,
evidence and recommendations, but a human auditor reviews everything and owns
every final determination.

## Stack

- **Vite 5** + **React 18** + **TypeScript** (strict)
- **react-router-dom v6** for routing
- **Tailwind CSS v3** (+ PostCSS + Autoprefixer)
- **Recharts** for charts
- Native `fetch` only — no other runtime dependencies

## Prerequisites

- Node.js 18+ (developed against Node 20)
- The Django backend running on `http://localhost:8000` (for live data)

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. Start the dev server (with the backend running on :8000)
npm run dev
```

The dev server runs on http://localhost:5173 and proxies all `/api/*`
requests to `http://localhost:8000`, so the SPA talks to the Django backend
without CORS configuration in development.

## Build

```bash
npm run build      # type-checks (tsc -b) then produces an optimized build in dist/
npm run preview    # serve the production build locally
```

## Configuration

The API base URL defaults to `/api` (proxied to the backend in dev). Override it
by setting `VITE_API_BASE` — see `.env.example`:

```bash
VITE_API_BASE=https://your-api.example.com/api
```

## Project structure

```
src/
  api/
    client.ts        Typed fetch wrapper (unwraps the { success, data, meta } envelope)
    types.ts         All API TypeScript interfaces
  lib/
    format.ts        Formatting + status/risk color helpers
  hooks/
    useApi.ts        useAsync hook: { data, loading, error, reload }
  components/        Sidebar, Navbar, Layout, StatCard, ComplianceCard, RiskCard,
                     StatusBadge, FrameworkTable, Recommendations, EvidenceViewer,
                     Timeline, Charts (RiskPie/StatusBar/CoverageBar), UploadZone,
                     Spinner, ErrorBanner, EmptyState, PageHeader
  pages/             Dashboard, Upload, History (+ new-assessment flow),
                     Assessment (detail), FrameworkExplorer, FrameworkDetail,
                     Reports, Settings, NotFound
  App.tsx            Router + layout
  main.tsx           App entry
  index.css          Tailwind directives + base component classes
```

## Pages

- **Dashboard** — KPI cards, risk pie, requirement-status bar, totals, coverage,
  recent audit activity. Handles null/zero states gracefully.
- **Documents (Upload)** — drag-and-drop upload (single or multiple) with a
  document-type selector; lists uploaded documents.
- **Assessments (History)** — table of runs; a "New Assessment" flow to pick a
  framework + documents and run `/process`, then navigate to the result.
- **Assessment detail** — compliance + risk cards, control-score table,
  per-requirement cards (status, confidence, reasoning, needs-review, evidence),
  recommendations, plus Reprocess and Generate PDF/JSON report actions.
- **Frameworks** — framework table; detail view groups controls with their
  requirements, criteria and references.
- **Reports** — pick a completed assessment, generate PDF/JSON, download.
- **Settings** — health/version/phase, current user, configured API base, and a
  note on the human-in-the-loop model.

## API contract

Every response is an envelope: `{ "success": true, "data": ... , "meta"?: ... }`
on success, or `{ "success": false, "error": { code, message, details } }` on
error. The client in `src/api/client.ts` unwraps `data`/`meta` and throws an
`ApiRequestError` (with `message`, `code`, `details`, `status`) on failure.

Numeric score fields arrive as strings (e.g. `"72.50"`) and are parsed with the
`num()` helper before charting.

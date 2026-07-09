# Delivery roadmap

The platform was built in phases; each extends (never rewrites) prior work and
keeps the REST API backward-compatible. **All phases below are complete.**

### ✅ Phase 1 — Foundation
Django 5 + DRF; split settings; 11 core models; config-driven framework engine
(strict JSON Schema, loader, deterministic `config_hash`, `sync_frameworks`);
5 seed control libraries (122 requirements); secure upload API; deterministic
scoring engine; append-only audit trail; dashboard KPIs; auditor prompt library.

### ✅ Phase 2 — Ingestion
`ingestion/`: PyMuPDF + pdfplumber text/table extraction, python-docx, pytesseract
OCR fallback with scanned-page detection; `extracted_text` + reversible
`page_map` (char-offset → page) for page-cited evidence.

### ✅ Phase 3 — RAG
`rag/`: recursive + page chunkers; deterministic dependency-free hashing embedder
(default) with optional sentence-transformers; DB-backed vector index (default,
deterministic cosine) with optional ChromaDB; framework-scoped retriever.

### ✅ Phase 4 — LLM assessment + hallucination prevention
`llm/`: provider-agnostic client — deterministic offline **mock** (default),
Anthropic **Claude** adapter (auto-selected when `ANTHROPIC_API_KEY` set),
OpenAI/Ollama adapters. Strict-JSON schema validation, retry, safe fallback,
verbatim quote verification, confidence threshold, human-review flag. Populates
`Evidence` + requirement-level `AssessmentScore`.

### ✅ Phase 5 — Runtime pipeline (scoring, risk, recommendations)
`assessments/pipeline.run_assessment` orchestrates ingest → index → per-requirement
assessment → deterministic scoring → recommendation generation (weight+status
priority, stable ranking, full traceability). `POST /api/process` runs it.

### ✅ Phase 6 — Reports
ReportLab PDF (exec summary, control scores, gaps, prioritised recommendations)
+ JSON export, content-checksummed; `POST /api/report`, `GET /api/report/{id}`,
`/download`.

### ✅ Phase 7 — Frontend
React + TypeScript + Tailwind + Recharts SPA (`frontend/`): Dashboard, Upload,
History (+ new-assessment flow), Assessment detail (evidence + recommendations +
report generation + reprocess/override), Framework Explorer, Reports, Settings.
Typed API client over the response envelope; Vite dev proxy to the backend.

### ✅ Phase 8 — Auth/RBAC, hardening, deployment
Role hierarchy + `HasMinimumRole` gating write/override endpoints (toggled by
`ENFORCE_RBAC`); human-override endpoint that re-scores deterministically and
audits; DRF throttling; Dockerfile + docker-compose (PostgreSQL) + entrypoint;
`docs/DEPLOYMENT.md`.

## Possible future work
- Move `POST /api/process` onto a task queue (Celery/RQ) for real-LLM scale.
- Browser E2E tests (Playwright) for the frontend.
- Deterministic response caching for real LLM providers.

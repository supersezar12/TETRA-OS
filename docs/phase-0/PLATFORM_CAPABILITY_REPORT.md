# TETRA OS — Phase 0: Platform Capability Report
**Document ID:** `TETRA-P0-CAP-001`  
**Date:** 2026-11-21  
**Status:** Phase 0 Discovery Complete (Pending Approval)

---

## 1. Verified Runtime & Infrastructure Capabilities

Direct inspection of the execution environment yields the following verified facts:

| Capability | Verified Status | Details & Version |
|---|---|---|
| **Operating System** | Linux x86_64 (gVisor sandbox) | `4.19.0-gvisor #1 SMP` |
| **Compute & Memory** | 4 vCPU cores, 12,288 MB RAM (~11.7 GB free) | 0 MB Swap; 504 GB disk (~504 GB free) |
| **Node.js Runtime** | Available (Primary Runtime) | `v22.23.2` (`npm 10.9.8`, `tsx 4.21.0`, `bun`) |
| **C/C++ Toolchain** | Available | `/usr/bin/gcc`, `/usr/bin/g++`, `node-gyp` |
| **Python Runtime** | Standard Library Only (Restricted) | Python `3.11.2`; **no `pip3`**, **no `ensurepip`**, **no `scipy`**, **no `pulp`**, **no `ortools`**, **no `glpsol`/`cbc`** |
| **HTTP & Hosting** | Single-Origin Full-Stack on Port `3000` | Express (`server.ts`) + Vite (`vite.middlewares` in dev; `dist/` in prod), Cloud Run deployment |
| **Frontend Stack** | Pre-configured | React `19.0.1`, Vite `8.3.0`, Tailwind CSS `4.3.3`, TypeScript `7.0.2`, `lucide-react`, `motion` |
| **AI SDK** | Pre-installed & Server-Authorized | `@google/genai ^2.4.0`; `MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API` enabled via `GEMINI_API_KEY` |
| **Concurrency** | Built-in `node:worker_threads` | Non-blocking background execution for solvers, forecasts, and simulations |
| **Testing & Browser QA** | Built-in & Pre-installed | `node:test` + `tsx --test` + `playwright-cli` + headless Chromium |
| **Database Options** | Two Verified Paths | 1) **Cloud SQL (PostgreSQL)** via AI Studio provisioning + Drizzle ORM<br>2) **SQLite (`better-sqlite3` / `node:sqlite`)** embedded relational DB |

---

## 2. Critical Platform Constraints & Architectural Implications

### Constraint 1: Python OR/ML Ecosystem Is Unavailable
- **Finding:** Python 3.11.2 exists without `pip`, `ensurepip`, `numpy`, `scipy`, `ortools`, `pulp`, or native solvers (`cbc`, `glpsol`).
- **Implication:** Building a Python microservice for SciPy/OR-Tools would fail to install packages or break Cloud Run single-container deployment (`npm start` -> `node server.ts`).
- **Resolution:** Execute all **Prediction**, **Mathematical Optimization**, and **Detection** engines directly inside the Node.js/TypeScript backend using:
  - **HiGHS WebAssembly (`highs` npm package, MIT License)** for industrial-grade LP, MILP, and QP solving.
  - **Dedicated TypeScript Quantitative Modules** for Nonlinear/Convex Optimization (Projected Gradient / Nelder-Mead / Sequential Quadratic Approximation), Dynamic Programming, Network/Assignment/Transportation Flows, Monte Carlo Simulation, Sensitivity Analysis, and Statistical/Time-Series Forecasting.
  - **`node:worker_threads`** to isolate CPU-intensive mathematical solves from the main Express API thread.

### Constraint 2: Single Container & Port 3000 Requirement
- **Finding:** The application must serve both frontend and backend via a single Node.js server listening on port `3000` (`server.ts` with `vite.middlewares` in development and static `dist/` in production).
- **Implication:** No separate Redis, Celery, RabbitMQ, or standalone Python FastAPI server processes are managed externally by the runtime.
- **Resolution:** Implement an **in-process persistent Job Queue backed by the relational database** + a **`Worker Thread` pool** (`worker_threads`) for asynchronous optimization runs, large file ingestion, and batch detection jobs, with full job status tracking, cancellation, and time-limit enforcement.

### Constraint 3: Ephemeral Container Filesystem vs. Managed Persistence
- **Finding:** Local files in Cloud Run containers are ephemeral across container restarts/redeployments unless backed by a managed database.
- **Implication:** Using local SQLite alone risks losing tenant data on container redeployment, though it works reliably during single-instance runtime and testing.
- **Resolution:**
  - **Primary Enterprise Recommendation:** **Cloud SQL (PostgreSQL)** provisioned through the platform's Cloud SQL integration + **Drizzle ORM** (`drizzle-orm` + `pg`) for durable, ACID-compliant, multi-tenant relational storage.
  - **Secondary / Local Fallback Option:** If Cloud SQL provisioning is deferred or declined, **SQLite (`better-sqlite3`)** with Drizzle ORM + exportable encrypted SQL/JSON snapshot backups provides full relational integrity and zero external dependencies while maintaining identical schema contracts via Drizzle.

### Constraint 4: Browser Sandbox & Security
- **Finding:** The app runs inside an iframe on AI Studio (`window.alert` / `window.open` are restricted; HMR is disabled).
- **Implication:** All confirmations, modals, exports, and auth flows must be in-app React UI (no browser popups/alerts). Secrets (`GEMINI_API_KEY`, session signing keys, DB URLs) must remain strictly server-side.

---

## 3. Solver Evaluation, Licensing & Boundaries

| Solver / Engine | Problem Classes | License | Platform Fit | Limitations & Guardrails |
|---|---|---|---|---|
| **HiGHS (`highs` WASM)** | LP, MILP, Binary/Integer Programming, Portfolio/Bundle Combinatorial MILP, Budget Allocation, Transportation/Assignment | **MIT License** (Commercial-friendly, zero copyleft) | Runs natively in Node.js & Worker Threads via WASM with zero OS binaries | Single-threaded WASM per worker; enforce strict `time_limit` and report `OPTIMAL` vs `FEASIBLE` vs `TIME_LIMIT` vs `INFEASIBLE` vs `UNBOUNDED` truthfully |
| **TypeScript Convex / NLP Engine** | Pricing Response Optimization, Diminishing-Returns Budget Curves, Constrained Nonlinear Allocation | Custom TS (MIT) | Native TypeScript in Worker Threads | Local vs global optimality clearly documented; KKT/gradient tolerance and feasibility checks logged |
| **TypeScript Network & DP Engine** | Shortest Path, Min-Cost Flow, Multi-Period Inventory/Cashflow DP, Knapsack | Custom TS (MIT) | Native TypeScript | Exact polynomial/pseudo-polynomial algorithms with size bounds |
| **TypeScript Monte Carlo & Sensitivity Engine** | Stochastic Demand/Liquidity Scenarios, Risk-Aware CVaR/VaR Bounds, Shadow Price & RHS Perturbation | Custom TS (MIT) | Native TypeScript with seeded PRNG (`mulberry32`) for reproducibility | Reproducible via explicit random seed & iteration count logged in run metadata |
| **Model Selection Layer** | Automatic routing across LP, MILP, NLP, DP, Network, and Simulation | Custom TS | Runs before Solver execution | Validates data sufficiency (`READY`, `PARTIAL`, `INSUFFICIENT_DATA`, `AMBIGUOUS`, `FAILED`) and selects simplest sound model |

---

## 4. Recommended Production Technology Stack

| Layer | Selected Technology | Justification |
|---|---|---|
| **Frontend UI** | React 19 + TypeScript + Vite + Tailwind CSS v4 | Pre-installed, fast compilation, strict typing, full RTL/LTR logical CSS (`dir="rtl"` / `dir="ltr"`), custom Design System |
| **Charts & Data Grid** | Custom SVG/Canvas interactive analytical charts + structured typed tables (or `recharts` if needed) | Complete control over RTL axis orientation, units, confidence bands, Pareto frontiers, and zero cosmetic clutter |
| **Localization (i18n)** | Custom typed i18n dictionary engine (Arabic primary + English) + `Intl.NumberFormat` / `Intl.DateTimeFormat` | Zero-overhead, compile-time key safety, dynamic currency/timezone formatting |
| **Backend API** | Node.js 22 + Express + TypeScript (`tsx` dev / compiled prod) | Unified single-origin server on port `3000`, `/api/v1/*` versioned REST API, Zod schema validation |
| **Database & ORM** | **PostgreSQL (Cloud SQL)** + Drizzle ORM (or SQLite fallback if requested) | Strict relational integrity, multi-tenant foreign keys, transactions, migrations, auditability |
| **File Ingestion** | `xlsx` (SheetJS) / `csv-parse` / JSON streaming parser | Supports Excel (`.xlsx`, `.xls`), CSV, JSON, and external REST/DB connectors |
| **Prediction Engine** | Pure TypeScript Statistical & Time-Series Suite (SES, Holt-Winters, OLS/Ridge Regression, Quantile Intervals, Backtesting) | Explainable, reproducible, fast, mathematically verifiable without black-box guesses |
| **Optimization Engine** | `highs` (WASM LP/MILP) + TS Convex/NLP/DP/Monte Carlo + `node:worker_threads` | Industrial solver fidelity with authentic solver statuses and constraint conflict diagnostics |
| **AI Orchestration** | `@google/genai` (server-side proxy `/api/v1/ai/*`) with structured Tool Calling to TETRA engines | Strictly grounded in database & engine outputs; never fabricates numbers or approves decisions |
| **Security & Auth** | `scrypt` password hashing, HTTP-only signed/encrypted session tokens, RBAC + Tenant/Branch/Region scope middleware, rate limiting, audit log | Enforced at backend API & DB query layers |
| **Reports & Export** | Server-side structured report generator + Excel (`.xlsx`) & printable/downloadable HTML/PDF report exports | Bilingual AR/EN reports with lineage, assumptions, and model versions |
| **QA & Automation** | `node:test` + `tsx --test` + Playwright CLI (`playwright-cli`) | Deterministic unit, mathematical, security, integration, and E2E verification |

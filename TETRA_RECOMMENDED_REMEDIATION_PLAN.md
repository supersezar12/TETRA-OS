# TETRA OS — Recommended Remediation Plan

This plan sequences the smallest, lowest-risk fixes required to close critical governance, security, and mathematical truthfulness gaps while **preserving all working HiGHS LP/MILP, statistical backtesting, SQLite persistence, and React UI functionality**.

---

## Phase A — Governance, Immutability & Financial Truthfulness Hotfixes *(Immediate Priority — Before Any Production Use)*

1. **Close Critical State-Machine Bypasses (`GAP-01`, `GAP-02`, `GAP-06`):**
   - Introduce SQLite migration #1 adding `decision_reviews`, `decision_executions`, and `alert_history` append-only tables plus `PRAGMA user_version = 1` tracking.
   - Lock `PATCH /api/decisions/:id/review` against modifying finalized (`APPROVED` / `REJECTED`) dossiers (`409`), add `REANALYSIS_REQUESTED` status, version `MODIFIED` dossiers cleanly, and block self-approval (`created_by === user.email`).
   - Lock `PATCH /api/decisions/:id/execution` so only `APPROVED` / `MODIFIED` dossiers can receive execution records (`409` otherwise), capture explicit execution status (`CONFIRMED | FAILED | UNKNOWN`), and gate via dedicated `recordExecution` permission.
   - Lock `PATCH /api/detect/alerts/:id` to forward-only transitions (`OPEN -> UNDER_REVIEW | RESOLVED | DISMISSED`, `UNDER_REVIEW -> RESOLVED | DISMISSED`), rejecting closed alert edits with `409`.
2. **Eliminate Financial & Sufficiency Fabrications (`GAP-03`, `GAP-07`):**
   - Remove synthetic `approvedTarget = revenue * 1.05` and `units = revenue / 50` fabrication in `ingestion.ts`; keep unmapped targets/units `null`.
   - Enforce `snapshot.hasSpend` before running `budget_allocation` / `trade_promo` (`INSUFFICIENT_DATA` otherwise), remove `0.68`, `0.08`, and `0.06` silent fallbacks in `optimize.ts`, and exclude null-COGS rows properly in `predict.ts` (`gross_margin`) rather than substituting `0`.
   - Route `restoreCompanyRecordsFromBackup` through validation logic instead of hardcoding `qualityScore: 95, sufficiencyStatus: 'READY'`.
3. **Close RBAC & Hierarchical Scope Leaks (`GAP-04`, `GAP-05`):**
   - Gate `GET /api/audit-logs`, `GET /api/users`, and `POST /api/ai/analyze` with explicit `requirePermission(...)`.
   - Implement `departmentScope` SQL filtering in `getCommercialRecordsForSnapshot`, remove the `.includes('HQ')` bypass, and pass user scopes consistently across `/api/predict/runs`, `/api/optimize/runs`, `/api/detect/*`, `/api/ai/analyze`, and `/api/reports/export`.
   - Gate `UsersManagementView.tsx` row controls on `canManageUsers`.

---

## Phase B — Quantitative & Provenance Hardening *(Near-Term)*

1. **Optimization Engine Hardening (`GAP-08`, `GAP-09`, `GAP-10`):**
   - Fix `trade_promo` `baselineTotal` calculation parity with `allocations`.
   - Move `highs` solver execution into a `node:worker_threads` worker so solves never block the Express event loop.
   - Add post-solve primal constraint verification, extract `FEASIBLE` incumbents + MIP gap on `TIME_LIMIT`, align `SolverStatus` (`INSUFFICIENT_DATA`, `AMBIGUOUS`, `FAILED`), and record HiGHS/model version + `forecastId`.
   - Freeze full Stage 05 provenance (`dataset_snapshot_id`, `forecast_id`, `model_version`, `solver_version`, `sufficiency_status`, `constraints_json`, `expected_outcomes_json`) onto `decision_dossiers` at creation time.
2. **Prediction & Sufficiency Hardening (`GAP-08`, `GAP-11`):**
   - Implement `AMBIGUOUS` (duplicate keys, mixed period formats/currencies) and `FAILED` statuses in Stage 02.
   - Add `WAPE` and `MASE` metrics, zero-safe `MAPE`, true seasonal Holt-Winters (triple exponential when sufficient seasonal history exists), `model_registry` tracking, and `[lower95, upper95]` band + run selector in `PredictView.tsx`.
3. **Live Chart & UI Fidelity (`GAP-12`, `GAP-13`):**
   - Fix `OptimizationImprovementChart.tsx` live mode so scenario tabs, unit labels, `/1000` scaling, lift labels, and downloaded JSON `reportType` accurately reflect live HiGHS runs.

---

## Phase C — Operational Readiness, Security & Phase-0 Expansion *(Post-Stabilization)*

1. **Auth, Session & Ops Hardening (`GAP-14`):**
   - Persist/require `TETRA_SESSION_SECRET` (refuse startup in `NODE_ENV=production` without secret or persisted key), add `/api/auth/logout` token revocation table, add login rate limiting, and implement `PENDING_INVITE` activation / password reset flows.
   - Remove unintended root `/1234567890*` SQLite files after confirming `data/tetra.db` is sole active store, add SQLite indexes, update `vite.config.ts` (`import.meta.dirname`) + code-split chunks, and add automated HTTP integration + Playwright E2E regression tests to `"test"` script in `package.json`.
2. **Complete Remaining Phase-0 / v1.5 Capabilities (`GAP-13`, `GAP-14`):**
   - Complete Arabic/English translations across all operational screens and PDF/XLSX exports.
   - Upgrade Detect engine to compare Actuals vs Forecasts and Approved Decisions, with configurable thresholds.
   - Upgrade AI Workspace to Gemini function/tool-calling over scoped engines.
   - Progressively build missing Phase-0/v1.5 commercial screens (`Company Setup`, `Commercial Intelligence`, `Sales & Channel Intelligence`, `Bundles & Offers`, `Supplier & Procurement`, `Credit & Liquidity`) and any additional requested mathematical solvers (TS Convex/NLP, Monte Carlo simulation) only when genuinely implemented and tested.

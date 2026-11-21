# TETRA OS — Eight-Stage Governed Lifecycle Audit (Part 2)

Each of the eight lifecycle stages is assigned an evidence-based status based strictly on backend logic, database schema, authorization, validation, integration, and executed tests.

---

## Stage 01 — Data Ingestion & Mapping
**Assigned Status:** `IMPLEMENTED_WITH_GAPS`

### Verified Working Implementation
- **File Parsing (`/server/engines/ingestion.ts`):**
  - CSV parsing (`parseCsvText`, lines 45–110) with quoted cell & CRLF handling.
  - Excel `.xlsx` parsing (`parseXlsxBase64`, lines 112–151) via `exceljs` resolving formula `.result` values.
  - JSON array parsing (`parseJsonText`, lines 153–175).
- **Column Mapping & Preview:** `suggestColumnMapping` (`ingestion.ts:25-43`) maps canonical fields (`period`, `region`, `branch`, `department`, `channel`, `product`, `revenue`, `cogs`, `marketingSpend`, `tradeSpend`, `units`, `approvedTarget`). Frontend interactive mapping UI exists in `DataCenterView.tsx:313-357` calling `POST /api/datasets/preview` (`server.ts:310-341`).
- **Snapshot Versioning & Non-Destructive Rollback:**
  - `saveDatasetSnapshot` (`/server/db.ts:905-991`) increments `version_number` per `company_id`, inserts immutable rows into `dataset_snapshots` and `commercial_records`, and switches `is_active` inside a SQLite transaction.
  - `rollbackToSnapshot` (`/server/db.ts:993-1020`, `POST /api/datasets/rollback` at `server.ts:424-456`) activates an older snapshot without deleting newer snapshots or historical import records, and writes `DATASET_ROLLBACK` to `audit_logs`.
- **Tenant Isolation:** `company_id` is derived server-side from `req.activeCompanyId` (`server/auth.ts:130-144`); cross-tenant `X-Company-Id` headers return `403` for non-`platform_super_admin` roles (empirically verified: `403` for `data_analyst`).

### Concrete Gaps Found
1. **No API / Webhook Ingestion Connector:** Only manual base64/text file POSTs (`/api/datasets/preview`, `/api/datasets/ingest`) exist; no external REST/webhook ingestion endpoint or connector config table exists.
2. **No Duplicate Row Detection:** `validateAndMapRows` (`/server/engines/ingestion.ts:194-307`) never checks for duplicate composite keys `(period, region, branch, department, channel, product)`. Duplicate rows are silently summed downstream.
3. **No Canonical Entity Matching / Master Tables:** There are no `regions`, `branches`, `departments`, `channels`, or `products` tables in `/server/db.ts`. Free-text strings are stored unnormalized and missing dimensions are defaulted to `'All Regions'`, `'Main Branch'`, `'Commercial'`, and `'Core Portfolio'` (`ingestion.ts:242-248`).
4. **Silent Synthetic Fabrication of `approvedTarget` and `units`:** In `ingestion.ts:232-235`, if `approvedTarget` is unmapped or blank, the system silently fabricates `Math.round(revenue * 1.05)` and stores it as `approved_target`. If `units` is unmapped, it synthesizes `Math.round(revenue / 50)`.
5. **Backup Restore Bypasses Validation:** `restoreCompanyRecordsFromBackup` (`/server/db.ts:1451-1469`) hardcodes `qualityScore: 95, sufficiencyStatus: 'READY', missingFields: []` regardless of whether restored records have `cogs: null` or `marketingSpend: null` (empirically reproduced via `POST /api/admin/restore`).
6. **Upload Permission vs Scope:** `DataCenterView` preview table (`GET /api/datasets/snapshots`, `server.ts:297-300`) filters preview rows by `regionScope` and `branchScope` (ignoring `departmentScope`), while `POST /api/datasets/ingest` allows a department-scoped user (`trade_marketing_manager`, `procurement_manager`) to overwrite the entire company's active snapshot (`is_active = 1`).

---

## Stage 02 — Data Quality & Sufficiency
**Assigned Status:** `PARTIALLY_IMPLEMENTED`

### Verified Working Implementation
- `validateAndMapRows` (`/server/engines/ingestion.ts:270-306`) calculates numeric completeness (`validRatio`), COGS coverage (`cogsCoverage`), and spend coverage (`spendCoverage`), producing `qualityScore` (`0–100`), `hasCogs`, `hasSpend`, and `sufficiencyStatus` (`READY | PARTIAL | INSUFFICIENT_DATA`).
- Required fields (`period`, `channel`, `revenue`) gate ingestion (`422` when no valid rows pass).
- COGS Gating (Partial): `POST /api/predict/run` (`server.ts:496-501`) blocks `metric === 'gross_margin'` with `422` when `!snapshot.hasCogs`. `runOptimizationEngine` (`optimize.ts:96-119`) returns `solverStatus: 'BLOCKED_INSUFFICIENT_DATA'` for `margin_mix` when `!snapshot.hasCogs`.

### Concrete Gaps Found
1. **`AMBIGUOUS` and `FAILED` Statuses Not Implemented:** `SufficiencyStatus` (`/server/types.ts:238`) only defines `'READY' | 'PARTIAL' | 'INSUFFICIENT_DATA'`.
2. **80% Threshold Leaks Fabricated COGS (20% Silent Margin Fabrication):** `hasCogs = cogsCoverage >= 0.8` (`ingestion.ts:273`). If 85% of rows have COGS, `hasCogs` is `true`, allowing `margin_mix` and `gross_margin` forecasting to run, while `optimize.ts:40` silently fabricates COGS on the missing 15% of rows using `r.cogs ?? r.revenue * 0.68` and `predict.ts:27` silently substitutes `0` margin (`row.cogs !== null ? row.revenue - row.cogs : 0`).
3. **Total Absence of Spend Sufficiency Gating & Silent Spend Fabrication (HIGH):** Although `hasSpend` is stored on `dataset_snapshots`, **zero downstream engines check `snapshot.hasSpend`**. Worse, `buildDefaultChannelInputs` (`optimize.ts:41-42`) silently fabricates `marketingSpend ?? r.revenue * 0.08` and `tradeSpend ?? r.revenue * 0.06`, then computes `roiMultiplier` from fabricated spend (`budget_allocation` returned `OPTIMAL` with spend `5,145` on a test upload with 0 spend columns).
4. **No Currency, Unit, or Period Consistency Checks:** Mixed currencies, mixed units, malformed periods (e.g., `"Jan-26"` mixed with `"2026-01"`), or negative COGS/spend checks beyond `>= 0` skipping are not flagged as `AMBIGUOUS`.

---

## Stage 03 — Prediction Engine (PREDICT)
**Assigned Status:** `IMPLEMENTED_WITH_GAPS`

### Verified Working Implementation
- **Statistical Pipelines (`/server/engines/predict.ts`):**
  - `fitSes` (`lines 49-80`): Grid searches `alpha in [0.15, 0.3, 0.45, 0.6, 0.75]` by SSE.
  - `fitHoltWintersLinear` (`lines 82-102`): Double exponential smoothing (`alpha = 0.4, beta = 0.25`).
  - `fitLinearRegression` (`lines 104-123`): Ordinary Least Squares linear trend.
- **No-Leakage Holdout Backtesting:** `runForecastEngine` (`predict.ts:171-189`) splits `trainValues = values.slice(0, values.length - holdoutSize)` and `testValues = values.slice(values.length - holdoutSize)`, evaluates out-of-sample errors, and benchmarks against one-step Naive persistence (`naiveMetrics`).
- **Confidence Intervals & Persistence:** Computes residual `sigma` and step-scaled `1.96 * sigma * sqrt(step)` intervals (`lines 192-224`), persisting runs to `forecast_runs` linked to `snapshot_id` (`server.ts:509-520`).
- **Targets Separation:** `forecast_runs` is structurally separate from `commercial_records.approved_target`.

### Concrete Gaps Found
1. **Missing Required Error Metrics (`WAPE`, `MASE`):** `computeErrorMetrics` (`predict.ts:125-151`) only computes `MAE`, `RMSE`, and `MAPE`. `WAPE` and `MASE` are absent.
2. **Seasonal Holt-Winters Mislabeling:** `modelType: 'HOLT_WINTERS'` runs non-seasonal linear trend smoothing (`fitHoltWintersLinear`, `alpha`/`beta` only, no seasonal `gamma` component or period cycle).
3. **MAPE Near-Zero Safeguard Missing:** `computeErrorMetrics` (`predict.ts:139`) divides by `actuals[i]` whenever `actuals[i] > 0`, risking distortion on near-zero series.
4. **Missing Model Registry & Model Version:** `forecast_runs` stores `model_type` string only; there is no `model_registry` table, `model_version`, or hyperparameter serialization (SES `bestAlpha` is discarded after fitting).
5. **Scope Leakage on `GET /api/predict/runs`:** `server.ts:462` reads all tenant rows without `regionScope`/`branchScope`/`departmentScope`, exposing unauthorized channel lists, and `POST /api/predict/run` ignores `departmentScope`.
6. **UI Rendering Gap (`PredictView.tsx`):** Plots only `<Area dataKey="upper95">` (`PredictView.tsx:223-230`) without a lower bound or band range (`lower95`), and has no historical run selector (always displays `runs[0]`).

---

## Stage 04 — Mathematical Optimization Engine (OPTIMIZE)
**Assigned Status:** `IMPLEMENTED_WITH_GAPS`

### Verified Working Implementation
- **Authentic LP / MILP Solving (`highs` WASM v1.16.0 in `/server/engines/optimize.ts`):**
  - `budget_allocation`: 2-segment piecewise-linear concave LP (`c_i` core + `s_i` stretch at `0.78` marginal yield).
  - `margin_mix`: COGS-gated (`!snapshot.hasCogs` -> `BLOCKED_INSUFFICIENT_DATA`) piecewise-linear LP weighted by `(1 + marginRate)`.
  - `trade_promo`: Binary MILP (`y_i in {0, 1}`, `promo_min`/`promo_max` linking constraints, `max_active_promos` cardinality constraint).
- **Authentic Solver Diagnostics & Sensitivity:** Maps HiGHS `Status` (`Optimal`, `Unbounded`, `Time limit reached`, `Infeasible`), returns real dual shadow prices and constraint slacks for LP (and skips LP duals when `isMilp` is true, `optimize.ts:320-353`).
- **Persistence & Audit:** Saves results to `optimization_runs` with `execution_ms` and logs `OPTIMIZATION_EXECUTED`.

### Concrete Gaps Found
1. **Unsupported Methods Claimed in Phase-0 / UI:** `App.tsx:75`, `AppWorkflowView`, and `PRODUCT_REQUIREMENTS.md` reference **NLP / Convex, Constraint Programming / CP-SAT, Multi-objective, Stochastic, Robust, Monte Carlo simulation, and Scenario Optimization**. **None of these exist in code**; only LP and binary MILP via `highs` exist.
2. **Synchronous Main-Thread Solver Execution:** `solver.solve(lpProblem, {time_limit: 5})` (`optimize.ts:214`) executes synchronously inside the Express request handler, blocking the Node.js event loop for all concurrent HTTP requests (no `worker_threads` or async job queue).
3. **`FEASIBLE` Status Never Mapped on Time Limit:** `optimize.ts:219` maps `'Time limit reached'` directly to `'TIME_LIMIT'` and skips extracting incumbent solutions (`if (status === 'OPTIMAL')` on line 264), never surfacing `'FEASIBLE'` with optimality gap.
4. **Missing `INSUFFICIENT_DATA`, `AMBIGUOUS`, `FAILED` Statuses & Post-Solve Feasibility Validation:** Uses non-standard `'BLOCKED_INSUFFICIENT_DATA'`, lacks `'FAILED'` / `'AMBIGUOUS'`, lacks MILP MIP-gap reporting, lacks solver/model version metadata, and does not independently verify primal constraints (`sum(spend) <= totalBudget`, `min <= spend <= max`) after solve.
5. **No Forecast Linkage:** `optimization_runs` only references `snapshot_id`; it has no `forecast_id` reference.
6. **ROI & Spend Governance Violation:** As noted in Stage 02, `buildDefaultChannelInputs` fabricates missing `cogs` (`0.68`) and `marketingSpend`/`tradeSpend` (`0.08`/`0.06`), and uses `(baselineReturn * grossMarginRate) / totalSpend` as `roiMultiplier` without spend-to-attributable-return validation.

---

## Stage 05 — Recommendation Dossier
**Assigned Status:** `PARTIALLY_IMPLEMENTED`

### Verified Working Implementation
- `POST /api/decisions` (`/server.ts:653-701`) requires `runOptimize` permission, verifies `optimizationRunId` belongs to `companyId`, and blocks non-actionable runs (`INFEASIBLE`, `UNBOUNDED`, `BLOCKED_INSUFFICIENT_DATA`, `TIME_LIMIT` -> HTTP `422`).
- Captures `assumptions`, `risks`, `limitations`, `createdBy`, `createdAt` in `decision_dossiers` (`/server/db.ts:150-167`), separate from `APPROVED` decisions.

### Concrete Gaps Found
1. **Incomplete Traceability Schema:** `decision_dossiers` only stores `optimization_run_id` (`db.ts:153`). It lacks direct immutable columns/snapshots for `dataset_snapshot_id`, `forecast_id` (+ version), `model_id`/`version`, `solver_name`/`version`, `objective_function`, `constraints_snapshot`, `data_sufficiency_status`, `expected_outcomes_json`, and `evidence_json`.
2. **Evidence Mutability Risk:** If an optimization run is inspected via join, the dossier itself does not freeze the evidence payload or solver metadata at creation time.
3. **No Draft vs Submitted Separation:** Dossiers are inserted directly with `status = 'PENDING_REVIEW'` (`db.ts:1223`); no `DRAFT` state or structured evidence attachment exists.

---

## Stage 06 — Management Review & Approval
**Assigned Status:** `PARTIALLY_IMPLEMENTED`

### Verified Working Implementation
- `PATCH /api/decisions/:id/review` (`/server.ts:708-746`) enforces `requirePermission('approveDecisions')` (verified: `data_analyst` receives `403`).
- Supports `APPROVED`, `MODIFIED`, `REJECTED` with required `comment` and writes `DECISION_<STATUS>` to `audit_logs`.

### Concrete Gaps Found
1. **Mutable In-Place Overwrite & Zero Approval History Table (CRITICAL Governance Defect):** `reviewDecision` (`db.ts:1263-1267`) runs `UPDATE decision_dossiers SET status = ?, reviewer_comment = ?, reviewed_by = ?, reviewed_at = ?` directly on the single dossier row. There is **no `decision_approvals` / `review_history` table**, and **no state guard preventing re-review**. Empirically proved: a `REJECTED` decision was overwritten in-place to `APPROVED` (`HTTP 200`), erasing the original reviewer identity, comment, and timestamp from the dossier record.
2. **`MODIFIED` Does Not Preserve Original & Version New Recommendation:** Selecting `MODIFIED` only updates the status string and comment; no modified parameter values (e.g., adjusted budget/constraints) are captured and no new dossier version is linked.
3. **Missing `"Request Re-Analysis"` Workflow:** Required status/action for sending a dossier back to analysts does not exist.
4. **No Separation of Duties or Scoped Approval Authority:** Any user in the tenant with `approveDecisions` (e.g., `finance_manager`, `commercial_director`, `executive_manager`, `company_owner`) can approve a dossier they created (`created_by === reviewed_by` allowed) with no region/branch/department or monetary approval limit enforcement.

---

## Stage 07 — Execution Reference Handoff
**Assigned Status:** `PARTIALLY_IMPLEMENTED`

### Verified Working Implementation
- `PATCH /api/decisions/:id/execution` (`/server.ts:754-795`) and `DecisionsView.tsx:296-348` persist `execution_ref`, `actual_outcome_value`, and `actual_outcome_notes` on `decision_dossiers`, logging `DECISION_EXECUTION_LINKED`.

### Concrete Gaps Found
1. **Execution Can Be Linked to `PENDING_REVIEW` or `REJECTED` Decisions (CRITICAL Bypass):** `updateDecisionExecution` (`db.ts:1275-1304`) never checks `status`. Empirically proved: attaching `executionRef: "SAP-ILLEGAL-001"` to a `REJECTED` dossier succeeded with `HTTP 200`!
2. **Wrong RBAC Permission Check:** `server.ts:757` gates execution updates with `requirePermission('manageDetectAlerts')` rather than a dedicated execution permission—allowing `data_analyst` and `decision_reviewer` to record ERP execution tickets.
3. **No Execution Status Lifecycle:** Stores only a single nullable `execution_ref` string on `decision_dossiers`; cannot distinguish `execution_confirmation`, `execution_failure`, or `unknown_execution_status`, nor support external sync/webhook verification or multiple execution records.
4. **Scalar Manual Outcome Entry:** `actual_outcome_value` is a manually typed scalar number rather than an automated measurement linked to post-execution `commercial_records`.

---

## Stage 08 — Outcome Measurement & DETECT
**Assigned Status:** `PARTIALLY_IMPLEMENTED`

### Verified Working Implementation
- **Rule Evaluation (`/server/engines/detect.ts`):** Implements 4 real rules (`REV_TARGET_VARIANCE`, `MARGIN_COMPRESSION_DRIFT`, `CHANNEL_CONCENTRATION_RISK`, `OPT_REALLOCATION_OPPORTUNITY`).
- **Re-Detection Linking (`/server/db.ts:1366-1394`):** When a previously `RESOLVED` or `DISMISSED` alert rule triggers again, `upsertEvaluatedAlerts` inserts a **new** alert row with `parent_alert_id` pointing to the prior closed alert and increments `occurrence_count`.

### Concrete Gaps Found
1. **No Outcome Comparison Against Forecasts or Approved Decisions:** `evaluateDetectRules` (`detect.ts:18-121`) only inspects `commercial_records` (`approvedTarget`, `cogs`, `channel`) and the latest `optimization_runs` row. It never compares Actuals vs `forecast_runs` or `decision_dossiers` (`actualOutcomeValue` vs expected lift).
2. **Mutable Closed Alerts & No Alert History Table (HIGH):** `transitionAlertStatus` (`db.ts:1400-1422`) performs an unguarded `UPDATE detect_alerts SET status = ?, resolution_notes = ?, updated_by = ?`. Empirically proved: a `RESOLVED` alert was transitioned backwards to `UNDER_REVIEW` (`HTTP 200`), overwriting the resolution note in place. There is no `alert_history` table.
3. **Scope Leak on Evaluation (`server.ts:816`):** `POST /api/detect/evaluate` queries ALL company rows (`getCommercialRecordsForSnapshot(companyId, snapshot.id)`) without `user` region/branch/department scope, allowing a branch-scoped `sales_manager` to evaluate company-wide alerts and read all company alerts via `GET /api/detect/alerts`.
4. **Hardcoded Rules & Thresholds:** Thresholds (`5%` variance, `1.5 pts` margin drift, `30%` channel share, `5%` optimization lift) are hardcoded in `detect.ts`; no configurable threshold or policy table exists.

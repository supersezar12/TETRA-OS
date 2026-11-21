# TETRA OS — Architectural & Implementation Gap Register

All findings below are strictly backed by source code locations and/or live execution probes.

---

### GAP-01 — Mutable Decision Review Overwrites & Missing Approval History
- **Finding ID:** `GAP-01`
- **Description:** `reviewDecision` updates `status`, `reviewer_comment`, `reviewed_by`, and `reviewed_at` directly in place on `decision_dossiers` with no state-transition guard, no `decision_approvals` audit history table, no separation-of-duties check (`created_by === reviewed_by`), no `"Request Re-Analysis"` status, and no versioned lineage for `"MODIFIED"` decisions.
- **Evidence:** `/server/db.ts:1249-1273`; `/server.ts:708-746`; Live probe: `PATCH /api/decisions/:id/review` overwrote a `REJECTED` decision to `APPROVED` (`HTTP 200`).
- **Severity:** `CRITICAL`
- **Business Impact:** Destroys governance accountability; rejected commercial decisions can be silently converted to approved without preserving who rejected them or why, and authors can self-approve their own recommendations.
- **Technical Impact:** Violates Stage 06 immutability requirements and creates non-reconstructible decision state.
- **Dependencies:** `decision_dossiers` schema, `DecisionsView.tsx`.
- **Recommended Fix:** Introduce an append-only `decision_reviews` table, enforce valid state transitions (`PENDING_REVIEW | REANALYSIS_REQUESTED -> APPROVED | MODIFIED | REJECTED`), block `created_by === reviewer` self-approval (unless explicitly permitted for single-user tenants), and clone a new versioned dossier when `"MODIFIED"` alters parameters.
- **Acceptance Criteria:** Prior reviews remain queryable forever; re-reviewing a finalized `APPROVED`/`REJECTED` dossier returns `409`; `created_by === user.email` is rejected with `403` where multi-user governance applies.
- **Regression Tests:** Integration test verifying `REJECTED -> APPROVED` returns `409`, `decision_reviews` preserves timeline, and self-approval returns `403`.

---

### GAP-02 — Execution Reference Allowed on Rejected & Unapproved Decisions
- **Finding ID:** `GAP-02`
- **Description:** `PATCH /api/decisions/:id/execution` allows linking ERP/CRM `execution_ref` and `actual_outcome_value` onto dossiers whose status is `PENDING_REVIEW` or `REJECTED`, and gates access with `manageDetectAlerts` rather than an execution authority permission.
- **Evidence:** `/server/db.ts:1275-1304`; `/server.ts:754-795`; `/src/components/DecisionsView.tsx:296-348`; Live probe: `PATCH /api/decisions/:id/execution` on `REJECTED` decision returned `HTTP 200` (`SAP-ILLEGAL-001`).
- **Severity:** `CRITICAL`
- **Business Impact:** Enables unapproved or explicitly rejected commercial plans to be logged as executed in external ERP/CRM systems, breaking the core governance boundary of Stage 07.
- **Technical Impact:** Violates Stage 07 state-machine integrity and RBAC permission boundaries.
- **Dependencies:** `GAP-01`, `ENTERPRISE_ROLE_MATRIX`.
- **Recommended Fix:** Require `decision.status === 'APPROVED' || decision.status === 'MODIFIED'` before execution attachment (otherwise `409`), move execution records into an immutable `decision_executions` table with explicit execution status (`PENDING_SYNC | CONFIRMED | FAILED | UNKNOWN`), and introduce a dedicated `recordExecution` permission.
- **Acceptance Criteria:** Attempting `PATCH /api/decisions/:id/execution` on `PENDING_REVIEW` or `REJECTED` returns `409`; `DecisionsView` hides/disables execution form unless approved.
- **Regression Tests:** API test asserting `409` on `PENDING_REVIEW` & `REJECTED` decisions and `200` on `APPROVED`.

---

### GAP-03 — Silent Fabrication of Missing Spend, COGS & Approved Targets
- **Finding ID:** `GAP-03`
- **Description:** When datasets omit spend or COGS or targets: (1) `ingestion.ts:232-235` fabricates `approvedTarget = revenue * 1.05` and `units = revenue / 50`; (2) `ingestion.ts:273` sets `hasCogs = true` at `>= 80%` coverage while `optimize.ts:40` fabricates `cogs = revenue * 0.68` for missing rows and `predict.ts:27` substitutes `0` margin; (3) `optimize.ts:41-42` fabricates `marketingSpend = revenue * 0.08` and `tradeSpend = revenue * 0.06` without checking `snapshot.hasSpend` and clamps `roiMultiplier` to `[1.2, 4.8]`.
- **Evidence:** `/server/engines/ingestion.ts:232-235, 273-274`; `/server/engines/optimize.ts:40-56`; `/server/engines/predict.ts:27`; Live probe: 0-spend CSV produced `budget_allocation: OPTIMAL` with fabricated spend `5,145`.
- **Severity:** `CRITICAL`
- **Business Impact:** Leadership receives mathematically "OPTIMAL" budget and ROI recommendations derived from invented costs, invented marketing/trade spend, and invented sales targets—violating financial truthfulness rules.
- **Technical Impact:** Corrupts downstream KPIs, Predict (`gross_margin`), Optimize (`roiMultiplier`), and Detect (`REV_TARGET_VARIANCE` against synthetic `1.05x` target).
- **Dependencies:** Stage 01, Stage 02, Stage 03, Stage 04, Stage 08.
- **Recommended Fix:** Store `approvedTarget: number | null` and `units: number | null` without synthesizing `1.05x`/`/50`; require `hasSpend === true` (and `100%` or per-segment verified COGS/spend) before computing ROI or running `budget_allocation`/`trade_promo`; gate `REV_TARGET_VARIANCE` when `approvedTarget` is absent; omit unverified `0.68`/`0.08`/`0.06` fallbacks.
- **Acceptance Criteria:** Uploading a CSV without spend blocks `budget_allocation`/`trade_promo` with `INSUFFICIENT_DATA`; missing `approvedTarget` yields `null` target variance instead of synthetic `-4.8%`; rows with `cogs === null` never receive `0.68 * revenue`.
- **Regression Tests:** Unit & API tests with missing spend, 85% COGS, and unmapped `approvedTarget`.

---

### GAP-04 — Unpermissioned Access to Audit Logs, User Directory & AI Workspace
- **Finding ID:** `GAP-04`
- **Description:** `GET /api/audit-logs`, `GET /api/users`, and `POST /api/ai/analyze` apply only `requireAuth` with no `requirePermission(...)` guard.
- **Evidence:** `/server.ts:892, 1124, 1237`; Live probe: `read_only_user` received `HTTP 200` on `/api/audit-logs` and `/api/users`, and passed auth/RBAC on `/api/ai/analyze`.
- **Severity:** `HIGH`
- **Business Impact:** Least-privilege `read_only_user` accounts can inspect full tenant user emails/roles, security/governance audit trails, and invoke billable Gemini API analysis over full-company data.
- **Technical Impact:** Direct RBAC policy enforcement gap on 3 backend endpoints and `UsersManagementView.tsx:281`.
- **Dependencies:** `ENTERPRISE_ROLE_MATRIX`, `/server/auth.ts`.
- **Recommended Fix:** Add `requirePermission('manageUsers')` (or dedicated `viewAuditLogs`/`useAiWorkspace` flags) to `/api/audit-logs`, `/api/users`, and `/api/ai/analyze`, and hide the Audit Logs tab in `UsersManagementView.tsx` when unauthorized.
- **Acceptance Criteria:** `read_only_user` receives `403` on `/api/audit-logs`, `/api/users` (or sees scoped directory only if authorized), and `/api/ai/analyze`.
- **Regression Tests:** Integration test verifying `403` vs `200` across all 12 roles on these routes.

---

### GAP-05 — Hierarchical Scope Bypass (`departmentScope` Ignored & Cross-Route Leaks)
- **Finding ID:** `GAP-05`
- **Description:** `getCommercialRecordsForSnapshot` accepts `departmentScope` in its signature (`/server/db.ts:1025`) and ignores it in SQL. Additionally, `GET /api/predict/runs`, `GET /api/optimize/runs`, `POST /api/detect/evaluate`, `GET /api/detect/alerts`, `POST /api/ai/analyze`, and `GET /api/reports/export` omit `regionScope`/`branchScope`/`departmentScope` filtering, and `db.ts:1035` bypasses branch checks whenever `branchScope.includes('HQ')`.
- **Evidence:** `/server/db.ts:1022-1042`; `/server.ts:462, 550, 816, 908, 1004`; Live probe: `department_manager` received full company revenue `1,975,576`, and `sales_manager` received all 5 channels in `predict/runs` & `optimize/runs`.
- **Severity:** `HIGH`
- **Business Impact:** Regional, branch, and department managers can view, forecast, optimize, alert on, and export commercial data outside their authorized organizational boundaries.
- **Technical Impact:** Broken row-level access control across analytics, reporting, and AI grounding.
- **Dependencies:** `users` scope columns, `/server/db.ts`.
- **Recommended Fix:** Enforce `departmentScope` in `getCommercialRecordsForSnapshot`, remove the `.includes('HQ')` wildcard bypass, apply user scope consistently across Predict/Optimize/Detect/AI/Reports/Overview/DataCenter, and tag runs/alerts with scope metadata.
- **Acceptance Criteria:** Scoped `department_manager` and `sales_manager` only see metrics, channels, exports, and AI context matching their assigned `regionScope`, `branchScope`, and `departmentScope`.
- **Regression Tests:** API tests verifying scoped counts/revenues differ from admin totals for restricted scopes across all 6 endpoints.

---

### GAP-06 — Mutable Closed Detect Alerts & Missing Alert History
- **Finding ID:** `GAP-06`
- **Description:** `transitionAlertStatus` updates `detect_alerts` in place without checking whether the alert is already `RESOLVED` or `DISMISSED`, and there is no `alert_history` audit table.
- **Evidence:** `/server/db.ts:1400-1422`; Live probe: `PATCH /api/detect/alerts/:id` moved a `RESOLVED` alert back to `UNDER_REVIEW` (`HTTP 200`), overwriting `resolution_notes`.
- **Severity:** `HIGH`
- **Business Impact:** Breaks Stage 08 immutable alert auditability; closed compliance/variance findings can be altered or silenced retroactively.
- **Technical Impact:** Violates Stage 08 alert lifecycle state machine (`OPEN -> UNDER_REVIEW -> RESOLVED | DISMISSED`).
- **Dependencies:** `detect_alerts` schema.
- **Recommended Fix:** Enforce forward-only transitions (`OPEN -> UNDER_REVIEW | RESOLVED | DISMISSED`, `UNDER_REVIEW -> RESOLVED | DISMISSED`) returning `409` on closed alerts, and insert every transition into an append-only `alert_history` table.
- **Acceptance Criteria:** Modifying a `RESOLVED` or `DISMISSED` alert returns `409`; re-evaluation creates a new linked `OPEN` child alert (`parent_alert_id`).
- **Regression Tests:** Integration test verifying closed alert mutation fails with `409` while re-detection creates linked child alert.

---

### GAP-07 — Backup Restore Bypasses Stage 02 Data Validation
- **Finding ID:** `GAP-07`
- **Description:** `restoreCompanyRecordsFromBackup` inserts restored JSON rows with hardcoded `qualityScore: 95, sufficiencyStatus: 'READY', missingFields: []`, ignoring null COGS/spend values.
- **Evidence:** `/server/db.ts:1451-1469`; Live probe: restoring 1 row with `cogs: null` yielded `sufficiencyStatus: 'READY', hasCogs: false`.
- **Severity:** `HIGH`
- **Business Impact:** An invalid or COGS-less backup can mark an active tenant snapshot `READY`, corrupting downstream governance indicators.
- **Technical Impact:** Contradictory snapshot metadata (`sufficiencyStatus: 'READY'` with `hasCogs: false`).
- **Dependencies:** `validateAndMapRows`, `/api/admin/restore`.
- **Recommended Fix:** Route `activeSnapshotRecords` through validation scoring (`computeQualityMetrics` over restored `CommercialRow[]`) before persisting the snapshot.
- **Acceptance Criteria:** Restoring null-COGS records produces `PARTIAL` or `INSUFFICIENT_DATA` matching live CSV ingestion rules.
- **Regression Tests:** API test restoring null-COGS backup asserts `sufficiencyStatus !== 'READY'`.

---

### GAP-08 — Missing `AMBIGUOUS` / `FAILED` Data Sufficiency & `FEASIBLE` / `FAILED` Solver States
- **Finding ID:** `GAP-08`
- **Description:** `SufficiencyStatus` omits `AMBIGUOUS` and `FAILED` (`/server/types.ts:238`); `SolverStatus` uses `'BLOCKED_INSUFFICIENT_DATA'` instead of `'INSUFFICIENT_DATA'`, omits `'AMBIGUOUS'` and `'FAILED'`, and maps `'Time limit reached'` directly to `'TIME_LIMIT'` while discarding feasible incumbent solutions (`optimize.ts:219, 264`).
- **Evidence:** `/server/types.ts:238, 302`; `/server/engines/optimize.ts:216-221, 264`.
- **Severity:** `HIGH`
- **Business Impact:** Ambiguous period/currency/duplicate inputs are silently aggregated instead of halted, and timed-out MILP runs with valid incumbent solutions cannot surface `FEASIBLE` + optimality gap diagnostics.
- **Technical Impact:** Incomplete status state machines across Stage 02 and Stage 04.
- **Dependencies:** `ingestion.ts`, `optimize.ts`, `DataCenterView.tsx`, `OptimizeView.tsx`.
- **Recommended Fix:** Add `AMBIGUOUS` (duplicate keys, mixed period formats) and `FAILED` to Stage 02; align `SolverStatus` to canonical enum, capture `FEASIBLE` incumbents with `optimalityGap` when present on time limit, and add post-solve primal feasibility verification.
- **Acceptance Criteria:** Duplicate composite keys flag `AMBIGUOUS`; solver primal feasibility is independently verified before returning `OPTIMAL`/`FEASIBLE`.
- **Regression Tests:** Unit tests for duplicate-row `AMBIGUOUS` detection, time-limit incumbent handling, and post-solve feasibility assertion.

---

### GAP-09 — Synchronous Main-Thread HiGHS Execution & `trade_promo` Baseline Total Mismatch
- **Finding ID:** `GAP-09`
- **Description:** `solver.solve()` (`/server/engines/optimize.ts:214`) runs synchronously on the main Express event loop (blocking all HTTP requests during MILP solves up to 5 seconds), lacks MILP optimality gap / IIS diagnostics / solver & model version metadata, and `baselineTotal` (`lines 222-232`) uses a different multiplier formula than `allocations[i].baseline` (`lines 282-290`) for `trade_promo`.
- **Evidence:** `/server/engines/optimize.ts:214, 222-232, 282-290`.
- **Severity:** `HIGH`
- **Business Impact:** Concurrent users experience server freezes during large MILP solves, and `trade_promo` reports inconsistent `baselineTotal` vs sum of segment baselines (`netDelta` distortion).
- **Technical Impact:** Single-threaded Express availability bottleneck + arithmetic discrepancy in `trade_promo`.
- **Dependencies:** `node:worker_threads`, `optimize.ts`.
- **Recommended Fix:** Fix `trade_promo` `baselineTotal` to match `allocations` sum (`effMult`), record HiGHS version & model version, and offload `solver.solve()` to a Node `worker_threads` worker pool.
- **Acceptance Criteria:** `trade_promo` `baselineTotal === sum(allocations.baseline)`; concurrent `/api/health` requests respond in `< 50 ms` while a MILP job runs.
- **Regression Tests:** Unit test asserting `sum(allocations.baseline) === baselineTotal` across all 3 templates + worker execution test.

---

### GAP-10 — Incomplete Recommendation Dossier Provenance & Missing Forecast Linkage
- **Finding ID:** `GAP-10`
- **Description:** `decision_dossiers` (`/server/db.ts:150-167`) only stores `optimization_run_id` without direct immutable snapshots of `dataset_snapshot_id`, `forecast_id`, `model_id`/`version`, `solver_name`/`version`, `objective_function`, `constraints_json`, `data_sufficiency_status`, `expected_outcomes_json`, or `evidence_json`. `optimization_runs` also lacks `forecast_id`.
- **Evidence:** `/server/db.ts:128-167`; `/server.ts:678-686`.
- **Severity:** `HIGH`
- **Business Impact:** Audit dossiers do not contain self-contained, frozen mathematical & data provenance (e.g., which forecast version and sufficiency state justified the recommendation).
- **Technical Impact:** Partial lineage breaks Stage 05 completeness guarantees.
- **Dependencies:** DB schema migration, `optimize.ts`, `DecisionsView.tsx`.
- **Recommended Fix:** Add provenance columns (snapshot ID/version, forecast ID/version, solver/model metadata, sufficiency status, frozen objective/constraints/expected outcomes JSON) to `decision_dossiers` at creation time.
- **Acceptance Criteria:** Every newly created dossier stores and renders immutable snapshot, forecast, solver, constraint, and sufficiency metadata.
- **Regression Tests:** Integration test asserting dossier JSON includes all Stage 05 provenance fields even if new snapshots/runs occur later.

---

### GAP-11 — PREDICT Missing `WAPE`, `MASE`, True Seasonal Holt-Winters, & Lower Confidence Band UI
- **Finding ID:** `GAP-11`
- **Description:** `predict.ts` omits `WAPE` and `MASE`, mislabels non-seasonal Double Exponential Smoothing as `HOLT_WINTERS`, lacks near-zero `MAPE` guards and empirical CI coverage evaluation, omits `model_registry`/`model_version`, and `PredictView.tsx:223` only shades `upper95` without `lower95` or run history browsing.
- **Evidence:** `/server/engines/predict.ts:82-102, 125-151, 226-241`; `/src/components/PredictView.tsx:191-250`.
- **Severity:** `MEDIUM`
- **Business Impact:** Seasonal demand patterns are under-modeled, `MAPE` can blow up on low-volume series, and forecast charts misrepresent lower confidence limits.
- **Technical Impact:** Incomplete Stage 03 metrics and visualization defect.
- **Dependencies:** `predict.ts`, `forecast_runs`, `PredictView.tsx`.
- **Recommended Fix:** Add `WAPE` & `MASE` metrics, implement true seasonal Holt-Winters (triple exponential when cycle length >= 2x period, clearly labeled), guard near-zero `MAPE`, persist `modelVersion` + parameters, and render a proper `[lower95, upper95]` confidence band + run selector in `PredictView`.
- **Acceptance Criteria:** Forecasts report `MAE`, `RMSE`, `WAPE`, `MASE`, and conditional `MAPE`; `PredictView` draws both `lower95` and `upper95`.
- **Regression Tests:** Unit tests for `WAPE`, `MASE`, zero-value `MAPE` safety, and seasonal Holt-Winters.

---

### GAP-12 — Overview Chart Misrepresentation in Live Mode (`OptimizationImprovementChart.tsx`)
- **Finding ID:** `GAP-12`
- **Description:** In live mode, `OptimizationImprovementChart.tsx:56-73` renders dead `"Budget Allocation"` / `"Margin Mix"` selector buttons, retains sample `unit` (`"SAR Thousands"`), divides arbitrary live units by `1000`, labels HiGHS lift `"Simulated Optimization Lift"`, and exports `"reportType": "illustrative_optimization_summary"`.
- **Evidence:** `/src/components/OptimizationImprovementChart.tsx:56-73, 135-157, 212`; `/src/utils/optimizationSample.ts:105-125`.
- **Severity:** `MEDIUM`
- **Business Impact:** Executives viewing live HiGHS outputs see misleading "Simulated" / "illustrative_optimization_summary" labels and dead scenario toggle buttons.
- **Technical Impact:** Violates live-vs-sample labeling fidelity and currency/unit accuracy.
- **Dependencies:** `KPISummary.tsx`, `OptimizationImprovementChart.tsx`.
- **Recommended Fix:** Separate `LiveOptimizationPreview` rendering from `SampleOptimizationScenario`, hide/repurpose sample scenario tabs in live mode, remove hardcoded `/1000` & `"SAR Thousands"` assumptions, label HiGHS lift `"Projected LP/MILP Lift"`, and emit `"reportType": "live_optimization_summary"` with snapshot version/status.
- **Acceptance Criteria:** Live overview chart accurately displays currency, unit, dataset version, solver status, and non-illustrative JSON/CSV exports.
- **Regression Tests:** Unit tests for live vs sample report payload builders.

---

### GAP-13 — Partial Bilingual (AR/RTL) Localization & Unprotected UI Row Controls
- **Finding ID:** `GAP-13`
- **Description:** Only `App.tsx` landing/nav strings are translated in `src/utils/i18n.ts`; all operational views (`DataCenter`, `Predict`, `Optimize`, `Decisions`, `Detect`, `AiReports`, `Users`, `KPISummary`, `OptimizationImprovementChart`) and XLSX/PDF reports are English-only. Additionally, `UsersManagementView.tsx:640-678` leaves role dropdowns and Suspend buttons enabled for non-admin authenticated users, and `App.tsx:435` enables sample edits when signed out.
- **Evidence:** `/src/utils/i18n.ts:1-84`; `/src/components/UsersManagementView.tsx:281, 640-678`; `/src/App.tsx:435`.
- **Severity:** `MEDIUM`
- **Business Impact:** Arabic-speaking enterprise users hit mixed-language screens, and non-admin users encounter interactive controls that fail on click (`403`).
- **Technical Impact:** Incomplete RTL/i18n requirement and UI-RBAC polish gap.
- **Dependencies:** All `/src/components/*View.tsx`, `/server/engines/reports.ts`.
- **Recommended Fix:** Gate role/status controls and Audit Logs tab cleanly on `canManageUsers` in `UsersManagementView.tsx`, make unauthenticated `Users & RBAC` clearly read-only sample mode, and expand `UI_TRANSLATIONS` across KPI cards and operational views.
- **Acceptance Criteria:** Non-admins see read-only role badges; switching to `AR` translates KPIs, chart headers, and operational workspace headings cleanly.
- **Regression Tests:** Playwright RTL (`AR`) and non-admin role UI check.

---

### GAP-14 — No Database Migration Framework, Ephemeral Session Secret, & Missing Master Entities / Phase-0 Domains
- **Finding ID:** `GAP-14`
- **Description:** (1) SQLite relies on `CREATE TABLE IF NOT EXISTS` with `user_version = 0` and zero migrations or indexes; (2) `server/auth.ts:11-12` generates an ephemeral `SESSION_SECRET` on boot if unset, and lacks `/api/auth/logout` revocation, login rate-limiting, or invite-acceptance/password-reset flows; (3) AI Workspace (`/server/ai.ts`) injects context JSON rather than backend tool-calling; (4) `Detect` thresholds are hardcoded and never compare Actuals vs Forecasts/Decisions; (5) 6 Phase-0 commercial modules (`Company Setup`, `Commercial Intelligence`, `Sales & Channel Target Opt`, `Bundles & Offers`, `Supplier & Procurement`, `Credit & Liquidity`) and unsupported solver modes (NLP, CP-SAT, Monte Carlo) are unimplemented; (6) orphaned root SQLite files `/1234567890*` and `exceljs > uuid@8.3.2` moderate advisory remain in workspace.
- **Evidence:** `/server/db.ts:38-202`; `/server/auth.ts:11-12`; `/server/ai.ts:44-106`; `/server/engines/detect.ts:18-121`; `/docs/phase-0/PRODUCT_REQUIREMENTS.md:60-83`; `bun audit`; workspace root `1234567890*`.
- **Severity:** `HIGH` (Schema migrations & session secret/rate-limit) / `MEDIUM` (Missing Phase-0 modules & AI tool-calling) / `LOW` (Root `1234567890*` cleanup, Vite `__dirname` warning, `uuid` advisory)
- **Business Impact:** Schema upgrades on live databases are fragile, server restarts log out all users, and Phase-0 commercial expansion modules remain unbuilt.
- **Technical Impact:** Blocks safe incremental DB evolution and enterprise multi-module coverage.
- **Dependencies:** All future phases.
- **Recommended Fix:** Add numbered SQLite migration runner (`_migrations` + `PRAGMA user_version`), require/persist `TETRA_SESSION_SECRET`, add token revocation & invite activation/rate-limiting, clean up `/1234567890*`, and deliver missing Phase-0 modules sequentially per roadmap.
- **Acceptance Criteria:** Migrations run idempotently with `user_version > 0`; server restart preserves valid sessions when secret configured; invite activation works end-to-end.
- **Regression Tests:** Migration upgrade test + session persistence + rate-limit test.

# TETRA OS — Data Governance, Financial Truthfulness & Schema Audit (Part 3)

---

## 1. Commercial Financial Truthfulness Compliance

| Governance Rule | Requirement | Current State | Evidence & Severity |
|---|---|---|---|
| **Gross Profit vs Missing COGS** | Never compute Gross Profit without valid COGS; flag/gate when absent | **VIOLATED ON PARTIAL COVERAGE** | `server.ts:91-101` correctly yields `null` KPI if 0 rows have COGS, **but** `ingestion.ts:273` marks `hasCogs = true` at `>= 80%`. Missing rows (up to 19.9%) silently default to `0.68 * revenue` COGS in `optimize.ts:40` and `0` margin in `predict.ts:27`. (**HIGH**) |
| **ROI vs Actual Spend & Attributable Return** | Never compute ROI without Actual Spend & Attributable Return | **CRITICAL VIOLATION** | `optimize.ts:41-42` silently fabricates `marketingSpend = revenue * 0.08` and `tradeSpend = revenue * 0.06` when null, ignores `snapshot.hasSpend`, and clamps `(baselineReturn * grossMarginRate) / totalSpend` to `[1.2, 4.8]` (`optimize.ts:54-56`). (**CRITICAL**) |
| **Spend Lifecycle Stage Separation** | Separate Budget -> Allocated -> Approved -> Committed -> Actual Spend | **NOT IMPLEMENTED** | `commercial_records` only has `marketing_spend`, `trade_spend`, and `approved_target` (revenue target). No tables/columns exist for Budget, Allocated, Approved, or Committed spend stages. (**MEDIUM**) |
| **Synthetic Target / Unit Fabrication** | Do not fabricate Approved Targets or Units during ingestion | **VIOLATED** | `ingestion.ts:232-235` fabricates `approvedTarget = Math.round(revenue * 1.05)` and `units = Math.round(revenue / 50)` whenever columns are unmapped or null. (**HIGH**) |
| **KPI & Chart Metadata Completeness** | Display Currency, Unit, Period, Dataset Version, Quality Status | **PARTIAL** | `KPISummary.tsx:42-84` displays Currency/Version/Quality/Sufficiency in live mode, but `OptimizationImprovementChart.tsx:57-73` mixes live data with sample `unit` (`SAR Thousands`), fixed `/1000` division, and lacks Dataset Version & Quality badge. (**MEDIUM**) |
| **Demo Data Isolation** | Clearly separate illustrative demo data from live tenant data | **PARTIAL** | `INITIAL_SAMPLE_USERS` (`isIllustrativeDemo: true`), `SAMPLE_OPTIMIZATION_SCENARIOS` (`ILLUSTRATIVE SAMPLE` badge), and unauthenticated Overview fallback exist cleanly; however, seeded DB records (`alrayan_commercial_fy2026_seed.csv`) have no `is_demo` flag on `dataset_snapshots` or `commercial_records` in SQLite. (**LOW**) |

---

## 2. Strict Entity Separation Audit

Requirement (`PRODUCT_REQUIREMENTS.md` §2):  
`Approved Targets != Forecasts != Recommendations != Approved Decisions != Execution References != Actual Outcomes != Alerts != Performance Measurements`

| Entity Boundary | Database Table(s) | Separation Verdict | Defects Found |
|---|---|---|---|
| **Approved Targets vs Forecasts** | `commercial_records.approved_target` vs `forecast_runs` | **Separated** | Stored in distinct tables; however, ingestion synthesizes `approvedTarget` at `1.05 * revenue` if unmapped. |
| **Recommendations vs Approved Decisions** | Single table: `decision_dossiers` | **BLURRED / MUTABLE** | Both Recommendation state (`PENDING_REVIEW`) and Approval state (`APPROVED`/`MODIFIED`/`REJECTED`) live on the same mutable row (`db.ts:150-167`). `reviewDecision` mutates in place with no approval history table or versioned modification record. (**HIGH**) |
| **Approved Decisions vs Execution References** | Single table: `decision_dossiers` (`execution_ref`) | **VIOLATED** | Stored as columns on `decision_dossiers`; `PATCH /api/decisions/:id/execution` permits attaching `executionRef` to **`REJECTED`** or **`PENDING_REVIEW`** dossiers (`execOnRejectedStatus: 200`). (**CRITICAL**) |
| **Execution References vs Actual Outcomes** | Single table: `decision_dossiers` (`actual_outcome_value`) | **CONFLATED** | Only a manually typed scalar (`actual_outcome_value`) on the dossier row; no link to actual ingested `commercial_records` or automated variance attribution. (**MEDIUM**) |
| **Alerts & History** | Single table: `detect_alerts` | **PARTIAL / MUTABLE** | `parent_alert_id` preserves re-detection across closed cycles, **but** `transitionAlertStatus` mutates closed alerts backward in place (`RESOLVED -> UNDER_REVIEW`) without an `alert_history` table. (**HIGH**) |

---

## 3. Database Schema, Lineage & Operational Findings (`/server/db.ts`)

1. **No Schema Versioning or Migrations (`user_version = 0`):**
   - `initializeSchema` (`/server/db.ts:44-202`) runs `CREATE TABLE IF NOT EXISTS` directly. There is no migration history table (`_migrations`) and `PRAGMA user_version` is `0`. Future schema evolutions on an existing `tetra.db` will fail silently or require destructive recreation.
2. **Missing Foreign-Key Lineage Columns:**
   - `optimization_runs` references `snapshot_id` (`db.ts:131`), **not** `forecast_id`.
   - `decision_dossiers` references `optimization_run_id` (`db.ts:153`), **not** `snapshot_id` or `forecast_id`, and does not snapshot solver/model version, objective, constraints, or data sufficiency status.
3. **Backup Restore Corrupts Governance State (`db.ts:1451-1469`):**
   - `restoreCompanyRecordsFromBackup` inserts restored JSON rows into `dataset_snapshots` with hardcoded `qualityScore: 95, sufficiencyStatus: 'READY', missingFields: []`, even when rows contain `cogs: null`, `marketingSpend: null`, `tradeSpend: null` (verified live: restored 1 null-COGS row -> `sufficiencyStatus: 'READY', hasCogs: false`).
4. **Missing Master Entity & Policy Tables:**
   - No normalized tables exist for `regions`, `branches`, `departments`, `channels`, `products`, `customers`, `suppliers`, `commercial_policies`, `detect_rules`, or `model_registry`.
5. **Missing Database Indexes:**
   - `commercial_records(company_id, snapshot_id)`, `audit_logs(company_id, created_at)`, `forecast_runs(company_id)`, `optimization_runs(company_id)`, `decision_dossiers(company_id)`, and `detect_alerts(company_id, rule_code, status)` have no explicit secondary `CREATE INDEX` definitions.
6. **Orphaned Root SQLite Database Artifact:**
   - Workspace root contains `/1234567890`, `/1234567890-shm`, `/1234567890-wal` duplicating the initial `data/tetra.db` schema and seed records.

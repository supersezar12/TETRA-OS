# TETRA OS — Phase 0: Product Requirements & Scope Matrix
**Document ID:** `TETRA-P0-PRD-002`  
**Date:** 2026-11-21  
**Identity:** TETRA OS — Commercial Decisions Intelligence Platform (*Predict. Optimize. Detect.*)

---

## 1. Product Positioning & Strict Boundaries

TETRA OS is a **Commercial Decisions Intelligence Platform** for distribution, multi-product trading, FMCG, wholesale, multi-branch retail, and import/supply companies.

- **What TETRA OS IS:** A quantitative intelligence, forecasting, mathematical optimization, deviation detection, decision governance, and outcome-measurement platform.
- **What TETRA OS IS NOT:** An operational ERP, CRM, WMS, POS, Accounting, TMS, or SFA execution system. Operational systems feed data into TETRA OS; TETRA OS returns validated, explainable, auditable commercial decisions and records external **Execution References** and **Actual Outcomes**.

---

## 2. Mandatory Financial, Commercial & Entity Separation Principles

1. **Strict Entity Separation (Database & UI):**
   - `Approved Targets` != `Forecasts` != `Recommendations` != `Approved Decisions` != `Execution References` != `Actual Outcomes` != `Alerts` != `Performance Measurements`.
2. **Mandatory Decision Lifecycle:**
   `DATA → VALIDATION → PREDICTION → OPTIMIZATION → RECOMMENDATION → REVIEW → APPROVAL → EXECUTION REFERENCE → MEASUREMENT → DETECT → FEEDBACK`
3. **Commercial Accounting Truthfulness:**
   - Never compute **Gross Profit** without valid **COGS** (`INSUFFICIENT_DATA` / `PARTIAL` flagged explicitly when COGS is absent).
   - Never compute **ROI** without both **Actual Spend** and **Attributable Return**; distinguish *Revenue-to-Investment Ratio* from true *ROI*.
   - Separate `Budget` -> `Allocated Amount` -> `Approved Amount` -> `Committed Amount` -> `Actual Spend`.
   - Never claim **Price Elasticity**, **Uplift**, or **Cannibalization** without supporting historical variance/data and a documented statistical model.
   - Every KPI and chart displays **Currency**, **Unit of Measure**, **Time Period**, **Dataset Version**, and **Data Quality Status**.

---

## 3. Release Phasing: MVP vs. Advanced Modules vs. Deferred

To ensure a commercially sellable, mathematically real, end-to-end working product without superficial placeholders, features are explicitly classified into **MVP (Core Release v1.0)**, **Phase-2 Expansion (v1.5)**, and **Deferred / Connector Extensions (v2.0)**.

### Status Definitions
- `IN_MVP_SCOPE` — Built end-to-end from DB -> Engine -> API -> UI -> Tests in the initial release cycle.
- `IN_V1_5_EXPANSION` — Built after MVP core stabilization within the same platform architecture.
- `DEFERRED_V2` — Architectural interfaces and schema hooks prepared now; full external production connectors/advanced enterprise ops scheduled post-v1.5.

### 3.1 Core Platform & Governance Capabilities

| Module / Capability | Classification | Scope & Acceptance Criteria |
|---|---|---|
| **Auth, Sessions & RBAC** | `IN_MVP_SCOPE` | Login, password hashing (`scrypt`), session management, 12 RBAC roles, backend enforcement of Company/Branch/Region/Department scopes, user invitations |
| **Multi-Tenancy & Company Setup** | `IN_MVP_SCOPE` | Strict `company_id` tenant isolation, company profile, currency, timezone, branches, regions, channels, products, customers, suppliers, commercial policies |
| **Data Center (Ingestion, Quality, Lineage)** | `IN_MVP_SCOPE` | Real CSV/Excel/JSON upload, column detection, interactive mapping, type inference, preview, validation rules, duplicate/missing detection, entity matching, quality score (`READY`/`PARTIAL`/`INSUFFICIENT_DATA`/`AMBIGUOUS`/`FAILED`), dataset snapshots, import history & safe rollback |
| **Realistic Interconnected Seed Dataset + Edge-Case Scenarios** | `IN_MVP_SCOPE` | Flagged (`is_demo = true`) distribution company dataset + edge-case test packs (missing COGS, budget without spend, spend without attributable revenue, infeasible constraints, insufficient data) |
| **Bilingual Localization (AR Primary + EN)** | `IN_MVP_SCOPE` | Full RTL/LTR switching, Arabic & English UI, status badges, validation errors, reports, locale-aware numbers/dates/currencies |
| **Audit Trail & Governance** | `IN_MVP_SCOPE` | Immutable audit log for logins, imports, model runs, recommendations, approvals/rejections, alert transitions, and exports |

### 3.2 Three Core Quantitative Engines

| Engine | Classification | Scope in Initial Build |
|---|---|---|
| **PREDICT Engine** | `IN_MVP_SCOPE` | Demand, Sales, Revenue, Product, Channel, Regional, Budget & Liquidity forecasting; SES, Holt-Winters, Linear/Multiple Regression; automated backtesting (MAPE/RMSE/MAE) vs Naive baseline; statistical confidence intervals; data sufficiency gating; forecast versioning |
| **OPTIMIZE Engine (TETRA Mathematical Decision Engine)** | `IN_MVP_SCOPE` | Model Selection Layer + HiGHS WASM (LP/MILP) + TS Convex/NLP + Sensitivity Analysis + Monte Carlo Scenario Simulation; authentic solver status (`OPTIMAL`, `FEASIBLE`, `INFEASIBLE`, `UNBOUNDED`, `TIME_LIMIT`, `INSUFFICIENT_DATA`, `AMBIGUOUS`, `FAILED`); infeasibility conflict reporting; run reproducibility metadata |
| **DETECT Engine** | `IN_MVP_SCOPE` | Automated comparison of Actual Outcomes vs Approved Targets, Forecasts, Budgets, and Approved Decisions; rule & threshold management; full lifecycle `OPEN -> UNDER_REVIEW -> RESOLVED | DISMISSED`; immutable alert history; re-detection linking to prior closed alerts |

### 3.3 Commercial Modules (11 Domains & 19 Screens)

| Screen / Module | Classification | Details |
|---|---|---|
| **1. Authentication & Account** | `IN_MVP_SCOPE` | Sign in, password reset flow, active sessions, user invitations, profile |
| **2. Company Setup** | `IN_MVP_SCOPE` | Company creation, branches, regions, channels, products, customers, suppliers, policies |
| **3. Executive Intelligence Dashboard** | `IN_MVP_SCOPE` | Synthesized commercial posture, KPIs with currency/period/quality badges, engine run summaries, pending decisions, active alerts |
| **4. Data Center** | `IN_MVP_SCOPE` | File upload (CSV/XLSX/JSON), API/connector configs, mapping, validation, quality scores, lineage, rollback |
| **5. Commercial Intelligence** | `IN_MVP_SCOPE` | Product, customer, channel, regional, and trend analytics strictly respecting COGS/data availability |
| **6. Prediction Center** | `IN_MVP_SCOPE` | Scope/horizon selection, model comparison & backtesting, confidence bands, data sufficiency check, version saving |
| **7. Optimization Center** | `IN_MVP_SCOPE` | Problem builder (variables, objective, constraints), solver execution, sensitivity analysis, scenario comparison, authentic solver status |
| **8. Budget & Commercial Investment** | `IN_MVP_SCOPE` | *MVP Anchor Optimization Module #1:* Budget vs Allocated vs Approved vs Committed vs Actual Spend; LP/MILP optimal allocation across channels/regions/activities |
| **9. Pricing & Profitability** | `IN_MVP_SCOPE` | *MVP Anchor Optimization Module #2:* Margin analysis (COGS-gated), discount guardrails, constrained price/mix optimization & scenario testing |
| **10. Sales & Channel Intelligence** | `IN_MVP_SCOPE` | *MVP Anchor Module #3:* Approved targets vs actuals vs forecasts, gap analysis, target distribution optimization |
| **11. Trade Marketing Intelligence** | `IN_V1_5_EXPANSION` (Core tracking + MILP activity selection in MVP; advanced causal lift models in v1.5) | Activity registry, budget stage separation, overlap detection, MILP activity mix optimization |
| **12. Bundles & Offers** | `IN_V1_5_EXPANSION` (Core builder + MILP margin/cost bundle optimizer) | Combinatorial bundle optimization under margin/budget constraints |
| **13. Supplier & Procurement Intelligence** | `IN_V1_5_EXPANSION` | Supplier comparison, concentration risk, multi-supplier LP/MILP allocation |
| **14. Credit & Liquidity** | `IN_V1_5_EXPANSION` | Receivables aging, credit exposure vs policy limits, cashflow forecast & scenario stress |
| **15. Decision Workspace** | `IN_MVP_SCOPE` | Full recommendation dossier, evidence, assumptions, limitations, review/approve/reject/modify, execution references, actual outcome measurement |
| **16. Detect Center** | `IN_MVP_SCOPE` | Alerts, variances, risks, opportunities, evidence linking, lifecycle history |
| **17. Reports Center** | `IN_MVP_SCOPE` | Bilingual executive, forecast, optimization, budget, pricing, detect, and decision effectiveness reports; Excel (`.xlsx`) & printable PDF export |
| **18. AI Workspace** | `IN_MVP_SCOPE` | Gemini-orchestrated natural-language analyst grounded strictly via backend tool calls to SQL/Predict/Optimize/Detect engines |
| **19. Administration & Governance** | `IN_MVP_SCOPE` | Users, roles, granular permissions, company/scope policies, audit logs, model registry, retention settings |
| **External Live ERP/POS Polling & SSO/SAML** | `DEFERRED_V2` | Generic REST/Webhook ingestion endpoints & scheduled sync framework built in MVP/v1.5; vendor-specific SAP/Odoo/Oracle adapters & Enterprise SAML deferred to v2.0 |

*(Note: All 19 screens listed in Section 10 will be implemented cleanly in the application navigation, and every single one will connect to real database tables and backend APIs—zero dead buttons or fake static screens—while clearly labeling any statistical method boundaries such as causal uplift or elasticity when sample sizes are insufficient.)*

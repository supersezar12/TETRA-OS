# TETRA OS — UI / UX & Bilingual Audit (Part 4)

---

## 1. Visual & Runtime Verification Summary
- Inspected rendered application via headless Chromium (`playwright-cli` at `1440x900` on `http://localhost:3000`):
  - **Console Errors / Warnings:** `0` errors, `0` warnings.
  - **First-Load Auth State:** Unauthenticated visitors see the `Overview`, `App Workflow`, `Wireframes`, and `Users & RBAC` views using clearly badged `SAMPLE DATA` / `ILLUSTRATIVE SAMPLE` / `SAMPLE TENANT DIRECTORY`. Protected operational tabs (`Data Center`, `Predict`, `Optimize`, `Decisions`, `Detect`, `AI & Reports`) render `AuthPanel` (`First-Run Admin Claim` when `needsBootstrap: true`, `Workspace Authentication Required` otherwise).

---

## 2. Specific UI/UX & Data Fidelity Defects

### 2.1 Overview Live Chart Bugs (`src/components/OptimizationImprovementChart.tsx`)
1. **Scenario Selector Buttons Become Dead / Misleading in Live Mode (`HIGH`):** When `usingLive` is true (`lines 56-73`), `scenario` unconditionally replaces chart `points`, `title`, and `solverLabel` with `liveOptimization`. Clicking `"Budget Allocation"` vs `"Margin Mix"` still flips button `aria-pressed` state (`lines 135-157`), **but renders the exact same optimization run** while still injecting `sampleScenario.unit` (`"SAR Thousands (Attributed Contribution)"`), `baselineLabel` (`"Baseline Plan"` vs `"Historical Mix"`), and `scenarioKey` into JSON/CSV downloads!
2. **Wrong JSON Report Metadata Type for Live Runs (`HIGH`):** `handleDownloadReport` (`lines 77-86`) calls `buildScenarioReportPayload(scenario)`, which emits `"reportType": "illustrative_optimization_summary"` and `"isIllustrativeDemo": false` even for a live HiGHS solver run.
3. **Hardcoded `/1000` Scaling & `"K"` Suffix (`lines 69-70, 199, 207, 215`):** Live `allocations` values are divided by `1000` and displayed with `K` suffix + `"SAR Thousands"` unit label regardless of actual currency/unit scale or small-value segments (values `< 500` round to `0K`!).
4. **Inaccurate Lift Label (`line 212`):** Labels live HiGHS optimization lift `"Simulated Optimization Lift"` instead of `"Projected Optimization Lift (LP/MILP)"`, blurring mathematical optimization with simulation.

### 2.2 Operational Workspace UI Gaps
5. **`PredictView.tsx` Missing Lower Confidence Band & Run History:**
   - Line 223 renders `<Area dataKey="upper95">` (which shades from `0` up to `upper95`) without plotting `lower95` or computing a `[lower95, upper95]` band, visually misrepresenting the 95% confidence interval.
   - Always displays `runs[0]`; no UI control exists to inspect or compare previous persisted forecast runs in `runs`.
   - `MAE` is omitted from the 4-card summary grid (only `MAPE`, `Naive Baseline MAPE`, `RMSE`, and `Model vs Naive` are shown).
6. **`OptimizeView.tsx` Missing Run Selector, Forecast Link & Promo Cap Control:**
   - Always displays `runs[0]`; users cannot inspect prior optimization runs without running a new solve.
   - `maxActivePromos` supported by `/api/optimize/run` (`server.ts:572`) is not exposed in `OptimizeView.tsx` when `trade_promo` is selected.
   - Does not warn or disable `Run HiGHS Solver` on `margin_mix` when `activeSnapshot.hasCogs === false` before submission (relies on post-submit `BLOCKED_INSUFFICIENT_DATA` card).
7. **`DecisionsView.tsx` Exposes Unconstrained Actions Regardless of Role/State:**
   - Execution Reference form (`lines 296-348`) is rendered and editable even when `active.status === 'PENDING_REVIEW'` or `'REJECTED'`, and regardless of whether the signed-in user actually has execution authority.
   - No `Approval History` timeline or `Request Re-analysis` button exists.
   - No link/drawer showing the underlying `optimization_runs` numbers inside `DecisionsView` (only shows `Opt Run opt-...` ID string).
8. **`UsersManagementView.tsx` Unauthenticated Sample Edit Illusion & Missing Role Guard on Row Controls:**
   - When unauthenticated (`!token`), `Users & RBAC` (`App.tsx:435`) passes `canManageUsers: true`, allowing unauthenticated visitors to invite/suspend sample users in local React state.
   - When authenticated as a non-admin (`canManageUsers === false`), the `Invite User` button is hidden (`line 299`), **but the role `<select>` dropdown (`lines 640-656`) and `Suspend / Activate` button (`lines 672-678`) remain enabled** in the table—clicking them triggers a failed `403` PATCH call!
   - Also, `Audit Logs` tab (`line 281`) is shown to all authenticated users (including `read_only_user`).

### 2.3 Bilingual Localization (Arabic RTL / English LTR) Completeness Gap
9. **Partial Localization (`MEDIUM`):** `UI_TRANSLATIONS` (`/src/utils/i18n.ts`) only translates header subtitle, 10 nav labels, hero text, and auth gate prompts (~20 strings). All KPI cards (`KPISummary.tsx`), chart controls (`OptimizationImprovementChart.tsx`), and **100% of operational screens** (`DataCenterView`, `PredictView`, `OptimizeView`, `DecisionsView`, `DetectView`, `AiReportsView`, `UsersManagementView`, `AppWorkflowView`, `WireframeExplorerView`) plus Excel/PDF reports remain hardcoded in English even when `dir="rtl" lang="ar"` is active!

### 2.4 Blueprint vs Application Drift
10. **Phase-0 19-Screen Scope vs 10 Views:** `WireframeExplorerView` models 5 screens; `App.tsx` implements 10 tabs. Dedicated modules from `PRODUCT_REQUIREMENTS.md` (`Company Setup`, `Commercial Intelligence`, `Sales & Channel Intelligence`, `Bundles & Offers`, `Supplier & Procurement`, `Credit & Liquidity`) do not exist in the UI.

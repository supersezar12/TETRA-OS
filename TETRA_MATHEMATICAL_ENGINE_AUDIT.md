# TETRA OS — Mathematical Engine Audit (PREDICT, OPTIMIZE, DETECT)

---

## 1. Executive Capability Matrix

| Quantitative Method / Capability | Phase-0 / UI Claimed? | Genuine Backend Status | Implementation Evidence |
|---|---|---|---|
| **Simple Exponential Smoothing (SES)** | Yes | **Implemented** | `fitSes` (`/server/engines/predict.ts:49-80`) |
| **Double Exponential Smoothing (Trend)** | Yes (labeled `HOLT_WINTERS`) | **Implemented (Mislabelled)** | `fitHoltWintersLinear` (`predict.ts:82-102`) — no seasonal `gamma` |
| **Seasonal Holt-Winters (Triple)** | Implied by `HOLT_WINTERS` | **Not Implemented** | Only `alpha`/`beta` trend exists |
| **OLS Linear Regression** | Yes | **Implemented** | `fitLinearRegression` (`predict.ts:104-123`) |
| **Multiple Regression / Feature Regressors** | Yes (`PRODUCT_REQUIREMENTS.md`) | **Not Implemented** | Univariate period index `0..n-1` only |
| **Holdout Backtesting vs Naive Baseline** | Yes | **Implemented** | `runForecastEngine` (`predict.ts:171-189`) |
| **Error Metrics: MAE, RMSE, MAPE** | Yes | **Implemented (MAPE unguarded)** | `computeErrorMetrics` (`predict.ts:125-151`) |
| **Error Metrics: WAPE, MASE** | Required in Audit | **Not Implemented** | Absent from `predict.ts` & `ForecastRunRecord` |
| **Linear Programming (LP)** | Yes | **Implemented** | `highs` WASM (`optimize.ts:135-171`) — 2-segment piecewise LP |
| **Mixed Integer Linear Programming (MILP)** | Yes | **Implemented** | `highs` WASM (`optimize.ts:172-211`) — binary `y_i` promo selection |
| **LP Sensitivity / Shadow Prices (Duals)** | Yes | **Implemented (LP only)** | `optimize.ts:309-353`; correctly omitted for MILP |
| **Integer Programming (General IP)** | Audited | **Not Implemented** | Only binary MILP (`trade_promo`) |
| **Nonlinear / Convex Programming (NLP)** | Yes (`PRODUCT_REQUIREMENTS`, Roadmap) | **Not Implemented** | No NLP/convex solver library or algorithm |
| **Constraint Programming / CP-SAT** | Audited | **Not Implemented** | Not present |
| **Multi-Objective / Stochastic / Robust Opt** | Audited | **Not Implemented** | Single scalar `Maximize obj` only |
| **Monte Carlo Simulation** | Yes (`PRODUCT_REQUIREMENTS`, Roadmap) | **Not Implemented** | Not present |
| **Scenario Optimization Comparison** | Yes (`WireframeExplorerView`) | **Not Implemented** | Single-run execution only |
| **Worker Thread / Async Job Execution** | Yes (`AppWorkflowView`, Roadmap) | **Not Implemented** | Synchronous `solver.solve()` on Express main thread (`optimize.ts:214`) |

---

## 2. PREDICT Engine Deep Audit (`/server/engines/predict.ts`)

1. **Temporal Leakage Check (PASS):** `runForecastEngine` (`lines 171-188`) cleanly splits `trainValues = values.slice(0, values.length - holdoutSize)` and `testValues = values.slice(values.length - holdoutSize)`. `backtest` is fitted solely on `trainValues`, and Naive predictions use `trainValues[last]` for the first holdout step and `testValues[idx - 1]` thereafter. No future leakage occurs in backtesting.
2. **Holt-Winters Seasonal Defect (`HOLT_WINTERS` vs Double Exponential):** `fitHoltWintersLinear` (`lines 82-102`) uses fixed `alpha = 0.4`, `beta = 0.25` with equations `level = a * y + (1-a)*(l+b)` and `trend = beta*(l - l_prev) + (1-beta)*b`. This is Holt's linear trend method, **not** seasonal Holt-Winters. Seasonal patterns (explicitly generated in `generateSeedRows` via `Math.sin((pIdx / 12) * Math.PI * 2)`, `db.ts:595`) are not modeled.
3. **Metric Gaps (`WAPE`, `MASE`, Zero-Safe `MAPE`):**
   - `WAPE` (`sum(|e|) / sum(|actual|)`) and `MASE` (mean absolute scaled error vs in-sample naive MAE) do not exist.
   - `MAPE` (`lines 139-142`) skips `actuals[i] <= 0` but still explodes when `actuals[i]` is tiny positive (e.g., `0.01`).
4. **Confidence Interval Calibration:** Forecast intervals use `1.96 * sigma * sqrt(step)` where `sigma` is the in-sample residual standard deviation (`lines 192-195, 215`). While mathematically grounded in homoscedastic random-walk error scaling, **empirical out-of-sample coverage calibration is never evaluated or reported**, and `n - 1` degrees of freedom underestimates parameter uncertainty on short series (minimum `4` periods -> 1 holdout, 3 training points).
5. **Gross Margin Silent Zero Bug (`predict.ts:27`):** `aggregateSeriesByPeriod` computes `row.cogs !== null ? row.revenue - row.cogs : 0`. Because `hasCogs` is `true` at `>= 80%` coverage, up to 19.9% of rows with missing COGS silently contribute `0` gross margin to period totals.
6. **Reproducibility & Model Registry:** `bestAlpha` in SES is not persisted; no `model_registry`, `model_version`, or random seed metadata exists in `forecast_runs`.

---

## 3. OPTIMIZE Engine Deep Audit (`/server/engines/optimize.ts`)

1. **Mathematical Formulation Verification (LP & MILP):**
   - **Piecewise Concave LP (`budget_allocation`, `margin_mix`, lines 135-171):** Splits each channel spend into `c_i in [0, min(maxSpend, baselineSpend)]` and `s_i in [0, max(0, maxSpend - coreCap)]` with `coeffStretch = 0.78 * coeffBase`. Because `coeffBase > coeffStretch >= 0` for maximization, `c_i` always saturates before `s_i`, preserving exact convexity/concavity without extra binary variables.
   - **Binary MILP (`trade_promo`, lines 172-211):** Uses big-M / semi-continuous linking constraints `x_i - minSpend * y_i >= 0`, `x_i - maxSpend * y_i <= 0`, `y_i in {0, 1}`, and `sum(y_i) <= maxActivePromos`. Valid MILP formulation.
2. **Authentic Status Reporting vs Required Taxonomy:**
   - Verified empirically: setting `totalBudget = 1` below `sum(minSpend)` produces real `INFEASIBLE` status from HiGHS with explicit conflict diagnostic (`"Sum of minimum channel spend (...) exceeds Total Budget (1)."`).
   - **Defect — `TIME_LIMIT` vs `FEASIBLE`:** If HiGHS hits `time_limit: 5` (`optimize.ts:214, 219`), `status` is set to `'TIME_LIMIT'` (never `'OPTIMAL'`, good), **but** `if (status === 'OPTIMAL')` on line 264 discards any incumbent feasible primal solution and never reports `'FEASIBLE'` with an optimality gap.
   - **Defect — Non-Canonical / Missing Statuses:** Uses `'BLOCKED_INSUFFICIENT_DATA'` instead of `'INSUFFICIENT_DATA'`; `'AMBIGUOUS'` and `'FAILED'` are never returned (`FAILED` throws HTTP `500` in `server.ts:631` without recording a failed run).
   - **Defect — No General Infeasibility Conflict Extraction (IIS / Slack Inspection):** Beyond checking `minSpend > maxSpend` and `sumMin > totalBudget`, HiGHS does not compute an Irreducible Inconsistent Subsystem (IIS) for MILP/complex conflicts (e.g., `max_active_promos` combined with non-zero `minSpend`).
3. **Independent Feasibility Validation:** No post-solve validator verifies `totalSpend <= totalBudget + eps`, `minSpend <= optSpend <= maxSpend`, or `sum(y_i) <= maxActivePromos` against returned primal values.
4. **Sensitivity Validity:** For LP (`!isMilp`), extracts row `Dual` values from HiGHS (`lines 309-353`). For MILP (`isMilp`), skips channel bound duals and sets `dualValue: 0` on `max_active_promos` (`lines 320-331`), avoiding the common error of claiming LP shadow prices for MILP. However, range analysis (allowable RHS increase/decrease) is not computed.
5. **Baseline vs Objective Math Mismatch (`optimize.ts:222-232` vs `289-295`):**
   - Notice for `trade_promo` (`isMilp`): `baselineTotal` (`lines 222-232`) computes `ch.baselineSpend * ch.roiMultiplier`, whereas per-row `baseVal` (`lines 282-290`) computes `ch.baselineSpend * ch.roiMultiplier * (1.12 + ch.marginRate * 0.5)`. Thus `sum(allocations[i].baseline)` **does not equal** `baselineTotal` for `trade_promo`, distorting `netDelta` and `improvementPct`!
6. **Fabricated Spend & Unvalidated ROI (`optimize.ts:39-56`):**
   - `buildDefaultChannelInputs` synthesizes `cogs = r.revenue * 0.68`, `mkt = r.revenue * 0.08`, `trade = r.revenue * 0.06` whenever null.
   - Computes `roiMultiplier = clamp(1.2, 4.8, (baselineReturn * grossMarginRate) / totalSpend)`, treating total revenue * margin as attributed return on spend and clamping upward to `1.2x` even if true margin/spend is `< 1.2x`!
7. **Event-Loop Blocking & Missing Metadata:** Executes synchronously on Express main thread (`worker_threads` not used); `OptimizationRunRecord` omits `solverVersion`, `modelVersion`, `optimalityGap`, `seed`, and `forecastId`.

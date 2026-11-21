# TETRA OS — RBAC, Security & Tenant Isolation Audit (Part 5)

---

## 1. Verified Security & Multi-Tenant Controls

| Control | Implementation & Evidence | Verification Result |
|---|---|---|
| **Password Hashing** | `crypto.scryptSync(password, salt, 64)` with random 16-byte salt + `timingSafeEqual` (`/server/auth.ts:26-41`) | **VERIFIED** (`engines.test.ts:143-145`) |
| **Session Token Integrity** | HMAC-SHA256 signed base64url token (`12h` TTL) checked with `timingSafeEqual` (`/server/auth.ts:62-103`) | **VERIFIED** (`engines.test.ts:147-154`; tempered token rejected) |
| **First-Run Admin Bootstrap** | One-time claim via `POST /api/auth/bootstrap`; locks once `auth_settings.admin_password_hash` is set (`/server.ts:138-142`) | **VERIFIED** (`201` first call -> `409` second call) |
| **Suspended User Blocking** | `POST /api/auth/login` (`server.ts:197-200`) & `requireAuth` DB lookup (`server/auth.ts:123-127`) reject `SUSPENDED` accounts | **VERIFIED** (`403` enforced on DB status) |
| **Cross-Tenant Isolation (`company_id`)** | `requireAuth` (`auth.ts:130-144`) blocks mismatched `X-Company-Id` headers unless `roleId === 'platform_super_admin'`; SQL queries filter `WHERE company_id = ?` | **VERIFIED** (Non-admin `data_analyst` cross-tenant probe returned `403`; `platform_super_admin` returned `200`) |
| **Core Write RBAC Gates** | `ingestData`, `runPredict`, `runOptimize`, `approveDecisions`, `manageDetectAlerts`, `exportReports`, `manageUsers` enforced via `requirePermission(...)` | **VERIFIED ON TESTED ENDPOINTS** (`read_only_user` received `403` on ingest/predict/optimize/detect/export; `data_analyst` received `403` on `/review`) |
| **Client Session Storage** | React state keeps JWT strictly in memory (`src/App.tsx:120-121`), avoiding `localStorage`/`sessionStorage` XSS persistence | **VERIFIED** |
| **CSV Formula Injection Guard** | `escapeCsvCell` (`/server/engines/reports.ts:12-19`, `/src/utils/optimizationSample.ts:128-135`) prefixes `= + - @ \t \r` with `'` | **VERIFIED** |
| **HTTP Security Headers** | Sets `X-Content-Type-Options: nosniff` and `Referrer-Policy: strict-origin-when-cross-origin` (`server.ts:77-81`) | **VERIFIED** |

---

## 2. Critical & High Authorization / Security Gaps

### 2.1 RBAC & Endpoint Access Gaps (Empirically Verified Live)
1. **Unpermissioned Audit Log Exposure (`HIGH`):** `GET /api/audit-logs` (`/server.ts:1237-1239`) only applies `requireAuth` with **no** `requirePermission`. Empirically verified: `read_only_user` successfully retrieved tenant audit logs (`HTTP 200`).
2. **Unpermissioned User Directory Exposure (`HIGH`):** `GET /api/users` (`/server.ts:1124-1130`) only applies `requireAuth` with **no** `requirePermission`. Empirically verified: `read_only_user` retrieved all tenant user full names, emails, roles, and scopes (`HTTP 200`).
3. **Unpermissioned & Unscoped AI Endpoint (`HIGH`):** `POST /api/ai/analyze` (`/server.ts:892-946`) only applies `requireAuth`. Any role (including `read_only_user`) can trigger billable Gemini API calls and query **company-wide** KPIs, forecasts, optimizations, decisions, and alerts (`rows` on line 908 has zero region/branch/department filtering!).
4. **Wrong Permission on Execution Handoff (`HIGH`):** `PATCH /api/decisions/:id/execution` (`/server.ts:757`) checks `requirePermission('manageDetectAlerts')` instead of an execution-specific permission, allowing `data_analyst` and `decision_reviewer` to link execution references even on `REJECTED` decisions (`HTTP 200` empirically verified).

### 2.2 Hierarchical Scope Bypass & Leakage (Empirically Verified Live)
5. **`departmentScope` Parameter Completely Dead (`HIGH`):** `getCommercialRecordsForSnapshot` (`/server/db.ts:1022-1042`) accepts `userScope.departmentScope` in its TypeScript signature, and `server.ts:269` passes it, **but the SQL builder never appends `AND department = ?`**. Empirically verified: a `department_manager` scoped to `'Digital Commerce'` received full-company revenue `1,975,576` identical to `platform_super_admin`.
6. **Multi-Endpoint Region & Branch Scope Bypass (`HIGH`):** While `GET /api/overview`, `GET /api/datasets/snapshots`, `POST /api/predict/run`, and `POST /api/optimize/run` pass `regionScope`/`branchScope`, the following routes query **ALL tenant records unscoped**:
   - `GET /api/predict/runs` (`server.ts:462`) — leaked all 5 channels to `Central Region` `sales_manager` (verified).
   - `GET /api/optimize/runs` (`server.ts:550`) — leaked all 5 channels & computed `defaultChannels` over full company to `sales_manager` (verified).
   - `POST /api/detect/evaluate` (`server.ts:816`) & `GET /api/detect/alerts` (`server.ts:798`) — allows branch-scoped user to evaluate/view company-wide alerts.
   - `POST /api/ai/analyze` (`server.ts:908`) — injects full-company metrics into Gemini prompt.
   - `GET /api/reports/export` (`server.ts:1004` & `962-966`) — exports full-company CSV/XLSX/PDF/JSON even for branch/department-scoped roles (`sales_manager`, `department_manager`).
   - `GET /api/decisions` (`server.ts:637`) & `listForecastRuns` / `listOptimizationRuns` — return all company runs/decisions regardless of creator/scope.
7. **Branch Scope `'HQ'` Substring Bypass (`MEDIUM`):** `db.ts:1035` skips branch filtering whenever `userScope.branchScope.includes('HQ')`. Any branch name containing `'HQ'` bypasses branch isolation.
8. **Scoped Users Can Overwrite Company-Wide Active Snapshot (`MEDIUM`):** `trade_marketing_manager` and `procurement_manager` (`scopeLevel: 'Department'`, `ingestData: true`) can ingest/rollback company-wide snapshots via `POST /api/datasets/ingest` and `POST /api/datasets/rollback`.
9. **No Separation of Duties on Decision Approval (`MEDIUM`):** Nothing prevents a user with both `runOptimize` and `approveDecisions` (e.g., `commercial_director`, `finance_manager`, `company_owner`) from creating a recommendation dossier and immediately self-approving it.

### 2.3 Authentication & Operational Security Gaps
10. **Ephemeral `SESSION_SECRET` Fallback (`HIGH` for Multi-Instance / Restarts):** `server/auth.ts:11-12` defaults to `crypto.randomBytes(32)` if `TETRA_SESSION_SECRET` is unset, invalidating all user sessions on every server restart or failing across horizontal replicas.
11. **No Server-Side Token Revocation / Logout Endpoint (`MEDIUM`):** `Sign Out` (`App.tsx:184-189`) only clears React state; no `/api/auth/logout` or `sessions` table exists, so a copied Bearer token remains valid for up to 12 hours.
12. **No Login Rate Limiting / Lockout (`MEDIUM`):** `POST /api/auth/login` has no brute-force rate limiting or failed-attempt throttling.
13. **No User Self-Service Password Reset / Invite Activation Flow (`MEDIUM`):** `PENDING_INVITE` users (`passwordHash = null`) have no invite-acceptance or password-reset endpoint; `UsersManagementView.tsx` has no password-reset UI.
14. **Dependency Vulnerability (`LOW/MEDIUM`):** `bun audit` reports 1 moderate advisory (`GHSA-w5hq-g745-h8pq`) in `uuid@8.3.2` via `exceljs`.

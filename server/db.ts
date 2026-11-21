import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import type {
  AlertSeverity,
  AlertStatus,
  AuditLogRecord,
  CommercialRow,
  CompanyRecord,
  DatasetSnapshotRecord,
  DecisionDossierRecord,
  DecisionStatus,
  DetectAlertRecord,
  EnterpriseRoleId,
  ForecastRunRecord,
  OptimizationRunRecord,
  SafeUserRecord,
  SufficiencyStatus,
  UserAccountStatus,
} from './types.ts';

let dbInstance: DatabaseSync | null = null;

function resolveDbPath(): string {
  const configured = process.env.TETRA_DB_PATH?.trim() || 'data/tetra.db';
  return path.resolve(process.cwd(), configured);
}

export function getDb(): DatabaseSync {
  if (dbInstance) {
    return dbInstance;
  }
  const dbPath = resolveDbPath();
  fs.mkdirSync(path.dirname(dbPath), {recursive: true});
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  initializeSchema(db);
  seedInitialDataIfEmpty(db);
  dbInstance = db;
  return db;
}

export function initializeSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS companies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      currency TEXT NOT NULL,
      country TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS auth_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      admin_user_id TEXT,
      admin_password_hash TEXT,
      claimed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES companies(id),
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT,
      role_id TEXT NOT NULL,
      region_scope TEXT NOT NULL,
      branch_scope TEXT NOT NULL,
      department_scope TEXT NOT NULL,
      status TEXT NOT NULL,
      last_active TEXT NOT NULL,
      is_illustrative_demo INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS dataset_snapshots (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES companies(id),
      version_number INTEGER NOT NULL,
      source_name TEXT NOT NULL,
      source_type TEXT NOT NULL,
      row_count INTEGER NOT NULL,
      quality_score REAL NOT NULL,
      sufficiency_status TEXT NOT NULL,
      has_cogs INTEGER NOT NULL,
      has_spend INTEGER NOT NULL,
      missing_fields_json TEXT NOT NULL,
      column_mapping_json TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 0,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS commercial_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot_id TEXT NOT NULL REFERENCES dataset_snapshots(id) ON DELETE CASCADE,
      company_id TEXT NOT NULL REFERENCES companies(id),
      period TEXT NOT NULL,
      region TEXT NOT NULL,
      branch TEXT NOT NULL,
      department TEXT NOT NULL,
      channel TEXT NOT NULL,
      product TEXT NOT NULL,
      revenue REAL NOT NULL,
      cogs REAL,
      marketing_spend REAL,
      trade_spend REAL,
      units REAL NOT NULL,
      approved_target REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS forecast_runs (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES companies(id),
      snapshot_id TEXT NOT NULL REFERENCES dataset_snapshots(id),
      model_type TEXT NOT NULL,
      metric TEXT NOT NULL,
      horizon INTEGER NOT NULL,
      scope_filter TEXT NOT NULL,
      mae REAL NOT NULL,
      rmse REAL NOT NULL,
      mape REAL NOT NULL,
      naive_mape REAL NOT NULL,
      points_json TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS optimization_runs (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES companies(id),
      snapshot_id TEXT NOT NULL REFERENCES dataset_snapshots(id),
      template_key TEXT NOT NULL,
      title TEXT NOT NULL,
      solver_engine TEXT NOT NULL,
      solver_status TEXT NOT NULL,
      objective_value REAL NOT NULL,
      baseline_total REAL NOT NULL,
      optimized_total REAL NOT NULL,
      net_delta REAL NOT NULL,
      improvement_pct REAL NOT NULL,
      total_budget REAL NOT NULL,
      allocations_json TEXT NOT NULL,
      sensitivity_json TEXT NOT NULL,
      diagnostics TEXT NOT NULL,
      execution_ms REAL NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS decision_dossiers (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES companies(id),
      optimization_run_id TEXT NOT NULL REFERENCES optimization_runs(id),
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      assumptions TEXT NOT NULL,
      risks TEXT NOT NULL,
      limitations TEXT NOT NULL,
      reviewer_comment TEXT,
      reviewed_by TEXT,
      reviewed_at TEXT,
      execution_ref TEXT,
      actual_outcome_value REAL,
      actual_outcome_notes TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS detect_alerts (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES companies(id),
      snapshot_id TEXT NOT NULL REFERENCES dataset_snapshots(id),
      rule_code TEXT NOT NULL,
      severity TEXT NOT NULL,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      metric_value REAL NOT NULL,
      threshold_value REAL NOT NULL,
      status TEXT NOT NULL,
      parent_alert_id TEXT,
      occurrence_count INTEGER NOT NULL DEFAULT 1,
      resolution_notes TEXT,
      updated_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      actor_user_id TEXT NOT NULL,
      actor_email TEXT NOT NULL,
      actor_role TEXT NOT NULL,
      action TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      details_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
}

function seedInitialDataIfEmpty(db: DatabaseSync): void {
  const existing = db.prepare('SELECT COUNT(*) as cnt FROM companies').get() as {cnt: number};
  if (existing.cnt > 0) {
    return;
  }

  const now = new Date().toISOString();

  db.exec('BEGIN TRANSACTION');
  try {
    const insertCompany = db.prepare(
      'INSERT INTO companies (id, name, currency, country) VALUES (?, ?, ?, ?)',
    );
    insertCompany.run('comp-alrayan', 'Al-Rayan Distribution Co.', 'SAR', 'Saudi Arabia');
    insertCompany.run('comp-gulfhorizon', 'Gulf Horizon Retail', 'AED', 'United Arab Emirates');

    const insertUser = db.prepare(`
      INSERT INTO users (
        id, company_id, full_name, email, password_hash, role_id,
        region_scope, branch_scope, department_scope, status, last_active, is_illustrative_demo
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertUser.run(
      'usr-admin',
      'comp-alrayan',
      'Platform Administrator',
      'admin@tetra-os.local',
      null,
      'platform_super_admin',
      'All Regions',
      'All Branches',
      'Platform Governance',
      'ACTIVE',
      now,
      0,
    );
    insertUser.run(
      'usr-101',
      'comp-alrayan',
      'Tariq Al-Mansoor',
      't.almansoor@alrayan-dist.example',
      null,
      'company_owner',
      'All Regions',
      'All Branches',
      'Executive',
      'ACTIVE',
      '2026-11-21 09:40',
      1,
    );
    insertUser.run(
      'usr-102',
      'comp-alrayan',
      'Nadia Al-Harbi',
      'n.alharbi@alrayan-dist.example',
      null,
      'commercial_director',
      'All Regions',
      'All Branches',
      'Commercial Strategy',
      'ACTIVE',
      '2026-11-21 09:15',
      1,
    );
    insertUser.run(
      'usr-103',
      'comp-alrayan',
      'Omar Haddad',
      'o.haddad@alrayan-dist.example',
      null,
      'data_analyst',
      'All Regions',
      'HQ Analytics',
      'BI & Operations Research',
      'ACTIVE',
      '2026-11-21 08:52',
      1,
    );
    insertUser.run(
      'usr-104',
      'comp-alrayan',
      'Laila Al-Zahrani',
      'l.alzahrani@alrayan-dist.example',
      null,
      'finance_manager',
      'All Regions',
      'All Branches',
      'Finance & Credit',
      'ACTIVE',
      '2026-11-20 17:10',
      1,
    );
    insertUser.run(
      'usr-105',
      'comp-alrayan',
      'Faisal Al-Qahtani',
      'f.alqahtani@alrayan-dist.example',
      null,
      'sales_manager',
      'Central Region',
      'Riyadh Main Depot',
      'Wholesale & Modern Trade',
      'ACTIVE',
      '2026-11-20 15:28',
      1,
    );
    insertUser.run(
      'usr-106',
      'comp-alrayan',
      'Sara Al-Dosari',
      's.aldosari@alrayan-dist.example',
      null,
      'trade_marketing_manager',
      'Western & Central',
      'Jeddah & Riyadh',
      'Trade Marketing',
      'PENDING_INVITE',
      'Invite sent 2026-11-21',
      1,
    );
    insertUser.run(
      'usr-107',
      'comp-alrayan',
      'Karim Nassar',
      'k.nassar@alrayan-dist.example',
      null,
      'read_only_user',
      'Eastern Region',
      'Dammam Branch',
      'Field Operations',
      'SUSPENDED',
      '2026-11-03 11:04',
      1,
    );
    insertUser.run(
      'usr-201',
      'comp-gulfhorizon',
      'Huda Al-Suwaidi',
      'h.alsuwaidi@gulfhorizon.example',
      null,
      'company_owner',
      'All Regions',
      'Dubai HQ',
      'Executive',
      'ACTIVE',
      '2026-11-21 07:30',
      1,
    );

    db.prepare(
      'INSERT INTO auth_settings (id, admin_user_id, admin_password_hash, claimed_at) VALUES (1, ?, NULL, NULL)',
    ).run('usr-admin');

    const insertSnapshot = db.prepare(`
      INSERT INTO dataset_snapshots (
        id, company_id, version_number, source_name, source_type, row_count,
        quality_score, sufficiency_status, has_cogs, has_spend, missing_fields_json,
        column_mapping_json, is_active, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const alRayanRows = generateSeedRows('comp-alrayan');
    insertSnapshot.run(
      'snap-alrayan-v1',
      'comp-alrayan',
      1,
      'alrayan_commercial_fy2026_seed.csv',
      'SEED',
      alRayanRows.length,
      96.4,
      'READY',
      1,
      1,
      JSON.stringify([]),
      JSON.stringify({
        period: 'period',
        region: 'region',
        branch: 'branch',
        department: 'department',
        channel: 'channel',
        product: 'product',
        revenue: 'revenue',
        cogs: 'cogs',
        marketingSpend: 'marketing_spend',
        tradeSpend: 'trade_spend',
        units: 'units',
        approvedTarget: 'approved_target',
      }),
      1,
      'system-seed',
      now,
    );

    const gulfRows = generateSeedRows('comp-gulfhorizon');
    insertSnapshot.run(
      'snap-gulf-v1',
      'comp-gulfhorizon',
      1,
      'gulfhorizon_commercial_fy2026_seed.csv',
      'SEED',
      gulfRows.length,
      94.8,
      'READY',
      1,
      1,
      JSON.stringify([]),
      JSON.stringify({
        period: 'period',
        region: 'region',
        branch: 'branch',
        department: 'department',
        channel: 'channel',
        product: 'product',
        revenue: 'revenue',
        cogs: 'cogs',
        marketingSpend: 'marketing_spend',
        tradeSpend: 'trade_spend',
        units: 'units',
        approvedTarget: 'approved_target',
      }),
      1,
      'system-seed',
      now,
    );

    const insertRecord = db.prepare(`
      INSERT INTO commercial_records (
        snapshot_id, company_id, period, region, branch, department, channel, product,
        revenue, cogs, marketing_spend, trade_spend, units, approved_target
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const row of alRayanRows) {
      insertRecord.run(
        'snap-alrayan-v1',
        'comp-alrayan',
        row.period,
        row.region,
        row.branch,
        row.department,
        row.channel,
        row.product,
        row.revenue,
        row.cogs,
        row.marketingSpend,
        row.tradeSpend,
        row.units,
        row.approvedTarget,
      );
    }

    for (const row of gulfRows) {
      insertRecord.run(
        'snap-gulf-v1',
        'comp-gulfhorizon',
        row.period,
        row.region,
        row.branch,
        row.department,
        row.channel,
        row.product,
        row.revenue,
        row.cogs,
        row.marketingSpend,
        row.tradeSpend,
        row.units,
        row.approvedTarget,
      );
    }

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function generateSeedRows(companyId: string): CommercialRow[] {
  const periods = [
    '2025-12',
    '2026-01',
    '2026-02',
    '2026-03',
    '2026-04',
    '2026-05',
    '2026-06',
    '2026-07',
    '2026-08',
    '2026-09',
    '2026-10',
    '2026-11',
  ];

  const channels =
    companyId === 'comp-alrayan'
      ? [
          {
            channel: 'Modern Trade',
            region: 'Central Region',
            branch: 'Riyadh Main Depot',
            department: 'Key Retail',
            product: 'Beverages Core Pack',
            baseRev: 42000,
            margin: 0.34,
            mkt: 4800,
            trade: 3600,
          },
          {
            channel: 'Wholesale',
            region: 'Western Region',
            branch: 'Jeddah Hub',
            department: 'Wholesale & Modern Trade',
            product: 'Pantry Staples 12x',
            baseRev: 38000,
            margin: 0.28,
            mkt: 3200,
            trade: 4100,
          },
          {
            channel: 'Direct Key Accounts',
            region: 'Central Region',
            branch: 'Riyadh Main Depot',
            department: 'Commercial Strategy',
            product: 'HoReCa Bulk Case',
            baseRev: 29000,
            margin: 0.39,
            mkt: 2900,
            trade: 2400,
          },
          {
            channel: 'E-Commerce',
            region: 'Eastern Region',
            branch: 'Dammam Branch',
            department: 'Digital Commerce',
            product: 'Direct Bundle Box',
            baseRev: 18500,
            margin: 0.42,
            mkt: 2600,
            trade: 1100,
          },
          {
            channel: 'Regional Distributors',
            region: 'Eastern Region',
            branch: 'Dammam Branch',
            department: 'Field Operations',
            product: 'Regional Value SKU',
            baseRev: 26000,
            margin: 0.24,
            mkt: 2100,
            trade: 3500,
          },
        ]
      : [
          {
            channel: 'Hypermarkets',
            region: 'Dubai',
            branch: 'Dubai Logistics Center',
            department: 'Modern Retail',
            product: 'Premium Dairy Line',
            baseRev: 54000,
            margin: 0.31,
            mkt: 5100,
            trade: 4300,
          },
          {
            channel: 'Convenience Stores',
            region: 'Abu Dhabi',
            branch: 'Abu Dhabi Depot',
            department: 'Impulse & Express',
            product: 'Single-Serve Pack',
            baseRev: 31000,
            margin: 0.37,
            mkt: 2700,
            trade: 2100,
          },
          {
            channel: 'E-Grocery',
            region: 'Dubai',
            branch: 'Dubai Logistics Center',
            department: 'Digital Commerce',
            product: 'Family Pantry Bundle',
            baseRev: 24000,
            margin: 0.41,
            mkt: 3000,
            trade: 1400,
          },
        ];

  const rows: CommercialRow[] = [];
  periods.forEach((period, pIdx) => {
    const seasonal = 1 + Math.sin((pIdx / 12) * Math.PI * 2) * 0.08 + pIdx * 0.014;
    channels.forEach((ch, cIdx) => {
      const driftPenalty = pIdx >= 10 && cIdx === 0 ? 0.91 : 1;
      const revenue = Math.round(ch.baseRev * seasonal * driftPenalty);
      const effectiveMargin = Math.max(0.16, ch.margin - (pIdx >= 10 ? 0.035 : 0));
      const cogs = Math.round(revenue * (1 - effectiveMargin));
      const marketingSpend = Math.round(ch.mkt * (1 + pIdx * 0.01));
      const tradeSpend = Math.round(ch.trade * (1 + (pIdx % 3) * 0.04));
      const units = Math.round(revenue / 45);
      const approvedTarget = Math.round(ch.baseRev * (1 + pIdx * 0.018) * 1.04);
      rows.push({
        period,
        region: ch.region,
        branch: ch.branch,
        department: ch.department,
        channel: ch.channel,
        product: ch.product,
        revenue,
        cogs,
        marketingSpend,
        tradeSpend,
        units,
        approvedTarget,
      });
    });
  });
  return rows;
}

export function appendAuditLog(params: {
  companyId: string;
  actorUserId: string;
  actorEmail: string;
  actorRole: string;
  action: string;
  resourceType: string;
  resourceId: string;
  details: Record<string, unknown>;
}): void {
  const db = getDb();
  const id = `aud-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  db.prepare(`
    INSERT INTO audit_logs (
      id, company_id, actor_user_id, actor_email, actor_role, action,
      resource_type, resource_id, details_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    params.companyId,
    params.actorUserId,
    params.actorEmail,
    params.actorRole,
    params.action,
    params.resourceType,
    params.resourceId,
    JSON.stringify(params.details),
    new Date().toISOString(),
  );
}

export function listAuditLogs(companyId: string, limit = 50): AuditLogRecord[] {
  const db = getDb();
  const rows = db
    .prepare(
      'SELECT * FROM audit_logs WHERE company_id = ? ORDER BY created_at DESC LIMIT ?',
    )
    .all(companyId, limit) as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    id: String(row.id),
    companyId: String(row.company_id),
    actorUserId: String(row.actor_user_id),
    actorEmail: String(row.actor_email),
    actorRole: String(row.actor_role),
    action: String(row.action),
    resourceType: String(row.resource_type),
    resourceId: String(row.resource_id),
    details: JSON.parse(String(row.details_json || '{}')) as Record<string, unknown>,
    createdAt: String(row.created_at),
  }));
}

export function getAuthSettings(): {
  adminUserId: string;
  adminPasswordHash: string | null;
  claimedAt: string | null;
} {
  const db = getDb();
  const row = db.prepare('SELECT * FROM auth_settings WHERE id = 1').get() as
    | {admin_user_id: string; admin_password_hash: string | null; claimed_at: string | null}
    | undefined;
  return {
    adminUserId: row?.admin_user_id ?? 'usr-admin',
    adminPasswordHash: row?.admin_password_hash ?? null,
    claimedAt: row?.claimed_at ?? null,
  };
}

export function claimAdminPasswordHash(email: string, fullName: string, passwordHash: string): SafeUserRecord {
  const db = getDb();
  const now = new Date().toISOString();
  const normalizedEmail = email.trim().toLowerCase();

  db.exec('BEGIN TRANSACTION');
  try {
    db.prepare(
      'UPDATE auth_settings SET admin_password_hash = ?, claimed_at = ? WHERE id = 1',
    ).run(passwordHash, now);

    db.prepare(
      'UPDATE users SET full_name = ?, email = ?, password_hash = ?, last_active = ? WHERE id = ?',
    ).run(fullName.trim(), normalizedEmail, passwordHash, now, 'usr-admin');

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  const user = findUserById('usr-admin');
  if (!user) {
    throw new Error('Admin account record missing.');
  }
  return user;
}

export interface DbUserWithPassword extends SafeUserRecord {
  passwordHash: string | null;
}

function mapUserRow(row: Record<string, unknown>): DbUserWithPassword {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    companyName: String(row.company_name ?? ''),
    fullName: String(row.full_name),
    email: String(row.email),
    passwordHash: row.password_hash ? String(row.password_hash) : null,
    roleId: String(row.role_id) as EnterpriseRoleId,
    regionScope: String(row.region_scope),
    branchScope: String(row.branch_scope),
    departmentScope: String(row.department_scope),
    status: String(row.status) as UserAccountStatus,
    lastActive: String(row.last_active),
    isIllustrativeDemo: Boolean(row.is_illustrative_demo),
  };
}

export function findUserByEmail(email: string): DbUserWithPassword | null {
  const db = getDb();
  const row = db
    .prepare(`
      SELECT u.*, c.name as company_name
      FROM users u
      JOIN companies c ON c.id = u.company_id
      WHERE lower(u.email) = lower(?)
    `)
    .get(email.trim()) as Record<string, unknown> | undefined;
  return row ? mapUserRow(row) : null;
}

export function findUserById(userId: string): SafeUserRecord | null {
  const db = getDb();
  const row = db
    .prepare(`
      SELECT u.*, c.name as company_name
      FROM users u
      JOIN companies c ON c.id = u.company_id
      WHERE u.id = ?
    `)
    .get(userId) as Record<string, unknown> | undefined;
  if (!row) return null;
  const full = mapUserRow(row);
  const {passwordHash: _omit, ...safe} = full;
  return safe;
}

export function listCompanies(): CompanyRecord[] {
  const db = getDb();
  return db.prepare('SELECT id, name, currency, country FROM companies ORDER BY name').all() as unknown as CompanyRecord[];
}

export function getCompanyById(companyId: string): CompanyRecord | null {
  const db = getDb();
  const row = db
    .prepare('SELECT id, name, currency, country FROM companies WHERE id = ?')
    .get(companyId) as CompanyRecord | undefined;
  return row ?? null;
}

export function listUsersByCompany(companyId: string): SafeUserRecord[] {
  const db = getDb();
  const rows = db
    .prepare(`
      SELECT u.*, c.name as company_name
      FROM users u
      JOIN companies c ON c.id = u.company_id
      WHERE u.company_id = ?
      ORDER BY CASE WHEN u.id = 'usr-admin' THEN 0 ELSE 1 END, u.full_name ASC
    `)
    .all(companyId) as Array<Record<string, unknown>>;

  return rows.map((row) => {
    const {passwordHash: _omit, ...safe} = mapUserRow(row);
    return safe;
  });
}

export function createTenantUser(input: {
  companyId: string;
  fullName: string;
  email: string;
  passwordHash: string | null;
  roleId: EnterpriseRoleId;
  regionScope: string;
  branchScope: string;
  departmentScope: string;
}): SafeUserRecord {
  const db = getDb();
  const id = `usr-${Date.now().toString().slice(-6)}-${Math.random().toString(36).slice(2, 5)}`;
  const status: UserAccountStatus = input.passwordHash ? 'ACTIVE' : 'PENDING_INVITE';
  const nowLabel = new Date().toISOString().slice(0, 16).replace('T', ' ');

  db.prepare(`
    INSERT INTO users (
      id, company_id, full_name, email, password_hash, role_id,
      region_scope, branch_scope, department_scope, status, last_active, is_illustrative_demo
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
  `).run(
    id,
    input.companyId,
    input.fullName.trim(),
    input.email.trim().toLowerCase(),
    input.passwordHash,
    input.roleId,
    input.regionScope.trim(),
    input.branchScope.trim(),
    input.departmentScope.trim(),
    status,
    nowLabel,
  );

  const created = findUserById(id);
  if (!created) throw new Error('Failed to load created user.');
  return created;
}

export function updateTenantUser(
  userId: string,
  companyId: string,
  updates: {roleId?: EnterpriseRoleId; status?: UserAccountStatus},
): SafeUserRecord | null {
  const db = getDb();
  const existing = db
    .prepare('SELECT id, role_id, status FROM users WHERE id = ? AND company_id = ?')
    .get(userId, companyId) as {id: string; role_id: string; status: string} | undefined;
  if (!existing) return null;

  const nextRole = updates.roleId ?? existing.role_id;
  const nextStatus = updates.status ?? existing.status;

  db.prepare('UPDATE users SET role_id = ?, status = ? WHERE id = ? AND company_id = ?').run(
    nextRole,
    nextStatus,
    userId,
    companyId,
  );
  return findUserById(userId);
}

function mapSnapshotRow(row: Record<string, unknown>): DatasetSnapshotRecord {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    versionNumber: Number(row.version_number),
    sourceName: String(row.source_name),
    sourceType: String(row.source_type) as DatasetSnapshotRecord['sourceType'],
    rowCount: Number(row.row_count),
    qualityScore: Number(row.quality_score),
    sufficiencyStatus: String(row.sufficiency_status) as SufficiencyStatus,
    hasCogs: Boolean(row.has_cogs),
    hasSpend: Boolean(row.has_spend),
    missingFields: JSON.parse(String(row.missing_fields_json || '[]')) as string[],
    columnMapping: JSON.parse(String(row.column_mapping_json || '{}')) as Record<string, string>,
    isActive: Boolean(row.is_active),
    createdBy: String(row.created_by),
    createdAt: String(row.created_at),
  };
}

export function listSnapshots(companyId: string): DatasetSnapshotRecord[] {
  const db = getDb();
  const rows = db
    .prepare(
      'SELECT * FROM dataset_snapshots WHERE company_id = ? ORDER BY version_number DESC',
    )
    .all(companyId) as Array<Record<string, unknown>>;
  return rows.map(mapSnapshotRow);
}

export function getActiveSnapshot(companyId: string): DatasetSnapshotRecord | null {
  const db = getDb();
  const row = db
    .prepare(
      'SELECT * FROM dataset_snapshots WHERE company_id = ? AND is_active = 1 LIMIT 1',
    )
    .get(companyId) as Record<string, unknown> | undefined;
  return row ? mapSnapshotRow(row) : null;
}

export function saveDatasetSnapshot(params: {
  companyId: string;
  sourceName: string;
  sourceType: 'CSV' | 'XLSX' | 'JSON';
  qualityScore: number;
  sufficiencyStatus: SufficiencyStatus;
  hasCogs: boolean;
  hasSpend: boolean;
  missingFields: string[];
  columnMapping: Record<string, string>;
  rows: CommercialRow[];
  createdBy: string;
}): DatasetSnapshotRecord {
  const db = getDb();
  const now = new Date().toISOString();
  const maxRow = db
    .prepare('SELECT COALESCE(MAX(version_number), 0) as max_v FROM dataset_snapshots WHERE company_id = ?')
    .get(params.companyId) as {max_v: number};
  const nextVersion = Number(maxRow.max_v) + 1;
  const id = `snap-${params.companyId.slice(5, 11)}-v${nextVersion}-${Date.now().toString().slice(-4)}`;

  db.exec('BEGIN TRANSACTION');
  try {
    db.prepare('UPDATE dataset_snapshots SET is_active = 0 WHERE company_id = ?').run(
      params.companyId,
    );

    db.prepare(`
      INSERT INTO dataset_snapshots (
        id, company_id, version_number, source_name, source_type, row_count,
        quality_score, sufficiency_status, has_cogs, has_spend, missing_fields_json,
        column_mapping_json, is_active, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(
      id,
      params.companyId,
      nextVersion,
      params.sourceName,
      params.sourceType,
      params.rows.length,
      params.qualityScore,
      params.sufficiencyStatus,
      params.hasCogs ? 1 : 0,
      params.hasSpend ? 1 : 0,
      JSON.stringify(params.missingFields),
      JSON.stringify(params.columnMapping),
      params.createdBy,
      now,
    );

    const insertRecord = db.prepare(`
      INSERT INTO commercial_records (
        snapshot_id, company_id, period, region, branch, department, channel, product,
        revenue, cogs, marketing_spend, trade_spend, units, approved_target
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const row of params.rows) {
      insertRecord.run(
        id,
        params.companyId,
        row.period,
        row.region,
        row.branch,
        row.department,
        row.channel,
        row.product,
        row.revenue,
        row.cogs,
        row.marketingSpend,
        row.tradeSpend,
        row.units,
        row.approvedTarget,
      );
    }

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  const created = db.prepare('SELECT * FROM dataset_snapshots WHERE id = ?').get(id) as Record<
    string,
    unknown
  >;
  return mapSnapshotRow(created);
}

export function rollbackToSnapshot(
  companyId: string,
  snapshotId: string,
): DatasetSnapshotRecord | null {
  const db = getDb();
  const target = db
    .prepare('SELECT * FROM dataset_snapshots WHERE id = ? AND company_id = ?')
    .get(snapshotId, companyId) as Record<string, unknown> | undefined;
  if (!target) return null;

  db.exec('BEGIN TRANSACTION');
  try {
    db.prepare('UPDATE dataset_snapshots SET is_active = 0 WHERE company_id = ?').run(companyId);
    db.prepare('UPDATE dataset_snapshots SET is_active = 1 WHERE id = ? AND company_id = ?').run(
      snapshotId,
      companyId,
    );
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  const updated = db
    .prepare('SELECT * FROM dataset_snapshots WHERE id = ?')
    .get(snapshotId) as Record<string, unknown>;
  return mapSnapshotRow(updated);
}

export function getCommercialRecordsForSnapshot(
  companyId: string,
  snapshotId: string,
  userScope?: {regionScope?: string; branchScope?: string; departmentScope?: string},
): CommercialRow[] {
  const db = getDb();
  let query = 'SELECT * FROM commercial_records WHERE company_id = ? AND snapshot_id = ?';
  const args: Array<string> = [companyId, snapshotId];

  if (userScope?.regionScope && userScope.regionScope !== 'All Regions') {
    query += ' AND region = ?';
    args.push(userScope.regionScope);
  }
  if (userScope?.branchScope && userScope.branchScope !== 'All Branches' && !userScope.branchScope.includes('HQ')) {
    query += ' AND branch = ?';
    args.push(userScope.branchScope);
  }

  query += ' ORDER BY period ASC, channel ASC';

  const rows = db.prepare(query).all(...args) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    period: String(r.period),
    region: String(r.region),
    branch: String(r.branch),
    department: String(r.department),
    channel: String(r.channel),
    product: String(r.product),
    revenue: Number(r.revenue),
    cogs: r.cogs === null || r.cogs === undefined ? null : Number(r.cogs),
    marketingSpend:
      r.marketing_spend === null || r.marketing_spend === undefined
        ? null
        : Number(r.marketing_spend),
    tradeSpend:
      r.trade_spend === null || r.trade_spend === undefined ? null : Number(r.trade_spend),
    units: Number(r.units),
    approvedTarget: Number(r.approved_target),
  }));
}

export function saveForecastRun(run: ForecastRunRecord): ForecastRunRecord {
  const db = getDb();
  db.prepare(`
    INSERT INTO forecast_runs (
      id, company_id, snapshot_id, model_type, metric, horizon, scope_filter,
      mae, rmse, mape, naive_mape, points_json, created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    run.id,
    run.companyId,
    run.snapshotId,
    run.modelType,
    run.metric,
    run.horizon,
    run.scopeFilter,
    run.mae,
    run.rmse,
    run.mape,
    run.naiveMape,
    JSON.stringify(run.points),
    run.createdBy,
    run.createdAt,
  );
  return run;
}

export function listForecastRuns(companyId: string, limit = 15): ForecastRunRecord[] {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM forecast_runs WHERE company_id = ? ORDER BY created_at DESC LIMIT ?')
    .all(companyId, limit) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: String(r.id),
    companyId: String(r.company_id),
    snapshotId: String(r.snapshot_id),
    modelType: String(r.model_type) as ForecastRunRecord['modelType'],
    metric: String(r.metric) as ForecastRunRecord['metric'],
    horizon: Number(r.horizon),
    scopeFilter: String(r.scope_filter),
    mae: Number(r.mae),
    rmse: Number(r.rmse),
    mape: Number(r.mape),
    naiveMape: Number(r.naive_mape),
    points: JSON.parse(String(r.points_json || '[]')),
    createdBy: String(r.created_by),
    createdAt: String(r.created_at),
  }));
}

export function saveOptimizationRun(run: OptimizationRunRecord): OptimizationRunRecord {
  const db = getDb();
  db.prepare(`
    INSERT INTO optimization_runs (
      id, company_id, snapshot_id, template_key, title, solver_engine, solver_status,
      objective_value, baseline_total, optimized_total, net_delta, improvement_pct,
      total_budget, allocations_json, sensitivity_json, diagnostics, execution_ms,
      created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    run.id,
    run.companyId,
    run.snapshotId,
    run.templateKey,
    run.title,
    run.solverEngine,
    run.solverStatus,
    run.objectiveValue,
    run.baselineTotal,
    run.optimizedTotal,
    run.netDelta,
    run.improvementPct,
    run.totalBudget,
    JSON.stringify(run.allocations),
    JSON.stringify(run.sensitivity),
    run.diagnostics,
    run.executionMs,
    run.createdBy,
    run.createdAt,
  );
  return run;
}

export function listOptimizationRuns(companyId: string, limit = 15): OptimizationRunRecord[] {
  const db = getDb();
  const rows = db
    .prepare(
      'SELECT * FROM optimization_runs WHERE company_id = ? ORDER BY created_at DESC LIMIT ?',
    )
    .all(companyId, limit) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: String(r.id),
    companyId: String(r.company_id),
    snapshotId: String(r.snapshot_id),
    templateKey: String(r.template_key) as OptimizationRunRecord['templateKey'],
    title: String(r.title),
    solverEngine: String(r.solver_engine),
    solverStatus: String(r.solver_status) as OptimizationRunRecord['solverStatus'],
    objectiveValue: Number(r.objective_value),
    baselineTotal: Number(r.baseline_total),
    optimizedTotal: Number(r.optimized_total),
    netDelta: Number(r.net_delta),
    improvementPct: Number(r.improvement_pct),
    totalBudget: Number(r.total_budget),
    allocations: JSON.parse(String(r.allocations_json || '[]')),
    sensitivity: JSON.parse(String(r.sensitivity_json || '[]')),
    diagnostics: String(r.diagnostics),
    executionMs: Number(r.execution_ms),
    createdBy: String(r.created_by),
    createdAt: String(r.created_at),
  }));
}

export function getOptimizationRunById(
  companyId: string,
  runId: string,
): OptimizationRunRecord | null {
  const runs = listOptimizationRuns(companyId, 50);
  return runs.find((r) => r.id === runId) ?? null;
}

function mapDecisionRow(r: Record<string, unknown>): DecisionDossierRecord {
  return {
    id: String(r.id),
    companyId: String(r.company_id),
    optimizationRunId: String(r.optimization_run_id),
    title: String(r.title),
    status: String(r.status) as DecisionStatus,
    assumptions: String(r.assumptions),
    risks: String(r.risks),
    limitations: String(r.limitations),
    reviewerComment: r.reviewer_comment ? String(r.reviewer_comment) : null,
    reviewedBy: r.reviewed_by ? String(r.reviewed_by) : null,
    reviewedAt: r.reviewed_at ? String(r.reviewed_at) : null,
    executionRef: r.execution_ref ? String(r.execution_ref) : null,
    actualOutcomeValue:
      r.actual_outcome_value === null || r.actual_outcome_value === undefined
        ? null
        : Number(r.actual_outcome_value),
    actualOutcomeNotes: r.actual_outcome_notes ? String(r.actual_outcome_notes) : null,
    createdBy: String(r.created_by),
    createdAt: String(r.created_at),
  };
}

export function createDecisionDossier(input: {
  companyId: string;
  optimizationRunId: string;
  title: string;
  assumptions: string;
  risks: string;
  limitations: string;
  createdBy: string;
}): DecisionDossierRecord {
  const db = getDb();
  const id = `dec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO decision_dossiers (
      id, company_id, optimization_run_id, title, status, assumptions, risks, limitations,
      created_by, created_at
    ) VALUES (?, ?, ?, ?, 'PENDING_REVIEW', ?, ?, ?, ?, ?)
  `).run(
    id,
    input.companyId,
    input.optimizationRunId,
    input.title.trim(),
    input.assumptions.trim(),
    input.risks.trim(),
    input.limitations.trim(),
    input.createdBy,
    now,
  );
  const row = db
    .prepare('SELECT * FROM decision_dossiers WHERE id = ?')
    .get(id) as Record<string, unknown>;
  return mapDecisionRow(row);
}

export function listDecisions(companyId: string): DecisionDossierRecord[] {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM decision_dossiers WHERE company_id = ? ORDER BY created_at DESC')
    .all(companyId) as Array<Record<string, unknown>>;
  return rows.map(mapDecisionRow);
}

export function reviewDecision(
  companyId: string,
  decisionId: string,
  status: DecisionStatus,
  comment: string,
  reviewerEmail: string,
): DecisionDossierRecord | null {
  const db = getDb();
  const existing = db
    .prepare('SELECT id FROM decision_dossiers WHERE id = ? AND company_id = ?')
    .get(decisionId, companyId);
  if (!existing) return null;

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE decision_dossiers
    SET status = ?, reviewer_comment = ?, reviewed_by = ?, reviewed_at = ?
    WHERE id = ? AND company_id = ?
  `).run(status, comment.trim(), reviewerEmail, now, decisionId, companyId);

  const row = db
    .prepare('SELECT * FROM decision_dossiers WHERE id = ?')
    .get(decisionId) as Record<string, unknown>;
  return mapDecisionRow(row);
}

export function updateDecisionExecution(
  companyId: string,
  decisionId: string,
  executionRef: string,
  actualOutcomeValue: number | null,
  actualOutcomeNotes: string | null,
): DecisionDossierRecord | null {
  const db = getDb();
  const existing = db
    .prepare('SELECT id FROM decision_dossiers WHERE id = ? AND company_id = ?')
    .get(decisionId, companyId);
  if (!existing) return null;

  db.prepare(`
    UPDATE decision_dossiers
    SET execution_ref = ?, actual_outcome_value = ?, actual_outcome_notes = ?
    WHERE id = ? AND company_id = ?
  `).run(
    executionRef.trim(),
    actualOutcomeValue,
    actualOutcomeNotes ? actualOutcomeNotes.trim() : null,
    decisionId,
    companyId,
  );

  const row = db
    .prepare('SELECT * FROM decision_dossiers WHERE id = ?')
    .get(decisionId) as Record<string, unknown>;
  return mapDecisionRow(row);
}

function mapAlertRow(r: Record<string, unknown>): DetectAlertRecord {
  return {
    id: String(r.id),
    companyId: String(r.company_id),
    snapshotId: String(r.snapshot_id),
    ruleCode: String(r.rule_code),
    severity: String(r.severity) as AlertSeverity,
    category: String(r.category) as DetectAlertRecord['category'],
    title: String(r.title),
    description: String(r.description),
    metricValue: Number(r.metric_value),
    thresholdValue: Number(r.threshold_value),
    status: String(r.status) as AlertStatus,
    parentAlertId: r.parent_alert_id ? String(r.parent_alert_id) : null,
    occurrenceCount: Number(r.occurrence_count),
    resolutionNotes: r.resolution_notes ? String(r.resolution_notes) : null,
    updatedBy: r.updated_by ? String(r.updated_by) : null,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

export function listDetectAlerts(companyId: string): DetectAlertRecord[] {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM detect_alerts WHERE company_id = ? ORDER BY created_at DESC')
    .all(companyId) as Array<Record<string, unknown>>;
  return rows.map(mapAlertRow);
}

export function upsertEvaluatedAlerts(
  companyId: string,
  snapshotId: string,
  candidates: Array<{
    ruleCode: string;
    severity: AlertSeverity;
    category: DetectAlertRecord['category'];
    title: string;
    description: string;
    metricValue: number;
    thresholdValue: number;
  }>,
): DetectAlertRecord[] {
  const db = getDb();
  const now = new Date().toISOString();

  for (const cand of candidates) {
    const active = db
      .prepare(
        "SELECT id, occurrence_count FROM detect_alerts WHERE company_id = ? AND rule_code = ? AND status IN ('OPEN', 'UNDER_REVIEW') LIMIT 1",
      )
      .get(companyId, cand.ruleCode) as {id: string; occurrence_count: number} | undefined;

    if (active) {
      db.prepare(
        'UPDATE detect_alerts SET snapshot_id = ?, description = ?, metric_value = ?, updated_at = ? WHERE id = ?',
      ).run(snapshotId, cand.description, cand.metricValue, now, active.id);
      continue;
    }

    const priorClosed = db
      .prepare(
        "SELECT id, occurrence_count FROM detect_alerts WHERE company_id = ? AND rule_code = ? AND status IN ('RESOLVED', 'DISMISSED') ORDER BY created_at DESC LIMIT 1",
      )
      .get(companyId, cand.ruleCode) as {id: string; occurrence_count: number} | undefined;

    const id = `alt-${Date.now().toString().slice(-6)}-${Math.random().toString(36).slice(2, 6)}`;
    db.prepare(`
      INSERT INTO detect_alerts (
        id, company_id, snapshot_id, rule_code, severity, category, title, description,
        metric_value, threshold_value, status, parent_alert_id, occurrence_count,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, ?, ?)
    `).run(
      id,
      companyId,
      snapshotId,
      cand.ruleCode,
      cand.severity,
      cand.category,
      cand.title,
      cand.description,
      cand.metricValue,
      cand.thresholdValue,
      priorClosed ? priorClosed.id : null,
      priorClosed ? priorClosed.occurrence_count + 1 : 1,
      now,
      now,
    );
  }

  return listDetectAlerts(companyId);
}

export function transitionAlertStatus(
  companyId: string,
  alertId: string,
  status: AlertStatus,
  notes: string,
  actorEmail: string,
): DetectAlertRecord | null {
  const db = getDb();
  const existing = db
    .prepare('SELECT id FROM detect_alerts WHERE id = ? AND company_id = ?')
    .get(alertId, companyId);
  if (!existing) return null;

  const now = new Date().toISOString();
  db.prepare(
    'UPDATE detect_alerts SET status = ?, resolution_notes = ?, updated_by = ?, updated_at = ? WHERE id = ? AND company_id = ?',
  ).run(status, notes.trim(), actorEmail, now, alertId, companyId);

  const row = db
    .prepare('SELECT * FROM detect_alerts WHERE id = ?')
    .get(alertId) as Record<string, unknown>;
  return mapAlertRow(row);
}

export function exportCompanyBackup(companyId: string): Record<string, unknown> {
  const company = getCompanyById(companyId);
  const snapshots = listSnapshots(companyId);
  const activeSnap = getActiveSnapshot(companyId);
  const records = activeSnap
    ? getCommercialRecordsForSnapshot(companyId, activeSnap.id)
    : [];
  const forecasts = listForecastRuns(companyId, 50);
  const optimizations = listOptimizationRuns(companyId, 50);
  const decisions = listDecisions(companyId);
  const alerts = listDetectAlerts(companyId);
  const auditLogs = listAuditLogs(companyId, 200);

  return {
    backupFormat: 'tetra-os-tenant-backup-v1',
    exportedAt: new Date().toISOString(),
    company,
    snapshots,
    activeSnapshotRecords: records,
    forecasts,
    optimizations,
    decisions,
    alerts,
    auditLogs,
  };
}

export function restoreCompanyRecordsFromBackup(
  companyId: string,
  actorEmail: string,
  rows: CommercialRow[],
): DatasetSnapshotRecord {
  return saveDatasetSnapshot({
    companyId,
    sourceName: `restored_backup_${new Date().toISOString().slice(0, 10)}.json`,
    sourceType: 'JSON',
    qualityScore: 95,
    sufficiencyStatus: 'READY',
    hasCogs: rows.every((r) => r.cogs !== null),
    hasSpend: rows.every((r) => r.marketingSpend !== null || r.tradeSpend !== null),
    missingFields: [],
    columnMapping: {},
    rows,
    createdBy: actorEmail,
  });
}

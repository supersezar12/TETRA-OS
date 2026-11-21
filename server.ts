import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import {z} from 'zod';
import {runGroundedGeminiAnalysis} from './server/ai.ts';
import {
  hashPassword,
  needsAdminBootstrap,
  requireAuth,
  requirePermission,
  signSessionToken,
  verifyConfiguredAdminPasscode,
  verifyPassword,
  type AuthenticatedRequest,
} from './server/auth.ts';
import {
  appendAuditLog,
  claimAdminPasswordHash,
  createDecisionDossier,
  createTenantUser,
  exportCompanyBackup,
  findUserByEmail,
  getActiveSnapshot,
  getCommercialRecordsForSnapshot,
  getCompanyById,
  getDb,
  getOptimizationRunById,
  listAuditLogs,
  listCompanies,
  listDecisions,
  listDetectAlerts,
  listForecastRuns,
  listOptimizationRuns,
  listSnapshots,
  listUsersByCompany,
  restoreCompanyRecordsFromBackup,
  reviewDecision,
  rollbackToSnapshot,
  saveDatasetSnapshot,
  saveForecastRun,
  saveOptimizationRun,
  transitionAlertStatus,
  updateDecisionExecution,
  updateTenantUser,
  upsertEvaluatedAlerts,
} from './server/db.ts';
import {evaluateDetectRules} from './server/engines/detect.ts';
import {
  parseCsvText,
  parseJsonText,
  parseXlsxBase64,
  suggestColumnMapping,
  validateAndMapRows,
} from './server/engines/ingestion.ts';
import {buildDefaultChannelInputs, runOptimizationEngine} from './server/engines/optimize.ts';
import {runForecastEngine} from './server/engines/predict.ts';
import {
  escapeCsvCell,
  generateExcelReportBuffer,
  generatePdfReportBuffer,
} from './server/engines/reports.ts';
import {
  ENTERPRISE_ROLE_MATRIX,
  type CommercialRow,
  type EnterpriseRoleId,
  type UserAccountStatus,
} from './server/types.ts';

// Ensure DB schema and initial tenants are initialized cleanly on boot
getDb();

const app = express();
app.use(express.json({limit: '5mb'}));

// Security headers suitable for iframe-hosted previews
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

const ROLE_IDS = ENTERPRISE_ROLE_MATRIX.map((r) => r.id) as [
  EnterpriseRoleId,
  ...EnterpriseRoleId[],
];

function computeTenantKpis(rows: readonly CommercialRow[]) {
  const totalRevenue = Math.round(rows.reduce((s, r) => s + r.revenue, 0));
  const totalTarget = Math.round(rows.reduce((s, r) => s + r.approvedTarget, 0));
  const withCogs = rows.filter((r) => r.cogs !== null);
  const grossMarginPct =
    withCogs.length > 0
      ? Number(
          (
            (withCogs.reduce((s, r) => s + (r.revenue - (r.cogs ?? 0)), 0) /
              Math.max(1, withCogs.reduce((s, r) => s + r.revenue, 0))) *
            100
          ).toFixed(1),
        )
      : null;
  const totalMarketingSpend = Math.round(
    rows.reduce((s, r) => s + (r.marketingSpend ?? 0), 0),
  );
  const totalTradeSpend = Math.round(rows.reduce((s, r) => s + (r.tradeSpend ?? 0), 0));
  const targetVariancePct =
    totalTarget > 0
      ? Number((((totalRevenue - totalTarget) / totalTarget) * 100).toFixed(1))
      : 0;
  return {
    totalRevenue,
    totalTarget,
    grossMarginPct,
    totalMarketingSpend,
    totalTradeSpend,
    targetVariancePct,
  };
}

// ---------------- HEALTH ----------------
app.get('/api/health', (_req, res) => {
  res.json({status: 'ok', service: 'tetra-os', timestamp: new Date().toISOString()});
});

// ---------------- AUTH ----------------
app.get('/api/auth/status', (_req, res) => {
  res.json({
    needsBootstrap: needsAdminBootstrap(),
  });
});

const bootstrapSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(160),
  password: z.string().min(8).max(128),
});

app.post('/api/auth/bootstrap', (req, res) => {
  if (!needsAdminBootstrap()) {
    res.status(409).json({error: 'Admin account is already configured. Sign in instead.'});
    return;
  }

  const parsed = bootstrapSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({error: 'Provide full name, valid email, and password (min 8 chars).'});
    return;
  }

  try {
    const hash = hashPassword(parsed.data.password);
    const adminUser = claimAdminPasswordHash(parsed.data.email, parsed.data.fullName, hash);
    const token = signSessionToken({
      userId: adminUser.id,
      companyId: adminUser.companyId,
      roleId: adminUser.roleId,
    });
    appendAuditLog({
      companyId: adminUser.companyId,
      actorUserId: adminUser.id,
      actorEmail: adminUser.email,
      actorRole: adminUser.roleId,
      action: 'ADMIN_CLAIMED',
      resourceType: 'auth_settings',
      resourceId: adminUser.id,
      details: {email: adminUser.email},
    });
    res.status(201).json({
      token,
      user: adminUser,
      companies: listCompanies(),
      activeCompany: getCompanyById(adminUser.companyId),
    });
  } catch (err) {
    console.error('Bootstrap error:', err);
    res.status(500).json({error: 'Failed to initialize administrator account.'});
  }
});

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(128),
});

app.post('/api/auth/login', (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({error: 'Valid email and password are required.'});
    return;
  }

  const userRecord = findUserByEmail(parsed.data.email);
  if (!userRecord) {
    res.status(401).json({error: 'Invalid email or password.'});
    return;
  }
  if (userRecord.status === 'SUSPENDED') {
    res.status(403).json({error: 'This account is suspended. Contact your administrator.'});
    return;
  }

  let valid = false;
  if (userRecord.id === 'usr-admin' && verifyConfiguredAdminPasscode(parsed.data.password)) {
    valid = true;
  } else if (userRecord.passwordHash) {
    valid = verifyPassword(parsed.data.password, userRecord.passwordHash);
  }

  if (!valid) {
    res.status(401).json({error: 'Invalid email or password.'});
    return;
  }

  const {passwordHash: _omit, ...safeUser} = userRecord;
  const token = signSessionToken({
    userId: safeUser.id,
    companyId: safeUser.companyId,
    roleId: safeUser.roleId,
  });

  const companies =
    safeUser.roleId === 'platform_super_admin'
      ? listCompanies()
      : [getCompanyById(safeUser.companyId)].filter(Boolean);

  appendAuditLog({
    companyId: safeUser.companyId,
    actorUserId: safeUser.id,
    actorEmail: safeUser.email,
    actorRole: safeUser.roleId,
    action: 'USER_LOGIN',
    resourceType: 'session',
    resourceId: safeUser.id,
    details: {},
  });

  res.json({
    token,
    user: safeUser,
    companies,
    activeCompany: getCompanyById(safeUser.companyId),
  });
});

app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
  const user = req.authUser!;
  const companyId = req.activeCompanyId!;
  const companies =
    user.roleId === 'platform_super_admin'
      ? listCompanies()
      : [getCompanyById(user.companyId)].filter(Boolean);
  res.json({
    user,
    companies,
    activeCompany: getCompanyById(companyId),
  });
});

// ---------------- OVERVIEW ----------------
app.get('/api/overview', requireAuth, (req: AuthenticatedRequest, res) => {
  const user = req.authUser!;
  const companyId = req.activeCompanyId!;
  const company = getCompanyById(companyId);
  const snapshot = getActiveSnapshot(companyId);
  const rows = snapshot
    ? getCommercialRecordsForSnapshot(companyId, snapshot.id, {
        regionScope: user.regionScope,
        branchScope: user.branchScope,
        departmentScope: user.departmentScope,
      })
    : [];

  const kpis = computeTenantKpis(rows);
  const forecasts = listForecastRuns(companyId, 5);
  const optimizations = listOptimizationRuns(companyId, 5);
  const decisions = listDecisions(companyId);
  const alerts = listDetectAlerts(companyId);

  res.json({
    company,
    snapshot,
    kpis,
    latestForecast: forecasts[0] ?? null,
    latestOptimization: optimizations[0] ?? null,
    pendingDecisionsCount: decisions.filter((d) => d.status === 'PENDING_REVIEW').length,
    openAlertsCount: alerts.filter((a) => a.status === 'OPEN' || a.status === 'UNDER_REVIEW').length,
  });
});

// ---------------- DATA CENTER ----------------
app.get('/api/datasets/snapshots', requireAuth, (req: AuthenticatedRequest, res) => {
  const companyId = req.activeCompanyId!;
  const user = req.authUser!;
  const snapshots = listSnapshots(companyId);
  const active = snapshots.find((s) => s.isActive) ?? null;
  const previewRows = active
    ? getCommercialRecordsForSnapshot(companyId, active.id, {
        regionScope: user.regionScope,
        branchScope: user.branchScope,
      }).slice(0, 20)
    : [];
  res.json({snapshots, activeSnapshot: active, previewRows});
});

const previewUploadSchema = z.object({
  sourceType: z.enum(['CSV', 'XLSX', 'JSON']),
  content: z.string().min(1).max(4_000_000),
});

app.post(
  '/api/datasets/preview',
  requireAuth,
  requirePermission('ingestData'),
  async (req: AuthenticatedRequest, res) => {
    const parsed = previewUploadSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({error: 'Invalid dataset file payload.'});
      return;
    }

    try {
      const result =
        parsed.data.sourceType === 'CSV'
          ? parseCsvText(parsed.data.content)
          : parsed.data.sourceType === 'JSON'
            ? parseJsonText(parsed.data.content)
            : await parseXlsxBase64(parsed.data.content);

      res.json({
        headers: result.headers,
        rowCount: result.rows.length,
        sampleRows: result.rows.slice(0, 5),
        suggestedMapping: suggestColumnMapping(result.headers),
      });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Unable to parse dataset file.',
      });
    }
  },
);

const ingestSchema = z.object({
  sourceName: z.string().trim().min(1).max(160),
  sourceType: z.enum(['CSV', 'XLSX', 'JSON']),
  content: z.string().min(1).max(4_000_000),
  columnMapping: z.record(z.string(), z.string()),
});

app.post(
  '/api/datasets/ingest',
  requireAuth,
  requirePermission('ingestData'),
  async (req: AuthenticatedRequest, res) => {
    const parsed = ingestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({error: 'Invalid ingestion payload or column mapping.'});
      return;
    }

    const user = req.authUser!;
    const companyId = req.activeCompanyId!;

    try {
      const extracted =
        parsed.data.sourceType === 'CSV'
          ? parseCsvText(parsed.data.content)
          : parsed.data.sourceType === 'JSON'
            ? parseJsonText(parsed.data.content)
            : await parseXlsxBase64(parsed.data.content);

      const validation = validateAndMapRows(extracted.rows, parsed.data.columnMapping);
      if (validation.rows.length === 0) {
        res.status(422).json({
          error: validation.warnings.join(' ') || 'Dataset failed validation checks.',
          validation,
        });
        return;
      }

      const snapshot = saveDatasetSnapshot({
        companyId,
        sourceName: parsed.data.sourceName,
        sourceType: parsed.data.sourceType,
        qualityScore: validation.qualityScore,
        sufficiencyStatus: validation.sufficiencyStatus,
        hasCogs: validation.hasCogs,
        hasSpend: validation.hasSpend,
        missingFields: validation.missingFields,
        columnMapping: parsed.data.columnMapping,
        rows: validation.rows,
        createdBy: user.email,
      });

      appendAuditLog({
        companyId,
        actorUserId: user.id,
        actorEmail: user.email,
        actorRole: user.roleId,
        action: 'DATASET_INGESTED',
        resourceType: 'dataset_snapshot',
        resourceId: snapshot.id,
        details: {
          versionNumber: snapshot.versionNumber,
          rowCount: snapshot.rowCount,
          qualityScore: snapshot.qualityScore,
          sufficiencyStatus: snapshot.sufficiencyStatus,
        },
      });

      res.status(201).json({snapshot, warnings: validation.warnings});
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Dataset ingestion failed.',
      });
    }
  },
);

const rollbackSchema = z.object({
  snapshotId: z.string().trim().min(1),
});

app.post(
  '/api/datasets/rollback',
  requireAuth,
  requirePermission('ingestData'),
  (req: AuthenticatedRequest, res) => {
    const parsed = rollbackSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({error: 'snapshotId is required.'});
      return;
    }

    const user = req.authUser!;
    const companyId = req.activeCompanyId!;
    const activated = rollbackToSnapshot(companyId, parsed.data.snapshotId);
    if (!activated) {
      res.status(404).json({error: 'Snapshot not found in active tenant.'});
      return;
    }

    appendAuditLog({
      companyId,
      actorUserId: user.id,
      actorEmail: user.email,
      actorRole: user.roleId,
      action: 'DATASET_ROLLBACK',
      resourceType: 'dataset_snapshot',
      resourceId: activated.id,
      details: {versionNumber: activated.versionNumber},
    });

    res.json({snapshot: activated});
  },
);

// ---------------- PREDICT ENGINE ----------------
app.get('/api/predict/runs', requireAuth, (req: AuthenticatedRequest, res) => {
  const companyId = req.activeCompanyId!;
  const snapshot = getActiveSnapshot(companyId);
  const rows = snapshot ? getCommercialRecordsForSnapshot(companyId, snapshot.id) : [];
  const channels = Array.from(new Set(rows.map((r) => r.channel))).sort();
  res.json({
    runs: listForecastRuns(companyId, 20),
    channels,
    activeSnapshot: snapshot,
  });
});

const predictSchema = z.object({
  modelType: z.enum(['SES', 'HOLT_WINTERS', 'LINEAR_REGRESSION']),
  metric: z.enum(['revenue', 'gross_margin', 'units']),
  horizon: z.number().int().min(1).max(12),
  scopeFilter: z.string().trim().min(1).max(80).default('ALL'),
});

app.post(
  '/api/predict/run',
  requireAuth,
  requirePermission('runPredict'),
  (req: AuthenticatedRequest, res) => {
    const parsed = predictSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({error: 'Invalid forecast parameters.'});
      return;
    }

    const user = req.authUser!;
    const companyId = req.activeCompanyId!;
    const snapshot = getActiveSnapshot(companyId);
    if (!snapshot) {
      res.status(400).json({error: 'No active dataset snapshot found.'});
      return;
    }
    if (parsed.data.metric === 'gross_margin' && !snapshot.hasCogs) {
      res.status(422).json({
        error: 'Gross margin forecast blocked: active snapshot lacks sufficient COGS data.',
      });
      return;
    }

    const rows = getCommercialRecordsForSnapshot(companyId, snapshot.id, {
      regionScope: user.regionScope,
      branchScope: user.branchScope,
    });

    try {
      const run = runForecastEngine({
        companyId,
        snapshotId: snapshot.id,
        rows,
        modelType: parsed.data.modelType,
        metric: parsed.data.metric,
        horizon: parsed.data.horizon,
        scopeFilter: parsed.data.scopeFilter,
        createdBy: user.email,
      });
      saveForecastRun(run);

      appendAuditLog({
        companyId,
        actorUserId: user.id,
        actorEmail: user.email,
        actorRole: user.roleId,
        action: 'FORECAST_EXECUTED',
        resourceType: 'forecast_run',
        resourceId: run.id,
        details: {
          modelType: run.modelType,
          metric: run.metric,
          mape: run.mape,
          naiveMape: run.naiveMape,
        },
      });

      res.status(201).json({run});
    } catch (err) {
      res.status(422).json({
        error: err instanceof Error ? err.message : 'Forecast calculation failed.',
      });
    }
  },
);

// ---------------- OPTIMIZE ENGINE ----------------
app.get('/api/optimize/runs', requireAuth, (req: AuthenticatedRequest, res) => {
  const companyId = req.activeCompanyId!;
  const snapshot = getActiveSnapshot(companyId);
  const rows = snapshot ? getCommercialRecordsForSnapshot(companyId, snapshot.id) : [];
  const defaultChannels = buildDefaultChannelInputs(rows);
  res.json({
    runs: listOptimizationRuns(companyId, 20),
    defaultChannels,
    activeSnapshot: snapshot,
  });
});

const optimizeChannelSchema = z.object({
  segment: z.string().trim().min(1).max(80),
  baselineSpend: z.number().min(0),
  baselineReturn: z.number().min(0),
  roiMultiplier: z.number().min(0.1).max(50),
  marginRate: z.number().min(0.01).max(0.99),
  minSpend: z.number().min(0),
  maxSpend: z.number().min(0),
});

const optimizeSchema = z.object({
  templateKey: z.enum(['budget_allocation', 'margin_mix', 'trade_promo']),
  totalBudget: z.number().min(0).optional(),
  maxActivePromos: z.number().int().min(1).max(20).optional(),
  channels: z.array(optimizeChannelSchema).optional(),
});

app.post(
  '/api/optimize/run',
  requireAuth,
  requirePermission('runOptimize'),
  async (req: AuthenticatedRequest, res) => {
    const parsed = optimizeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({error: 'Invalid optimization constraints payload.'});
      return;
    }

    const user = req.authUser!;
    const companyId = req.activeCompanyId!;
    const snapshot = getActiveSnapshot(companyId);
    if (!snapshot) {
      res.status(400).json({error: 'No active dataset snapshot available.'});
      return;
    }

    const rows = getCommercialRecordsForSnapshot(companyId, snapshot.id, {
      regionScope: user.regionScope,
      branchScope: user.branchScope,
    });

    try {
      const run = await runOptimizationEngine({
        companyId,
        snapshot,
        rows,
        templateKey: parsed.data.templateKey,
        totalBudget: parsed.data.totalBudget,
        maxActivePromos: parsed.data.maxActivePromos,
        channels: parsed.data.channels,
        createdBy: user.email,
      });

      saveOptimizationRun(run);
      appendAuditLog({
        companyId,
        actorUserId: user.id,
        actorEmail: user.email,
        actorRole: user.roleId,
        action: 'OPTIMIZATION_EXECUTED',
        resourceType: 'optimization_run',
        resourceId: run.id,
        details: {
          templateKey: run.templateKey,
          solverStatus: run.solverStatus,
          improvementPct: run.improvementPct,
        },
      });

      res.status(201).json({run});
    } catch (err) {
      console.error('Optimization solver error:', err);
      res.status(500).json({error: 'Mathematical solver encountered an execution failure.'});
    }
  },
);

// ---------------- DECISIONS WORKSPACE ----------------
app.get('/api/decisions', requireAuth, (req: AuthenticatedRequest, res) => {
  const companyId = req.activeCompanyId!;
  res.json({
    decisions: listDecisions(companyId),
    optimizations: listOptimizationRuns(companyId, 20),
  });
});

const createDecisionSchema = z.object({
  optimizationRunId: z.string().trim().min(1),
  title: z.string().trim().min(3).max(160),
  assumptions: z.string().trim().min(3).max(1000),
  risks: z.string().trim().min(3).max(1000),
  limitations: z.string().trim().min(3).max(1000),
});

app.post(
  '/api/decisions',
  requireAuth,
  requirePermission('runOptimize'),
  (req: AuthenticatedRequest, res) => {
    const parsed = createDecisionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({error: 'Decision title, assumptions, risks, and limitations are required.'});
      return;
    }

    const user = req.authUser!;
    const companyId = req.activeCompanyId!;
    const optRun = getOptimizationRunById(companyId, parsed.data.optimizationRunId);
    if (!optRun) {
      res.status(404).json({error: 'Referenced optimization run not found in tenant.'});
      return;
    }
    if (optRun.solverStatus !== 'OPTIMAL' && optRun.solverStatus !== 'FEASIBLE') {
      res.status(422).json({
        error: `Cannot package ${optRun.solverStatus} optimization run as an actionable decision.`,
      });
      return;
    }

    const decision = createDecisionDossier({
      companyId,
      optimizationRunId: optRun.id,
      title: parsed.data.title,
      assumptions: parsed.data.assumptions,
      risks: parsed.data.risks,
      limitations: parsed.data.limitations,
      createdBy: user.email,
    });

    appendAuditLog({
      companyId,
      actorUserId: user.id,
      actorEmail: user.email,
      actorRole: user.roleId,
      action: 'DECISION_CREATED',
      resourceType: 'decision_dossier',
      resourceId: decision.id,
      details: {optimizationRunId: optRun.id, title: decision.title},
    });

    res.status(201).json({decision});
  },
);

const reviewDecisionSchema = z.object({
  status: z.enum(['APPROVED', 'MODIFIED', 'REJECTED']),
  comment: z.string().trim().min(2).max(1000),
});

app.patch(
  '/api/decisions/:id/review',
  requireAuth,
  requirePermission('approveDecisions'),
  (req: AuthenticatedRequest, res) => {
    const parsed = reviewDecisionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({error: 'Decision status and reviewer commentary are required.'});
      return;
    }

    const user = req.authUser!;
    const companyId = req.activeCompanyId!;
    const updated = reviewDecision(
      companyId,
      req.params.id,
      parsed.data.status,
      parsed.data.comment,
      user.email,
    );
    if (!updated) {
      res.status(404).json({error: 'Decision dossier not found.'});
      return;
    }

    appendAuditLog({
      companyId,
      actorUserId: user.id,
      actorEmail: user.email,
      actorRole: user.roleId,
      action: `DECISION_${parsed.data.status}`,
      resourceType: 'decision_dossier',
      resourceId: updated.id,
      details: {comment: parsed.data.comment},
    });

    res.json({decision: updated});
  },
);

const executionSchema = z.object({
  executionRef: z.string().trim().min(2).max(120),
  actualOutcomeValue: z.number().nullable().optional(),
  actualOutcomeNotes: z.string().trim().max(1000).nullable().optional(),
});

app.patch(
  '/api/decisions/:id/execution',
  requireAuth,
  requirePermission('manageDetectAlerts'),
  (req: AuthenticatedRequest, res) => {
    const parsed = executionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({error: 'Execution Reference ID is required.'});
      return;
    }

    const user = req.authUser!;
    const companyId = req.activeCompanyId!;
    const updated = updateDecisionExecution(
      companyId,
      req.params.id,
      parsed.data.executionRef,
      parsed.data.actualOutcomeValue ?? null,
      parsed.data.actualOutcomeNotes ?? null,
    );
    if (!updated) {
      res.status(404).json({error: 'Decision dossier not found.'});
      return;
    }

    appendAuditLog({
      companyId,
      actorUserId: user.id,
      actorEmail: user.email,
      actorRole: user.roleId,
      action: 'DECISION_EXECUTION_LINKED',
      resourceType: 'decision_dossier',
      resourceId: updated.id,
      details: {
        executionRef: parsed.data.executionRef,
        actualOutcomeValue: parsed.data.actualOutcomeValue ?? null,
      },
    });

    res.json({decision: updated});
  },
);

// ---------------- DETECT ENGINE ----------------
app.get('/api/detect/alerts', requireAuth, (req: AuthenticatedRequest, res) => {
  res.json({alerts: listDetectAlerts(req.activeCompanyId!)});
});

app.post(
  '/api/detect/evaluate',
  requireAuth,
  requirePermission('manageDetectAlerts'),
  (req: AuthenticatedRequest, res) => {
    const user = req.authUser!;
    const companyId = req.activeCompanyId!;
    const company = getCompanyById(companyId);
    const snapshot = getActiveSnapshot(companyId);
    if (!company || !snapshot) {
      res.status(400).json({error: 'No active company or dataset snapshot available.'});
      return;
    }

    const rows = getCommercialRecordsForSnapshot(companyId, snapshot.id);
    const latestOpt = listOptimizationRuns(companyId, 1)[0] ?? null;
    const candidates = evaluateDetectRules({
      rows,
      currency: company.currency,
      latestOptimization: latestOpt,
    });

    const alerts = upsertEvaluatedAlerts(companyId, snapshot.id, candidates);

    appendAuditLog({
      companyId,
      actorUserId: user.id,
      actorEmail: user.email,
      actorRole: user.roleId,
      action: 'DETECT_EVALUATED',
      resourceType: 'detect_alerts',
      resourceId: snapshot.id,
      details: {rulesTriggered: candidates.length},
    });

    res.json({alerts, evaluatedRulesCount: candidates.length});
  },
);

const alertTransitionSchema = z.object({
  status: z.enum(['UNDER_REVIEW', 'RESOLVED', 'DISMISSED']),
  notes: z.string().trim().min(2).max(500),
});

app.patch(
  '/api/detect/alerts/:id',
  requireAuth,
  requirePermission('manageDetectAlerts'),
  (req: AuthenticatedRequest, res) => {
    const parsed = alertTransitionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({error: 'Target alert status and resolution notes are required.'});
      return;
    }

    const user = req.authUser!;
    const companyId = req.activeCompanyId!;
    const updated = transitionAlertStatus(
      companyId,
      req.params.id,
      parsed.data.status,
      parsed.data.notes,
      user.email,
    );
    if (!updated) {
      res.status(404).json({error: 'Alert not found in active tenant.'});
      return;
    }

    appendAuditLog({
      companyId,
      actorUserId: user.id,
      actorEmail: user.email,
      actorRole: user.roleId,
      action: `ALERT_${parsed.data.status}`,
      resourceType: 'detect_alert',
      resourceId: updated.id,
      details: {notes: parsed.data.notes},
    });

    res.json({alert: updated});
  },
);

// ---------------- AI WORKSPACE ----------------
const aiPromptSchema = z.object({
  prompt: z.string().trim().min(3).max(2000),
  language: z.enum(['en', 'ar']).default('en'),
});

app.post('/api/ai/analyze', requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = aiPromptSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({error: 'Prompt must be between 3 and 2000 characters.'});
    return;
  }

  const user = req.authUser!;
  const companyId = req.activeCompanyId!;
  const company = getCompanyById(companyId);
  if (!company) {
    res.status(404).json({error: 'Active tenant not found.'});
    return;
  }

  const snapshot = getActiveSnapshot(companyId);
  const rows = snapshot ? getCommercialRecordsForSnapshot(companyId, snapshot.id) : [];
  const kpiSummary = computeTenantKpis(rows);
  const latestForecast = listForecastRuns(companyId, 1)[0] ?? null;
  const latestOptimization = listOptimizationRuns(companyId, 1)[0] ?? null;
  const decisions = listDecisions(companyId);
  const alerts = listDetectAlerts(companyId);

  try {
    const result = await runGroundedGeminiAnalysis({
      prompt: parsed.data.prompt,
      language: parsed.data.language,
      company,
      snapshot,
      kpiSummary,
      latestForecast,
      latestOptimization,
      decisions,
      alerts,
    });

    appendAuditLog({
      companyId,
      actorUserId: user.id,
      actorEmail: user.email,
      actorRole: user.roleId,
      action: 'AI_ANALYSIS_QUERIED',
      resourceType: 'ai_workspace',
      resourceId: snapshot?.id ?? companyId,
      details: {model: result.model, language: parsed.data.language},
    });

    res.json(result);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'AI analysis failed due to upstream API error.';
    const statusCode = message.includes('GEMINI_API_KEY') ? 503 : 502;
    res.status(statusCode).json({error: message});
  }
});

// ---------------- REPORTS & BACKUP/RESTORE ----------------
app.get(
  '/api/reports/export',
  requireAuth,
  requirePermission('exportReports'),
  async (req: AuthenticatedRequest, res) => {
    const format = String(req.query.format || 'json').toLowerCase();
    const companyId = req.activeCompanyId!;
    const company = getCompanyById(companyId);
    if (!company) {
      res.status(404).json({error: 'Tenant not found.'});
      return;
    }

    const snapshot = getActiveSnapshot(companyId);
    const forecast = listForecastRuns(companyId, 1)[0] ?? null;
    const optimization = listOptimizationRuns(companyId, 1)[0] ?? null;
    const decisions = listDecisions(companyId);
    const alerts = listDetectAlerts(companyId);
    const slug = company.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    try {
      if (format === 'xlsx') {
        const buffer = await generateExcelReportBuffer({
          company,
          snapshot,
          forecast,
          optimization,
          decisions,
          alerts,
        });
        res.setHeader(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        );
        res.setHeader('Content-Disposition', `attachment; filename="tetra-os-${slug}.xlsx"`);
        res.send(buffer);
        return;
      }

      if (format === 'pdf') {
        const buffer = await generatePdfReportBuffer({
          company,
          snapshot,
          forecast,
          optimization,
          decisions,
          alerts,
        });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="tetra-os-${slug}.pdf"`);
        res.send(buffer);
        return;
      }

      if (format === 'csv') {
        const rows = snapshot ? getCommercialRecordsForSnapshot(companyId, snapshot.id) : [];
        const header =
          'period,region,branch,department,channel,product,revenue,cogs,marketing_spend,trade_spend,units,approved_target';
        const lines = rows.map((r) =>
          [
            r.period,
            r.region,
            r.branch,
            r.department,
            r.channel,
            r.product,
            r.revenue,
            r.cogs ?? '',
            r.marketingSpend ?? '',
            r.tradeSpend ?? '',
            r.units,
            r.approvedTarget,
          ]
            .map(escapeCsvCell)
            .join(','),
        );
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="tetra-os-${slug}.csv"`);
        res.send([header, ...lines].join('\n'));
        return;
      }

      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="tetra-os-${slug}.json"`);
      res.send(
        JSON.stringify(
          {
            exportedAt: new Date().toISOString(),
            company,
            snapshot,
            forecast,
            optimization,
            decisions,
            alerts,
          },
          null,
          2,
        ),
      );
    } catch (err) {
      console.error('Report export error:', err);
      res.status(500).json({error: 'Failed to generate enterprise report export.'});
    }
  },
);

app.get(
  '/api/admin/backup',
  requireAuth,
  requirePermission('manageUsers'),
  (req: AuthenticatedRequest, res) => {
    const companyId = req.activeCompanyId!;
    const backup = exportCompanyBackup(companyId);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="tetra-backup-${companyId}.json"`);
    res.send(JSON.stringify(backup, null, 2));
  },
);

const restoreSchema = z.object({
  activeSnapshotRecords: z
    .array(
      z.object({
        period: z.string().min(1),
        region: z.string().min(1),
        branch: z.string().min(1),
        department: z.string().min(1),
        channel: z.string().min(1),
        product: z.string().min(1),
        revenue: z.number().min(0),
        cogs: z.number().min(0).nullable(),
        marketingSpend: z.number().min(0).nullable(),
        tradeSpend: z.number().min(0).nullable(),
        units: z.number().min(0),
        approvedTarget: z.number().min(0),
      }),
    )
    .min(1),
});

app.post(
  '/api/admin/restore',
  requireAuth,
  requirePermission('manageUsers'),
  (req: AuthenticatedRequest, res) => {
    const parsed = restoreSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({error: 'Invalid backup payload structure.'});
      return;
    }

    const user = req.authUser!;
    const companyId = req.activeCompanyId!;
    const snapshot = restoreCompanyRecordsFromBackup(
      companyId,
      user.email,
      parsed.data.activeSnapshotRecords,
    );

    appendAuditLog({
      companyId,
      actorUserId: user.id,
      actorEmail: user.email,
      actorRole: user.roleId,
      action: 'BACKUP_RESTORED',
      resourceType: 'dataset_snapshot',
      resourceId: snapshot.id,
      details: {rowCount: snapshot.rowCount},
    });

    res.status(201).json({snapshot});
  },
);

// ---------------- USERS & AUDIT LOGS ----------------
app.get('/api/users', requireAuth, (req: AuthenticatedRequest, res) => {
  const companyId = req.activeCompanyId!;
  res.json({
    users: listUsersByCompany(companyId),
    roles: ENTERPRISE_ROLE_MATRIX,
  });
});

const createUserSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(160),
  roleId: z.enum(ROLE_IDS),
  regionScope: z.string().trim().min(1).max(80),
  branchScope: z.string().trim().min(1).max(80),
  departmentScope: z.string().trim().min(1).max(80),
  initialPassword: z.string().min(8).max(128).optional().or(z.literal('')),
});

app.post(
  '/api/users',
  requireAuth,
  requirePermission('manageUsers'),
  (req: AuthenticatedRequest, res) => {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({error: 'Invalid user invite details.'});
      return;
    }

    if (findUserByEmail(parsed.data.email)) {
      res.status(409).json({error: 'A user with this email already exists.'});
      return;
    }

    const actor = req.authUser!;
    const companyId = req.activeCompanyId!;
    const passwordHash = parsed.data.initialPassword
      ? hashPassword(parsed.data.initialPassword)
      : null;

    const created = createTenantUser({
      companyId,
      fullName: parsed.data.fullName,
      email: parsed.data.email,
      passwordHash,
      roleId: parsed.data.roleId,
      regionScope: parsed.data.regionScope,
      branchScope: parsed.data.branchScope,
      departmentScope: parsed.data.departmentScope,
    });

    appendAuditLog({
      companyId,
      actorUserId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.roleId,
      action: 'USER_PROVISIONED',
      resourceType: 'user',
      resourceId: created.id,
      details: {email: created.email, roleId: created.roleId, status: created.status},
    });

    res.status(201).json({user: created});
  },
);

const updateUserSchema = z.object({
  roleId: z.enum(ROLE_IDS).optional(),
  status: z.enum(['ACTIVE', 'PENDING_INVITE', 'SUSPENDED']).optional(),
});

app.patch(
  '/api/users/:id',
  requireAuth,
  requirePermission('manageUsers'),
  (req: AuthenticatedRequest, res) => {
    const parsed = updateUserSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({error: 'Invalid role or status update.'});
      return;
    }

    const actor = req.authUser!;
    const companyId = req.activeCompanyId!;
    if (req.params.id === actor.id && parsed.data.status === 'SUSPENDED') {
      res.status(400).json({error: 'You cannot suspend your own active administrator session.'});
      return;
    }

    const updated = updateTenantUser(req.params.id, companyId, {
      roleId: parsed.data.roleId,
      status: parsed.data.status as UserAccountStatus | undefined,
    });
    if (!updated) {
      res.status(404).json({error: 'User not found in active tenant.'});
      return;
    }

    appendAuditLog({
      companyId,
      actorUserId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.roleId,
      action: 'USER_UPDATED',
      resourceType: 'user',
      resourceId: updated.id,
      details: {roleId: updated.roleId, status: updated.status},
    });

    res.json({user: updated});
  },
);

app.get('/api/audit-logs', requireAuth, (req: AuthenticatedRequest, res) => {
  res.json({logs: listAuditLogs(req.activeCompanyId!, 60)});
});

// ---------------- FRONTEND SERVING (VITE DEV OR DIST PROD) ----------------
const distDir = path.resolve(process.cwd(), 'dist');
const isProdStart =
  process.env.NODE_ENV === 'production' ||
  process.env.npm_lifecycle_event === 'start';

async function startServer() {
  if (isProdStart && fs.existsSync(path.join(distDir, 'index.html'))) {
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const {createServer: createViteServer} = await import('vite');
    const vite = await createViteServer({
      server: {middlewareMode: true},
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const port = Number(process.env.PORT || 3000);
  app.listen(port, '0.0.0.0', () => {
    console.log(`TETRA OS server running on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start TETRA OS server:', err);
  process.exit(1);
});

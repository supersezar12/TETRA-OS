import test from 'node:test';
import assert from 'node:assert/strict';
import {hashPassword, signSessionToken, verifyPassword, verifySessionToken} from '../auth.ts';
import {roleHasPermission, type CommercialRow, type DatasetSnapshotRecord} from '../types.ts';
import {evaluateDetectRules} from './detect.ts';
import {parseCsvText, suggestColumnMapping, validateAndMapRows} from './ingestion.ts';
import {buildDefaultChannelInputs, runOptimizationEngine} from './optimize.ts';
import {runForecastEngine} from './predict.ts';

const SAMPLE_CSV = `period,channel,revenue,cogs,marketing_spend,trade_spend,units
2026-01,Modern Trade,42000,28000,4500,3200,900
2026-02,Modern Trade,44500,29500,4600,3300,940
2026-03,Modern Trade,46000,30500,4700,3400,980
2026-04,Modern Trade,48200,32000,4800,3500,1020
2026-05,Modern Trade,50100,33500,4900,3600,1060
2026-06,Modern Trade,43000,33000,4950,3650,920
2026-01,Wholesale,35000,25200,3000,3900,800
2026-02,Wholesale,36200,26100,3100,4000,830
2026-03,Wholesale,37500,27000,3200,4100,860
2026-04,Wholesale,38800,27900,3300,4200,890
2026-05,Wholesale,39500,28500,3400,4300,910
2026-06,Wholesale,40200,29000,3450,4350,925`;

test('ingestion parses CSV, computes READY quality, and gates missing COGS', () => {
  const parsed = parseCsvText(SAMPLE_CSV);
  const mapping = suggestColumnMapping(parsed.headers);
  const res = validateAndMapRows(parsed.rows, mapping);
  assert.equal(res.rows.length, 12);
  assert.equal(res.hasCogs, true);
  assert.equal(res.sufficiencyStatus, 'READY');

  const noCogsMapping = {...mapping};
  delete noCogsMapping.cogs;
  const partialRes = validateAndMapRows(parsed.rows, noCogsMapping);
  assert.equal(partialRes.hasCogs, false);
  assert.equal(partialRes.sufficiencyStatus, 'PARTIAL');
});

test('predict engine produces holdout backtest metrics and future confidence intervals', () => {
  const parsed = parseCsvText(SAMPLE_CSV);
  const validated = validateAndMapRows(parsed.rows, suggestColumnMapping(parsed.headers));
  const forecast = runForecastEngine({
    companyId: 'comp-test',
    snapshotId: 'snap-test',
    rows: validated.rows,
    modelType: 'HOLT_WINTERS',
    metric: 'revenue',
    horizon: 3,
    scopeFilter: 'ALL',
    createdBy: 'analyst@test.local',
  });
  assert.equal(forecast.points.length, 9);
  const futurePts = forecast.points.filter((p) => p.actual === null);
  assert.equal(futurePts.length, 3);
  assert.ok(futurePts[0].upper95 >= futurePts[0].forecast);
  assert.ok(futurePts[0].lower95 <= futurePts[0].forecast);
  assert.ok(forecast.mape >= 0);
});

test('HiGHS optimization engine returns OPTIMAL solution and authentic INFEASIBLE diagnostics', async () => {
  const parsed = parseCsvText(SAMPLE_CSV);
  const validated = validateAndMapRows(parsed.rows, suggestColumnMapping(parsed.headers));
  const snapshot: DatasetSnapshotRecord = {
    id: 'snap-1',
    companyId: 'comp-test',
    versionNumber: 1,
    sourceName: 'test.csv',
    sourceType: 'CSV',
    rowCount: validated.rows.length,
    qualityScore: 96,
    sufficiencyStatus: 'READY',
    hasCogs: true,
    hasSpend: true,
    missingFields: [],
    columnMapping: {},
    isActive: true,
    createdBy: 'tester',
    createdAt: new Date().toISOString(),
  };

  const optRun = await runOptimizationEngine({
    companyId: 'comp-test',
    snapshot,
    rows: validated.rows,
    templateKey: 'budget_allocation',
    createdBy: 'tester',
  });
  assert.equal(optRun.solverStatus, 'OPTIMAL');
  assert.ok(optRun.allocations.length === 2);
  assert.ok(optRun.optimizedTotal >= optRun.baselineTotal);
  assert.ok(optRun.sensitivity.length >= 1);

  const milpRun = await runOptimizationEngine({
    companyId: 'comp-test',
    snapshot,
    rows: validated.rows,
    templateKey: 'trade_promo',
    maxActivePromos: 1,
    createdBy: 'tester',
  });
  assert.equal(milpRun.solverStatus, 'OPTIMAL');
  assert.equal(milpRun.allocations.filter((a) => a.active !== false).length, 1);
  assert.ok(milpRun.sensitivity.some((s) => s.constraint === 'Max Active Promos Cap'));

  // Trigger infeasibility by setting budget below sum of channel minSpend
  const channels = buildDefaultChannelInputs(validated.rows);
  const infeasibleRun = await runOptimizationEngine({
    companyId: 'comp-test',
    snapshot,
    rows: validated.rows,
    templateKey: 'budget_allocation',
    totalBudget: 100,
    channels,
    createdBy: 'tester',
  });
  assert.equal(infeasibleRun.solverStatus, 'INFEASIBLE');
  assert.ok(infeasibleRun.diagnostics.includes('exceeds Total Budget'));

  // Trigger COGS sufficiency gate on margin_mix
  const blockedRun = await runOptimizationEngine({
    companyId: 'comp-test',
    snapshot: {...snapshot, hasCogs: false},
    rows: validated.rows,
    templateKey: 'margin_mix',
    createdBy: 'tester',
  });
  assert.equal(blockedRun.solverStatus, 'BLOCKED_INSUFFICIENT_DATA');
});

test('detect engine flags margin compression and concentration risk', () => {
  const parsed = parseCsvText(SAMPLE_CSV);
  const validated = validateAndMapRows(parsed.rows, suggestColumnMapping(parsed.headers));
  const alerts = evaluateDetectRules({
    rows: validated.rows as CommercialRow[],
    currency: 'SAR',
    latestOptimization: null,
  });
  assert.ok(alerts.some((a) => a.ruleCode === 'MARGIN_COMPRESSION_DRIFT'));
  assert.ok(alerts.some((a) => a.ruleCode === 'CHANNEL_CONCENTRATION_RISK'));
});

test('auth scrypt hashing, HMAC token verification, and 12-role RBAC enforcement', () => {
  const hash = hashPassword('StrongPass!2026');
  assert.equal(verifyPassword('StrongPass!2026', hash), true);
  assert.equal(verifyPassword('WrongPass', hash), false);

  const token = signSessionToken({
    userId: 'usr-admin',
    companyId: 'comp-alrayan',
    roleId: 'platform_super_admin',
  });
  const verified = verifySessionToken(token);
  assert.equal(verified?.userId, 'usr-admin');
  assert.equal(verifySessionToken(`${token}tampered`), null);

  assert.equal(roleHasPermission('platform_super_admin', 'approveDecisions'), true);
  assert.equal(roleHasPermission('data_analyst', 'approveDecisions'), false);
  assert.equal(roleHasPermission('read_only_user', 'ingestData'), false);
});

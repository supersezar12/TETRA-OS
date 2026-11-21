import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildScenarioCsv,
  buildScenarioReportPayload,
  computeScenarioSummary,
  escapeCsvCell,
  SAMPLE_OPTIMIZATION_SCENARIOS,
} from './optimizationSample';

test('computeScenarioSummary calculates totals, net delta, and percentage improvement', () => {
  const summary = computeScenarioSummary(
    SAMPLE_OPTIMIZATION_SCENARIOS.budget_allocation.points,
  );
  assert.equal(summary.baselineTotal, 1535);
  assert.equal(summary.optimizedTotal, 1815);
  assert.equal(summary.netDelta, 280);
  assert.equal(summary.improvementPct, 18.2);
});

test('computeScenarioSummary handles empty or zero-baseline arrays safely', () => {
  assert.deepEqual(computeScenarioSummary([]), {
    baselineTotal: 0,
    optimizedTotal: 0,
    netDelta: 0,
    improvementPct: 0,
  });

  assert.deepEqual(
    computeScenarioSummary([{segment: 'Test', baseline: 0, optimized: 120}]),
    {
      baselineTotal: 0,
      optimizedTotal: 120,
      netDelta: 120,
      improvementPct: 0,
    },
  );
});

test('all sample scenarios remain explicitly marked as illustrative demos', () => {
  for (const scenario of Object.values(SAMPLE_OPTIMIZATION_SCENARIOS)) {
    assert.equal(scenario.isIllustrativeDemo, true);
    assert.equal(scenario.solverStatus, 'OPTIMAL');
    assert.ok(scenario.points.length > 0);
  }
});

test('buildScenarioReportPayload generates a complete JSON summary with segment deltas', () => {
  const payload = buildScenarioReportPayload(
    SAMPLE_OPTIMIZATION_SCENARIOS.margin_mix,
    '2026-11-21T13:38:00.000Z',
  );

  assert.equal(payload.reportType, 'illustrative_optimization_summary');
  assert.equal(payload.isIllustrativeDemo, true);
  assert.equal(payload.generatedAt, '2026-11-21T13:38:00.000Z');
  assert.equal(payload.scenarioKey, 'margin_mix');
  assert.equal(payload.summary.netDelta, 239);
  assert.equal(payload.segments.length, 4);
  assert.equal(payload.segments[0]?.delta, 38);
});

test('buildScenarioCsv formats raw segment rows and guards against CSV formula injection', () => {
  const csv = buildScenarioCsv(SAMPLE_OPTIMIZATION_SCENARIOS.budget_allocation);
  const lines = csv.split('\n');

  assert.equal(
    lines[0],
    'scenario_key,period,currency,unit,segment,baseline,optimized,delta',
  );
  assert.equal(lines.length, 6);
  assert.match(lines[1] ?? '', /,Modern Trade,420,515,95$/);
  assert.equal(escapeCsvCell('=SUM(A1:A2)'), "'=SUM(A1:A2)");
  assert.equal(escapeCsvCell('Retail, East'), '"Retail, East"');
});

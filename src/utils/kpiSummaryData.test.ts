import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSampleKPIMetrics} from './kpiSummaryData';

test('buildSampleKPIMetrics returns exactly four KPI metrics with required metadata', () => {
  const metrics = buildSampleKPIMetrics();
  assert.equal(metrics.length, 4);

  for (const metric of metrics) {
    assert.ok(metric.id.length > 0);
    assert.ok(metric.label.length > 0);
    assert.ok(metric.value.length > 0);
    assert.ok(metric.unitAndPeriod.length > 0);
    assert.ok(metric.deltaLabel.length > 0);
    assert.ok(metric.basisNote.length > 0);
  }
});

test('KPI contribution and margin figures stay synchronized with optimization sample totals', () => {
  const metrics = buildSampleKPIMetrics();
  const contribution = metrics.find((m) => m.id === 'optimized-contribution');
  const margin = metrics.find((m) => m.id === 'margin-mix-uplift');

  assert.equal(contribution?.value, 'SAR 1,815K');
  assert.match(contribution?.deltaLabel ?? '', /\+18\.2%/);
  assert.equal(margin?.value, 'SAR 1,569K');
  assert.match(margin?.deltaLabel ?? '', /\+SAR 239K/);
});

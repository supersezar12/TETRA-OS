import {
  computeScenarioSummary,
  SAMPLE_OPTIMIZATION_SCENARIOS,
} from './optimizationSample';

export type MetricTrendTone = 'positive' | 'neutral' | 'attention';

export interface KPIMetric {
  id: string;
  label: string;
  value: string;
  unitAndPeriod: string;
  deltaLabel: string;
  basisNote: string;
  tone: MetricTrendTone;
}

export function buildSampleKPIMetrics(): KPIMetric[] {
  const budgetSummary = computeScenarioSummary(
    SAMPLE_OPTIMIZATION_SCENARIOS.budget_allocation.points,
  );
  const marginSummary = computeScenarioSummary(
    SAMPLE_OPTIMIZATION_SCENARIOS.margin_mix.points,
  );

  return [
    {
      id: 'optimized-contribution',
      label: 'Optimized Channel Contribution',
      value: `SAR ${budgetSummary.optimizedTotal.toLocaleString()}K`,
      unitAndPeriod: 'SAR Thousands · Q1–Q4 Sample',
      deltaLabel: `+${budgetSummary.improvementPct.toFixed(1)}% vs. baseline plan`,
      basisNote: 'LP Allocation Model (OPTIMAL)',
      tone: 'positive',
    },
    {
      id: 'margin-mix-uplift',
      label: 'COGS-Constrained Net Margin',
      value: `SAR ${marginSummary.optimizedTotal.toLocaleString()}K`,
      unitAndPeriod: 'SAR Thousands · Q1–Q4 Sample',
      deltaLabel: `+SAR ${marginSummary.netDelta.toLocaleString()}K (+${marginSummary.improvementPct.toFixed(1)}%)`,
      basisNote: 'MILP Pricing & Mix (COGS Validated)',
      tone: 'positive',
    },
    {
      id: 'forecast-target-alignment',
      label: 'Forecast-to-Target Alignment',
      value: '94.6%',
      unitAndPeriod: 'Attainment Ratio · Q1–Q4 Sample',
      deltaLabel: '5.4% gap to approved target',
      basisNote: 'Backtested Forecast vs. Target',
      tone: 'neutral',
    },
    {
      id: 'open-detect-alerts',
      label: 'Open Variance Alerts',
      value: '3 Active',
      unitAndPeriod: 'Detect Queue · Current Cycle',
      deltaLabel: '2 High / 1 Medium severity',
      basisNote: 'Status: OPEN & UNDER_REVIEW',
      tone: 'attention',
    },
  ];
}

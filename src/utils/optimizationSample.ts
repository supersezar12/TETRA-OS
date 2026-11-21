export type ScenarioKey = 'budget_allocation' | 'margin_mix';

export interface ComparisonPoint {
  segment: string;
  baseline: number;
  optimized: number;
}

export interface SampleOptimizationScenario {
  key: ScenarioKey;
  title: string;
  subtitle: string;
  unit: string;
  currency: string;
  period: string;
  solverLabel: string;
  solverStatus: 'OPTIMAL';
  isIllustrativeDemo: true;
  baselineLabel: string;
  optimizedLabel: string;
  points: ComparisonPoint[];
}

export interface ScenarioSummary {
  baselineTotal: number;
  optimizedTotal: number;
  netDelta: number;
  improvementPct: number;
}

export const SAMPLE_OPTIMIZATION_SCENARIOS: Record<ScenarioKey, SampleOptimizationScenario> = {
  budget_allocation: {
    key: 'budget_allocation',
    title: 'Channel Budget Allocation Improvement',
    subtitle:
      'Illustrative sample comparing historical static budget allocation against an LP-constrained reallocation model.',
    unit: 'SAR Thousands (Attributed Contribution)',
    currency: 'SAR',
    period: 'Q1–Q4 Sample Horizon',
    solverLabel: 'LP Budget Allocation Model (Sample)',
    solverStatus: 'OPTIMAL',
    isIllustrativeDemo: true,
    baselineLabel: 'Baseline Plan',
    optimizedLabel: 'Optimized Plan',
    points: [
      {segment: 'Modern Trade', baseline: 420, optimized: 515},
      {segment: 'Wholesale', baseline: 380, optimized: 410},
      {segment: 'Direct Key Accounts', baseline: 290, optimized: 375},
      {segment: 'E-Commerce', baseline: 185, optimized: 245},
      {segment: 'Regional Distributors', baseline: 260, optimized: 270},
    ],
  },
  margin_mix: {
    key: 'margin_mix',
    title: 'Portfolio Margin Mix Improvement',
    subtitle:
      'Illustrative sample comparing unoptimized discount rules against a COGS-constrained MILP pricing and mix plan.',
    unit: 'SAR Thousands (Net Margin)',
    currency: 'SAR',
    period: 'Q1–Q4 Sample Horizon',
    solverLabel: 'MILP Margin & Mix Model (Sample)',
    solverStatus: 'OPTIMAL',
    isIllustrativeDemo: true,
    baselineLabel: 'Historical Mix',
    optimizedLabel: 'Optimized Mix',
    points: [
      {segment: 'Q1', baseline: 310, optimized: 348},
      {segment: 'Q2', baseline: 335, optimized: 389},
      {segment: 'Q3', baseline: 325, optimized: 394},
      {segment: 'Q4', baseline: 360, optimized: 438},
    ],
  },
};

export interface ScenarioReportPayload {
  reportType: 'illustrative_optimization_summary';
  isIllustrativeDemo: true;
  generatedAt: string;
  scenarioKey: ScenarioKey;
  title: string;
  period: string;
  currency: string;
  unit: string;
  solverLabel: string;
  solverStatus: 'OPTIMAL';
  summary: ScenarioSummary;
  segments: Array<ComparisonPoint & {delta: number}>;
}

export function computeScenarioSummary(points: readonly ComparisonPoint[]): ScenarioSummary {
  const baselineTotal = points.reduce((sum, item) => sum + item.baseline, 0);
  const optimizedTotal = points.reduce((sum, item) => sum + item.optimized, 0);
  const netDelta = optimizedTotal - baselineTotal;
  const improvementPct =
    baselineTotal > 0 ? Number(((netDelta / baselineTotal) * 100).toFixed(1)) : 0;

  return {
    baselineTotal,
    optimizedTotal,
    netDelta,
    improvementPct,
  };
}

export function buildScenarioReportPayload(
  scenario: SampleOptimizationScenario,
  generatedAt = new Date().toISOString(),
): ScenarioReportPayload {
  return {
    reportType: 'illustrative_optimization_summary',
    isIllustrativeDemo: scenario.isIllustrativeDemo,
    generatedAt,
    scenarioKey: scenario.key,
    title: scenario.title,
    period: scenario.period,
    currency: scenario.currency,
    unit: scenario.unit,
    solverLabel: scenario.solverLabel,
    solverStatus: scenario.solverStatus,
    summary: computeScenarioSummary(scenario.points),
    segments: scenario.points.map((point) => ({
      ...point,
      delta: point.optimized - point.baseline,
    })),
  };
}

export function escapeCsvCell(value: string | number): string {
  const raw = String(value);
  const formulaSafe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  if (/[",\n\r]/.test(formulaSafe)) {
    return `"${formulaSafe.replaceAll('"', '""')}"`;
  }
  return formulaSafe;
}

export function buildScenarioCsv(scenario: SampleOptimizationScenario): string {
  const headers = [
    'scenario_key',
    'period',
    'currency',
    'unit',
    'segment',
    'baseline',
    'optimized',
    'delta',
  ];

  const rows = scenario.points.map((point) =>
    [
      scenario.key,
      scenario.period,
      scenario.currency,
      scenario.unit,
      point.segment,
      point.baseline,
      point.optimized,
      point.optimized - point.baseline,
    ]
      .map(escapeCsvCell)
      .join(','),
  );

  return [headers.join(','), ...rows].join('\n');
}

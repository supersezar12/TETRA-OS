import type {
  CommercialRow,
  ForecastPoint,
  ForecastRunRecord,
  PredictModelType,
} from '../types.ts';

interface AggregatedPeriod {
  period: string;
  value: number;
}

export function aggregateSeriesByPeriod(
  rows: readonly CommercialRow[],
  metric: 'revenue' | 'gross_margin' | 'units',
  channelFilter = 'ALL',
): AggregatedPeriod[] {
  const buckets = new Map<string, number>();
  for (const row of rows) {
    if (channelFilter !== 'ALL' && row.channel !== channelFilter) continue;
    let val = 0;
    if (metric === 'revenue') {
      val = row.revenue;
    } else if (metric === 'units') {
      val = row.units;
    } else {
      val = row.cogs !== null ? row.revenue - row.cogs : 0;
    }
    buckets.set(row.period, (buckets.get(row.period) ?? 0) + val);
  }
  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, value]) => ({period, value: Math.round(value)}));
}

function advancePeriodLabel(lastPeriod: string, offset: number): string {
  const match = /^(\d{4})-(\d{2})$/.exec(lastPeriod.trim());
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const totalMonths = year * 12 + (month - 1) + offset;
    const nextYear = Math.floor(totalMonths / 12);
    const nextMonth = (totalMonths % 12) + 1;
    return `${nextYear}-${String(nextMonth).padStart(2, '0')}`;
  }
  return `T+${offset}`;
}

function fitSes(values: number[], horizon: number): {
  fitted: number[];
  future: number[];
} {
  const alphas = [0.15, 0.3, 0.45, 0.6, 0.75];
  let bestAlpha = 0.3;
  let bestSse = Infinity;

  for (const alpha of alphas) {
    let level = values[0];
    let sse = 0;
    for (let i = 1; i < values.length; i++) {
      const err = values[i] - level;
      sse += err * err;
      level = alpha * values[i] + (1 - alpha) * level;
    }
    if (sse < bestSse) {
      bestSse = sse;
      bestAlpha = alpha;
    }
  }

  let level = values[0];
  const fitted: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    fitted.push(level);
    level = bestAlpha * values[i] + (1 - bestAlpha) * level;
  }

  const future = Array.from({length: horizon}, () => level);
  return {fitted, future};
}

function fitHoltWintersLinear(values: number[], horizon: number): {
  fitted: number[];
  future: number[];
} {
  const alpha = 0.4;
  const beta = 0.25;
  let level = values[0];
  let trend = values.length > 1 ? values[1] - values[0] : 0;
  const fitted: number[] = [values[0]];

  for (let i = 1; i < values.length; i++) {
    const forecast = level + trend;
    fitted.push(forecast);
    const prevLevel = level;
    level = alpha * values[i] + (1 - alpha) * (level + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
  }

  const future = Array.from({length: horizon}, (_, idx) => level + (idx + 1) * trend);
  return {fitted, future};
}

function fitLinearRegression(values: number[], horizon: number): {
  fitted: number[];
  future: number[];
} {
  const n = values.length;
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - meanX) * (values[i] - meanY);
    den += (i - meanX) * (i - meanX);
  }
  const slope = den > 0 ? num / den : 0;
  const intercept = meanY - slope * meanX;

  const fitted = values.map((_, i) => intercept + slope * i);
  const future = Array.from({length: horizon}, (_, idx) => intercept + slope * (n + idx));
  return {fitted, future};
}

function computeErrorMetrics(actuals: number[], preds: number[]): {
  mae: number;
  rmse: number;
  mape: number;
} {
  let absSum = 0;
  let sqSum = 0;
  let pctSum = 0;
  let pctCount = 0;

  for (let i = 0; i < actuals.length; i++) {
    const err = actuals[i] - preds[i];
    absSum += Math.abs(err);
    sqSum += err * err;
    if (actuals[i] > 0) {
      pctSum += Math.abs(err) / actuals[i];
      pctCount++;
    }
  }

  const n = Math.max(1, actuals.length);
  return {
    mae: Math.round(absSum / n),
    rmse: Math.round(Math.sqrt(sqSum / n)),
    mape: pctCount > 0 ? Number(((pctSum / pctCount) * 100).toFixed(2)) : 0,
  };
}

export function runForecastEngine(params: {
  companyId: string;
  snapshotId: string;
  rows: readonly CommercialRow[];
  modelType: PredictModelType;
  metric: 'revenue' | 'gross_margin' | 'units';
  horizon: number;
  scopeFilter: string;
  createdBy: string;
}): ForecastRunRecord {
  const series = aggregateSeriesByPeriod(params.rows, params.metric, params.scopeFilter);
  if (series.length < 4) {
    throw new Error(
      `Insufficient time-series history (${series.length} periods). Need at least 4 periods for backtesting.`,
    );
  }

  const values = series.map((s) => s.value);
  const holdoutSize = Math.min(3, Math.max(1, Math.floor(values.length / 4)));
  const trainValues = values.slice(0, values.length - holdoutSize);
  const testValues = values.slice(values.length - holdoutSize);

  const runModel = (input: number[], h: number) => {
    if (params.modelType === 'SES') return fitSes(input, h);
    if (params.modelType === 'HOLT_WINTERS') return fitHoltWintersLinear(input, h);
    return fitLinearRegression(input, h);
  };

  // Holdout backtest vs Naive baseline
  const backtest = runModel(trainValues, holdoutSize);
  const modelMetrics = computeErrorMetrics(testValues, backtest.future);

  const naivePreds = testValues.map((_, idx) =>
    idx === 0 ? trainValues[trainValues.length - 1] : testValues[idx - 1],
  );
  const naiveMetrics = computeErrorMetrics(testValues, naivePreds);

  // Full series fit + future horizon
  const fullFit = runModel(values, params.horizon);
  const residuals = values.map((v, i) => v - fullFit.fitted[i]);
  const sigma = Math.sqrt(
    residuals.reduce((sum, r) => sum + r * r, 0) / Math.max(1, residuals.length - 1),
  );

  const points: ForecastPoint[] = series.map((pt, idx) => {
    const f = Math.round(fullFit.fitted[idx]);
    const naive = idx > 0 ? values[idx - 1] : null;
    const band = Math.round(1.96 * sigma);
    return {
      period: pt.period,
      actual: pt.value,
      forecast: f,
      lower95: Math.max(0, f - band),
      upper95: f + band,
      naiveBaseline: naive,
    };
  });

  const lastPeriod = series[series.length - 1].period;
  fullFit.future.forEach((rawPred, idx) => {
    const step = idx + 1;
    const f = Math.max(0, Math.round(rawPred));
    const band = Math.round(1.96 * sigma * Math.sqrt(step));
    points.push({
      period: advancePeriodLabel(lastPeriod, step),
      actual: null,
      forecast: f,
      lower95: Math.max(0, f - band),
      upper95: f + band,
      naiveBaseline: Math.round(values[values.length - 1]),
    });
  });

  return {
    id: `fc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    companyId: params.companyId,
    snapshotId: params.snapshotId,
    modelType: params.modelType,
    metric: params.metric,
    horizon: params.horizon,
    scopeFilter: params.scopeFilter,
    mae: modelMetrics.mae,
    rmse: modelMetrics.rmse,
    mape: modelMetrics.mape,
    naiveMape: naiveMetrics.mape,
    points,
    createdBy: params.createdBy,
    createdAt: new Date().toISOString(),
  };
}

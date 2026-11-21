import {useEffect, useState} from 'react';
import {Play, TrendingUp} from 'lucide-react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {apiRequest} from '../utils/apiClient';

interface ForecastPoint {
  period: string;
  actual: number | null;
  forecast: number;
  lower95: number;
  upper95: number;
  naiveBaseline: number | null;
}

interface ForecastRun {
  id: string;
  modelType: 'SES' | 'HOLT_WINTERS' | 'LINEAR_REGRESSION';
  metric: 'revenue' | 'gross_margin' | 'units';
  horizon: number;
  scopeFilter: string;
  mae: number;
  rmse: number;
  mape: number;
  naiveMape: number;
  points: ForecastPoint[];
  createdAt: string;
}

interface PredictViewProps {
  token: string;
  companyId: string;
  currency: string;
}

export function PredictView({token, companyId, currency}: PredictViewProps) {
  const [runs, setRuns] = useState<ForecastRun[]>([]);
  const [channels, setChannels] = useState<string[]>([]);
  const [modelType, setModelType] = useState<'SES' | 'HOLT_WINTERS' | 'LINEAR_REGRESSION'>(
    'HOLT_WINTERS',
  );
  const [metric, setMetric] = useState<'revenue' | 'gross_margin' | 'units'>('revenue');
  const [horizon, setHorizon] = useState<number>(4);
  const [scopeFilter, setScopeFilter] = useState<string>('ALL');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRuns = async () => {
    try {
      const res = await apiRequest<{runs: ForecastRun[]; channels: string[]}>(
        '/api/predict/runs',
        {token, companyId},
      );
      setRuns(res.runs);
      setChannels(res.channels);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load forecast runs.');
    }
  };

  useEffect(() => {
    void loadRuns();
  }, [token, companyId]);

  const handleRunForecast = async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await apiRequest<{run: ForecastRun}>('/api/predict/run', {
        method: 'POST',
        token,
        companyId,
        body: {modelType, metric, horizon, scopeFilter},
      });
      setRuns((prev) => [res.run, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Forecast execution failed.');
    } finally {
      setRunning(false);
    }
  };

  const activeRun = runs[0] ?? null;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs sm:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
              PREDICT — Quantitative Forecasting
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
              Prediction Center &amp; Naive-Baseline Backtesting
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              Execute statistical time-series forecasts with holdout backtesting against a Naive
              persistence baseline and 95% confidence bands.
            </p>
          </div>
          <button
            type="button"
            disabled={running}
            onClick={() => void handleRunForecast()}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
          >
            <Play className="h-4 w-4" aria-hidden="true" />
            <span>{running ? 'Running Forecast...' : 'Run Forecast Model'}</span>
          </button>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Statistical Model
            </label>
            <select
              value={modelType}
              onChange={(e) => setModelType(e.target.value as ForecastRun['modelType'])}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
            >
              <option value="HOLT_WINTERS">Holt-Winters Linear Trend</option>
              <option value="SES">Simple Exponential Smoothing (SES)</option>
              <option value="LINEAR_REGRESSION">OLS Linear Regression</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Target Metric
            </label>
            <select
              value={metric}
              onChange={(e) => setMetric(e.target.value as ForecastRun['metric'])}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
            >
              <option value="revenue">Revenue ({currency})</option>
              <option value="gross_margin">Gross Margin ({currency})</option>
              <option value="units">Volume (Units)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Channel Scope
            </label>
            <select
              value={scopeFilter}
              onChange={(e) => setScopeFilter(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
            >
              <option value="ALL">All Channels</option>
              {channels.map((ch) => (
                <option key={ch} value={ch}>
                  {ch}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Horizon ({horizon} periods)
            </label>
            <input
              type="range"
              min={1}
              max={8}
              value={horizon}
              onChange={(e) => setHorizon(Number(e.target.value))}
              className="mt-3 w-full accent-slate-900"
            />
          </div>
        </div>
      </section>

      {error && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      {activeRun ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs sm:p-8">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-xs font-medium text-slate-500">Holdout MAPE</p>
              <p className="mt-1 text-xl font-semibold text-slate-900">{activeRun.mape}%</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-xs font-medium text-slate-500">Naive Baseline MAPE</p>
              <p className="mt-1 text-xl font-semibold text-slate-900">{activeRun.naiveMape}%</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-xs font-medium text-slate-500">Holdout RMSE</p>
              <p className="mt-1 text-xl font-semibold text-slate-900">
                {activeRun.rmse.toLocaleString()}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-xs font-medium text-slate-500">Model vs Naive</p>
              <p className="mt-1 text-xl font-semibold text-emerald-700">
                {activeRun.mape <= activeRun.naiveMape ? 'Outperforms' : 'Trailing Naive'}
              </p>
            </div>
          </div>

          <div className="mt-6 h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={activeRun.points}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="period" tick={{fontSize: 12, fill: '#475569'}} />
                <YAxis tick={{fontSize: 12, fill: '#475569'}} />
                <RechartsTooltip />
                <Area
                  type="monotone"
                  dataKey="upper95"
                  name="95% Upper Bound"
                  stroke="none"
                  fill="#cbd5e1"
                  fillOpacity={0.35}
                />
                <Line
                  type="monotone"
                  dataKey="actual"
                  name="Actual"
                  stroke="#0f172a"
                  strokeWidth={2.5}
                  dot={{r: 3}}
                />
                <Line
                  type="monotone"
                  dataKey="forecast"
                  name="Forecast"
                  stroke="#059669"
                  strokeWidth={2.5}
                  strokeDasharray="5 3"
                  dot={{r: 3}}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </section>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <TrendingUp className="h-8 w-8 text-slate-400" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium text-slate-800">No forecast runs persisted yet</p>
          <p className="mt-1 text-xs text-slate-500">
            Select a model and click Run Forecast Model to evaluate backtest metrics.
          </p>
        </div>
      )}
    </div>
  );
}

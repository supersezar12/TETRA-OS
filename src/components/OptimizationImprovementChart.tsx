import {useState} from 'react';
import {Download, FileSpreadsheet} from 'lucide-react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  buildScenarioCsv,
  buildScenarioReportPayload,
  computeScenarioSummary,
  SAMPLE_OPTIMIZATION_SCENARIOS,
  type ScenarioKey,
} from '../utils/optimizationSample';

const SCENARIO_KEYS: ScenarioKey[] = ['budget_allocation', 'margin_mix'];

function triggerFileDownload(content: string, mimeType: string, filename: string) {
  const blob = new Blob([content], {type: mimeType});
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export interface LiveOptimizationPreview {
  title: string;
  solverEngine: string;
  solverStatus: string;
  allocations: Array<{segment: string; baseline: number; optimized: number}>;
}

export function OptimizationImprovementChart({
  liveOptimization = null,
  liveCurrency = 'SAR',
}: {
  liveOptimization?: LiveOptimizationPreview | null;
  liveCurrency?: string;
}) {
  const [selectedKey, setSelectedKey] = useState<ScenarioKey>('budget_allocation');
  const [showBaselineTrend, setShowBaselineTrend] = useState(true);
  const [showOptimizedTrend, setShowOptimizedTrend] = useState(true);
  const [lastDownloadedFile, setLastDownloadedFile] = useState<string | null>(null);

  const sampleScenario = SAMPLE_OPTIMIZATION_SCENARIOS[selectedKey];
  const usingLive = Boolean(liveOptimization && liveOptimization.allocations.length > 0);
  const scenario = usingLive && liveOptimization
    ? {
        ...sampleScenario,
        title: liveOptimization.title,
        subtitle: `Executed via ${liveOptimization.solverEngine} against active tenant dataset snapshot.`,
        currency: liveCurrency,
        period: 'Active Tenant Snapshot',
        solverLabel: liveOptimization.solverEngine,
        solverStatus: liveOptimization.solverStatus as 'OPTIMAL',
        isIllustrativeDemo: false as unknown as true,
        points: liveOptimization.allocations.map((a) => ({
          segment: a.segment,
          baseline: Math.round(a.baseline / 1000),
          optimized: Math.round(a.optimized / 1000),
        })),
      }
    : sampleScenario;

  const summary = computeScenarioSummary(scenario.points);

  const handleDownloadReport = () => {
    const payload = buildScenarioReportPayload(scenario);
    const filename = `tetra-os-${scenario.key}-report.json`;
    triggerFileDownload(
      JSON.stringify(payload, null, 2),
      'application/json',
      filename,
    );
    setLastDownloadedFile(filename);
  };

  const handleExportCsv = () => {
    const csv = buildScenarioCsv(scenario);
    const filename = `tetra-os-${scenario.key}-raw-data.csv`;
    triggerFileDownload(csv, 'text/csv;charset=utf-8;', filename);
    setLastDownloadedFile(filename);
  };

  return (
    <section
      id="optimization-preview"
      aria-labelledby="optimization-preview-heading"
      className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs sm:mt-10 sm:p-8"
    >
      <div className="flex flex-col gap-4 border-b border-slate-100 pb-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
            <span
              className={`rounded-md px-2 py-0.5 font-mono ${
                usingLive
                  ? 'bg-emerald-50 text-emerald-800'
                  : 'bg-slate-100 text-slate-700'
              }`}
            >
              {usingLive ? 'LIVE HiGHS SOLVER' : 'ILLUSTRATIVE SAMPLE'}
            </span>
            <span>{scenario.period}</span>
            <span aria-hidden="true">&middot;</span>
            <span>Solver Status: {scenario.solverStatus}</span>
          </div>
          <h2
            id="optimization-preview-heading"
            className="mt-2 text-lg font-semibold tracking-tight text-slate-900 sm:text-xl"
          >
            {scenario.title}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">
            {scenario.subtitle}
          </p>
        </div>

        <div className="flex w-full flex-col gap-2 lg:w-auto lg:items-end">
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center lg:justify-end">
            <div
              role="group"
              aria-label="Sample optimization scenario selector"
              className="inline-flex w-full flex-col gap-2 sm:w-auto sm:flex-row"
            >
              {SCENARIO_KEYS.map((key) => {
                const isActive = key === selectedKey;
                const label =
                  key === 'budget_allocation' ? 'Budget Allocation' : 'Margin Mix';
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => {
                      setSelectedKey(key);
                      setLastDownloadedFile(null);
                    }}
                    className={`rounded-lg border px-3.5 py-2 text-xs font-medium transition-colors sm:text-sm ${
                      isActive
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <button
                type="button"
                onClick={handleDownloadReport}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 sm:text-sm"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                <span>Download Report</span>
              </button>

              <button
                type="button"
                onClick={handleExportCsv}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 sm:text-sm"
              >
                <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
                <span>Export as CSV</span>
              </button>
            </div>
          </div>

          {lastDownloadedFile && (
            <p
              role="status"
              aria-live="polite"
              className="text-xs text-emerald-700"
            >
              Generated {lastDownloadedFile}
            </p>
          )}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
          <p className="text-xs font-medium text-slate-500">
            {scenario.baselineLabel} Total
          </p>
          <p className="mt-1 font-mono text-xl font-semibold text-slate-900">
            {scenario.currency} {summary.baselineTotal.toLocaleString()}K
          </p>
        </div>
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
          <p className="text-xs font-medium text-slate-500">
            {scenario.optimizedLabel} Total
          </p>
          <p className="mt-1 font-mono text-xl font-semibold text-slate-900">
            {scenario.currency} {summary.optimizedTotal.toLocaleString()}K
          </p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
          <p className="text-xs font-medium text-emerald-800">
            Simulated Optimization Lift
          </p>
          <p className="mt-1 font-mono text-xl font-semibold text-emerald-900">
            +{scenario.currency} {summary.netDelta.toLocaleString()}K (+
            {summary.improvementPct.toFixed(1)}%)
          </p>
        </div>
      </div>

      <div className="mt-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-0.5 text-xs text-slate-500">
            <span>Unit: {scenario.unit}</span>
            <span>Source: {scenario.solverLabel}</span>
          </div>

          <div
            role="group"
            aria-label="Trend line visibility toggles"
            className="flex flex-wrap items-center gap-2"
          >
            <span className="text-xs font-medium text-slate-500">
              Trend Lines:
            </span>
            <button
              type="button"
              aria-pressed={showBaselineTrend}
              onClick={() => setShowBaselineTrend((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                showBaselineTrend
                  ? 'border-slate-500 bg-slate-100 text-slate-900'
                  : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
              }`}
            >
              <span
                aria-hidden="true"
                className="h-0.5 w-3 border-t-2 border-dashed border-slate-600"
              />
              <span>Baseline Trend</span>
            </button>
            <button
              type="button"
              aria-pressed={showOptimizedTrend}
              onClick={() => setShowOptimizedTrend((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                showOptimizedTrend
                  ? 'border-emerald-600 bg-emerald-50 text-emerald-900'
                  : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
              }`}
            >
              <span
                aria-hidden="true"
                className="h-0.5 w-3 bg-emerald-600"
              />
              <span>Optimized Trend</span>
            </button>
          </div>
        </div>

        <div
          data-testid="optimization-chart-container"
          className="h-72 w-full sm:h-80"
        >
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <ComposedChart
              data={scenario.points}
              margin={{top: 12, right: 16, left: 0, bottom: 8}}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis
                dataKey="segment"
                tick={{fill: '#475569', fontSize: 12}}
                axisLine={{stroke: '#cbd5e1'}}
                tickLine={false}
              />
              <YAxis
                tick={{fill: '#475569', fontSize: 12}}
                axisLine={false}
                tickLine={false}
                width={48}
              />
              <Tooltip
                cursor={{fill: '#f1f5f9'}}
                contentStyle={{
                  borderRadius: '0.5rem',
                  borderColor: '#cbd5e1',
                  fontSize: '0.75rem',
                }}
                formatter={(value: unknown) => [
                  `${scenario.currency} ${Number(value).toLocaleString()}K`,
                ]}
              />
              <Legend wrapperStyle={{fontSize: '0.75rem', paddingTop: '8px'}} />
              <Bar
                dataKey="baseline"
                name={scenario.baselineLabel}
                fill="#94a3b8"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="optimized"
                name={scenario.optimizedLabel}
                fill="#0f172a"
                radius={[4, 4, 0, 0]}
              />
              {showBaselineTrend && (
                <Line
                  type="monotone"
                  dataKey="baseline"
                  name="Baseline Trend"
                  stroke="#475569"
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  dot={{r: 3.5, fill: '#475569', strokeWidth: 0}}
                  activeDot={{r: 5}}
                  tooltipType="none"
                />
              )}
              {showOptimizedTrend && (
                <Line
                  type="monotone"
                  dataKey="optimized"
                  name="Optimized Trend"
                  stroke="#059669"
                  strokeWidth={2.5}
                  dot={{r: 4, fill: '#059669', stroke: '#ffffff', strokeWidth: 1.5}}
                  activeDot={{r: 5.5}}
                  tooltipType="none"
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}

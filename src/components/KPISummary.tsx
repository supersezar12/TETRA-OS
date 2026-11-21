import {
  Activity,
  AlertTriangle,
  BarChart3,
  TrendingUp,
} from 'lucide-react';
import {
  buildSampleKPIMetrics,
  type MetricTrendTone,
} from '../utils/kpiSummaryData';

const METRIC_ICONS = {
  'optimized-contribution': TrendingUp,
  'margin-mix-uplift': BarChart3,
  'forecast-target-alignment': Activity,
  'open-detect-alerts': AlertTriangle,
} as const;

const TONE_BADGE_STYLES: Record<MetricTrendTone, string> = {
  positive: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  neutral: 'bg-slate-100 text-slate-700 border-slate-200',
  attention: 'bg-amber-50 text-amber-800 border-amber-200',
};

export interface LiveOverviewData {
  company: {name: string; currency: string} | null;
  snapshot: {versionNumber: number; qualityScore: number; sufficiencyStatus: string} | null;
  kpis: {
    totalRevenue: number;
    grossMarginPct: number | null;
    totalMarketingSpend: number;
    totalTradeSpend: number;
    targetVariancePct: number;
  };
  openAlertsCount: number;
}

export function KPISummary({liveOverview = null}: {liveOverview?: LiveOverviewData | null}) {
  const sampleMetrics = buildSampleKPIMetrics();
  const currency = liveOverview?.company?.currency ?? 'SAR';

  const metrics = liveOverview
    ? [
        {
          id: 'optimized-contribution',
          label: 'Total Snapshot Revenue',
          value: `${currency} ${Math.round(liveOverview.kpis.totalRevenue / 1000).toLocaleString()}K`,
          unitAndPeriod: `Snapshot v${liveOverview.snapshot?.versionNumber ?? 1}`,
          deltaLabel: `Quality ${liveOverview.snapshot?.qualityScore ?? 0}%`,
          basisNote: `${liveOverview.company?.name ?? 'Active Tenant'} (${liveOverview.snapshot?.sufficiencyStatus ?? 'READY'})`,
          tone: 'positive' as MetricTrendTone,
        },
        {
          id: 'margin-mix-uplift',
          label: 'Gross Margin Ratio',
          value:
            liveOverview.kpis.grossMarginPct !== null
              ? `${liveOverview.kpis.grossMarginPct}%`
              : 'Gated (No COGS)',
          unitAndPeriod: 'COGS-Verified Scope',
          deltaLabel: `Spend ${currency} ${Math.round((liveOverview.kpis.totalMarketingSpend + liveOverview.kpis.totalTradeSpend) / 1000).toLocaleString()}K`,
          basisNote: 'Marketing + Trade Commercial Spend',
          tone: (liveOverview.kpis.grossMarginPct !== null ? 'positive' : 'attention') as MetricTrendTone,
        },
        {
          id: 'forecast-target-alignment',
          label: 'Revenue vs Target Gap',
          value: `${liveOverview.kpis.targetVariancePct >= 0 ? '+' : ''}${liveOverview.kpis.targetVariancePct}%`,
          unitAndPeriod: 'Actual vs Approved Target',
          deltaLabel:
            liveOverview.kpis.targetVariancePct >= 0 ? 'On / Above Target' : 'Variance Detected',
          basisNote: 'Targets strictly separated from Forecasts',
          tone: (liveOverview.kpis.targetVariancePct >= -3 ? 'neutral' : 'attention') as MetricTrendTone,
        },
        {
          id: 'open-detect-alerts',
          label: 'Open Detect Alerts',
          value: `${liveOverview.openAlertsCount} Active`,
          unitAndPeriod: 'DETECT Lifecycle Queue',
          deltaLabel: liveOverview.openAlertsCount > 0 ? 'Action Required' : 'Clear',
          basisNote: 'Variance, Margin Drift & Risk Rules',
          tone: (liveOverview.openAlertsCount > 0 ? 'attention' : 'positive') as MetricTrendTone,
        },
      ]
    : sampleMetrics;

  return (
    <section
      id="kpi-summary"
      aria-labelledby="kpi-summary-heading"
      className="mt-8 sm:mt-10"
    >
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2
              id="kpi-summary-heading"
              className="text-lg font-semibold tracking-tight text-slate-900 sm:text-xl"
            >
              Commercial Performance Snapshot
            </h2>
            <span
              className={`rounded-md px-2 py-0.5 font-mono text-[11px] font-medium ${
                liveOverview
                  ? 'bg-emerald-50 text-emerald-800'
                  : 'bg-slate-100 text-slate-700'
              }`}
            >
              {liveOverview
                ? `LIVE SNAPSHOT v${liveOverview.snapshot?.versionNumber ?? 1}`
                : 'SAMPLE DATA'}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-slate-500">
            High-level commercial metrics anchored to currency, period, and model basis.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-4">
        {metrics.map((metric) => {
          const Icon =
            METRIC_ICONS[metric.id as keyof typeof METRIC_ICONS] ?? Activity;

          return (
            <article
              key={metric.id}
              data-testid={`kpi-card-${metric.id}`}
              className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-xs"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-xs font-medium text-slate-500">
                    {metric.label}
                  </p>
                  <span
                    aria-hidden="true"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-600"
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                </div>

                <p className="mt-3 font-mono text-2xl font-semibold tracking-tight text-slate-900">
                  {metric.value}
                </p>

                <p className="mt-1 text-xs text-slate-500">
                  {metric.unitAndPeriod}
                </p>
              </div>

              <div className="mt-4 border-t border-slate-100 pt-3">
                <span
                  className={`inline-block rounded-md border px-2 py-0.5 text-xs font-medium ${TONE_BADGE_STYLES[metric.tone]}`}
                >
                  {metric.deltaLabel}
                </span>
                <p className="mt-2 text-[11px] text-slate-500">
                  {metric.basisNote}
                </p>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

import {useEffect, useState, type FormEvent} from 'react';
import {AlertTriangle, CheckCircle2, FileCheck2, Play} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {apiRequest} from '../utils/apiClient';

interface ChannelInput {
  segment: string;
  baselineSpend: number;
  baselineReturn: number;
  roiMultiplier: number;
  marginRate: number;
  minSpend: number;
  maxSpend: number;
}

interface OptimizationRun {
  id: string;
  templateKey: 'budget_allocation' | 'margin_mix' | 'trade_promo';
  title: string;
  solverEngine: string;
  solverStatus: string;
  objectiveValue: number;
  baselineTotal: number;
  optimizedTotal: number;
  netDelta: number;
  improvementPct: number;
  totalBudget: number;
  allocations: Array<{
    segment: string;
    baseline: number;
    optimized: number;
    recommendedSpend: number;
    baselineSpend: number;
    delta: number;
    shadowPrice: number;
    active: boolean;
  }>;
  sensitivity: Array<{constraint: string; status: string; slack: number; dualValue: number}>;
  diagnostics: string;
  executionMs: number;
  createdAt: string;
}

interface OptimizeViewProps {
  token: string;
  companyId: string;
  currency: string;
  onDecisionCreated?: () => void;
}

export function OptimizeView({
  token,
  companyId,
  currency,
  onDecisionCreated,
}: OptimizeViewProps) {
  const [templateKey, setTemplateKey] = useState<
    'budget_allocation' | 'margin_mix' | 'trade_promo'
  >('budget_allocation');
  const [channels, setChannels] = useState<ChannelInput[]>([]);
  const [totalBudget, setTotalBudget] = useState<number>(0);
  const [runs, setRuns] = useState<OptimizationRun[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Package as decision state
  const [showDossierForm, setShowDossierForm] = useState(false);
  const [dossierTitle, setDossierTitle] = useState('');
  const [assumptions, setAssumptions] = useState(
    'Channel marginal return segments remain valid within +/-15% spend bounds over the horizon.',
  );
  const [risks, setRisks] = useState(
    'Competitor promotional response or lead-time bottlenecks in high-growth channels.',
  );
  const [limitations, setLimitations] = useState(
    'Assumes deterministic demand elasticities without cross-channel cannibalization.',
  );
  const [dossierSuccess, setDossierSuccess] = useState<string | null>(null);

  const loadOptimizationData = async () => {
    try {
      const res = await apiRequest<{
        runs: OptimizationRun[];
        defaultChannels: ChannelInput[];
      }>('/api/optimize/runs', {token, companyId});
      setRuns(res.runs);
      setChannels(res.defaultChannels);
      const sumSpend = res.defaultChannels.reduce((s, c) => s + c.baselineSpend, 0);
      setTotalBudget(sumSpend);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load optimization data.');
    }
  };

  useEffect(() => {
    void loadOptimizationData();
  }, [token, companyId]);

  const handleSolve = async () => {
    setRunning(true);
    setError(null);
    setDossierSuccess(null);
    try {
      const res = await apiRequest<{run: OptimizationRun}>('/api/optimize/run', {
        method: 'POST',
        token,
        companyId,
        body: {
          templateKey,
          totalBudget,
          channels,
        },
      });
      setRuns((prev) => [res.run, ...prev]);
      setDossierTitle(`Approve ${res.run.title} (+${res.run.improvementPct}%)`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Solver execution failed.');
    } finally {
      setRunning(false);
    }
  };

  const handleCreateDecision = async (e: FormEvent) => {
    e.preventDefault();
    const activeRun = runs[0];
    if (!activeRun) return;
    setError(null);
    try {
      const res = await apiRequest<{decision: {id: string; title: string}}>('/api/decisions', {
        method: 'POST',
        token,
        companyId,
        body: {
          optimizationRunId: activeRun.id,
          title: dossierTitle || activeRun.title,
          assumptions,
          risks,
          limitations,
        },
      });
      setShowDossierForm(false);
      setDossierSuccess(
        `Decision Dossier "${res.decision.title}" created (${res.decision.id}) and routed to Decision Workspace for management approval.`,
      );
      onDecisionCreated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create decision dossier.');
    }
  };

  const activeRun = runs[0] ?? null;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs sm:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
              OPTIMIZE — HiGHS WASM LP / MILP Solver
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
              Optimization Center &amp; Constraint Studio
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              Configure commercial problem templates and min/max bounds. Executes real HiGHS LP/MILP
              optimization with authentic status diagnostics and sensitivity duals.
            </p>
          </div>
          <button
            type="button"
            disabled={running}
            onClick={() => void handleSolve()}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
          >
            <Play className="h-4 w-4" aria-hidden="true" />
            <span>{running ? 'Solving LP/MILP...' : 'Run HiGHS Solver'}</span>
          </button>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Problem Template
            </label>
            <select
              value={templateKey}
              onChange={(e) =>
                setTemplateKey(e.target.value as OptimizationRun['templateKey'])
              }
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
            >
              <option value="budget_allocation">Channel Budget Allocation (Piecewise LP)</option>
              <option value="margin_mix">Portfolio Margin &amp; Pricing Mix (COGS-Gated LP)</option>
              <option value="trade_promo">Trade Marketing Promo Selection (Binary MILP)</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="opt-total-budget"
              className="block text-xs font-semibold uppercase tracking-wide text-slate-500"
            >
              Total Spend Budget Cap ({currency})
            </label>
            <input
              id="opt-total-budget"
              type="number"
              min={0}
              value={totalBudget}
              onChange={(e) => setTotalBudget(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
            />
          </div>
        </div>

        {channels.length > 0 && (
          <div className="mt-5 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-3 py-2 font-semibold">Segment</th>
                  <th className="px-3 py-2 font-semibold">ROI Mult.</th>
                  <th className="px-3 py-2 font-semibold">Margin %</th>
                  <th className="px-3 py-2 font-semibold">Min Spend ({currency})</th>
                  <th className="px-3 py-2 font-semibold">Max Spend ({currency})</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {channels.map((ch, idx) => (
                  <tr key={ch.segment}>
                    <td className="px-3 py-2 font-medium text-slate-900">{ch.segment}</td>
                    <td className="px-3 py-2 font-mono text-slate-700">{ch.roiMultiplier}x</td>
                    <td className="px-3 py-2 font-mono text-slate-700">
                      {(ch.marginRate * 100).toFixed(1)}%
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        aria-label={`${ch.segment} min spend`}
                        value={ch.minSpend}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setChannels((prev) =>
                            prev.map((item, i) => (i === idx ? {...item, minSpend: val} : item)),
                          );
                        }}
                        className="w-24 rounded border border-slate-200 px-2 py-1 text-xs"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        aria-label={`${ch.segment} max spend`}
                        value={ch.maxSpend}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setChannels((prev) =>
                            prev.map((item, i) => (i === idx ? {...item, maxSpend: val} : item)),
                          );
                        }}
                        className="w-24 rounded border border-slate-200 px-2 py-1 text-xs"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {error && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      {dossierSuccess && (
        <div role="status" className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
          <span>{dossierSuccess}</span>
        </div>
      )}

      {activeRun && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs sm:p-8">
          <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold ${
                    activeRun.solverStatus === 'OPTIMAL'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : 'border-rose-200 bg-rose-50 text-rose-800'
                  }`}
                >
                  {activeRun.solverStatus === 'OPTIMAL' ? (
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {activeRun.solverStatus}
                </span>
                <span className="font-mono text-xs text-slate-500">
                  {activeRun.solverEngine} · {activeRun.executionMs} ms
                </span>
              </div>
              <h2 className="mt-2 text-lg font-semibold text-slate-900">{activeRun.title}</h2>
              <p className="mt-1 text-sm text-slate-600">{activeRun.diagnostics}</p>
            </div>

            {activeRun.solverStatus === 'OPTIMAL' && (
              <button
                type="button"
                onClick={() => setShowDossierForm((prev) => !prev)}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-900 bg-slate-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-slate-800"
              >
                <FileCheck2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Package as Decision Dossier</span>
              </button>
            )}
          </div>

          {showDossierForm && (
            <form
              onSubmit={handleCreateDecision}
              className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-700">Dossier Title</label>
                <input
                  type="text"
                  required
                  value={dossierTitle}
                  onChange={(e) => setDossierTitle(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm"
                />
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Assumptions</label>
                  <textarea
                    rows={2}
                    required
                    value={assumptions}
                    onChange={(e) => setAssumptions(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Key Risks</label>
                  <textarea
                    rows={2}
                    required
                    value={risks}
                    onChange={(e) => setRisks(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Limitations</label>
                  <textarea
                    rows={2}
                    required
                    value={limitations}
                    onChange={(e) => setLimitations(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 text-xs"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowDossierForm(false)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white"
                >
                  Submit for Management Review
                </button>
              </div>
            </form>
          )}

          {activeRun.solverStatus === 'OPTIMAL' && activeRun.allocations.length > 0 && (
            <>
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                  <p className="text-xs font-medium text-slate-500">Baseline Value</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">
                    {currency} {activeRun.baselineTotal.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
                  <p className="text-xs font-medium text-emerald-700">Optimized Value</p>
                  <p className="mt-1 text-lg font-semibold text-emerald-950">
                    {currency} {activeRun.optimizedTotal.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                  <p className="text-xs font-medium text-slate-500">Incremental Gain</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">
                    +{currency} {activeRun.netDelta.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                  <p className="text-xs font-medium text-slate-500">Lift Percentage</p>
                  <p className="mt-1 text-lg font-semibold text-emerald-700">
                    +{activeRun.improvementPct}%
                  </p>
                </div>
              </div>

              <div className="mt-6 h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={activeRun.allocations}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="segment" tick={{fontSize: 12, fill: '#475569'}} />
                    <YAxis tick={{fontSize: 12, fill: '#475569'}} />
                    <RechartsTooltip />
                    <Legend />
                    <Bar dataKey="baseline" name="Baseline" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="optimized" name="HiGHS Optimized" fill="#0f172a" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {activeRun.sensitivity.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-sm font-semibold text-slate-900">
                    Sensitivity &amp; Binding Constraints
                  </h3>
                  <div className="mt-2 overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                      <thead className="bg-slate-50 text-slate-600">
                        <tr>
                          <th className="px-3 py-2 font-semibold">Constraint</th>
                          <th className="px-3 py-2 font-semibold">Status</th>
                          <th className="px-3 py-2 font-semibold">Slack</th>
                          <th className="px-3 py-2 font-semibold">Shadow Price (Dual)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {activeRun.sensitivity.map((s) => (
                          <tr key={s.constraint}>
                            <td className="px-3 py-2 font-medium text-slate-900">{s.constraint}</td>
                            <td className="px-3 py-2 font-mono text-slate-600">{s.status}</td>
                            <td className="px-3 py-2 font-mono text-slate-700">{s.slack}</td>
                            <td className="px-3 py-2 font-mono text-slate-700">{s.dualValue}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}

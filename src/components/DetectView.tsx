import {useEffect, useState} from 'react';
import {Activity, AlertCircle, CheckCircle2, RefreshCw} from 'lucide-react';
import {apiRequest} from '../utils/apiClient';

interface DetectAlert {
  id: string;
  ruleCode: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  category: string;
  title: string;
  description: string;
  metricValue: number;
  thresholdValue: number;
  status: 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED' | 'DISMISSED';
  parentAlertId: string | null;
  occurrenceCount: number;
  resolutionNotes: string | null;
  updatedBy: string | null;
  updatedAt: string;
}

interface DetectViewProps {
  token: string;
  companyId: string;
}

export function DetectView({token, companyId}: DetectViewProps) {
  const [alerts, setAlerts] = useState<DetectAlert[]>([]);
  const [notesById, setNotesById] = useState<Record<string, string>>({});
  const [evaluating, setEvaluating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const loadAlerts = async () => {
    try {
      const res = await apiRequest<{alerts: DetectAlert[]}>('/api/detect/alerts', {
        token,
        companyId,
      });
      setAlerts(res.alerts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load alerts.');
    }
  };

  useEffect(() => {
    void loadAlerts();
  }, [token, companyId]);

  const handleEvaluate = async () => {
    setEvaluating(true);
    setError(null);
    setStatusMsg(null);
    try {
      const res = await apiRequest<{alerts: DetectAlert[]; evaluatedRulesCount: number}>(
        '/api/detect/evaluate',
        {method: 'POST', token, companyId},
      );
      setAlerts(res.alerts);
      setStatusMsg(
        `Evaluated commercial variance, margin drift, and risk rules (${res.evaluatedRulesCount} active conditions flagged).`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Detect rule evaluation failed.');
    } finally {
      setEvaluating(false);
    }
  };

  const handleTransition = async (
    alertId: string,
    status: 'UNDER_REVIEW' | 'RESOLVED' | 'DISMISSED',
  ) => {
    setError(null);
    setStatusMsg(null);
    try {
      const notes =
        notesById[alertId]?.trim() || `Transitioned to ${status} from Detect Center.`;
      const res = await apiRequest<{alert: DetectAlert}>(`/api/detect/alerts/${alertId}`, {
        method: 'PATCH',
        token,
        companyId,
        body: {status, notes},
      });
      setAlerts((prev) => prev.map((a) => (a.id === alertId ? res.alert : a)));
      setStatusMsg(`Alert ${alertId} transitioned to ${status}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Alert status transition failed.');
    }
  };

  const severityBadge = (sev: DetectAlert['severity']) => {
    if (sev === 'HIGH') return 'border-rose-200 bg-rose-50 text-rose-800';
    if (sev === 'MEDIUM') return 'border-amber-200 bg-amber-50 text-amber-800';
    return 'border-sky-200 bg-sky-50 text-sky-800';
  };

  const statusBadge = (status: DetectAlert['status']) => {
    if (status === 'OPEN') return 'border-rose-200 bg-rose-50 text-rose-800';
    if (status === 'UNDER_REVIEW') return 'border-sky-200 bg-sky-50 text-sky-800';
    if (status === 'RESOLVED') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
    return 'border-slate-200 bg-slate-100 text-slate-700';
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
              DETECT — Variance, Drift &amp; Risk Engine
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
              Detect Center &amp; Immutable Alert Lifecycle
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              Continuously compares actual commercial snapshots against approved targets,
              historical margins, concentration caps, and unclaimed optimization lift.
            </p>
          </div>
          <button
            type="button"
            disabled={evaluating}
            onClick={() => void handleEvaluate()}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            <span>{evaluating ? 'Evaluating Rules...' : 'Evaluate Live Rules'}</span>
          </button>
        </div>
      </section>

      {error && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      {statusMsg && (
        <div role="status" className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
          <span>{statusMsg}</span>
        </div>
      )}

      {alerts.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <Activity className="h-8 w-8 text-slate-400" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium text-slate-800">No alerts evaluated yet</p>
          <p className="mt-1 text-xs text-slate-500">
            Click Evaluate Live Rules to scan the active tenant snapshot for variances and risks.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {alerts.map((alert) => (
            <article
              key={alert.id}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${severityBadge(
                        alert.severity,
                      )}`}
                    >
                      <AlertCircle className="h-3 w-3" aria-hidden="true" />
                      {alert.severity}
                    </span>
                    <span
                      className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${statusBadge(
                        alert.status,
                      )}`}
                    >
                      {alert.status}
                    </span>
                    <span className="font-mono text-[11px] text-slate-500">
                      {alert.ruleCode} · Occurrence #{alert.occurrenceCount}
                    </span>
                    {alert.parentAlertId && (
                      <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-600">
                        Re-detected from {alert.parentAlertId}
                      </span>
                    )}
                  </div>
                  <h2 className="mt-2 text-base font-semibold text-slate-900">{alert.title}</h2>
                  <p className="mt-1 text-sm text-slate-600">{alert.description}</p>
                </div>
              </div>

              {alert.resolutionNotes && (
                <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
                  <strong>Audit Note ({alert.updatedBy}):</strong> {alert.resolutionNotes}
                </p>
              )}

              {(alert.status === 'OPEN' || alert.status === 'UNDER_REVIEW') && (
                <div className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:items-center">
                  <input
                    type="text"
                    value={notesById[alert.id] ?? ''}
                    onChange={(e) =>
                      setNotesById((prev) => ({...prev, [alert.id]: e.target.value}))
                    }
                    placeholder="Add investigation or resolution notes..."
                    className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs"
                  />
                  <div className="flex flex-wrap gap-2">
                    {alert.status === 'OPEN' && (
                      <button
                        type="button"
                        onClick={() => void handleTransition(alert.id, 'UNDER_REVIEW')}
                        className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-800 hover:bg-sky-100"
                      >
                        Mark Under Review
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleTransition(alert.id, 'RESOLVED')}
                      className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800"
                    >
                      Resolve
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleTransition(alert.id, 'DISMISSED')}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

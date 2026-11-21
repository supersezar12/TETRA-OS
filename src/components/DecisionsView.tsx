import {useEffect, useState, type FormEvent} from 'react';
import {CheckCircle2, FileCheck2, ShieldAlert} from 'lucide-react';
import {apiRequest} from '../utils/apiClient';

interface DecisionDossier {
  id: string;
  optimizationRunId: string;
  title: string;
  status: 'PENDING_REVIEW' | 'APPROVED' | 'MODIFIED' | 'REJECTED';
  assumptions: string;
  risks: string;
  limitations: string;
  reviewerComment: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  executionRef: string | null;
  actualOutcomeValue: number | null;
  actualOutcomeNotes: string | null;
  createdBy: string;
  createdAt: string;
}

interface DecisionsViewProps {
  token: string;
  companyId: string;
  currency: string;
  canApprove: boolean;
}

export function DecisionsView({
  token,
  companyId,
  currency,
  canApprove,
}: DecisionsViewProps) {
  const [decisions, setDecisions] = useState<DecisionDossier[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reviewComment, setReviewComment] = useState('');
  const [execRef, setExecRef] = useState('');
  const [actualOutcome, setActualOutcome] = useState('');
  const [actualNotes, setActualNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const loadDecisions = async () => {
    try {
      const res = await apiRequest<{decisions: DecisionDossier[]}>('/api/decisions', {
        token,
        companyId,
      });
      setDecisions(res.decisions);
      if (res.decisions.length > 0 && !selectedId) {
        setSelectedId(res.decisions[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load decision dossiers.');
    }
  };

  useEffect(() => {
    void loadDecisions();
  }, [token, companyId]);

  const active = decisions.find((d) => d.id === selectedId) ?? decisions[0] ?? null;

  useEffect(() => {
    if (active) {
      setExecRef(active.executionRef ?? '');
      setActualOutcome(
        active.actualOutcomeValue !== null ? String(active.actualOutcomeValue) : '',
      );
      setActualNotes(active.actualOutcomeNotes ?? '');
    }
  }, [active?.id]);

  const handleReview = async (status: 'APPROVED' | 'MODIFIED' | 'REJECTED') => {
    if (!active) return;
    setError(null);
    setStatusMsg(null);
    try {
      const res = await apiRequest<{decision: DecisionDossier}>(
        `/api/decisions/${active.id}/review`,
        {
          method: 'PATCH',
          token,
          companyId,
          body: {status, comment: reviewComment || `Marked ${status} by reviewer.`},
        },
      );
      setDecisions((prev) => prev.map((d) => (d.id === active.id ? res.decision : d)));
      setReviewComment('');
      setStatusMsg(`Decision ${res.decision.id} updated to ${res.decision.status}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Review update failed.');
    }
  };

  const handleSaveExecution = async (e: FormEvent) => {
    e.preventDefault();
    if (!active) return;
    setError(null);
    setStatusMsg(null);
    try {
      const parsedVal = actualOutcome.trim() ? Number(actualOutcome) : null;
      const res = await apiRequest<{decision: DecisionDossier}>(
        `/api/decisions/${active.id}/execution`,
        {
          method: 'PATCH',
          token,
          companyId,
          body: {
            executionRef: execRef,
            actualOutcomeValue: parsedVal,
            actualOutcomeNotes: actualNotes || null,
          },
        },
      );
      setDecisions((prev) => prev.map((d) => (d.id === active.id ? res.decision : d)));
      setStatusMsg(`Linked execution reference "${res.decision.executionRef}".`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update execution tracking.');
    }
  };

  const statusBadge = (status: DecisionDossier['status']) => {
    if (status === 'APPROVED') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
    if (status === 'MODIFIED') return 'border-sky-200 bg-sky-50 text-sky-800';
    if (status === 'REJECTED') return 'border-rose-200 bg-rose-50 text-rose-800';
    return 'border-amber-200 bg-amber-50 text-amber-800';
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
          Decision Governance Layer
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
          Decision Workspace — Review, Approval &amp; Outcome Tracking
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          Separates optimization recommendations from RBAC-gated management approval, external
          ERP/CRM execution references, and realized commercial outcomes.
        </p>
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

      {decisions.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <FileCheck2 className="h-8 w-8 text-slate-400" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium text-slate-800">No decision dossiers yet</p>
          <p className="mt-1 text-xs text-slate-500">
            Run an optimal solution in the Optimize tab and click Package as Decision Dossier.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="space-y-2.5 lg:col-span-4">
            {decisions.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setSelectedId(d.id)}
                className={`w-full rounded-xl border p-4 text-left transition-colors ${
                  active?.id === d.id
                    ? 'border-slate-900 bg-white shadow-xs'
                    : 'border-slate-200 bg-white/80 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] text-slate-400">{d.id}</span>
                  <span
                    className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${statusBadge(
                      d.status,
                    )}`}
                  >
                    {d.status}
                  </span>
                </div>
                <p className="mt-1.5 text-sm font-semibold text-slate-900">{d.title}</p>
                <p className="mt-1 text-xs text-slate-500">By {d.createdBy}</p>
              </button>
            ))}
          </div>

          {active && (
            <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs lg:col-span-8">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4">
                <div>
                  <span className="font-mono text-xs text-slate-400">
                    Dossier {active.id} · Opt Run {active.optimizationRunId}
                  </span>
                  <h2 className="mt-1 text-lg font-semibold text-slate-900">{active.title}</h2>
                </div>
                <span
                  className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${statusBadge(
                    active.status,
                  )}`}
                >
                  {active.status}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Assumptions
                  </p>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-700">
                    {active.assumptions}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Identified Risks
                  </p>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-700">{active.risks}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Model Limitations
                  </p>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-700">
                    {active.limitations}
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 p-4">
                <h3 className="text-sm font-semibold text-slate-900">
                  Management Review &amp; Approval
                </h3>
                {active.reviewedBy && (
                  <p className="mt-1 text-xs text-slate-600">
                    Last reviewed by <strong>{active.reviewedBy}</strong>: &ldquo;
                    {active.reviewerComment}&rdquo;
                  </p>
                )}

                {canApprove ? (
                  <div className="mt-3 space-y-3">
                    <input
                      type="text"
                      value={reviewComment}
                      onChange={(e) => setReviewComment(e.target.value)}
                      placeholder="Reviewer commentary or modification conditions..."
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void handleReview('APPROVED')}
                        className="rounded-lg bg-emerald-700 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-800"
                      >
                        Approve Decision
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleReview('MODIFIED')}
                        className="rounded-lg bg-sky-700 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-sky-800"
                      >
                        Approve with Modifications
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleReview('REJECTED')}
                        className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-100"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-800">
                    <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>
                      Your assigned role does not hold decision approval authority (enforced
                      server-side).
                    </span>
                  </p>
                )}
              </div>

              <form
                onSubmit={handleSaveExecution}
                className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-3"
              >
                <h3 className="text-sm font-semibold text-slate-900">
                  Execution Reference &amp; Actual Outcome ({currency})
                </h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-600">
                      External Execution Ref ID (ERP / CRM)
                    </label>
                    <input
                      type="text"
                      required
                      value={execRef}
                      onChange={(e) => setExecRef(e.target.value)}
                      placeholder="e.g., SAP-BUD-2026-884"
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600">
                      Measured Actual Outcome ({currency})
                    </label>
                    <input
                      type="number"
                      value={actualOutcome}
                      onChange={(e) => setActualOutcome(e.target.value)}
                      placeholder="Optional realized value"
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600">
                    Outcome Verification Notes
                  </label>
                  <input
                    type="text"
                    value={actualNotes}
                    onChange={(e) => setActualNotes(e.target.value)}
                    placeholder="Variance notes vs solver projection..."
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm"
                  />
                </div>
                <button
                  type="submit"
                  className="rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
                >
                  Save Execution &amp; Outcome
                </button>
              </form>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

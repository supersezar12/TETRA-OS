import {useState} from 'react';
import {ArrowRight, CheckCircle2, ShieldCheck} from 'lucide-react';
import {WORKFLOW_STAGES} from '../utils/platformBlueprints';

const ENGINE_BADGE_CLASS: Record<string, string> = {
  'Data Layer': 'border-slate-200 bg-slate-100 text-slate-800',
  Predict: 'border-indigo-200 bg-indigo-50 text-indigo-800',
  Optimize: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  'Decision Layer': 'border-amber-200 bg-amber-50 text-amber-800',
  Detect: 'border-sky-200 bg-sky-50 text-sky-800',
};

export function AppWorkflowView() {
  const [selectedStageId, setSelectedStageId] = useState<string>(
    WORKFLOW_STAGES[0].id,
  );
  const selectedStage =
    WORKFLOW_STAGES.find((stage) => stage.id === selectedStageId) ??
    WORKFLOW_STAGES[0];

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs sm:p-8">
        <p className="font-mono text-xs font-medium uppercase tracking-widest text-slate-500">
          End-to-End Application Workflow
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          Governed Commercial Decision Pipeline
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
          Every workflow in TETRA OS enforces strict separation between raw data,
          predictions, solver recommendations, management approvals, external
          execution references, and measured actual outcomes. Select any stage below
          to inspect its inputs, outputs, and governance gate.
        </p>
      </section>

      <section aria-labelledby="workflow-stages-heading">
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <h2
            id="workflow-stages-heading"
            className="text-lg font-semibold tracking-tight text-slate-900"
          >
            8-Stage Lifecycle Sequence
          </h2>
          <p className="text-xs text-slate-500">
            Click a stage card to inspect inputs, outputs, and RBAC gates.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {WORKFLOW_STAGES.map((stage) => {
            const isSelected = stage.id === selectedStage.id;
            return (
              <button
                key={stage.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => setSelectedStageId(stage.id)}
                className={`flex h-full flex-col justify-between rounded-xl border p-4 text-left transition-colors ${
                  isSelected
                    ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                    : 'border-slate-200 bg-white text-slate-900 hover:border-slate-300 hover:bg-slate-50/70'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`font-mono text-xs font-semibold ${
                        isSelected ? 'text-slate-300' : 'text-slate-400'
                      }`}
                    >
                      STEP {stage.stepNumber}
                    </span>
                    <span
                      className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${
                        isSelected
                          ? 'border-slate-700 bg-slate-800 text-slate-100'
                          : ENGINE_BADGE_CLASS[stage.engine]
                      }`}
                    >
                      {stage.engine}
                    </span>
                  </div>
                  <h3 className="mt-3 text-sm font-semibold leading-snug">
                    {stage.title}
                  </h3>
                  <p
                    className={`mt-1.5 text-xs leading-relaxed ${
                      isSelected ? 'text-slate-300' : 'text-slate-600'
                    }`}
                  >
                    {stage.summary}
                  </p>
                </div>

                <div
                  className={`mt-4 flex items-center gap-1 text-[11px] font-medium ${
                    isSelected ? 'text-emerald-300' : 'text-slate-500'
                  }`}
                >
                  <span>Inspect Stage</span>
                  <ArrowRight className="h-3 w-3" aria-hidden="true" />
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section
        aria-labelledby="stage-inspector-heading"
        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs sm:p-8"
      >
        <div className="flex flex-col gap-2 border-b border-slate-100 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="font-mono text-xs font-semibold text-slate-500">
              STAGE {selectedStage.stepNumber} &middot; {selectedStage.engine}
            </span>
            <h2
              id="stage-inspector-heading"
              className="mt-1 text-xl font-semibold text-slate-900"
            >
              {selectedStage.title}
            </h2>
          </div>
          <span className="inline-flex items-center gap-1.5 self-start rounded-md border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
            <ShieldCheck className="h-4 w-4 text-slate-600" aria-hidden="true" />
            Mandatory Gate Enforced
          </span>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Required Inputs
            </h3>
            <ul className="mt-3 space-y-2">
              {selectedStage.inputs.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-2 text-sm text-slate-700"
                >
                  <CheckCircle2
                    className="mt-0.5 h-4 w-4 shrink-0 text-slate-500"
                    aria-hidden="true"
                  />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Verified Outputs
            </h3>
            <ul className="mt-3 space-y-2">
              {selectedStage.outputs.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-2 text-sm text-slate-700"
                >
                  <CheckCircle2
                    className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600"
                    aria-hidden="true"
                  />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Governance Gate &amp; Roles
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-slate-700">
              {selectedStage.gateRule}
            </p>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {selectedStage.accountableRoles.map((role) => (
                <span
                  key={role}
                  className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700"
                >
                  {role}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

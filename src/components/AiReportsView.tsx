import {useState, type ChangeEvent, type FormEvent} from 'react';
import {
  ArchiveRestore,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  Sparkles,
} from 'lucide-react';
import {apiRequest, downloadAuthorizedFile} from '../utils/apiClient';
import type {AppLanguage} from '../utils/i18n';

interface AiReportsViewProps {
  token: string;
  companyId: string;
  language: AppLanguage;
  canManageUsers: boolean;
  canExportReports: boolean;
  onDataRestored?: () => void;
}

const SUGGESTED_PROMPTS = [
  'Summarize our current commercial margin, target gap, and highest-priority Detect alerts.',
  'Explain the latest HiGHS optimization allocation and what assumptions leadership should verify before approval.',
  'Compare our latest statistical forecast accuracy against the Naive baseline.',
];

export function AiReportsView({
  token,
  companyId,
  language,
  canManageUsers,
  canExportReports,
  onDataRestored,
}: AiReportsViewProps) {
  const [prompt, setPrompt] = useState(SUGGESTED_PROMPTS[0]);
  const [aiResponse, setAiResponse] = useState<{
    answer: string;
    model: string;
    groundedSnapshotVersion: number | null;
  } | null>(null);
  const [asking, setAsking] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAskAi = async (e: FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;
    setAsking(true);
    setError(null);
    try {
      const res = await apiRequest<{
        answer: string;
        model: string;
        groundedSnapshotVersion: number | null;
      }>('/api/ai/analyze', {
        method: 'POST',
        token,
        companyId,
        body: {prompt, language},
      });
      setAiResponse(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI analysis failed.');
    } finally {
      setAsking(false);
    }
  };

  const handleExport = async (format: 'xlsx' | 'pdf' | 'csv' | 'json') => {
    setError(null);
    setStatusMsg(null);
    try {
      const filename = await downloadAuthorizedFile(
        `/api/reports/export?format=${format}`,
        `tetra-os-report.${format}`,
        token,
        companyId,
      );
      setStatusMsg(`Downloaded ${filename}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed.');
    }
  };

  const handleDownloadBackup = async () => {
    setError(null);
    setStatusMsg(null);
    try {
      const filename = await downloadAuthorizedFile(
        '/api/admin/backup',
        `tetra-backup-${companyId}.json`,
        token,
        companyId,
      );
      setStatusMsg(`Downloaded tenant backup archive ${filename}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Backup export failed.');
    }
  };

  const handleRestoreFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setStatusMsg(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as {activeSnapshotRecords?: unknown};
      if (!Array.isArray(parsed.activeSnapshotRecords)) {
        throw new Error('Backup JSON must contain activeSnapshotRecords array.');
      }
      const res = await apiRequest<{snapshot: {versionNumber: number; rowCount: number}}>(
        '/api/admin/restore',
        {
          method: 'POST',
          token,
          companyId,
          body: {activeSnapshotRecords: parsed.activeSnapshotRecords},
        },
      );
      setStatusMsg(
        `Restored tenant snapshot v${res.snapshot.versionNumber} (${res.snapshot.rowCount} rows).`,
      );
      onDataRestored?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Restore failed.');
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
          Tool-Grounded AI &amp; Enterprise Reporting
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
          AI Workspace &amp; Reports Center
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          Query Gemini strictly grounded in your tenant&apos;s live SQLite snapshot, forecasts,
          HiGHS solver results, and Detect alerts, or export board-ready Excel/PDF reports.
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs lg:col-span-7">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-slate-900" aria-hidden="true" />
            <h2 className="text-base font-semibold text-slate-900">
              Grounded Executive Analyst
            </h2>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {SUGGESTED_PROMPTS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => setPrompt(q)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-left text-xs text-slate-700 hover:bg-slate-100"
              >
                {q.slice(0, 56)}...
              </button>
            ))}
          </div>

          <form onSubmit={handleAskAi} className="mt-4 space-y-3">
            <textarea
              rows={3}
              required
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ask about commercial variance, forecast accuracy, or solver recommendations..."
              className="w-full rounded-xl border border-slate-200 p-3 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
            />
            <button
              type="submit"
              disabled={asking}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60"
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{asking ? 'Analyzing Live Telemetry...' : 'Analyze Grounded Data'}</span>
            </button>
          </form>

          {aiResponse && (
            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-500">
                <span>Model: {aiResponse.model}</span>
                <span>
                  Grounded Snapshot: v{aiResponse.groundedSnapshotVersion ?? 'N/A'}
                </span>
              </div>
              <div className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
                {aiResponse.answer}
              </div>
            </div>
          )}
        </section>

        <div className="space-y-6 lg:col-span-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
            <h2 className="text-base font-semibold text-slate-900">Enterprise Report Exports</h2>
            <p className="mt-1 text-xs text-slate-500">
              Multi-sheet Excel workbooks, executive PDFs, and formula-safe CSV exports.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <button
                type="button"
                disabled={!canExportReports}
                onClick={() => void handleExport('xlsx')}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
                <span>Excel (.xlsx)</span>
              </button>
              <button
                type="button"
                disabled={!canExportReports}
                onClick={() => void handleExport('pdf')}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
              >
                <FileText className="h-4 w-4" aria-hidden="true" />
                <span>Executive PDF</span>
              </button>
              <button
                type="button"
                disabled={!canExportReports}
                onClick={() => void handleExport('csv')}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Raw CSV</span>
              </button>
              <button
                type="button"
                disabled={!canExportReports}
                onClick={() => void handleExport('json')}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Dossier JSON</span>
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
            <h2 className="text-base font-semibold text-slate-900">
              Tenant Backup &amp; Snapshot Restore
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Administrator-only JSON archive export and point-in-time record restore.
            </p>
            <div className="mt-4 flex flex-wrap gap-2.5">
              <button
                type="button"
                disabled={!canManageUsers}
                onClick={() => void handleDownloadBackup()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Download Tenant Backup</span>
              </button>
              <label
                className={`inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-slate-50 px-3.5 py-2 text-xs font-medium text-slate-800 ${
                  canManageUsers
                    ? 'cursor-pointer hover:bg-slate-100'
                    : 'cursor-not-allowed opacity-50'
                }`}
              >
                <ArchiveRestore className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Restore Backup JSON</span>
                <input
                  type="file"
                  accept=".json"
                  disabled={!canManageUsers}
                  onChange={handleRestoreFile}
                  className="sr-only"
                />
              </label>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

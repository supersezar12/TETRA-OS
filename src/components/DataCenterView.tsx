import {useEffect, useState, type ChangeEvent} from 'react';
import {CheckCircle2, Database, RotateCcw, Upload} from 'lucide-react';
import {apiRequest} from '../utils/apiClient';

interface SnapshotItem {
  id: string;
  versionNumber: number;
  sourceName: string;
  sourceType: string;
  rowCount: number;
  qualityScore: number;
  sufficiencyStatus: 'READY' | 'PARTIAL' | 'INSUFFICIENT_DATA';
  hasCogs: boolean;
  hasSpend: boolean;
  missingFields: string[];
  isActive: boolean;
  createdBy: string;
  createdAt: string;
}

interface PreviewRow {
  period: string;
  region: string;
  channel: string;
  product: string;
  revenue: number;
  cogs: number | null;
  marketingSpend: number | null;
  tradeSpend: number | null;
}

const CANONICAL_FIELDS = [
  {key: 'period', label: 'Period (Required)'},
  {key: 'channel', label: 'Channel (Required)'},
  {key: 'revenue', label: 'Revenue (Required)'},
  {key: 'cogs', label: 'COGS'},
  {key: 'marketingSpend', label: 'Marketing Spend'},
  {key: 'tradeSpend', label: 'Trade Spend'},
  {key: 'region', label: 'Region'},
  {key: 'branch', label: 'Branch'},
  {key: 'department', label: 'Department'},
  {key: 'product', label: 'Product / SKU'},
  {key: 'units', label: 'Units'},
  {key: 'approvedTarget', label: 'Approved Target'},
];

const QUICK_CSV_TEMPLATE = `period,region,branch,department,channel,product,revenue,cogs,marketing_spend,trade_spend,units,approved_target
2026-07,Central Region,Riyadh Main Depot,Key Retail,Modern Trade,Beverages Core,45200,29800,4900,3600,980,47000
2026-08,Central Region,Riyadh Main Depot,Key Retail,Modern Trade,Beverages Core,46800,30900,5050,3750,1010,48000
2026-09,Central Region,Riyadh Main Depot,Key Retail,Modern Trade,Beverages Core,48100,31700,5200,3800,1040,49500
2026-10,Central Region,Riyadh Main Depot,Key Retail,Modern Trade,Beverages Core,44200,32400,5300,3900,960,50500
2026-07,Western Region,Jeddah Hub,Wholesale,Wholesale,Pantry 12x,39400,28100,3300,4200,890,41000
2026-08,Western Region,Jeddah Hub,Wholesale,Wholesale,Pantry 12x,40200,28700,3400,4300,910,41800
2026-09,Western Region,Jeddah Hub,Wholesale,Wholesale,Pantry 12x,41500,29500,3500,4350,940,42500
2026-10,Western Region,Jeddah Hub,Wholesale,Wholesale,Pantry 12x,42100,30000,3550,4400,955,43200`;

interface DataCenterViewProps {
  token: string;
  companyId: string;
  currency: string;
  onDataUpdated?: () => void;
}

export function DataCenterView({
  token,
  companyId,
  currency,
  onDataUpdated,
}: DataCenterViewProps) {
  const [snapshots, setSnapshots] = useState<SnapshotItem[]>([]);
  const [activeSnapshot, setActiveSnapshot] = useState<SnapshotItem | null>(null);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Upload & mapping state
  const [pendingSourceName, setPendingSourceName] = useState<string>('');
  const [pendingSourceType, setPendingSourceType] = useState<'CSV' | 'XLSX' | 'JSON'>('CSV');
  const [pendingContent, setPendingContent] = useState<string>('');
  const [uploadedHeaders, setUploadedHeaders] = useState<string[]>([]);
  const [uploadedRowCount, setUploadedRowCount] = useState<number>(0);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [ingesting, setIngesting] = useState(false);

  const loadSnapshots = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest<{
        snapshots: SnapshotItem[];
        activeSnapshot: SnapshotItem | null;
        previewRows: PreviewRow[];
      }>('/api/datasets/snapshots', {token, companyId});
      setSnapshots(data.snapshots);
      setActiveSnapshot(data.activeSnapshot);
      setPreviewRows(data.previewRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dataset snapshots.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSnapshots();
  }, [token, companyId]);

  const previewPayload = async (
    name: string,
    sourceType: 'CSV' | 'XLSX' | 'JSON',
    content: string,
  ) => {
    setError(null);
    setStatusMsg(null);
    try {
      const res = await apiRequest<{
        headers: string[];
        rowCount: number;
        suggestedMapping: Record<string, string>;
      }>('/api/datasets/preview', {
        method: 'POST',
        token,
        companyId,
        body: {sourceType, content},
      });
      setPendingSourceName(name);
      setPendingSourceType(sourceType);
      setPendingContent(content);
      setUploadedHeaders(res.headers);
      setUploadedRowCount(res.rowCount);
      setMapping(res.suggestedMapping);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to inspect uploaded file.');
    }
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase();

    if (ext === 'xlsx') {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const b64 = btoa(binary);
      await previewPayload(file.name, 'XLSX', b64);
    } else if (ext === 'json') {
      const text = await file.text();
      await previewPayload(file.name, 'JSON', text);
    } else {
      const text = await file.text();
      await previewPayload(file.name, 'CSV', text);
    }
  };

  const handleIngest = async () => {
    if (!pendingContent || !pendingSourceName) return;
    setIngesting(true);
    setError(null);
    setStatusMsg(null);
    try {
      const res = await apiRequest<{snapshot: SnapshotItem; warnings: string[]}>(
        '/api/datasets/ingest',
        {
          method: 'POST',
          token,
          companyId,
          body: {
            sourceName: pendingSourceName,
            sourceType: pendingSourceType,
            content: pendingContent,
            columnMapping: mapping,
          },
        },
      );
      setPendingContent('');
      setUploadedHeaders([]);
      setStatusMsg(
        `Ingested Snapshot v${res.snapshot.versionNumber} (${res.snapshot.rowCount} rows · Quality ${res.snapshot.qualityScore}% · ${res.snapshot.sufficiencyStatus}).${
          res.warnings.length > 0 ? ` Notes: ${res.warnings.join(' ')}` : ''
        }`,
      );
      await loadSnapshots();
      onDataUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ingestion failed.');
    } finally {
      setIngesting(false);
    }
  };

  const handleRollback = async (snapshotId: string, versionNumber: number) => {
    setError(null);
    setStatusMsg(null);
    try {
      await apiRequest('/api/datasets/rollback', {
        method: 'POST',
        token,
        companyId,
        body: {snapshotId},
      });
      setStatusMsg(`Rolled back active dataset to Snapshot v${versionNumber}.`);
      await loadSnapshots();
      onDataUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rollback failed.');
    }
  };

  const sufficiencyBadge = (status: SnapshotItem['sufficiencyStatus']) => {
    if (status === 'READY') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
    if (status === 'PARTIAL') return 'border-amber-200 bg-amber-50 text-amber-800';
    return 'border-rose-200 bg-rose-50 text-rose-800';
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs sm:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
              Data Governance &amp; Sufficiency
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
              Data Center — Ingestion, Quality &amp; Snapshots
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              Upload CSV, Excel (.xlsx), or JSON feeds, map columns to the canonical commercial
              schema, score data sufficiency, and roll back across versioned snapshots.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-slate-800">
              <Upload className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Upload CSV / XLSX / JSON</span>
              <input
                type="file"
                accept=".csv,.xlsx,.json"
                onChange={handleFileChange}
                className="sr-only"
              />
            </label>
            <button
              type="button"
              onClick={() =>
                void previewPayload('sample_commercial_q3_q4.csv', 'CSV', QUICK_CSV_TEMPLATE)
              }
              className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Load Sample CSV
            </button>
          </div>
        </div>

        {activeSnapshot && (
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-xs font-medium text-slate-500">Active Snapshot</p>
              <p className="mt-1 text-xl font-semibold text-slate-900">
                v{activeSnapshot.versionNumber}
              </p>
              <p className="mt-0.5 truncate text-xs text-slate-500">{activeSnapshot.sourceName}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-xs font-medium text-slate-500">Quality Score</p>
              <p className="mt-1 text-xl font-semibold text-slate-900">
                {activeSnapshot.qualityScore}%
              </p>
              <p className="mt-0.5 text-xs text-slate-500">{activeSnapshot.rowCount} valid rows</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-xs font-medium text-slate-500">Sufficiency Gate</p>
              <span
                className={`mt-1.5 inline-flex rounded-md border px-2 py-0.5 text-xs font-semibold ${sufficiencyBadge(
                  activeSnapshot.sufficiencyStatus,
                )}`}
              >
                {activeSnapshot.sufficiencyStatus}
              </span>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-xs font-medium text-slate-500">Module Gates</p>
              <p className="mt-1 text-xs font-medium text-slate-700">
                COGS: {activeSnapshot.hasCogs ? 'Verified' : 'Missing'}
              </p>
              <p className="mt-0.5 text-xs font-medium text-slate-700">
                Spend: {activeSnapshot.hasSpend ? 'Verified' : 'Missing'}
              </p>
            </div>
          </div>
        )}
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

      {uploadedHeaders.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Column Schema Mapping — {pendingSourceName}
              </h2>
              <p className="text-xs text-slate-500">
                {uploadedRowCount} rows detected. Confirm canonical field mapping before validation.
              </p>
            </div>
            <button
              type="button"
              disabled={ingesting}
              onClick={handleIngest}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60"
            >
              <Database className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{ingesting ? 'Validating & Saving...' : 'Validate & Commit Snapshot'}</span>
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {CANONICAL_FIELDS.map((field) => (
              <div key={field.key}>
                <label className="block text-xs font-medium text-slate-600">{field.label}</label>
                <select
                  value={mapping[field.key] ?? ''}
                  onChange={(e) =>
                    setMapping((prev) => ({...prev, [field.key]: e.target.value}))
                  }
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800"
                >
                  <option value="">-- Unmapped --</option>
                  {uploadedHeaders.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs lg:col-span-5">
          <h2 className="text-base font-semibold text-slate-900">Snapshot Versions &amp; Rollback</h2>
          {loading ? (
            <p className="mt-4 text-sm text-slate-500">Loading snapshots...</p>
          ) : (
            <div className="mt-4 space-y-2.5">
              {snapshots.map((snap) => (
                <div
                  key={snap.id}
                  className={`rounded-xl border p-3.5 ${
                    snap.isActive
                      ? 'border-slate-900 bg-slate-50'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900">
                      v{snap.versionNumber} · {snap.sourceName}
                    </span>
                    <span
                      className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${sufficiencyBadge(
                        snap.sufficiencyStatus,
                      )}`}
                    >
                      {snap.sufficiencyStatus}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {snap.rowCount} rows · Quality {snap.qualityScore}% · {snap.sourceType}
                  </p>
                  <div className="mt-2.5 flex items-center justify-between">
                    <span className="text-[11px] text-slate-400">
                      {snap.createdAt.slice(0, 16).replace('T', ' ')}
                    </span>
                    {snap.isActive ? (
                      <span className="text-xs font-semibold text-emerald-700">Active</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void handleRollback(snap.id, snap.versionNumber)}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <RotateCcw className="h-3 w-3" aria-hidden="true" />
                        <span>Rollback</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs lg:col-span-7">
          <h2 className="text-base font-semibold text-slate-900">
            Active Snapshot Sample ({currency})
          </h2>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-3 py-2 font-semibold">Period</th>
                  <th className="px-3 py-2 font-semibold">Channel</th>
                  <th className="px-3 py-2 font-semibold">Region</th>
                  <th className="px-3 py-2 font-semibold">Revenue</th>
                  <th className="px-3 py-2 font-semibold">COGS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {previewRows.slice(0, 10).map((row, idx) => (
                  <tr key={`${row.period}-${row.channel}-${idx}`}>
                    <td className="px-3 py-2 font-mono text-slate-700">{row.period}</td>
                    <td className="px-3 py-2 font-medium text-slate-900">{row.channel}</td>
                    <td className="px-3 py-2 text-slate-600">{row.region}</td>
                    <td className="px-3 py-2 font-medium text-slate-900">
                      {row.revenue.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {row.cogs !== null ? row.cogs.toLocaleString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

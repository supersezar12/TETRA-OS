import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import type {
  CompanyRecord,
  DatasetSnapshotRecord,
  DecisionDossierRecord,
  DetectAlertRecord,
  ForecastRunRecord,
  OptimizationRunRecord,
} from '../types.ts';

export function escapeCsvCell(value: string | number | null | undefined): string {
  const raw = value === null || value === undefined ? '' : String(value);
  const formulaSafe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  if (/[",\n\r]/.test(formulaSafe)) {
    return `"${formulaSafe.replaceAll('"', '""')}"`;
  }
  return formulaSafe;
}

export async function generateExcelReportBuffer(params: {
  company: CompanyRecord;
  snapshot: DatasetSnapshotRecord | null;
  forecast: ForecastRunRecord | null;
  optimization: OptimizationRunRecord | null;
  decisions: DecisionDossierRecord[];
  alerts: DetectAlertRecord[];
}): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'TETRA OS';
  workbook.created = new Date();

  const summarySheet = workbook.addWorksheet('Executive Summary');
  summarySheet.columns = [
    {header: 'Dimension', key: 'dim', width: 28},
    {header: 'Value', key: 'val', width: 48},
  ];
  summarySheet.addRows([
    {dim: 'Platform', val: 'TETRA OS — Commercial Decisions Intelligence'},
    {dim: 'Company / Tenant', val: params.company.name},
    {dim: 'Currency', val: params.company.currency},
    {
      dim: 'Active Dataset Snapshot',
      val: params.snapshot
        ? `v${params.snapshot.versionNumber} (${params.snapshot.sourceName}) · Quality ${params.snapshot.qualityScore}% (${params.snapshot.sufficiencyStatus})`
        : 'None',
    },
    {
      dim: 'Latest Forecast Model',
      val: params.forecast
        ? `${params.forecast.modelType} · MAPE ${params.forecast.mape}% vs Naive ${params.forecast.naiveMape}%`
        : 'Not run',
    },
    {
      dim: 'Latest Optimization Status',
      val: params.optimization
        ? `${params.optimization.solverStatus} · Lift +${params.optimization.improvementPct}% (${params.company.currency} ${params.optimization.netDelta.toLocaleString()})`
        : 'Not run',
    },
    {dim: 'Decision Dossiers Count', val: String(params.decisions.length)},
    {
      dim: 'Open Detect Alerts',
      val: String(params.alerts.filter((a) => a.status === 'OPEN' || a.status === 'UNDER_REVIEW').length),
    },
  ]);

  if (params.optimization && params.optimization.allocations.length > 0) {
    const optSheet = workbook.addWorksheet('Optimization Allocations');
    optSheet.columns = [
      {header: 'Segment', key: 'segment', width: 26},
      {header: 'Baseline Spend', key: 'baselineSpend', width: 18},
      {header: 'Recommended Spend', key: 'recommendedSpend', width: 20},
      {header: 'Baseline Value', key: 'baseline', width: 18},
      {header: 'Optimized Value', key: 'optimized', width: 18},
      {header: 'Delta', key: 'delta', width: 16},
      {header: 'Shadow Price', key: 'shadowPrice', width: 16},
    ];
    optSheet.addRows(params.optimization.allocations);
  }

  const decSheet = workbook.addWorksheet('Decisions');
  decSheet.columns = [
    {header: 'ID', key: 'id', width: 20},
    {header: 'Title', key: 'title', width: 34},
    {header: 'Status', key: 'status', width: 18},
    {header: 'Reviewed By', key: 'reviewedBy', width: 24},
    {header: 'Execution Ref', key: 'executionRef', width: 20},
    {header: 'Actual Outcome', key: 'actualOutcomeValue', width: 16},
  ];
  decSheet.addRows(params.decisions);

  const alertSheet = workbook.addWorksheet('Detect Alerts');
  alertSheet.columns = [
    {header: 'ID', key: 'id', width: 18},
    {header: 'Severity', key: 'severity', width: 12},
    {header: 'Category', key: 'category', width: 20},
    {header: 'Status', key: 'status', width: 16},
    {header: 'Title', key: 'title', width: 38},
    {header: 'Occurrences', key: 'occurrenceCount', width: 14},
  ];
  alertSheet.addRows(params.alerts);

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

export async function generatePdfReportBuffer(params: {
  company: CompanyRecord;
  snapshot: DatasetSnapshotRecord | null;
  forecast: ForecastRunRecord | null;
  optimization: OptimizationRunRecord | null;
  decisions: DecisionDossierRecord[];
  alerts: DetectAlertRecord[];
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({margin: 48, size: 'A4'});
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(18).text('TETRA OS — Executive Commercial Intelligence Report');
    doc.moveDown(0.3);
    doc
      .fontSize(10)
      .fillColor('#475569')
      .text(`Tenant: ${params.company.name} (${params.company.currency}) · Generated: ${new Date().toISOString()}`);

    doc.moveDown(1);
    doc.fillColor('#0f172a').fontSize(13).text('1. Data Quality & Snapshot Posture');
    doc.fontSize(10).text(
      params.snapshot
        ? `Snapshot v${params.snapshot.versionNumber} (${params.snapshot.sourceName}) — Rows: ${params.snapshot.rowCount}, Quality: ${params.snapshot.qualityScore}%, Sufficiency: ${params.snapshot.sufficiencyStatus}`
        : 'No active snapshot available.',
    );

    doc.moveDown(0.8);
    doc.fontSize(13).text('2. PREDICT Engine Summary');
    doc.fontSize(10).text(
      params.forecast
        ? `Model: ${params.forecast.modelType} | Metric: ${params.forecast.metric} | Horizon: ${params.forecast.horizon} periods | Holdout MAPE: ${params.forecast.mape}% (Naive: ${params.forecast.naiveMape}%)`
        : 'No forecast run recorded yet.',
    );

    doc.moveDown(0.8);
    doc.fontSize(13).text('3. OPTIMIZE Engine Summary');
    if (params.optimization) {
      doc.fontSize(10).text(
        `Template: ${params.optimization.title} | Status: ${params.optimization.solverStatus} | Lift: +${params.optimization.improvementPct}% (${params.company.currency} ${params.optimization.netDelta.toLocaleString()})`,
      );
      doc.moveDown(0.4);
      params.optimization.allocations.slice(0, 8).forEach((row) => {
        doc.text(
          `  • ${row.segment}: Spend ${params.company.currency} ${row.recommendedSpend.toLocaleString()} -> Value ${params.company.currency} ${row.optimized.toLocaleString()} (Delta ${row.delta >= 0 ? '+' : ''}${row.delta.toLocaleString()})`,
        );
      });
    } else {
      doc.fontSize(10).text('No optimization run recorded yet.');
    }

    doc.moveDown(0.8);
    doc.fontSize(13).text(`4. Governed Decisions (${params.decisions.length})`);
    if (params.decisions.length === 0) {
      doc.fontSize(10).text('No decision dossiers created yet.');
    } else {
      params.decisions.slice(0, 6).forEach((dec) => {
        doc
          .fontSize(10)
          .text(`  • [${dec.status}] ${dec.title} ${dec.executionRef ? `(Exec Ref: ${dec.executionRef})` : ''}`);
      });
    }

    doc.moveDown(0.8);
    doc.fontSize(13).text(`5. DETECT Alerts (${params.alerts.length})`);
    if (params.alerts.length === 0) {
      doc.fontSize(10).text('No active alerts.');
    } else {
      params.alerts.slice(0, 6).forEach((alt) => {
        doc.fontSize(10).text(`  • [${alt.severity} / ${alt.status}] ${alt.title}`);
      });
    }

    doc.end();
  });
}

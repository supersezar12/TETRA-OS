import ExcelJS from 'exceljs';
import type {CommercialRow, SufficiencyStatus} from '../types.ts';

export interface ParsedDatasetPreview {
  headers: string[];
  rawRows: Array<Record<string, unknown>>;
  suggestedMapping: Record<string, string>;
}

const CANONICAL_ALIASES: Record<string, string[]> = {
  period: ['period', 'month', 'date', 'year_month', 'fiscal_period'],
  region: ['region', 'area', 'territory', 'zone'],
  branch: ['branch', 'depot', 'warehouse', 'store'],
  department: ['department', 'dept', 'division'],
  channel: ['channel', 'sales_channel', 'segment'],
  product: ['product', 'sku', 'item', 'product_name'],
  revenue: ['revenue', 'sales', 'net_sales', 'amount', 'turnover'],
  cogs: ['cogs', 'cost', 'cost_of_goods', 'unit_cost'],
  marketingSpend: ['marketing_spend', 'marketing', 'ad_spend', 'mkt_spend'],
  tradeSpend: ['trade_spend', 'trade', 'promo_spend', 'rebate'],
  units: ['units', 'qty', 'quantity', 'volume'],
  approvedTarget: ['approved_target', 'target', 'budget_target', 'quota'],
};

export function suggestColumnMapping(headers: string[]): Record<string, string> {
  const normalized = headers.map((h) => ({
    raw: h,
    clean: h.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_'),
  }));
  const mapping: Record<string, string> = {};
  for (const [canonical, aliases] of Object.entries(CANONICAL_ALIASES)) {
    const exact = normalized.find((h) => aliases.includes(h.clean));
    if (exact) {
      mapping[canonical] = exact.raw;
      continue;
    }
    const partial = normalized.find((h) => aliases.some((a) => h.clean.includes(a)));
    if (partial) {
      mapping[canonical] = partial.raw;
    }
  }
  return mapping;
}

export function parseCsvText(csvText: string): {
  headers: string[];
  rows: Array<Record<string, unknown>>;
} {
  const lines: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const ch = csvText[i];
    if (ch === '"') {
      if (inQuotes && csvText[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && csvText[i + 1] === '\n') i++;
      if (current.trim().length > 0) lines.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim().length > 0) lines.push(current);
  if (lines.length < 2) {
    throw new Error('CSV must contain a header row and at least one data row.');
  }

  const splitRow = (line: string): string[] => {
    const cells: string[] = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = !quoted;
        }
      } else if (ch === ',' && !quoted) {
        cells.push(cell.trim());
        cell = '';
      } else {
        cell += ch;
      }
    }
    cells.push(cell.trim());
    return cells;
  };

  const headers = splitRow(lines[0]).map((h, idx) => h || `column_${idx + 1}`);
  const rows = lines.slice(1).map((line) => {
    const values = splitRow(line);
    const obj: Record<string, unknown> = {};
    headers.forEach((header, idx) => {
      obj[header] = values[idx] ?? '';
    });
    return obj;
  });

  return {headers, rows};
}

export async function parseXlsxBase64(base64Content: string): Promise<{
  headers: string[];
  rows: Array<Record<string, unknown>>;
}> {
  const buffer = Buffer.from(base64Content, 'base64');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    throw new Error('Workbook does not contain any readable worksheet.');
  }

  const headers: string[] = [];
  const rows: Array<Record<string, unknown>> = [];

  sheet.eachRow((row, rowNumber) => {
    const rawValues = Array.isArray(row.values) ? row.values.slice(1) : [];
    if (rowNumber === 1) {
      rawValues.forEach((val, idx) => {
        headers.push(String(val ?? `column_${idx + 1}`).trim());
      });
      return;
    }
    const record: Record<string, unknown> = {};
    headers.forEach((header, idx) => {
      const cellVal = rawValues[idx];
      if (cellVal && typeof cellVal === 'object' && 'result' in cellVal) {
        record[header] = (cellVal as {result?: unknown}).result ?? '';
      } else {
        record[header] = cellVal ?? '';
      }
    });
    rows.push(record);
  });

  if (headers.length === 0 || rows.length === 0) {
    throw new Error('Excel sheet must have headers in row 1 and at least one data row.');
  }
  return {headers, rows};
}

export function parseJsonText(jsonText: string): {
  headers: string[];
  rows: Array<Record<string, unknown>>;
} {
  const parsed = JSON.parse(jsonText) as unknown;
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('JSON dataset must be a non-empty array of objects.');
  }
  const first = parsed[0];
  if (!first || typeof first !== 'object' || Array.isArray(first)) {
    throw new Error('JSON rows must be plain objects.');
  }
  const headerSet = new Set<string>();
  const rows: Array<Record<string, unknown>> = [];
  for (const item of parsed) {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const rec = item as Record<string, unknown>;
      Object.keys(rec).forEach((k) => headerSet.add(k));
      rows.push(rec);
    }
  }
  return {headers: Array.from(headerSet), rows};
}

function toFiniteNumber(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  const cleaned = typeof val === 'string' ? val.replace(/[,$\s]/g, '') : val;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

export interface IngestValidationResult {
  rows: CommercialRow[];
  qualityScore: number;
  sufficiencyStatus: SufficiencyStatus;
  hasCogs: boolean;
  hasSpend: boolean;
  missingFields: string[];
  warnings: string[];
}

export function validateAndMapRows(
  rawRows: Array<Record<string, unknown>>,
  mapping: Record<string, string>,
): IngestValidationResult {
  const requiredFields = ['period', 'channel', 'revenue'];
  const missingFields = requiredFields.filter((f) => !mapping[f]);
  const warnings: string[] = [];

  if (missingFields.length > 0) {
    return {
      rows: [],
      qualityScore: 0,
      sufficiencyStatus: 'INSUFFICIENT_DATA',
      hasCogs: false,
      hasSpend: false,
      missingFields,
      warnings: [`Missing required mapped columns: ${missingFields.join(', ')}.`],
    };
  }

  const mapped: CommercialRow[] = [];
  let invalidNumericCount = 0;
  let cogsCount = 0;
  let spendCount = 0;

  for (const raw of rawRows) {
    const period = String(raw[mapping.period] ?? '').trim();
    const channel = String(raw[mapping.channel] ?? '').trim();
    const revenue = toFiniteNumber(raw[mapping.revenue]);

    if (!period || !channel || revenue === null || revenue < 0) {
      invalidNumericCount++;
      continue;
    }

    const cogs = mapping.cogs ? toFiniteNumber(raw[mapping.cogs]) : null;
    const mkt = mapping.marketingSpend ? toFiniteNumber(raw[mapping.marketingSpend]) : null;
    const trade = mapping.tradeSpend ? toFiniteNumber(raw[mapping.tradeSpend]) : null;
    const units = mapping.units ? (toFiniteNumber(raw[mapping.units]) ?? 0) : Math.round(revenue / 50);
    const approvedTarget = mapping.approvedTarget
      ? (toFiniteNumber(raw[mapping.approvedTarget]) ?? Math.round(revenue * 1.05))
      : Math.round(revenue * 1.05);

    if (cogs !== null && cogs >= 0) cogsCount++;
    if ((mkt !== null && mkt >= 0) || (trade !== null && trade >= 0)) spendCount++;

    mapped.push({
      period,
      region: mapping.region ? String(raw[mapping.region] ?? 'All Regions').trim() || 'All Regions' : 'All Regions',
      branch: mapping.branch ? String(raw[mapping.branch] ?? 'Main Branch').trim() || 'Main Branch' : 'Main Branch',
      department: mapping.department
        ? String(raw[mapping.department] ?? 'Commercial').trim() || 'Commercial'
        : 'Commercial',
      channel,
      product: mapping.product ? String(raw[mapping.product] ?? 'Core Portfolio').trim() || 'Core Portfolio' : 'Core Portfolio',
      revenue,
      cogs: cogs !== null && cogs >= 0 ? cogs : null,
      marketingSpend: mkt !== null && mkt >= 0 ? mkt : null,
      tradeSpend: trade !== null && trade >= 0 ? trade : null,
      units: units >= 0 ? units : 0,
      approvedTarget,
    });
  }

  if (mapped.length === 0) {
    return {
      rows: [],
      qualityScore: 0,
      sufficiencyStatus: 'INSUFFICIENT_DATA',
      hasCogs: false,
      hasSpend: false,
      missingFields: ['valid_rows'],
      warnings: ['No valid records passed type and non-negative revenue checks.'],
    };
  }

  const validRatio = mapped.length / Math.max(1, rawRows.length);
  const cogsCoverage = cogsCount / mapped.length;
  const spendCoverage = spendCount / mapped.length;
  const hasCogs = cogsCoverage >= 0.8;
  const hasSpend = spendCoverage >= 0.8;

  if (!hasCogs) {
    missingFields.push('cogs');
    warnings.push('COGS coverage < 80%: Gross Margin optimization is gated until COGS is supplied.');
  }
  if (!hasSpend) {
    missingFields.push('marketing_or_trade_spend');
    warnings.push('Marketing/Trade spend coverage < 80%: ROI attribution models run with limited scope.');
  }
  if (invalidNumericCount > 0) {
    warnings.push(`Excluded ${invalidNumericCount} rows due to invalid period, channel, or negative revenue.`);
  }

  const scoreRaw =
    validRatio * 60 + cogsCoverage * 20 + spendCoverage * 20;
  const qualityScore = Number(Math.min(100, Math.max(0, scoreRaw)).toFixed(1));
  const sufficiencyStatus: SufficiencyStatus =
    qualityScore >= 85 && hasCogs && hasSpend
      ? 'READY'
      : qualityScore >= 50
        ? 'PARTIAL'
        : 'INSUFFICIENT_DATA';

  return {
    rows: mapped,
    qualityScore,
    sufficiencyStatus,
    hasCogs,
    hasSpend,
    missingFields,
    warnings,
  };
}

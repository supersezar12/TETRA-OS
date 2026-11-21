import type {
  AlertSeverity,
  CommercialRow,
  DetectAlertRecord,
  OptimizationRunRecord,
} from '../types.ts';

export interface AlertCandidate {
  ruleCode: string;
  severity: AlertSeverity;
  category: DetectAlertRecord['category'];
  title: string;
  description: string;
  metricValue: number;
  thresholdValue: number;
}

export function evaluateDetectRules(params: {
  rows: readonly CommercialRow[];
  currency: string;
  latestOptimization: OptimizationRunRecord | null;
}): AlertCandidate[] {
  const candidates: AlertCandidate[] = [];
  if (params.rows.length === 0) return candidates;

  const periods = Array.from(new Set(params.rows.map((r) => r.period))).sort();
  const latestPeriod = periods[periods.length - 1];
  const priorPeriods = periods.slice(0, -1);

  const latestRows = params.rows.filter((r) => r.period === latestPeriod);
  const latestRev = latestRows.reduce((s, r) => s + r.revenue, 0);
  const latestTarget = latestRows.reduce((s, r) => s + r.approvedTarget, 0);

  // 1. Revenue Variance vs Approved Target
  if (latestTarget > 0) {
    const gapPct = Number((((latestTarget - latestRev) / latestTarget) * 100).toFixed(1));
    if (gapPct >= 5) {
      candidates.push({
        ruleCode: 'REV_TARGET_VARIANCE',
        severity: gapPct >= 12 ? 'HIGH' : 'MEDIUM',
        category: 'VARIANCE',
        title: `Revenue Below Approved Target in ${latestPeriod}`,
        description: `Actual revenue (${params.currency} ${latestRev.toLocaleString()}) trailed the approved target (${params.currency} ${latestTarget.toLocaleString()}) by ${gapPct}%.`,
        metricValue: gapPct,
        thresholdValue: 5,
      });
    }
  }

  // 2. Gross Margin Drift (latest period vs prior average)
  const latestWithCogs = latestRows.filter((r) => r.cogs !== null);
  const priorWithCogs = params.rows.filter(
    (r) => priorPeriods.includes(r.period) && r.cogs !== null,
  );
  if (latestWithCogs.length > 0 && priorWithCogs.length > 0) {
    const latestMarginPct =
      (latestWithCogs.reduce((s, r) => s + (r.revenue - (r.cogs ?? 0)), 0) /
        Math.max(1, latestWithCogs.reduce((s, r) => s + r.revenue, 0))) *
      100;
    const priorMarginPct =
      (priorWithCogs.reduce((s, r) => s + (r.revenue - (r.cogs ?? 0)), 0) /
        Math.max(1, priorWithCogs.reduce((s, r) => s + r.revenue, 0))) *
      100;
    const driftBps = Number((priorMarginPct - latestMarginPct).toFixed(1));
    if (driftBps >= 1.5) {
      candidates.push({
        ruleCode: 'MARGIN_COMPRESSION_DRIFT',
        severity: driftBps >= 3.0 ? 'HIGH' : 'MEDIUM',
        category: 'MARGIN_DRIFT',
        title: `Gross Margin Compression Detected (${latestPeriod})`,
        description: `Gross margin declined from ${priorMarginPct.toFixed(1)}% historical baseline to ${latestMarginPct.toFixed(1)}% (-${driftBps} pts).`,
        metricValue: Number(latestMarginPct.toFixed(1)),
        thresholdValue: Number((priorMarginPct - 1.5).toFixed(1)),
      });
    }
  }

  // 3. Channel Concentration Risk
  const channelRev = new Map<string, number>();
  let totalRev = 0;
  for (const r of params.rows) {
    channelRev.set(r.channel, (channelRev.get(r.channel) ?? 0) + r.revenue);
    totalRev += r.revenue;
  }
  if (totalRev > 0) {
    const topChannel = Array.from(channelRev.entries()).sort((a, b) => b[1] - a[1])[0];
    if (topChannel) {
      const sharePct = Number(((topChannel[1] / totalRev) * 100).toFixed(1));
      if (sharePct >= 30) {
        candidates.push({
          ruleCode: 'CHANNEL_CONCENTRATION_RISK',
          severity: sharePct >= 45 ? 'HIGH' : 'LOW',
          category: 'CONCENTRATION_RISK',
          title: `Channel Concentration in ${topChannel[0]}`,
          description: `${topChannel[0]} represents ${sharePct}% of cumulative revenue; consider diversifying allocation thresholds.`,
          metricValue: sharePct,
          thresholdValue: 30,
        });
      }
    }
  }

  // 4. Optimization Lift Opportunity
  if (
    params.latestOptimization &&
    params.latestOptimization.solverStatus === 'OPTIMAL' &&
    params.latestOptimization.improvementPct >= 5
  ) {
    candidates.push({
      ruleCode: 'OPT_REALLOCATION_OPPORTUNITY',
      severity: 'MEDIUM',
      category: 'OPPORTUNITY',
      title: `Unclaimed Optimization Lift (+${params.latestOptimization.improvementPct}%)`,
      description: `Latest ${params.latestOptimization.solverEngine} run identified +${params.currency} ${params.latestOptimization.netDelta.toLocaleString()} incremental value awaiting Decision approval.`,
      metricValue: params.latestOptimization.improvementPct,
      thresholdValue: 5,
    });
  }

  return candidates;
}

import highsLoader from 'highs';
import type {
  ChannelConstraintInput,
  CommercialRow,
  DatasetSnapshotRecord,
  OptimizationAllocationRow,
  OptimizationRunRecord,
  OptimizeTemplateKey,
  SolverStatus,
} from '../types.ts';

type HighsInstance = Awaited<ReturnType<typeof highsLoader>>;

let cachedSolverPromise: Promise<HighsInstance> | null = null;

async function getSolver(): Promise<HighsInstance> {
  if (!cachedSolverPromise) {
    cachedSolverPromise = highsLoader();
  }
  return cachedSolverPromise;
}

export function buildDefaultChannelInputs(
  rows: readonly CommercialRow[],
): ChannelConstraintInput[] {
  const byChannel = new Map<
    string,
    {revenue: number; cogs: number; mkt: number; trade: number; count: number}
  >();

  for (const r of rows) {
    const prev = byChannel.get(r.channel) ?? {
      revenue: 0,
      cogs: 0,
      mkt: 0,
      trade: 0,
      count: 0,
    };
    prev.revenue += r.revenue;
    prev.cogs += r.cogs ?? r.revenue * 0.68;
    prev.mkt += r.marketingSpend ?? r.revenue * 0.08;
    prev.trade += r.tradeSpend ?? r.revenue * 0.06;
    prev.count += 1;
    byChannel.set(r.channel, prev);
  }

  return Array.from(byChannel.entries()).map(([segment, agg]) => {
    const totalSpend = Math.max(1000, Math.round((agg.mkt + agg.trade) / Math.max(1, agg.count / 3)));
    const grossMarginRate = Math.max(
      0.12,
      Math.min(0.65, Number(((agg.revenue - agg.cogs) / Math.max(1, agg.revenue)).toFixed(3))),
    );
    const baselineReturn = Math.round(agg.revenue / Math.max(1, agg.count / 3));
    const roiMultiplier = Number(
      Math.max(1.2, Math.min(4.8, (baselineReturn * grossMarginRate) / totalSpend)).toFixed(2),
    );
    return {
      segment,
      baselineSpend: totalSpend,
      baselineReturn,
      roiMultiplier,
      marginRate: grossMarginRate,
      minSpend: Math.round(totalSpend * 0.55),
      maxSpend: Math.round(totalSpend * 1.65),
    };
  });
}

function sanitizeVarName(idx: number): string {
  return `x${idx}`;
}

export async function runOptimizationEngine(params: {
  companyId: string;
  snapshot: DatasetSnapshotRecord;
  rows: readonly CommercialRow[];
  templateKey: OptimizeTemplateKey;
  totalBudget?: number;
  channels?: ChannelConstraintInput[];
  maxActivePromos?: number;
  createdBy: string;
}): Promise<OptimizationRunRecord> {
  const startMs = Date.now();
  const baseId = `opt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const channelInputs =
    params.channels && params.channels.length > 0
      ? params.channels
      : buildDefaultChannelInputs(params.rows);

  if (channelInputs.length === 0) {
    throw new Error('Cannot formulate optimization problem: active dataset has 0 channels.');
  }

  // Enforce COGS sufficiency gate on Margin Mix template
  if (params.templateKey === 'margin_mix' && !params.snapshot.hasCogs) {
    return {
      id: baseId,
      companyId: params.companyId,
      snapshotId: params.snapshot.id,
      templateKey: params.templateKey,
      title: 'Portfolio Margin & Pricing Mix Optimization',
      solverEngine: 'HiGHS WASM LP/MILP',
      solverStatus: 'BLOCKED_INSUFFICIENT_DATA',
      objectiveValue: 0,
      baselineTotal: 0,
      optimizedTotal: 0,
      netDelta: 0,
      improvementPct: 0,
      totalBudget: 0,
      allocations: [],
      sensitivity: [],
      diagnostics:
        'Blocked by Data Sufficiency Gate: Margin Mix optimization requires >= 80% COGS coverage in the active snapshot.',
      executionMs: Date.now() - startMs,
      createdBy: params.createdBy,
      createdAt: new Date().toISOString(),
    };
  }

  const defaultBudget = channelInputs.reduce((sum, c) => sum + c.baselineSpend, 0);
  const totalBudget =
    params.totalBudget !== undefined && Number.isFinite(params.totalBudget)
      ? Math.max(0, Math.round(params.totalBudget))
      : defaultBudget;

  // Check explicit structural conflicts before/alongside HiGHS
  const sumMin = channelInputs.reduce((s, c) => s + c.minSpend, 0);
  const sumMax = channelInputs.reduce((s, c) => s + c.maxSpend, 0);
  const invertedBounds = channelInputs.filter((c) => c.minSpend > c.maxSpend);

  let lpProblem = '';
  const isMilp = params.templateKey === 'trade_promo';

  if (params.templateKey === 'budget_allocation' || params.templateKey === 'margin_mix') {
    // Concave 2-segment piecewise linear LP per channel:
    // x_i = x_i_core + x_i_stretch (core gets 100% marginal yield, stretch above baseline gets 78% diminishing return)
    const objTerms: string[] = [];
    const budgetTerms: string[] = [];
    const linkConstraints: string[] = [];
    const bounds: string[] = [];

    channelInputs.forEach((ch, idx) => {
      const coeffBase =
        params.templateKey === 'margin_mix'
          ? Number((ch.roiMultiplier * (1 + ch.marginRate)).toFixed(4))
          : ch.roiMultiplier;
      const coeffStretch = Number((coeffBase * 0.78).toFixed(4));
      const coreCap = Math.min(ch.maxSpend, ch.baselineSpend);
      const stretchCap = Math.max(0, ch.maxSpend - coreCap);

      const coreVar = `c${idx}`;
      const stretchVar = `s${idx}`;
      objTerms.push(`${coeffBase} ${coreVar} + ${coeffStretch} ${stretchVar}`);
      budgetTerms.push(`${coreVar} + ${stretchVar}`);
      linkConstraints.push(` min_ch_${idx}: ${coreVar} + ${stretchVar} >= ${ch.minSpend}`);
      linkConstraints.push(` max_ch_${idx}: ${coreVar} + ${stretchVar} <= ${ch.maxSpend}`);
      bounds.push(` 0 <= ${coreVar} <= ${coreCap}`);
      bounds.push(` 0 <= ${stretchVar} <= ${stretchCap}`);
    });

    lpProblem = [
      'Maximize',
      ` obj: ${objTerms.join(' + ')}`,
      'Subject To',
      ` total_budget: ${budgetTerms.join(' + ')} <= ${totalBudget}`,
      ...linkConstraints,
      'Bounds',
      ...bounds,
      'End',
    ].join('\n');
  } else {
    // MILP Trade Marketing Promo Selection with binary activation y_i in {0, 1}
    const maxPromos = Math.max(
      1,
      Math.min(channelInputs.length, params.maxActivePromos ?? Math.ceil(channelInputs.length * 0.7)),
    );
    const objTerms: string[] = [];
    const budgetTerms: string[] = [];
    const activationTerms: string[] = [];
    const constraints: string[] = [];
    const bounds: string[] = [];
    const binaries: string[] = [];

    channelInputs.forEach((ch, idx) => {
      const xv = sanitizeVarName(idx);
      const yv = `y${idx}`;
      const promoLift = Number((ch.roiMultiplier * (1.12 + ch.marginRate * 0.5)).toFixed(4));
      objTerms.push(`${promoLift} ${xv}`);
      budgetTerms.push(xv);
      activationTerms.push(yv);
      constraints.push(` promo_min_${idx}: ${xv} - ${ch.minSpend} ${yv} >= 0`);
      constraints.push(` promo_max_${idx}: ${xv} - ${ch.maxSpend} ${yv} <= 0`);
      bounds.push(` 0 <= ${xv} <= ${ch.maxSpend}`);
      binaries.push(` ${yv}`);
    });

    lpProblem = [
      'Maximize',
      ` obj: ${objTerms.join(' + ')}`,
      'Subject To',
      ` total_budget: ${budgetTerms.join(' + ')} <= ${totalBudget}`,
      ` max_active_promos: ${activationTerms.join(' + ')} <= ${maxPromos}`,
      ...constraints,
      'Bounds',
      ...bounds,
      'Binary',
      ...binaries,
      'End',
    ].join('\n');
  }

  const solver = await getSolver();
  const rawResult = solver.solve(lpProblem, {time_limit: 5});

  let status: SolverStatus = 'INFEASIBLE';
  if (rawResult.Status === 'Optimal') status = 'OPTIMAL';
  else if (rawResult.Status === 'Unbounded') status = 'UNBOUNDED';
  else if (rawResult.Status === 'Time limit reached') status = 'TIME_LIMIT';
  else if (rawResult.Status === 'Infeasible') status = 'INFEASIBLE';

  const baselineTotal = channelInputs.reduce(
    (sum, ch) =>
      sum +
      Math.round(
        ch.baselineSpend *
          (params.templateKey === 'margin_mix'
            ? ch.roiMultiplier * (1 + ch.marginRate)
            : ch.roiMultiplier),
      ),
    0,
  );

  let diagnostics = '';
  const allocations: OptimizationAllocationRow[] = [];
  const sensitivity: Array<{constraint: string; status: string; slack: number; dualValue: number}> =
    [];

  interface RuntimeColumn {
    Primal?: number;
    Dual?: number;
    Status?: string;
    Name?: string;
  }
  interface RuntimeRow {
    Index: number;
    Lower: number;
    Upper: number;
    Primal?: number;
    Dual?: number;
    Status?: string;
    Name?: string;
  }

  const columnsMap = (rawResult.Columns ?? {}) as Record<string, RuntimeColumn>;
  const rowsList = (Array.isArray(rawResult.Rows) ? rawResult.Rows : []) as RuntimeRow[];
  const rowByName = new Map<string, RuntimeRow>();
  for (const r of rowsList) {
    if (typeof r.Name === 'string' && r.Name.length > 0) {
      rowByName.set(r.Name, r);
    }
  }

  if (status === 'OPTIMAL') {
    channelInputs.forEach((ch, idx) => {
      let optSpend = ch.baselineSpend;
      let dualVal = 0;
      let active = true;

      if (isMilp) {
        const colX = columnsMap[sanitizeVarName(idx)];
        const colY = columnsMap[`y${idx}`];
        optSpend = Math.round(colX?.Primal ?? 0);
        active = (colY?.Primal ?? 0) >= 0.5;
      } else {
        const colCore = columnsMap[`c${idx}`];
        const colStretch = columnsMap[`s${idx}`];
        optSpend = Math.round((colCore?.Primal ?? 0) + (colStretch?.Primal ?? 0));
        dualVal = Number(((colStretch?.Dual ?? colCore?.Dual ?? 0) || 0).toFixed(3));
      }

      const effMult =
        params.templateKey === 'margin_mix'
          ? ch.roiMultiplier * (1 + ch.marginRate)
          : params.templateKey === 'trade_promo'
            ? ch.roiMultiplier * (1.12 + ch.marginRate * 0.5)
            : ch.roiMultiplier;

      const baseVal = Math.round(ch.baselineSpend * effMult);
      const optVal = active
        ? Math.round(
            Math.min(optSpend, ch.baselineSpend) * effMult +
              Math.max(0, optSpend - ch.baselineSpend) * effMult * (isMilp ? 1 : 0.78),
          )
        : 0;

      allocations.push({
        segment: ch.segment,
        baseline: baseVal,
        optimized: optVal,
        recommendedSpend: optSpend,
        baselineSpend: ch.baselineSpend,
        delta: optVal - baseVal,
        shadowPrice: dualVal,
        active,
      });
    });

    const budgetRow = rowByName.get('total_budget') ?? rowsList[0];
    if (budgetRow) {
      const budgetPrimal = budgetRow.Primal ?? 0;
      const budgetSlack = Math.round((totalBudget - budgetPrimal) * 100) / 100;
      sensitivity.push({
        constraint: 'Total Budget Cap',
        status: budgetRow.Status ?? (Math.abs(budgetSlack) < 0.01 ? 'UB' : 'BS'),
        slack: budgetSlack,
        dualValue: Number((budgetRow.Dual ?? 0).toFixed(4)),
      });
    }
    if (isMilp) {
      const promoCapRow = rowByName.get('max_active_promos') ?? rowsList[1];
      if (promoCapRow && Number.isFinite(promoCapRow.Upper)) {
        const usedPromos = Math.round(promoCapRow.Primal ?? 0);
        const capPromos = Math.round(promoCapRow.Upper);
        sensitivity.push({
          constraint: 'Max Active Promos Cap',
          status: usedPromos >= capPromos ? 'BINDING_UPPER' : 'BS',
          slack: Math.max(0, capPromos - usedPromos),
          dualValue: 0,
        });
      }
    } else {
      channelInputs.forEach((ch, idx) => {
        const rMin = rowByName.get(`min_ch_${idx}`);
        const rMax = rowByName.get(`max_ch_${idx}`);
        if (rMin && rMin.Status && rMin.Status !== 'BS') {
          sensitivity.push({
            constraint: `${ch.segment} Minimum Floor`,
            status: 'BINDING_LOWER',
            slack: 0,
            dualValue: Number((rMin.Dual ?? 0).toFixed(4)),
          });
        }
        if (rMax && rMax.Status && rMax.Status !== 'BS') {
          sensitivity.push({
            constraint: `${ch.segment} Maximum Cap`,
            status: 'BINDING_UPPER',
            slack: 0,
            dualValue: Number((rMax.Dual ?? 0).toFixed(4)),
          });
        }
      });
    }

    diagnostics = `HiGHS solved to proven optimality in ${Date.now() - startMs} ms across ${channelInputs.length} commercial segments.`;
  } else {
    const reasons: string[] = [];
    if (invertedBounds.length > 0) {
      reasons.push(
        `Inverted min/max bounds on: ${invertedBounds.map((c) => c.segment).join(', ')}.`,
      );
    }
    if (sumMin > totalBudget) {
      reasons.push(
        `Sum of minimum channel spend (${sumMin.toLocaleString()}) exceeds Total Budget (${totalBudget.toLocaleString()}).`,
      );
    }
    if (reasons.length === 0) {
      reasons.push(`Solver reported status "${rawResult.Status}". Relax conflicting bounds or increase budget.`);
    }
    diagnostics = reasons.join(' ');
  }

  const optimizedTotal =
    status === 'OPTIMAL'
      ? allocations.reduce((sum, a) => sum + a.optimized, 0)
      : 0;
  const netDelta = status === 'OPTIMAL' ? optimizedTotal - baselineTotal : 0;
  const improvementPct =
    status === 'OPTIMAL' && baselineTotal > 0
      ? Number(((netDelta / baselineTotal) * 100).toFixed(1))
      : 0;

  const titleMap: Record<OptimizeTemplateKey, string> = {
    budget_allocation: 'Channel Budget Allocation (Piecewise LP)',
    margin_mix: 'Portfolio Margin & Pricing Mix (COGS-Gated LP)',
    trade_promo: 'Trade Marketing Promo Selection (Binary MILP)',
  };

  return {
    id: baseId,
    companyId: params.companyId,
    snapshotId: params.snapshot.id,
    templateKey: params.templateKey,
    title: titleMap[params.templateKey],
    solverEngine: isMilp ? 'HiGHS WASM MILP' : 'HiGHS WASM Simplex LP',
    solverStatus: status,
    objectiveValue: Math.round(rawResult.ObjectiveValue ?? optimizedTotal),
    baselineTotal,
    optimizedTotal,
    netDelta,
    improvementPct,
    totalBudget,
    allocations,
    sensitivity,
    diagnostics,
    executionMs: Math.max(1, Date.now() - startMs),
    createdBy: params.createdBy,
    createdAt: new Date().toISOString(),
  };
}

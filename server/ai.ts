import {GoogleGenAI} from '@google/genai';
import type {
  CompanyRecord,
  DatasetSnapshotRecord,
  DecisionDossierRecord,
  DetectAlertRecord,
  ForecastRunRecord,
  OptimizationRunRecord,
} from './types.ts';

export async function runGroundedGeminiAnalysis(params: {
  prompt: string;
  language: 'en' | 'ar';
  company: CompanyRecord;
  snapshot: DatasetSnapshotRecord | null;
  kpiSummary: {
    totalRevenue: number;
    grossMarginPct: number | null;
    totalMarketingSpend: number;
    totalTradeSpend: number;
    targetVariancePct: number;
  };
  latestForecast: ForecastRunRecord | null;
  latestOptimization: OptimizationRunRecord | null;
  decisions: DecisionDossierRecord[];
  alerts: DetectAlertRecord[];
}): Promise<{answer: string; model: string; groundedSnapshotVersion: number | null}> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured. Add your Gemini API key in Settings > Secrets to use the AI Workspace.',
    );
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const groundedContext = {
    tenant: params.company,
    activeSnapshot: params.snapshot
      ? {
          version: params.snapshot.versionNumber,
          sourceName: params.snapshot.sourceName,
          qualityScore: params.snapshot.qualityScore,
          sufficiencyStatus: params.snapshot.sufficiencyStatus,
          hasCogs: params.snapshot.hasCogs,
          rowCount: params.snapshot.rowCount,
        }
      : null,
    kpis: params.kpiSummary,
    latestForecast: params.latestForecast
      ? {
          modelType: params.latestForecast.modelType,
          metric: params.latestForecast.metric,
          mape: params.latestForecast.mape,
          naiveMape: params.latestForecast.naiveMape,
          horizon: params.latestForecast.horizon,
          nextPeriods: params.latestForecast.points.filter((p) => p.actual === null),
        }
      : null,
    latestOptimization: params.latestOptimization
      ? {
          title: params.latestOptimization.title,
          solverStatus: params.latestOptimization.solverStatus,
          baselineTotal: params.latestOptimization.baselineTotal,
          optimizedTotal: params.latestOptimization.optimizedTotal,
          netDelta: params.latestOptimization.netDelta,
          improvementPct: params.latestOptimization.improvementPct,
          allocations: params.latestOptimization.allocations,
        }
      : null,
    decisions: params.decisions.slice(0, 6).map((d) => ({
      title: d.title,
      status: d.status,
      executionRef: d.executionRef,
      actualOutcomeValue: d.actualOutcomeValue,
    })),
    openAlerts: params.alerts
      .filter((a) => a.status === 'OPEN' || a.status === 'UNDER_REVIEW')
      .map((a) => ({
        severity: a.severity,
        category: a.category,
        title: a.title,
        metricValue: a.metricValue,
      })),
  };

  const model = 'gemini-4-hydrogen';
  const systemInstruction =
    params.language === 'ar'
      ? 'أنت محلل القرارات التجارية في منصة TETRA OS. التزم التزاماً صارماً بالبيانات الموثقة المرفقة فقط دون اختلاق أي أرقام أو توقعات غير موجودة في السياق. أجب باللغة العربية بأسلوب تنفيذي واضح ومختصر.'
      : 'You are the TETRA OS Commercial Decisions Analyst. Ground every number, metric, solver status, and recommendation strictly in the provided verified tenant telemetry JSON. Never invent unverified metrics or claim execution without approval.';

  const response = await ai.models.generateContent({
    model,
    contents: `VERIFIED TENANT TELEMETRY:\n${JSON.stringify(groundedContext, null, 2)}\n\nUSER QUESTION:\n${params.prompt}`,
    config: {
      systemInstruction,
    },
  });

  const text = response.text?.trim();
  if (!text) {
    throw new Error('Gemini returned an empty response.');
  }

  return {
    answer: text,
    model,
    groundedSnapshotVersion: params.snapshot?.versionNumber ?? null,
  };
}

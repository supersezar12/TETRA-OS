export type EnterpriseRoleId =
  | 'platform_super_admin'
  | 'company_owner'
  | 'executive_manager'
  | 'commercial_director'
  | 'sales_manager'
  | 'trade_marketing_manager'
  | 'finance_manager'
  | 'procurement_manager'
  | 'data_analyst'
  | 'decision_reviewer'
  | 'department_manager'
  | 'read_only_user';

export type UserAccountStatus = 'ACTIVE' | 'PENDING_INVITE' | 'SUSPENDED';

export type PermissionKey =
  | 'ingestData'
  | 'runPredict'
  | 'runOptimize'
  | 'approveDecisions'
  | 'manageDetectAlerts'
  | 'exportReports'
  | 'manageUsers';

export interface RoleDefinition {
  id: EnterpriseRoleId;
  name: string;
  scopeLevel: 'Platform' | 'Company' | 'Region / Branch' | 'Department';
  permissions: Record<PermissionKey, boolean>;
}

export const ENTERPRISE_ROLE_MATRIX: readonly RoleDefinition[] = [
  {
    id: 'platform_super_admin',
    name: 'Platform Super Admin',
    scopeLevel: 'Platform',
    permissions: {
      ingestData: true,
      runPredict: true,
      runOptimize: true,
      approveDecisions: true,
      manageDetectAlerts: true,
      exportReports: true,
      manageUsers: true,
    },
  },
  {
    id: 'company_owner',
    name: 'Company Owner',
    scopeLevel: 'Company',
    permissions: {
      ingestData: true,
      runPredict: true,
      runOptimize: true,
      approveDecisions: true,
      manageDetectAlerts: true,
      exportReports: true,
      manageUsers: true,
    },
  },
  {
    id: 'executive_manager',
    name: 'Executive Manager',
    scopeLevel: 'Company',
    permissions: {
      ingestData: false,
      runPredict: true,
      runOptimize: true,
      approveDecisions: true,
      manageDetectAlerts: true,
      exportReports: true,
      manageUsers: false,
    },
  },
  {
    id: 'commercial_director',
    name: 'Commercial Director',
    scopeLevel: 'Company',
    permissions: {
      ingestData: false,
      runPredict: true,
      runOptimize: true,
      approveDecisions: true,
      manageDetectAlerts: true,
      exportReports: true,
      manageUsers: false,
    },
  },
  {
    id: 'sales_manager',
    name: 'Sales Manager',
    scopeLevel: 'Region / Branch',
    permissions: {
      ingestData: false,
      runPredict: true,
      runOptimize: false,
      approveDecisions: false,
      manageDetectAlerts: true,
      exportReports: true,
      manageUsers: false,
    },
  },
  {
    id: 'trade_marketing_manager',
    name: 'Trade Marketing Manager',
    scopeLevel: 'Department',
    permissions: {
      ingestData: true,
      runPredict: true,
      runOptimize: true,
      approveDecisions: false,
      manageDetectAlerts: true,
      exportReports: true,
      manageUsers: false,
    },
  },
  {
    id: 'finance_manager',
    name: 'Finance Manager',
    scopeLevel: 'Company',
    permissions: {
      ingestData: true,
      runPredict: true,
      runOptimize: true,
      approveDecisions: true,
      manageDetectAlerts: true,
      exportReports: true,
      manageUsers: false,
    },
  },
  {
    id: 'procurement_manager',
    name: 'Procurement Manager',
    scopeLevel: 'Department',
    permissions: {
      ingestData: true,
      runPredict: true,
      runOptimize: true,
      approveDecisions: false,
      manageDetectAlerts: true,
      exportReports: true,
      manageUsers: false,
    },
  },
  {
    id: 'data_analyst',
    name: 'Data Analyst',
    scopeLevel: 'Company',
    permissions: {
      ingestData: true,
      runPredict: true,
      runOptimize: true,
      approveDecisions: false,
      manageDetectAlerts: true,
      exportReports: true,
      manageUsers: false,
    },
  },
  {
    id: 'decision_reviewer',
    name: 'Decision Reviewer',
    scopeLevel: 'Company',
    permissions: {
      ingestData: false,
      runPredict: false,
      runOptimize: false,
      approveDecisions: true,
      manageDetectAlerts: true,
      exportReports: true,
      manageUsers: false,
    },
  },
  {
    id: 'department_manager',
    name: 'Department Manager',
    scopeLevel: 'Department',
    permissions: {
      ingestData: false,
      runPredict: true,
      runOptimize: false,
      approveDecisions: false,
      manageDetectAlerts: true,
      exportReports: true,
      manageUsers: false,
    },
  },
  {
    id: 'read_only_user',
    name: 'Read-only User',
    scopeLevel: 'Region / Branch',
    permissions: {
      ingestData: false,
      runPredict: false,
      runOptimize: false,
      approveDecisions: false,
      manageDetectAlerts: false,
      exportReports: false,
      manageUsers: false,
    },
  },
];

export function getRoleDefinition(roleId: string): RoleDefinition {
  return (
    ENTERPRISE_ROLE_MATRIX.find((r) => r.id === roleId) ??
    ENTERPRISE_ROLE_MATRIX[ENTERPRISE_ROLE_MATRIX.length - 1]
  );
}

export function roleHasPermission(roleId: EnterpriseRoleId, permission: PermissionKey): boolean {
  const role = getRoleDefinition(roleId);
  return Boolean(role.permissions[permission]);
}

export interface CompanyRecord {
  id: string;
  name: string;
  currency: string;
  country: string;
}

export interface SafeUserRecord {
  id: string;
  companyId: string;
  companyName: string;
  fullName: string;
  email: string;
  roleId: EnterpriseRoleId;
  regionScope: string;
  branchScope: string;
  departmentScope: string;
  status: UserAccountStatus;
  lastActive: string;
  isIllustrativeDemo: boolean;
}

export type SufficiencyStatus = 'READY' | 'PARTIAL' | 'INSUFFICIENT_DATA';

export interface DatasetSnapshotRecord {
  id: string;
  companyId: string;
  versionNumber: number;
  sourceName: string;
  sourceType: 'SEED' | 'CSV' | 'XLSX' | 'JSON';
  rowCount: number;
  qualityScore: number;
  sufficiencyStatus: SufficiencyStatus;
  hasCogs: boolean;
  hasSpend: boolean;
  missingFields: string[];
  columnMapping: Record<string, string>;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
}

export interface CommercialRow {
  period: string;
  region: string;
  branch: string;
  department: string;
  channel: string;
  product: string;
  revenue: number;
  cogs: number | null;
  marketingSpend: number | null;
  tradeSpend: number | null;
  units: number;
  approvedTarget: number;
}

export type PredictModelType = 'SES' | 'HOLT_WINTERS' | 'LINEAR_REGRESSION';

export interface ForecastPoint {
  period: string;
  actual: number | null;
  forecast: number;
  lower95: number;
  upper95: number;
  naiveBaseline: number | null;
}

export interface ForecastRunRecord {
  id: string;
  companyId: string;
  snapshotId: string;
  modelType: PredictModelType;
  metric: 'revenue' | 'gross_margin' | 'units';
  horizon: number;
  scopeFilter: string;
  mae: number;
  rmse: number;
  mape: number;
  naiveMape: number;
  points: ForecastPoint[];
  createdBy: string;
  createdAt: string;
}

export type OptimizeTemplateKey = 'budget_allocation' | 'margin_mix' | 'trade_promo';
export type SolverStatus = 'OPTIMAL' | 'FEASIBLE' | 'INFEASIBLE' | 'UNBOUNDED' | 'TIME_LIMIT' | 'BLOCKED_INSUFFICIENT_DATA';

export interface ChannelConstraintInput {
  segment: string;
  baselineSpend: number;
  baselineReturn: number;
  roiMultiplier: number;
  marginRate: number;
  minSpend: number;
  maxSpend: number;
}

export interface OptimizationAllocationRow {
  segment: string;
  baseline: number;
  optimized: number;
  recommendedSpend: number;
  baselineSpend: number;
  delta: number;
  shadowPrice: number;
  active: boolean;
}

export interface OptimizationRunRecord {
  id: string;
  companyId: string;
  snapshotId: string;
  templateKey: OptimizeTemplateKey;
  title: string;
  solverEngine: string;
  solverStatus: SolverStatus;
  objectiveValue: number;
  baselineTotal: number;
  optimizedTotal: number;
  netDelta: number;
  improvementPct: number;
  totalBudget: number;
  allocations: OptimizationAllocationRow[];
  sensitivity: Array<{constraint: string; status: string; slack: number; dualValue: number}>;
  diagnostics: string;
  executionMs: number;
  createdBy: string;
  createdAt: string;
}

export type DecisionStatus = 'PENDING_REVIEW' | 'APPROVED' | 'MODIFIED' | 'REJECTED';

export interface DecisionDossierRecord {
  id: string;
  companyId: string;
  optimizationRunId: string;
  title: string;
  status: DecisionStatus;
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

export type AlertStatus = 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED' | 'DISMISSED';
export type AlertSeverity = 'HIGH' | 'MEDIUM' | 'LOW';

export interface DetectAlertRecord {
  id: string;
  companyId: string;
  snapshotId: string;
  ruleCode: string;
  severity: AlertSeverity;
  category: 'VARIANCE' | 'MARGIN_DRIFT' | 'CONCENTRATION_RISK' | 'OPPORTUNITY';
  title: string;
  description: string;
  metricValue: number;
  thresholdValue: number;
  status: AlertStatus;
  parentAlertId: string | null;
  occurrenceCount: number;
  resolutionNotes: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLogRecord {
  id: string;
  companyId: string;
  actorUserId: string;
  actorEmail: string;
  actorRole: string;
  action: string;
  resourceType: string;
  resourceId: string;
  details: Record<string, unknown>;
  createdAt: string;
}

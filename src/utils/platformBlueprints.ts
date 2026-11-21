export type AppView =
  | 'overview'
  | 'data'
  | 'predict'
  | 'optimize'
  | 'decisions'
  | 'detect'
  | 'ai_reports'
  | 'workflow'
  | 'wireframes'
  | 'users';

export interface WorkflowStage {
  id: string;
  stepNumber: string;
  title: string;
  engine: 'Data Layer' | 'Predict' | 'Optimize' | 'Decision Layer' | 'Detect';
  summary: string;
  inputs: string[];
  outputs: string[];
  gateRule: string;
  accountableRoles: string[];
}

export interface WireframeZone {
  id: string;
  label: string;
  slotType: 'header' | 'sidebar' | 'kpis' | 'chart' | 'table' | 'inspector' | 'actions';
  colSpanDesktop: string;
  description: string;
}

export interface ScreenWireframeSpec {
  id: string;
  title: string;
  category: string;
  route: string;
  purpose: string;
  primaryActions: string[];
  guardrails: string[];
  zones: WireframeZone[];
}

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

export interface RoleDefinition {
  id: EnterpriseRoleId;
  name: string;
  scopeLevel: 'Platform' | 'Company' | 'Region / Branch' | 'Department';
  permissions: {
    ingestData: boolean;
    runPredict: boolean;
    runOptimize: boolean;
    approveDecisions: boolean;
    manageDetectAlerts: boolean;
    exportReports: boolean;
    manageUsers: boolean;
  };
}

export interface SampleUserRecord {
  id: string;
  fullName: string;
  email: string;
  roleId: EnterpriseRoleId;
  companyName: string;
  regionScope: string;
  branchScope: string;
  departmentScope: string;
  status: UserAccountStatus;
  lastActive: string;
  isIllustrativeDemo: true;
}

export interface InviteUserInput {
  fullName: string;
  email: string;
  roleId: EnterpriseRoleId;
  regionScope: string;
  branchScope: string;
  departmentScope: string;
}

export const WORKFLOW_STAGES: WorkflowStage[] = [
  {
    id: 'data-ingestion',
    stepNumber: '01',
    title: 'Data Ingestion & Mapping',
    engine: 'Data Layer',
    summary:
      'Ingest Excel, CSV, JSON, or API feeds with column detection, type mapping, and duplicate checks.',
    inputs: ['CSV / Excel / JSON Files', 'ERP / POS / Accounting Feeds'],
    outputs: ['Mapped Dataset Snapshot', 'Import History & Lineage Record'],
    gateRule: 'Requires valid company_id tenant scope and schema type conformance.',
    accountableRoles: ['Data Analyst', 'Platform Super Admin'],
  },
  {
    id: 'validation-sufficiency',
    stepNumber: '02',
    title: 'Quality & Sufficiency Gate',
    engine: 'Data Layer',
    summary:
      'Evaluate completeness, consistency, referential integrity, and COGS/spend availability.',
    inputs: ['Dataset Snapshot', 'Commercial Policy Rules'],
    outputs: [
      'Quality Score',
      'Sufficiency Status (READY / PARTIAL / INSUFFICIENT_DATA)',
    ],
    gateRule:
      'Blocks Gross Profit without COGS and blocks ROI without Actual Spend & Attributable Return.',
    accountableRoles: ['Data Analyst', 'Finance Manager'],
  },
  {
    id: 'predict',
    stepNumber: '03',
    title: 'PREDICT — Forecasting & Backtesting',
    engine: 'Predict',
    summary:
      'Generate demand, sales, channel, and liquidity forecasts benchmarked against Naive baselines.',
    inputs: ['Validated Time-Series Data', 'Horizon & Scope Selection'],
    outputs: ['Versioned Forecast', 'MAPE / RMSE Backtest', 'Confidence Intervals'],
    gateRule: 'Forecasts remain strictly separated from Approved Targets.',
    accountableRoles: ['Data Analyst', 'Commercial Director'],
  },
  {
    id: 'optimize',
    stepNumber: '04',
    title: 'OPTIMIZE — Mathematical Solver',
    engine: 'Optimize',
    summary:
      'Formulate variables, objective, and constraints; run LP/MILP/NLP/Monte Carlo in worker threads.',
    inputs: ['Versioned Forecast', 'Budgets & Policies', 'Operational Constraints'],
    outputs: [
      'Solver Status (OPTIMAL / FEASIBLE / INFEASIBLE / TIME_LIMIT)',
      'Sensitivity Bounds',
    ],
    gateRule:
      'Never reports OPTIMAL on timed-out runs; surfaces conflicting constraints on INFEASIBLE.',
    accountableRoles: ['Data Analyst', 'Finance Manager', 'Commercial Director'],
  },
  {
    id: 'recommendation',
    stepNumber: '05',
    title: 'Recommendation Dossier',
    engine: 'Decision Layer',
    summary:
      'Package solver output, evidence, assumptions, risks, and limitations into a reviewable dossier.',
    inputs: ['Optimization Run Metadata', 'Forecast Reference', 'Data Quality Status'],
    outputs: ['Recommendation Record (DRAFT / PENDING_REVIEW)'],
    gateRule: 'Every recommendation traces back to Dataset Version, Model ID, and Assumptions.',
    accountableRoles: ['Commercial Director', 'Trade Marketing Manager', 'Sales Manager'],
  },
  {
    id: 'review-approval',
    stepNumber: '06',
    title: 'Management Review & Approval',
    engine: 'Decision Layer',
    summary:
      'Authorized reviewers approve, modify, reject, or request re-analysis with immutable audit logging.',
    inputs: ['Recommendation Dossier', 'Reviewer Commentary'],
    outputs: ['Approved Decision (APPROVED / MODIFIED / REJECTED)', 'Audit Trail Entry'],
    gateRule: 'Recommendations never self-execute without explicit RBAC approval authority.',
    accountableRoles: ['Company Owner', 'Executive Manager', 'Decision Reviewer'],
  },
  {
    id: 'execution-reference',
    stepNumber: '07',
    title: 'Execution Reference Handoff',
    engine: 'Decision Layer',
    summary:
      'Record external ERP/CRM/Marketing execution ticket IDs without replacing operational systems.',
    inputs: ['Approved Decision ID', 'External System Reference ID'],
    outputs: ['Execution Reference Record'],
    gateRule: 'Approved Decision status stays distinct from Execution confirmation.',
    accountableRoles: ['Sales Manager', 'Trade Marketing Manager', 'Procurement Manager'],
  },
  {
    id: 'measurement-detect',
    stepNumber: '08',
    title: 'Outcome Measurement & DETECT',
    engine: 'Detect',
    summary:
      'Compare Actual Outcomes against Targets, Forecasts, and Decisions; raise auditable alerts.',
    inputs: ['Actual Outcomes Feed', 'Approved Targets', 'Forecasts & Budgets'],
    outputs: ['Performance Measurement', 'Variance Alerts (OPEN -> RESOLVED | DISMISSED)'],
    gateRule: 'Alert history is immutable; recurring issues link back to prior closed alerts.',
    accountableRoles: ['Executive Manager', 'Finance Manager', 'Decision Reviewer'],
  },
];

export const SCREEN_WIREFRAMES: ScreenWireframeSpec[] = [
  {
    id: 'wf-executive-dashboard',
    title: 'Executive Intelligence Dashboard',
    category: 'Intelligence Core',
    route: '/dashboard',
    purpose:
      'Synthesizes commercial posture, forecast vs. target gaps, optimization runs, pending approvals, and active Detect alerts.',
    primaryActions: ['Filter by Region/Channel', 'Open Decision Dossier', 'Inspect Alert'],
    guardrails: [
      'Every KPI displays Currency, Unit, Period & Data Quality badge',
      'Separates Forecasts from Approved Targets',
    ],
    zones: [
      {
        id: 'z-hdr',
        label: 'Top Utility Bar (Company Switcher · Language RTL/LTR · User Scope)',
        slotType: 'header',
        colSpanDesktop: 'col-span-12',
        description: 'Tenant selector, AR/EN toggle, and authenticated user badge.',
      },
      {
        id: 'z-nav',
        label: 'Module Rail',
        slotType: 'sidebar',
        colSpanDesktop: 'col-span-12 lg:col-span-3',
        description: 'Navigation across Data, Predict, Optimize, Decisions, Detect & Reports.',
      },
      {
        id: 'z-kpi',
        label: '4-Card Commercial KPI Strip (Revenue · COGS Margin · Target Gap · Open Alerts)',
        slotType: 'kpis',
        colSpanDesktop: 'col-span-12 lg:col-span-9',
        description: 'Anchored to dataset snapshot version and currency.',
      },
      {
        id: 'z-chart',
        label: 'Forecast vs. Actuals & Optimization Lift Canvas',
        slotType: 'chart',
        colSpanDesktop: 'col-span-12 lg:col-span-6',
        description: 'Interactive chart with confidence bands and baseline comparison.',
      },
      {
        id: 'z-table',
        label: 'Pending Approvals & Active Variance Alerts Queue',
        slotType: 'table',
        colSpanDesktop: 'col-span-12 lg:col-span-6',
        description: 'Prioritized action rows linking directly to Decision & Detect workspaces.',
      },
    ],
  },
  {
    id: 'wf-data-center',
    title: 'Data Center (Ingestion & Quality)',
    category: 'Data Governance',
    route: '/data-center',
    purpose:
      'Manages CSV/Excel/JSON uploads, column mapping, validation rules, quality scoring, snapshots, and safe rollback.',
    primaryActions: ['Upload Dataset', 'Map Columns', 'Run Validation', 'Rollback Snapshot'],
    guardrails: [
      'Blocks analytical modules when Sufficiency = INSUFFICIENT_DATA',
      'Preserves immutable Import History and Data Lineage',
    ],
    zones: [
      {
        id: 'z-hdr',
        label: 'Source Selector & Upload Dropzone (CSV / XLSX / JSON)',
        slotType: 'header',
        colSpanDesktop: 'col-span-12',
        description: 'File size/type sanitization and source connector selection.',
      },
      {
        id: 'z-map',
        label: 'Schema Column Mapping & Type Inference Grid',
        slotType: 'table',
        colSpanDesktop: 'col-span-12 lg:col-span-8',
        description: 'Maps source headers to canonical SKU, Customer, Channel, COGS & Spend fields.',
      },
      {
        id: 'z-qual',
        label: 'Data Quality & Sufficiency Scorecard',
        slotType: 'inspector',
        colSpanDesktop: 'col-span-12 lg:col-span-4',
        description: 'Displays READY / PARTIAL / INSUFFICIENT_DATA and missing required fields.',
      },
    ],
  },
  {
    id: 'wf-optimization-center',
    title: 'Optimization Center (Mathematical Solver)',
    category: 'Decision Engines',
    route: '/optimize',
    purpose:
      'Configures decision variables, objective functions, and constraints; executes LP/MILP/NLP solvers and sensitivity checks.',
    primaryActions: ['Select Problem Template', 'Edit Constraints', 'Run Solver', 'Create Recommendation'],
    guardrails: [
      'Authentic Solver Status (OPTIMAL vs FEASIBLE vs INFEASIBLE vs TIME_LIMIT)',
      'Displays constraint conflict diagnostics when INFEASIBLE',
    ],
    zones: [
      {
        id: 'z-vars',
        label: 'Problem Definition & Constraint Builder',
        slotType: 'sidebar',
        colSpanDesktop: 'col-span-12 lg:col-span-4',
        description: 'Budget caps, min/max channel bounds, margin floors, and solver time limit.',
      },
      {
        id: 'z-sol',
        label: 'Solver Output & Scenario Comparison Chart',
        slotType: 'chart',
        colSpanDesktop: 'col-span-12 lg:col-span-8',
        description: 'Baseline vs. Optimized allocation, objective value, and optimality gap.',
      },
      {
        id: 'z-sens',
        label: 'Sensitivity Bounds & Run Reproducibility Log',
        slotType: 'inspector',
        colSpanDesktop: 'col-span-12',
        description: 'Model ID, Solver Version, Seed, Execution Time, and Create Recommendation CTA.',
      },
    ],
  },
  {
    id: 'wf-decision-workspace',
    title: 'Decision Workspace (Review & Approval)',
    category: 'Governance',
    route: '/decisions',
    purpose:
      'Reviews solver recommendations, captures management approval/rejection/modification, and links external Execution References.',
    primaryActions: ['Approve Decision', 'Request Modification', 'Attach Execution Reference'],
    guardrails: [
      'Backend RBAC enforces approval authority per Company/Region/Budget limit',
      'Separates Recommendation -> Approved Decision -> Execution Reference -> Actual Outcome',
    ],
    zones: [
      {
        id: 'z-list',
        label: 'Recommendation Queue (PENDING_REVIEW / UNDER_REVIEW / APPROVED)',
        slotType: 'sidebar',
        colSpanDesktop: 'col-span-12 lg:col-span-4',
        description: 'Filterable list of active dossiers with confidence and risk tags.',
      },
      {
        id: 'z-dossier',
        label: 'Decision Evidence, Assumptions & Limitations Dossier',
        slotType: 'inspector',
        colSpanDesktop: 'col-span-12 lg:col-span-8',
        description: 'Dataset snapshot, forecast ref, solver status, and audit comment timeline.',
      },
      {
        id: 'z-act',
        label: 'Approval Action Bar & Execution Reference Form',
        slotType: 'actions',
        colSpanDesktop: 'col-span-12',
        description: 'Approve / Reject / Modify controls + external ERP/CRM execution tracking.',
      },
    ],
  },
  {
    id: 'wf-users-governance',
    title: 'Users, Roles & Tenant Governance',
    category: 'Administration',
    route: '/admin/users',
    purpose:
      'Manages enterprise users, 12-role RBAC permissions, geographic/branch/department access scopes, and audit logs.',
    primaryActions: ['Invite User', 'Assign Role & Scope', 'Suspend / Reactivate', 'Inspect Audit Log'],
    guardrails: [
      'Cross-tenant access strictly isolated by server-derived company_id',
      'Permission checks enforced in API & DB queries, never UI-only',
    ],
    zones: [
      {
        id: 'z-bar',
        label: 'Role & Status Filter Bar + Invite User CTA',
        slotType: 'header',
        colSpanDesktop: 'col-span-12',
        description: 'Search by name/email, filter by role or status, open invite drawer.',
      },
      {
        id: 'z-users',
        label: 'Scoped User Directory Table',
        slotType: 'table',
        colSpanDesktop: 'col-span-12 lg:col-span-8',
        description: 'Displays Role, Company/Region/Branch/Dept scope, and Account Status.',
      },
      {
        id: 'z-rbac',
        label: 'Role Permission Matrix & Approval Scope Inspector',
        slotType: 'inspector',
        colSpanDesktop: 'col-span-12 lg:col-span-4',
        description: 'Read-only/editable matrix of Ingest, Predict, Optimize, Approve & Export rights.',
      },
    ],
  },
];

export const ENTERPRISE_ROLES: RoleDefinition[] = [
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

export const INITIAL_SAMPLE_USERS: SampleUserRecord[] = [
  {
    id: 'usr-101',
    fullName: 'Tariq Al-Mansoor',
    email: 't.almansoor@alrayan-dist.example',
    roleId: 'company_owner',
    companyName: 'Al-Rayan Distribution Co.',
    regionScope: 'All Regions',
    branchScope: 'All Branches',
    departmentScope: 'Executive',
    status: 'ACTIVE',
    lastActive: '2026-11-21 09:40',
    isIllustrativeDemo: true,
  },
  {
    id: 'usr-102',
    fullName: 'Nadia Al-Harbi',
    email: 'n.alharbi@alrayan-dist.example',
    roleId: 'commercial_director',
    companyName: 'Al-Rayan Distribution Co.',
    regionScope: 'All Regions',
    branchScope: 'All Branches',
    departmentScope: 'Commercial Strategy',
    status: 'ACTIVE',
    lastActive: '2026-11-21 09:15',
    isIllustrativeDemo: true,
  },
  {
    id: 'usr-103',
    fullName: 'Omar Haddad',
    email: 'o.haddad@alrayan-dist.example',
    roleId: 'data_analyst',
    companyName: 'Al-Rayan Distribution Co.',
    regionScope: 'All Regions',
    branchScope: 'HQ Analytics',
    departmentScope: 'BI & Operations Research',
    status: 'ACTIVE',
    lastActive: '2026-11-21 08:52',
    isIllustrativeDemo: true,
  },
  {
    id: 'usr-104',
    fullName: 'Laila Al-Zahrani',
    email: 'l.alzahrani@alrayan-dist.example',
    roleId: 'finance_manager',
    companyName: 'Al-Rayan Distribution Co.',
    regionScope: 'All Regions',
    branchScope: 'All Branches',
    departmentScope: 'Finance & Credit',
    status: 'ACTIVE',
    lastActive: '2026-11-20 17:10',
    isIllustrativeDemo: true,
  },
  {
    id: 'usr-105',
    fullName: 'Faisal Al-Qahtani',
    email: 'f.alqahtani@alrayan-dist.example',
    roleId: 'sales_manager',
    companyName: 'Al-Rayan Distribution Co.',
    regionScope: 'Central Region',
    branchScope: 'Riyadh Main Depot',
    departmentScope: 'Wholesale & Modern Trade',
    status: 'ACTIVE',
    lastActive: '2026-11-20 15:28',
    isIllustrativeDemo: true,
  },
  {
    id: 'usr-106',
    fullName: 'Sara Al-Dosari',
    email: 's.aldosari@alrayan-dist.example',
    roleId: 'trade_marketing_manager',
    companyName: 'Al-Rayan Distribution Co.',
    regionScope: 'Western & Central',
    branchScope: 'Jeddah & Riyadh',
    departmentScope: 'Trade Marketing',
    status: 'PENDING_INVITE',
    lastActive: 'Invite sent 2026-11-21',
    isIllustrativeDemo: true,
  },
  {
    id: 'usr-107',
    fullName: 'Karim Nassar',
    email: 'k.nassar@alrayan-dist.example',
    roleId: 'read_only_user',
    companyName: 'Al-Rayan Distribution Co.',
    regionScope: 'Eastern Region',
    branchScope: 'Dammam Branch',
    departmentScope: 'Field Operations',
    status: 'SUSPENDED',
    lastActive: '2026-11-03 11:04',
    isIllustrativeDemo: true,
  },
];

export function filterUsers(
  users: readonly SampleUserRecord[],
  query: string,
  roleFilter: EnterpriseRoleId | 'ALL',
  statusFilter: UserAccountStatus | 'ALL',
): SampleUserRecord[] {
  const normalizedQuery = query.trim().toLowerCase();
  return users.filter((user) => {
    if (roleFilter !== 'ALL' && user.roleId !== roleFilter) {
      return false;
    }
    if (statusFilter !== 'ALL' && user.status !== statusFilter) {
      return false;
    }
    if (!normalizedQuery) {
      return true;
    }
    return (
      user.fullName.toLowerCase().includes(normalizedQuery) ||
      user.email.toLowerCase().includes(normalizedQuery) ||
      user.regionScope.toLowerCase().includes(normalizedQuery) ||
      user.departmentScope.toLowerCase().includes(normalizedQuery)
    );
  });
}

export function validateUserInvite(
  input: InviteUserInput,
  existingUsers: readonly SampleUserRecord[],
): string | null {
  if (!input.fullName.trim()) {
    return 'Full name is required.';
  }
  const normalizedEmail = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return 'Enter a valid work email address.';
  }
  if (existingUsers.some((u) => u.email.toLowerCase() === normalizedEmail)) {
    return 'A user with this email already exists in this tenant.';
  }
  if (!input.regionScope.trim() || !input.branchScope.trim() || !input.departmentScope.trim()) {
    return 'Region, branch, and department scopes are required.';
  }
  return null;
}

export function createInvitedUser(
  input: InviteUserInput,
  nextIdNumber: number,
): SampleUserRecord {
  return {
    id: `usr-${nextIdNumber}`,
    fullName: input.fullName.trim(),
    email: input.email.trim().toLowerCase(),
    roleId: input.roleId,
    companyName: 'Al-Rayan Distribution Co.',
    regionScope: input.regionScope.trim(),
    branchScope: input.branchScope.trim(),
    departmentScope: input.departmentScope.trim(),
    status: 'PENDING_INVITE',
    lastActive: 'Invite sent just now',
    isIllustrativeDemo: true,
  };
}

export function computeUsersSummary(users: readonly SampleUserRecord[]): {
  total: number;
  active: number;
  pending: number;
  suspended: number;
} {
  return users.reduce(
    (acc, user) => {
      acc.total += 1;
      if (user.status === 'ACTIVE') acc.active += 1;
      if (user.status === 'PENDING_INVITE') acc.pending += 1;
      if (user.status === 'SUSPENDED') acc.suspended += 1;
      return acc;
    },
    {total: 0, active: 0, pending: 0, suspended: 0},
  );
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {useEffect, useState} from 'react';
import {Building2, Globe, Info, LogIn, LogOut, Menu, X} from 'lucide-react';
import {AiReportsView} from './components/AiReportsView';
import {AppWorkflowView} from './components/AppWorkflowView';
import {AuthPanel, type AuthUserSession, type CompanyInfo} from './components/AuthPanel';
import {DataCenterView} from './components/DataCenterView';
import {DecisionsView} from './components/DecisionsView';
import {DetectView} from './components/DetectView';
import {KPISummary, type LiveOverviewData} from './components/KPISummary';
import {
  OptimizationImprovementChart,
  type LiveOptimizationPreview,
} from './components/OptimizationImprovementChart';
import {OptimizeView} from './components/OptimizeView';
import {PredictView} from './components/PredictView';
import {Tooltip} from './components/Tooltip';
import {UsersManagementView} from './components/UsersManagementView';
import {WireframeExplorerView} from './components/WireframeExplorerView';
import {apiRequest} from './utils/apiClient';
import {UI_TRANSLATIONS, type AppLanguage} from './utils/i18n';
import {ENTERPRISE_ROLES, type AppView} from './utils/platformBlueprints';

type EngineStatus = 'active' | 'monitoring' | 'idle';

const ENGINE_STATUS_CONFIG: Record<
  EngineStatus,
  {label: string; badgeClass: string; dotClass: string}
> = {
  active: {
    label: 'Active',
    badgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    dotClass: 'bg-emerald-500',
  },
  monitoring: {
    label: 'Monitoring',
    badgeClass: 'border-sky-200 bg-sky-50 text-sky-800',
    dotClass: 'bg-sky-500',
  },
  idle: {
    label: 'Idle',
    badgeClass: 'border-slate-200 bg-slate-100 text-slate-700',
    dotClass: 'bg-slate-400',
  },
};

const ENGINE_PILLARS: ReadonlyArray<{
  id: string;
  code: string;
  title: string;
  subtitle: string;
  summary: string;
  description: string;
  status: EngineStatus;
}> = [
  {
    id: 'predict',
    code: '01',
    title: 'Predict',
    subtitle: 'Intelligence & Forecasting',
    summary: 'Time-series forecasting & baseline backtesting.',
    description:
      'Statistical time-series models, regression pipelines, backtesting against baselines, and data sufficiency gating.',
    status: 'active',
  },
  {
    id: 'optimize',
    code: '02',
    title: 'Optimize',
    subtitle: 'Mathematical Decision Engine',
    summary: 'Constrained LP, MILP & simulation solvers.',
    description:
      'Operations research solvers (HiGHS LP/MILP) producing verifiable recommendations under explicit constraints.',
    status: 'active',
  },
  {
    id: 'detect',
    code: '03',
    title: 'Detect',
    subtitle: 'Variance, Risk & Opportunity',
    summary: 'Actual vs. target & budget variance alerting.',
    description:
      'Continuous comparison of actual outcomes against approved targets, forecasts, and budgets with auditable alert lifecycles.',
    status: 'monitoring',
  },
];

const NAV_ORDER: AppView[] = [
  'overview',
  'data',
  'predict',
  'optimize',
  'decisions',
  'detect',
  'ai_reports',
  'workflow',
  'wireframes',
  'users',
];

const AUTH_REQUIRED_VIEWS = new Set<AppView>([
  'data',
  'predict',
  'optimize',
  'decisions',
  'detect',
  'ai_reports',
]);

export default function App() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeView, setActiveView] = useState<AppView>('overview');
  const [language, setLanguage] = useState<AppLanguage>('en');
  const [showAuthModal, setShowAuthModal] = useState(false);

  // Strict in-memory session state (never stored in localStorage/sessionStorage)
  const [token, setToken] = useState<string | null>(null);
  const [authUser, setAuthUser] = useState<AuthUserSession | null>(null);
  const [companies, setCompanies] = useState<CompanyInfo[]>([]);
  const [activeCompanyId, setActiveCompanyId] = useState<string>('comp-alrayan');
  const [needsBootstrap, setNeedsBootstrap] = useState<boolean>(false);

  const [liveOverview, setLiveOverview] = useState<
    (LiveOverviewData & {latestOptimization: LiveOptimizationPreview | null}) | null
  >(null);

  const t = UI_TRANSLATIONS[language];

  useEffect(() => {
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    void apiRequest<{needsBootstrap: boolean}>('/api/auth/status')
      .then((res) => setNeedsBootstrap(res.needsBootstrap))
      .catch(() => {
        // Ignore transient status failure
      });
  }, []);

  const refreshOverview = async (sessionToken: string, companyId: string) => {
    try {
      const data = await apiRequest<
        LiveOverviewData & {latestOptimization: LiveOptimizationPreview | null}
      >('/api/overview', {token: sessionToken, companyId});
      setLiveOverview(data);
    } catch {
      setLiveOverview(null);
    }
  };

  useEffect(() => {
    if (token && activeCompanyId) {
      void refreshOverview(token, activeCompanyId);
    } else {
      setLiveOverview(null);
    }
  }, [token, activeCompanyId]);

  const handleSelectView = (view: AppView) => {
    setActiveView(view);
    setMobileMenuOpen(false);
  };

  const handleAuthenticated = (session: {
    token: string;
    user: AuthUserSession;
    companies: CompanyInfo[];
    activeCompany: CompanyInfo | null;
  }) => {
    setToken(session.token);
    setAuthUser(session.user);
    setCompanies(session.companies);
    setActiveCompanyId(session.activeCompany?.id ?? session.user.companyId);
    setNeedsBootstrap(false);
    setShowAuthModal(false);
  };

  const handleSignOut = () => {
    setToken(null);
    setAuthUser(null);
    setCompanies([]);
    setLiveOverview(null);
  };

  const activeCompany =
    companies.find((c) => c.id === activeCompanyId) ??
    liveOverview?.company ??
    null;

  const userRoleDef = authUser
    ? ENTERPRISE_ROLES.find((r) => r.id === authUser.roleId)
    : null;
  const canApprove = Boolean(userRoleDef?.permissions.approveDecisions);
  const canManageUsers = Boolean(userRoleDef?.permissions.manageUsers);
  const canExportReports = Boolean(userRoleDef?.permissions.exportReports);

  const needsAuthGate = AUTH_REQUIRED_VIEWS.has(activeView) && !token;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 antialiased">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-2 px-4 py-2.5 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => handleSelectView('overview')}
            className="flex shrink-0 items-center gap-2 text-left focus:outline-none"
          >
            <div
              aria-hidden="true"
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-sm font-semibold tracking-tight text-white"
            >
              T
            </div>
            <div>
              <span className="block text-sm font-semibold tracking-tight text-slate-900">
                TETRA OS
              </span>
              <span className="hidden text-[11px] text-slate-500 2xl:block">
                {t.brandSubtitle}
              </span>
            </div>
          </button>

          <nav
            aria-label="Primary navigation"
            className="hidden min-w-0 flex-1 items-center justify-center gap-0.5 overflow-x-auto lg:flex"
          >
            {NAV_ORDER.map((viewId) => {
              const isCurrent = activeView === viewId;
              return (
                <button
                  key={viewId}
                  type="button"
                  aria-current={isCurrent ? 'page' : undefined}
                  onClick={() => handleSelectView(viewId)}
                  className={`shrink-0 whitespace-nowrap rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${
                    isCurrent
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  {t.navLabels[viewId]}
                </button>
              );
            })}
          </nav>

          <div className="flex shrink-0 items-center gap-1.5">
            {token && companies.length > 1 && authUser?.roleId === 'platform_super_admin' && (
              <div className="hidden items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 xl:flex">
                <Building2 className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden="true" />
                <select
                  aria-label="Switch active tenant"
                  value={activeCompanyId}
                  onChange={(e) => setActiveCompanyId(e.target.value)}
                  className="max-w-[155px] truncate bg-transparent text-xs font-medium text-slate-800 focus:outline-none"
                >
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button
              type="button"
              aria-label="Toggle language AR or EN"
              onClick={() => setLanguage((prev) => (prev === 'en' ? 'ar' : 'en'))}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <Globe className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{language === 'en' ? 'AR' : 'EN'}</span>
            </button>

            {token && authUser ? (
              <button
                type="button"
                onClick={handleSignOut}
                title={`${authUser.fullName} (${authUser.roleId})`}
                className="hidden shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 sm:inline-flex"
              >
                <span className="max-w-24 truncate">{authUser.fullName}</span>
                <LogOut className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden="true" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowAuthModal((prev) => !prev)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
              >
                <LogIn className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{needsBootstrap ? t.claimAdmin : t.signIn}</span>
              </button>
            )}

            <button
              type="button"
              aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className="inline-flex items-center justify-center rounded-lg border border-slate-200 p-2 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 lg:hidden"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <nav
            aria-label="Mobile navigation"
            className="border-t border-slate-200 bg-white px-4 py-3 lg:hidden"
          >
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {NAV_ORDER.map((viewId) => {
                const isCurrent = activeView === viewId;
                return (
                  <button
                    key={viewId}
                    type="button"
                    aria-current={isCurrent ? 'page' : undefined}
                    onClick={() => handleSelectView(viewId)}
                    className={`rounded-md px-3 py-2 text-left text-xs font-medium transition-colors ${
                      isCurrent
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {t.navLabels[viewId]}
                  </button>
                );
              })}
            </div>
            {token && authUser && (
              <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-xs text-slate-600">
                <span>
                  {authUser.fullName} ({userRoleDef?.name ?? authUser.roleId})
                </span>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="font-medium text-rose-700"
                >
                  {t.signOut}
                </button>
              </div>
            )}
          </nav>
        )}
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        {showAuthModal && !token && (
          <div className="mb-8">
            <AuthPanel
              needsBootstrap={needsBootstrap}
              language={language}
              onAuthenticated={handleAuthenticated}
            />
          </div>
        )}

        {needsAuthGate ? (
          <AuthPanel
            needsBootstrap={needsBootstrap}
            language={language}
            onAuthenticated={handleAuthenticated}
          />
        ) : (
          <>
            {activeView === 'data' && token && (
              <DataCenterView
                token={token}
                companyId={activeCompanyId}
                currency={activeCompany?.currency ?? 'SAR'}
                onDataUpdated={() => void refreshOverview(token, activeCompanyId)}
              />
            )}

            {activeView === 'predict' && token && (
              <PredictView
                token={token}
                companyId={activeCompanyId}
                currency={activeCompany?.currency ?? 'SAR'}
              />
            )}

            {activeView === 'optimize' && token && (
              <OptimizeView
                token={token}
                companyId={activeCompanyId}
                currency={activeCompany?.currency ?? 'SAR'}
                onDecisionCreated={() => void refreshOverview(token, activeCompanyId)}
              />
            )}

            {activeView === 'decisions' && token && (
              <DecisionsView
                token={token}
                companyId={activeCompanyId}
                currency={activeCompany?.currency ?? 'SAR'}
                canApprove={canApprove}
              />
            )}

            {activeView === 'detect' && token && (
              <DetectView token={token} companyId={activeCompanyId} />
            )}

            {activeView === 'ai_reports' && token && (
              <AiReportsView
                token={token}
                companyId={activeCompanyId}
                language={language}
                canManageUsers={canManageUsers}
                canExportReports={canExportReports}
                onDataRestored={() => void refreshOverview(token, activeCompanyId)}
              />
            )}

            {activeView === 'workflow' && <AppWorkflowView />}
            {activeView === 'wireframes' && <WireframeExplorerView />}
            {activeView === 'users' && (
              <UsersManagementView
                token={token}
                companyId={token ? activeCompanyId : null}
                companyName={activeCompany?.name ?? 'Al-Rayan Distribution Co.'}
                canManageUsers={token ? canManageUsers : true}
              />
            )}

            {activeView === 'overview' && (
              <>
                <section
                  id="overview"
                  className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs sm:p-10"
                >
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                    {t.heroEyebrow}
                  </p>
                  <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                    {t.heroTitle}
                  </h1>
                  <p className="mt-4 max-w-3xl text-sm leading-relaxed text-slate-600 sm:text-base">
                    {t.heroBody}
                  </p>
                </section>

                <KPISummary liveOverview={liveOverview} />

                <section id="engines" className="mt-8 sm:mt-10">
                  <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                    <h2 className="text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">
                      {t.enginesHeading}
                    </h2>
                    <p className="text-sm text-slate-500">{t.enginesSubheading}</p>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-3">
                    {ENGINE_PILLARS.map((pillar) => {
                      const statusStyle = ENGINE_STATUS_CONFIG[pillar.status];

                      return (
                        <Tooltip
                          key={pillar.id}
                          label={`${pillar.title} — ${pillar.subtitle}`}
                          content={pillar.description}
                        >
                          {({
                            tooltipId,
                            isOpen,
                            onTriggerClick,
                            onTriggerFocus,
                            onTriggerPointerDown,
                          }) => (
                            <article
                              data-testid={`engine-card-${pillar.id}`}
                              className="flex h-full flex-col justify-between rounded-xl border border-slate-200 bg-white p-6 shadow-xs transition-colors hover:border-slate-300"
                            >
                              <div>
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-mono text-xs font-medium text-slate-400">
                                    {pillar.code}
                                  </span>
                                  <span className="text-xs font-medium text-slate-500">
                                    {pillar.subtitle}
                                  </span>
                                </div>

                                <div className="mt-3 flex items-center justify-between gap-2">
                                  <h3 className="text-lg font-semibold text-slate-900">
                                    {pillar.title}
                                  </h3>
                                  <button
                                    type="button"
                                    aria-label={`View ${pillar.title} engine details`}
                                    aria-describedby={isOpen ? tooltipId : undefined}
                                    aria-expanded={isOpen}
                                    onPointerDown={onTriggerPointerDown}
                                    onFocus={onTriggerFocus}
                                    onClick={onTriggerClick}
                                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400"
                                  >
                                    <Info className="h-3.5 w-3.5" aria-hidden="true" />
                                    <span>Details</span>
                                  </button>
                                </div>

                                <p className="mt-2 text-sm text-slate-600">
                                  {pillar.summary}
                                </p>
                              </div>

                              <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-3">
                                <span className="text-xs font-medium text-slate-500">
                                  Engine State
                                </span>
                                <span
                                  data-status={pillar.status}
                                  className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium ${statusStyle.badgeClass}`}
                                >
                                  <span
                                    aria-hidden="true"
                                    className={`h-1.5 w-1.5 rounded-full ${statusStyle.dotClass}`}
                                  />
                                  {statusStyle.label}
                                </span>
                              </div>
                            </article>
                          )}
                        </Tooltip>
                      );
                    })}
                  </div>
                </section>

                <OptimizationImprovementChart
                  liveOptimization={liveOverview?.latestOptimization ?? null}
                  liveCurrency={activeCompany?.currency ?? 'SAR'}
                />

                <section
                  id="architecture"
                  className="mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-xs sm:mt-10 sm:p-8"
                >
                  <h2 className="text-base font-semibold text-slate-900 sm:text-lg">
                    {t.lifecycleHeading}
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">
                    {t.lifecycleBody}
                  </p>
                </section>
              </>
            )}
          </>
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-6 text-xs text-slate-500 sm:flex-row sm:px-6 lg:px-8">
          <p className="font-medium text-slate-700">
            TETRA OS &mdash; Commercial Decisions Intelligence Platform
          </p>
          <p>Predict. Optimize. Detect. &copy; {new Date().getFullYear()}</p>
        </div>
      </footer>
    </div>
  );
}

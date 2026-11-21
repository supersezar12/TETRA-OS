import {useState, type FormEvent} from 'react';
import {KeyRound, Lock, ShieldCheck} from 'lucide-react';
import {apiRequest} from '../utils/apiClient';
import type {AppLanguage} from '../utils/i18n';
import {UI_TRANSLATIONS} from '../utils/i18n';

export interface AuthUserSession {
  id: string;
  companyId: string;
  companyName: string;
  fullName: string;
  email: string;
  roleId: string;
  regionScope: string;
  branchScope: string;
  departmentScope: string;
  status: string;
}

export interface CompanyInfo {
  id: string;
  name: string;
  currency: string;
  country: string;
}

interface AuthPanelProps {
  needsBootstrap: boolean;
  language: AppLanguage;
  onAuthenticated: (session: {
    token: string;
    user: AuthUserSession;
    companies: CompanyInfo[];
    activeCompany: CompanyInfo | null;
  }) => void;
}

export function AuthPanel({needsBootstrap, language, onAuthenticated}: AuthPanelProps) {
  const t = UI_TRANSLATIONS[language];
  const [fullName, setFullName] = useState('Platform Administrator');
  const [email, setEmail] = useState('admin@tetra-os.local');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const endpoint = needsBootstrap ? '/api/auth/bootstrap' : '/api/auth/login';
      const body = needsBootstrap
        ? {fullName, email, password}
        : {email, password};
      const result = await apiRequest<{
        token: string;
        user: AuthUserSession;
        companies: CompanyInfo[];
        activeCompany: CompanyInfo | null;
      }>(endpoint, {method: 'POST', body});
      setPassword('');
      onAuthenticated(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section
      aria-label={needsBootstrap ? 'First-run administrator setup' : 'Sign in'}
      className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-xs sm:p-8"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white">
          {needsBootstrap ? (
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          ) : (
            <Lock className="h-5 w-5" aria-hidden="true" />
          )}
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            {needsBootstrap ? 'First-Run Admin Claim' : 'Multi-Tenant Access Gate'}
          </p>
          <h2 className="mt-1 text-xl font-semibold text-slate-900">
            {needsBootstrap ? t.claimAdmin : t.authRequiredTitle}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {needsBootstrap
              ? 'Claim the initial Platform Super Admin account by setting a strong password (min 8 characters). This setup locks automatically once claimed.'
              : t.authRequiredDesc}
          </p>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-800"
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        {needsBootstrap && (
          <div>
            <label
              htmlFor="auth-fullname"
              className="block text-xs font-semibold uppercase tracking-wide text-slate-600"
            >
              Administrator Name
            </label>
            <input
              id="auth-fullname"
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
            />
          </div>
        )}

        <div>
          <label
            htmlFor="auth-email"
            className="block text-xs font-semibold uppercase tracking-wide text-slate-600"
          >
            Work Email
          </label>
          <input
            id="auth-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@tetra-os.local"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
          />
        </div>

        <div>
          <label
            htmlFor="auth-password"
            className="block text-xs font-semibold uppercase tracking-wide text-slate-600"
          >
            Password
          </label>
          <input
            id="auth-password"
            type="password"
            required
            minLength={needsBootstrap ? 8 : 1}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={needsBootstrap ? 'Choose at least 8 characters' : 'Enter password'}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-60"
        >
          <KeyRound className="h-4 w-4" aria-hidden="true" />
          <span>
            {submitting
              ? 'Verifying...'
              : needsBootstrap
                ? 'Claim Administrator Account & Enter'
                : t.signIn}
          </span>
        </button>
      </form>
    </section>
  );
}

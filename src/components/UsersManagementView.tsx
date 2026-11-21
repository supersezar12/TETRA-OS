import {useEffect, useState, type FormEvent} from 'react';
import {Check, History, Shield, UserPlus, Users, X} from 'lucide-react';
import {apiRequest} from '../utils/apiClient';
import {
  computeUsersSummary,
  createInvitedUser,
  ENTERPRISE_ROLES,
  filterUsers,
  INITIAL_SAMPLE_USERS,
  validateUserInvite,
  type EnterpriseRoleId,
  type SampleUserRecord,
  type UserAccountStatus,
} from '../utils/platformBlueprints';

const STATUS_BADGE: Record<UserAccountStatus, string> = {
  ACTIVE: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  PENDING_INVITE: 'border-amber-200 bg-amber-50 text-amber-800',
  SUSPENDED: 'border-rose-200 bg-rose-50 text-rose-800',
};

const STATUS_LABEL: Record<UserAccountStatus, string> = {
  ACTIVE: 'Active',
  PENDING_INVITE: 'Pending Invite',
  SUSPENDED: 'Suspended',
};

interface AuditLogEntry {
  id: string;
  actorEmail: string;
  actorRole: string;
  action: string;
  resourceType: string;
  resourceId: string;
  details: Record<string, unknown>;
  createdAt: string;
}

interface UsersManagementViewProps {
  token?: string | null;
  companyId?: string | null;
  companyName?: string;
  canManageUsers?: boolean;
}

export function UsersManagementView({
  token = null,
  companyId = null,
  companyName = 'Al-Rayan Distribution Co.',
  canManageUsers = true,
}: UsersManagementViewProps) {
  const isLiveMode = Boolean(token && companyId);
  const [users, setUsers] = useState<SampleUserRecord[]>(INITIAL_SAMPLE_USERS);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [activeSubTab, setActiveSubTab] = useState<'directory' | 'roles' | 'audit'>('directory');
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<EnterpriseRoleId | 'ALL'>('ALL');
  const [statusFilter, setStatusFilter] = useState<UserAccountStatus | 'ALL'>('ALL');

  const [inviteOpen, setInviteOpen] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [initialPassword, setInitialPassword] = useState('');
  const [roleId, setRoleId] = useState<EnterpriseRoleId>('data_analyst');
  const [regionScope, setRegionScope] = useState('Central Region');
  const [branchScope, setBranchScope] = useState('Riyadh Main Depot');
  const [departmentScope, setDepartmentScope] = useState('Commercial Intelligence');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const loadLiveDirectory = async () => {
    if (!token || !companyId) return;
    try {
      const [usersRes, auditRes] = await Promise.all([
        apiRequest<{users: SampleUserRecord[]}>('/api/users', {token, companyId}),
        apiRequest<{logs: AuditLogEntry[]}>('/api/audit-logs', {token, companyId}),
      ]);
      setUsers(usersRes.users);
      setAuditLogs(auditRes.logs);
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Failed to load tenant users.');
    }
  };

  useEffect(() => {
    if (isLiveMode) {
      void loadLiveDirectory();
    } else {
      setUsers(INITIAL_SAMPLE_USERS);
    }
  }, [token, companyId]);

  const summary = computeUsersSummary(users);
  const filteredUsers = filterUsers(users, searchQuery, roleFilter, statusFilter);

  const roleNameMap = new Map(ENTERPRISE_ROLES.map((r) => [r.id, r.name]));

  const handleInviteSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const input = {
      fullName,
      email,
      roleId,
      regionScope,
      branchScope,
      departmentScope,
    };

    const validationError = validateUserInvite(input, users);
    if (validationError) {
      setInviteError(validationError);
      return;
    }

    if (isLiveMode && token && companyId) {
      if (initialPassword && initialPassword.length < 8) {
        setInviteError('Initial password must be at least 8 characters if provided.');
        return;
      }
      try {
        const res = await apiRequest<{user: SampleUserRecord}>('/api/users', {
          method: 'POST',
          token,
          companyId,
          body: {
            ...input,
            initialPassword: initialPassword || undefined,
          },
        });
        setUsers((prev) => [res.user, ...prev]);
        setInviteError(null);
        setActionMessage(`Provisioned ${res.user.fullName} (${res.user.email}) in tenant database.`);
        setFullName('');
        setEmail('');
        setInitialPassword('');
        setInviteOpen(false);
        void loadLiveDirectory();
      } catch (err) {
        setInviteError(err instanceof Error ? err.message : 'Failed to invite user.');
      }
      return;
    }

    const nextId = 101 + users.length;
    const invited = createInvitedUser(input, nextId);
    setUsers((prev) => [invited, ...prev]);
    setInviteError(null);
    setActionMessage(`Invitation created for ${invited.fullName} (${invited.email}).`);
    setFullName('');
    setEmail('');
    setInviteOpen(false);
  };

  const handleToggleUserStatus = async (userId: string) => {
    const target = users.find((u) => u.id === userId);
    if (!target) return;
    const nextStatus: UserAccountStatus =
      target.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED';

    if (isLiveMode && token && companyId) {
      try {
        const res = await apiRequest<{user: SampleUserRecord}>(`/api/users/${userId}`, {
          method: 'PATCH',
          token,
          companyId,
          body: {status: nextStatus},
        });
        setUsers((prev) => prev.map((u) => (u.id === userId ? res.user : u)));
        setActionMessage(
          `Updated ${res.user.fullName} status to ${STATUS_LABEL[nextStatus]}.`,
        );
        void loadLiveDirectory();
      } catch (err) {
        setInviteError(err instanceof Error ? err.message : 'Status update denied.');
      }
      return;
    }

    setUsers((prev) =>
      prev.map((user) => {
        if (user.id !== userId) return user;
        setActionMessage(
          `Updated ${user.fullName} status to ${STATUS_LABEL[nextStatus]}.`,
        );
        return {...user, status: nextStatus};
      }),
    );
  };

  const handleRoleChange = async (userId: string, newRoleId: EnterpriseRoleId) => {
    if (isLiveMode && token && companyId) {
      try {
        const res = await apiRequest<{user: SampleUserRecord}>(`/api/users/${userId}`, {
          method: 'PATCH',
          token,
          companyId,
          body: {roleId: newRoleId},
        });
        setUsers((prev) => prev.map((u) => (u.id === userId ? res.user : u)));
        const roleLabel = roleNameMap.get(newRoleId) ?? newRoleId;
        setActionMessage(`Assigned ${res.user.fullName} role to ${roleLabel}.`);
        void loadLiveDirectory();
      } catch (err) {
        setInviteError(err instanceof Error ? err.message : 'Role update denied.');
      }
      return;
    }

    setUsers((prev) =>
      prev.map((user) => {
        if (user.id !== userId) return user;
        const roleLabel = roleNameMap.get(newRoleId) ?? newRoleId;
        setActionMessage(`Assigned ${user.fullName} role to ${roleLabel}.`);
        return {...user, roleId: newRoleId};
      }),
    );
  };

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs sm:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-md px-2 py-0.5 font-mono text-[11px] font-medium ${
                  isLiveMode
                    ? 'bg-emerald-50 text-emerald-800'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                {isLiveMode ? 'LIVE TENANT DIRECTORY' : 'SAMPLE TENANT DIRECTORY'}
              </span>
              <span className="text-xs text-slate-500">
                Tenant: {companyName}
              </span>
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              Users, Roles &amp; Access Governance
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
              Multi-tenant user management enforcing 12 enterprise RBAC roles across
              Company, Region, Branch, and Department boundaries.
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <div
              role="tablist"
              aria-label="Users workspace views"
              className="inline-flex flex-wrap items-center rounded-lg border border-slate-200 bg-slate-50 p-1"
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeSubTab === 'directory'}
                onClick={() => setActiveSubTab('directory')}
                className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors sm:text-sm ${
                  activeSubTab === 'directory'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Users className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>User Directory</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeSubTab === 'roles'}
                onClick={() => setActiveSubTab('roles')}
                className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors sm:text-sm ${
                  activeSubTab === 'roles'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Shield className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Role Matrix (12)</span>
              </button>
              {isLiveMode && (
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeSubTab === 'audit'}
                  onClick={() => setActiveSubTab('audit')}
                  className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors sm:text-sm ${
                    activeSubTab === 'audit'
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <History className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>Audit Logs</span>
                </button>
              )}
            </div>

            {activeSubTab === 'directory' && (!isLiveMode || canManageUsers) && (
              <button
                type="button"
                onClick={() => {
                  setInviteOpen((prev) => !prev);
                  setInviteError(null);
                }}
                className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-slate-800 sm:text-sm"
              >
                <UserPlus className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{inviteOpen ? 'Close Invite Form' : 'Invite User'}</span>
              </button>
            )}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs text-slate-500">Total Users</p>
            <p
              data-testid="users-count-total"
              className="mt-1 font-mono text-2xl font-semibold text-slate-900"
            >
              {summary.total}
            </p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
            <p className="text-xs text-emerald-800">Active</p>
            <p className="mt-1 font-mono text-2xl font-semibold text-emerald-900">
              {summary.active}
            </p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
            <p className="text-xs text-amber-800">Pending Invites</p>
            <p
              data-testid="users-count-pending"
              className="mt-1 font-mono text-2xl font-semibold text-amber-900"
            >
              {summary.pending}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">Suspended</p>
            <p className="mt-1 font-mono text-2xl font-semibold text-slate-900">
              {summary.suspended}
            </p>
          </div>
        </div>
      </section>

      {actionMessage && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-900 sm:text-sm"
        >
          <span>{actionMessage}</span>
          <button
            type="button"
            aria-label="Dismiss notification"
            onClick={() => setActionMessage(null)}
            className="rounded p-1 text-emerald-700 hover:bg-emerald-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {activeSubTab === 'directory' && (
        <>
          {inviteOpen && (
            <section
              aria-labelledby="invite-user-heading"
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs"
            >
              <h2
                id="invite-user-heading"
                className="text-base font-semibold text-slate-900"
              >
                Invite Tenant User &amp; Assign Scope
              </h2>
              <form
                onSubmit={handleInviteSubmit}
                noValidate
                className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
              >
                <div>
                  <label
                    htmlFor="invite-full-name"
                    className="block text-xs font-medium text-slate-700"
                  >
                    Full Name
                  </label>
                  <input
                    id="invite-full-name"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g., Reem Al-Saleh"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="invite-email"
                    className="block text-xs font-medium text-slate-700"
                  >
                    Work Email
                  </label>
                  <input
                    id="invite-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.example"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="invite-role"
                    className="block text-xs font-medium text-slate-700"
                  >
                    RBAC Role
                  </label>
                  <select
                    id="invite-role"
                    value={roleId}
                    onChange={(e) => setRoleId(e.target.value as EnterpriseRoleId)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                  >
                    {ENTERPRISE_ROLES.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="invite-region"
                    className="block text-xs font-medium text-slate-700"
                  >
                    Region Scope
                  </label>
                  <input
                    id="invite-region"
                    type="text"
                    value={regionScope}
                    onChange={(e) => setRegionScope(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="invite-branch"
                    className="block text-xs font-medium text-slate-700"
                  >
                    Branch Scope
                  </label>
                  <input
                    id="invite-branch"
                    type="text"
                    value={branchScope}
                    onChange={(e) => setBranchScope(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="invite-department"
                    className="block text-xs font-medium text-slate-700"
                  >
                    Department Scope
                  </label>
                  <input
                    id="invite-department"
                    type="text"
                    value={departmentScope}
                    onChange={(e) => setDepartmentScope(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                  />
                </div>

                {isLiveMode && (
                  <div className="sm:col-span-2 lg:col-span-3">
                    <label
                      htmlFor="invite-password"
                      className="block text-xs font-medium text-slate-700"
                    >
                      Initial Login Password (Optional — leave blank for Pending Invite)
                    </label>
                    <input
                      id="invite-password"
                      type="password"
                      value={initialPassword}
                      onChange={(e) => setInitialPassword(e.target.value)}
                      placeholder="Min 8 characters to activate login immediately"
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                    />
                  </div>
                )}

                {inviteError && (
                  <p
                    role="alert"
                    className="text-xs font-medium text-rose-700 sm:col-span-2 lg:col-span-3"
                  >
                    {inviteError}
                  </p>
                )}

                <div className="flex justify-end gap-2 sm:col-span-2 lg:col-span-3">
                  <button
                    type="button"
                    onClick={() => setInviteOpen(false)}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 sm:text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 sm:text-sm"
                  >
                    Send Invitation
                  </button>
                </div>
              </form>
            </section>
          )}

          <section
            aria-labelledby="user-directory-heading"
            className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs"
          >
            <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 lg:flex-row lg:items-end lg:justify-between">
              <h2
                id="user-directory-heading"
                className="text-base font-semibold text-slate-900"
              >
                Scoped User Directory ({filteredUsers.length})
              </h2>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label
                    htmlFor="user-search"
                    className="block text-xs font-medium text-slate-600"
                  >
                    Search Users
                  </label>
                  <input
                    id="user-search"
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Name, email, region..."
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="user-role-filter"
                    className="block text-xs font-medium text-slate-600"
                  >
                    Filter by Role
                  </label>
                  <select
                    id="user-role-filter"
                    value={roleFilter}
                    onChange={(e) =>
                      setRoleFilter(e.target.value as EnterpriseRoleId | 'ALL')
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                  >
                    <option value="ALL">All Roles</option>
                    {ENTERPRISE_ROLES.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="user-status-filter"
                    className="block text-xs font-medium text-slate-600"
                  >
                    Filter by Status
                  </label>
                  <select
                    id="user-status-filter"
                    value={statusFilter}
                    onChange={(e) =>
                      setStatusFilter(e.target.value as UserAccountStatus | 'ALL')
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="ACTIVE">Active</option>
                    <option value="PENDING_INVITE">Pending Invite</option>
                    <option value="SUSPENDED">Suspended</option>
                  </select>
                </div>
              </div>
            </div>

            {filteredUsers.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-500">
                No users match the active filters.
              </div>
            ) : (
              <>
                <div className="mt-4 hidden overflow-x-auto md:block">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs font-medium text-slate-500">
                        <th className="py-3 pr-4">User</th>
                        <th className="py-3 pr-4">Assigned Role</th>
                        <th className="py-3 pr-4">Access Scope</th>
                        <th className="py-3 pr-4">Status</th>
                        <th className="py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredUsers.map((user) => (
                        <tr key={user.id} data-testid={`user-row-${user.id}`}>
                          <td className="py-3.5 pr-4">
                            <p className="font-medium text-slate-900">
                              {user.fullName}
                            </p>
                            <p className="text-xs text-slate-500">{user.email}</p>
                          </td>
                          <td className="py-3.5 pr-4">
                            <select
                              aria-label={`Change role for ${user.fullName}`}
                              value={user.roleId}
                              onChange={(e) =>
                                handleRoleChange(
                                  user.id,
                                  e.target.value as EnterpriseRoleId,
                                )
                              }
                              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-800 focus:border-slate-900 focus:outline-none"
                            >
                              {ENTERPRISE_ROLES.map((role) => (
                                <option key={role.id} value={role.id}>
                                  {role.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-3.5 pr-4 text-xs text-slate-600">
                            <p>{user.regionScope}</p>
                            <p className="text-slate-500">
                              {user.branchScope} &middot; {user.departmentScope}
                            </p>
                          </td>
                          <td className="py-3.5 pr-4">
                            <span
                              className={`inline-block rounded-md border px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[user.status]}`}
                            >
                              {STATUS_LABEL[user.status]}
                            </span>
                          </td>
                          <td className="py-3.5 text-right">
                            <button
                              type="button"
                              onClick={() => handleToggleUserStatus(user.id)}
                              className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                            >
                              {user.status === 'SUSPENDED' ? 'Activate' : 'Suspend'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 space-y-3 md:hidden">
                  {filteredUsers.map((user) => (
                    <article
                      key={user.id}
                      className="rounded-xl border border-slate-200 p-4"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-slate-900">
                            {user.fullName}
                          </p>
                          <p className="text-xs text-slate-500">{user.email}</p>
                        </div>
                        <span
                          className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${STATUS_BADGE[user.status]}`}
                        >
                          {STATUS_LABEL[user.status]}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-slate-600">
                        Role: {roleNameMap.get(user.roleId) ?? user.roleId}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {user.regionScope} &middot; {user.branchScope} &middot;{' '}
                        {user.departmentScope}
                      </p>
                      <div className="mt-3 flex justify-end">
                        <button
                          type="button"
                          onClick={() => handleToggleUserStatus(user.id)}
                          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700"
                        >
                          {user.status === 'SUSPENDED' ? 'Activate' : 'Suspend'}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </>
            )}
          </section>
        </>
      )}

      {activeSubTab === 'roles' && (
        <section
          aria-labelledby="role-matrix-heading"
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs"
        >
          <div className="mb-4">
            <h2
              id="role-matrix-heading"
              className="text-base font-semibold text-slate-900"
            >
              12-Role Enterprise RBAC Permission Matrix
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Permissions enforced server-side alongside Company, Region, Branch, and
              Department data access policies.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-medium text-slate-500">
                  <th className="py-3 pr-4">Role</th>
                  <th className="py-3 pr-4">Default Scope</th>
                  <th className="py-3 px-2 text-center">Ingest</th>
                  <th className="py-3 px-2 text-center">Predict</th>
                  <th className="py-3 px-2 text-center">Optimize</th>
                  <th className="py-3 px-2 text-center">Approve</th>
                  <th className="py-3 px-2 text-center">Detect</th>
                  <th className="py-3 px-2 text-center">Export</th>
                  <th className="py-3 pl-2 text-center">Users</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ENTERPRISE_ROLES.map((role) => {
                  const flags = [
                    role.permissions.ingestData,
                    role.permissions.runPredict,
                    role.permissions.runOptimize,
                    role.permissions.approveDecisions,
                    role.permissions.manageDetectAlerts,
                    role.permissions.exportReports,
                    role.permissions.manageUsers,
                  ];
                  return (
                    <tr key={role.id}>
                      <td className="py-3 pr-4 font-medium text-slate-900">
                        {role.name}
                      </td>
                      <td className="py-3 pr-4 text-xs text-slate-600">
                        {role.scopeLevel}
                      </td>
                      {flags.map((allowed, idx) => (
                        <td key={idx} className="py-3 px-2 text-center">
                          {allowed ? (
                            <span
                              aria-label="Allowed"
                              className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-50 text-emerald-700"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </span>
                          ) : (
                            <span
                              aria-label="Denied"
                              className="inline-block text-slate-300"
                            >
                              &mdash;
                            </span>
                          )}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeSubTab === 'audit' && isLiveMode && (
        <section
          aria-labelledby="audit-log-heading"
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs"
        >
          <h2 id="audit-log-heading" className="text-base font-semibold text-slate-900">
            Immutable Governance Audit Trail ({auditLogs.length})
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Append-only server log tracking authentication, ingestion, solver executions,
            approvals, alert transitions, and user role mutations.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-3 py-2 font-semibold">Timestamp</th>
                  <th className="px-3 py-2 font-semibold">Actor</th>
                  <th className="px-3 py-2 font-semibold">Action</th>
                  <th className="px-3 py-2 font-semibold">Resource</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {auditLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="px-3 py-2 font-mono text-slate-500">
                      {log.createdAt.slice(0, 19).replace('T', ' ')}
                    </td>
                    <td className="px-3 py-2 text-slate-800">
                      {log.actorEmail}{' '}
                      <span className="font-mono text-[11px] text-slate-400">
                        ({log.actorRole})
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono font-semibold text-slate-900">
                      {log.action}
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-600">
                      {log.resourceType}:{log.resourceId}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

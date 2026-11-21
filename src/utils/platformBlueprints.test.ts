import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeUsersSummary,
  createInvitedUser,
  ENTERPRISE_ROLES,
  filterUsers,
  INITIAL_SAMPLE_USERS,
  SCREEN_WIREFRAMES,
  validateUserInvite,
  WORKFLOW_STAGES,
} from './platformBlueprints';

test('workflow and wireframe blueprints cover required stages and screens', () => {
  assert.equal(WORKFLOW_STAGES.length, 8);
  assert.equal(SCREEN_WIREFRAMES.length, 5);
  assert.equal(ENTERPRISE_ROLES.length, 12);
});

test('filterUsers filters by query, role, and status accurately', () => {
  const activeAnalysts = filterUsers(
    INITIAL_SAMPLE_USERS,
    'omar',
    'data_analyst',
    'ACTIVE',
  );
  assert.equal(activeAnalysts.length, 1);
  assert.equal(activeAnalysts[0]?.id, 'usr-103');

  const pendingUsers = filterUsers(INITIAL_SAMPLE_USERS, '', 'ALL', 'PENDING_INVITE');
  assert.equal(pendingUsers.length, 1);
});

test('validateUserInvite rejects invalid emails, missing fields, and duplicate tenant emails', () => {
  assert.equal(
    validateUserInvite(
      {
        fullName: '',
        email: 'a@b.com',
        roleId: 'data_analyst',
        regionScope: 'All',
        branchScope: 'All',
        departmentScope: 'BI',
      },
      INITIAL_SAMPLE_USERS,
    ),
    'Full name is required.',
  );

  assert.equal(
    validateUserInvite(
      {
        fullName: 'Reem Saleh',
        email: 'invalid-email',
        roleId: 'data_analyst',
        regionScope: 'All',
        branchScope: 'All',
        departmentScope: 'BI',
      },
      INITIAL_SAMPLE_USERS,
    ),
    'Enter a valid work email address.',
  );

  assert.equal(
    validateUserInvite(
      {
        fullName: 'Duplicate User',
        email: 'o.haddad@alrayan-dist.example',
        roleId: 'data_analyst',
        regionScope: 'All',
        branchScope: 'All',
        departmentScope: 'BI',
      },
      INITIAL_SAMPLE_USERS,
    ),
    'A user with this email already exists in this tenant.',
  );

  assert.equal(
    validateUserInvite(
      {
        fullName: 'Reem Saleh',
        email: 'r.saleh@alrayan-dist.example',
        roleId: 'decision_reviewer',
        regionScope: 'Central Region',
        branchScope: 'Riyadh Main Depot',
        departmentScope: 'Commercial Governance',
      },
      INITIAL_SAMPLE_USERS,
    ),
    null,
  );
});

test('createInvitedUser and computeUsersSummary update counts deterministically', () => {
  const newUser = createInvitedUser(
    {
      fullName: 'Reem Saleh',
      email: 'R.Saleh@AlRayan-Dist.example',
      roleId: 'decision_reviewer',
      regionScope: 'Central Region',
      branchScope: 'Riyadh Main Depot',
      departmentScope: 'Governance',
    },
    108,
  );

  assert.equal(newUser.email, 'r.saleh@alrayan-dist.example');
  assert.equal(newUser.status, 'PENDING_INVITE');

  const summary = computeUsersSummary([...INITIAL_SAMPLE_USERS, newUser]);
  assert.deepEqual(summary, {
    total: 8,
    active: 5,
    pending: 2,
    suspended: 1,
  });
});

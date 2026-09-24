import test from 'node:test';
import assert from 'node:assert/strict';

import { getUserAdminCapabilities } from './adminCapabilities';

const baseUser = {
  id: 'user-1',
  username: 'analyst',
  email: 'analyst@example.com',
  isApproved: true,
  createdAt: '2024-01-01T00:00:00.000Z',
} as any;

test('maker capability is distinct from checker approval capability', () => {
  const makerCaps = getUserAdminCapabilities({ ...baseUser, role: 'technical' }, []);

  assert.equal(makerCaps.canProposeMakerActions, true);
  assert.equal(makerCaps.canApproveMakerActions, false);
  assert.equal(makerCaps.canReviewApprovals, false);
});

test('checker capability can review and approve governance actions', () => {
  const checkerCaps = getUserAdminCapabilities({ ...baseUser, role: 'checker' }, []);

  assert.equal(checkerCaps.canReviewApprovals, true);
  assert.equal(checkerCaps.canApproveMakerActions, true);
  assert.equal(checkerCaps.canProposeMakerActions, false);
});

test('platform admin keeps full governance authority', () => {
  const adminCaps = getUserAdminCapabilities({ ...baseUser, role: 'admin' }, []);

  assert.equal(adminCaps.isGlobalAdmin, true);
  assert.equal(adminCaps.canReviewApprovals, true);
  assert.equal(adminCaps.canApproveMakerActions, true);
});

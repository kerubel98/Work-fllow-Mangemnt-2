import { User, Team, UserAdminCapabilities } from '../types';

function normalizeRole(role?: string): string {
  return (role || '').trim().toLowerCase();
}

export function getUserAdminCapabilities(
  user: User | null | undefined,
  teams: Team[] = []
): UserAdminCapabilities {
  const emptyCaps: UserAdminCapabilities = {
    isFullAdmin: false,
    isGlobalAdmin: false,
    canManageConnections: false,
    canMonitorConnections: false,
    canViewMonitoring: false,
    canManageAccessRequests: false,
    canManageColumnMapping: false,
    canManageUsers: false,
    canManageSystems: false,
    canReviewApprovals: false,
    canProposeMakerActions: false,
    canApproveMakerActions: false,
    canManageOperationalGovernance: false,
  };

  if (!user) {
    return emptyCaps;
  }

  const role = normalizeRole(user.role);
  const username = (user.username || '').toLowerCase();

  const isGlobalAdmin =
    ['admin', 'system_admin', 'superadmin', 'administrator', 'platform_admin'].includes(role) ||
    username === 'admin';

  const isMaker =
    ['maker', 'technical', 'operational'].includes(role) ||
    role.includes('maker') ||
    role.includes('technical') ||
    role.includes('operational');

  const isChecker =
    ['checker', 'reviewer', 'supervisor', 'approver', 'quality_checker'].includes(role) ||
    role.includes('checker') ||
    role.includes('review') ||
    role.includes('supervisor') ||
    role.includes('approver');

  if (isGlobalAdmin) {
    return {
      ...emptyCaps,
      isFullAdmin: true,
      isGlobalAdmin: true,
      canManageConnections: true,
      canMonitorConnections: true,
      canViewMonitoring: true,
      canManageAccessRequests: true,
      canManageColumnMapping: true,
      canManageUsers: true,
      canManageSystems: true,
      canReviewApprovals: true,
      canProposeMakerActions: true,
      canApproveMakerActions: true,
      canManageOperationalGovernance: true,
    };
  }

  const userTeams = teams.filter((t) =>
    t.managerId === user.id ||
    (t.memberIds && t.memberIds.includes(user.id)) ||
    (user.teamId && user.teamId === t.id) ||
    (user.permanentTeamId && user.permanentTeamId === t.id)
  );

  let isFullAdmin = false;
  let canManageConnections = false;
  let canMonitorConnections = false;
  let canManageAccessRequests = false;
  let canManageColumnMapping = false;
  let canManageUsers = false;
  let canManageSystems = false;
  let canReviewApprovals = false;
  let canProposeMakerActions = isMaker;
  let canApproveMakerActions = isChecker;
  let canManageOperationalGovernance = false;

  for (const team of userTeams) {
    const privs = team.adminPrivileges || {};
    if (privs.isFullAdmin) {
      return {
        ...emptyCaps,
        isFullAdmin: true,
        isGlobalAdmin: false,
        canManageConnections: true,
        canMonitorConnections: true,
        canViewMonitoring: true,
        canManageAccessRequests: true,
        canManageColumnMapping: true,
        canManageUsers: true,
        canManageSystems: true,
        canReviewApprovals: true,
        canProposeMakerActions: true,
        canApproveMakerActions: true,
        canManageOperationalGovernance: true,
      };
    }

    if (privs.canManageConnections) canManageConnections = true;
    if (privs.canMonitorConnections || (privs as any).canViewMonitoring) canMonitorConnections = true;
    if (privs.canManageAccessRequests) canManageAccessRequests = true;
    if (privs.canManageColumnMapping) canManageColumnMapping = true;
    if (privs.canManageUsers) canManageUsers = true;
    if (privs.canManageSystems) canManageSystems = true;
    if (privs.canReviewApprovals) canReviewApprovals = true;
    if (privs.canProposeMakerActions) canProposeMakerActions = true;
    if (privs.canApproveMakerActions) canApproveMakerActions = true;
    if (privs.canManageOperationalGovernance) canManageOperationalGovernance = true;
  }

  if (canManageOperationalGovernance) {
    canReviewApprovals = true;
    canApproveMakerActions = true;
    canProposeMakerActions = true;
  }

  return {
    isFullAdmin,
    isGlobalAdmin: false,
    canManageConnections,
    canMonitorConnections,
    canViewMonitoring: canMonitorConnections,
    canManageAccessRequests,
    canManageColumnMapping,
    canManageUsers,
    canManageSystems,
    canReviewApprovals: canReviewApprovals || isChecker,
    canProposeMakerActions: canProposeMakerActions || isMaker,
    canApproveMakerActions: canApproveMakerActions || isChecker,
    canManageOperationalGovernance: canManageOperationalGovernance || canReviewApprovals,
  };
}

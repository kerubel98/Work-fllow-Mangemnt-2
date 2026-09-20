import { User, Team, UserAdminCapabilities } from '../types';

export function getUserAdminCapabilities(
  user: User | null | undefined,
  teams: Team[] = []
): UserAdminCapabilities {
  if (!user) {
    return {
      isFullAdmin: false,
      isGlobalAdmin: false,
      canManageConnections: false,
      canMonitorConnections: false,
      canViewMonitoring: false,
      canManageAccessRequests: false,
      canManageColumnMapping: false,
      canManageUsers: false,
      canManageSystems: false,
    };
  }

  const isGlobalAdmin = 
    user.role === 'admin' || 
    (user.role as any) === 'system_admin' || 
    user.username?.toLowerCase() === 'admin' || 
    (user.role as string)?.toLowerCase() === 'administrator';

  if (isGlobalAdmin) {
    return {
      isFullAdmin: true,
      isGlobalAdmin: true,
      canManageConnections: true,
      canMonitorConnections: true,
      canViewMonitoring: true,
      canManageAccessRequests: true,
      canManageColumnMapping: true,
      canManageUsers: true,
      canManageSystems: true,
    };
  }

  // Find teams where user is manager or member
  const userTeams = teams.filter(t => 
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

  for (const team of userTeams) {
    const privs = team.adminPrivileges || {};
    if (privs.isFullAdmin) {
      return {
        isFullAdmin: true,
        isGlobalAdmin: false,
        canManageConnections: true,
        canMonitorConnections: true,
        canViewMonitoring: true,
        canManageAccessRequests: true,
        canManageColumnMapping: true,
        canManageUsers: true,
        canManageSystems: true,
      };
    }
    if (privs.canManageConnections) canManageConnections = true;
    if (privs.canMonitorConnections || (privs as any).canViewMonitoring) canMonitorConnections = true;
    if (privs.canManageAccessRequests) canManageAccessRequests = true;
    if (privs.canManageColumnMapping) canManageColumnMapping = true;
    if (privs.canManageUsers) canManageUsers = true;
    if (privs.canManageSystems) canManageSystems = true;
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
  };
}

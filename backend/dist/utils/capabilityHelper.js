import { repo } from '../store/repository.js';
export async function resolveUserAdminCapabilities(userId, userRole) {
    const isAdmin = userRole === 'admin' ||
        userRole === 'system_admin' ||
        userRole?.toLowerCase() === 'administrator';
    if (isAdmin) {
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
    if (!userId) {
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
    // Get teams where user is manager or member
    const allTeams = await repo.getTeams();
    const userTeams = allTeams.filter(t => t.managerId === userId || (t.memberIds && t.memberIds.includes(userId)));
    let isFullAdmin = false;
    let canManageConnections = false;
    let canMonitorConnections = false;
    let canManageAccessRequests = false;
    let canManageColumnMapping = userTeams.length === 0; // Default to true if not in any specialized team
    let canManageUsers = false;
    let canManageSystems = false;
    for (const team of userTeams) {
        const privs = team.adminPrivileges || {};
        if (privs.isFullAdmin) {
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
        if (privs.canManageConnections)
            canManageConnections = true;
        if (privs.canMonitorConnections || privs.canViewMonitoring)
            canMonitorConnections = true;
        if (privs.canManageAccessRequests)
            canManageAccessRequests = true;
        if (privs.canManageColumnMapping !== undefined) {
            canManageColumnMapping = Boolean(privs.canManageColumnMapping);
        }
        if (privs.canManageUsers)
            canManageUsers = true;
        if (privs.canManageSystems)
            canManageSystems = true;
    }
    return {
        isFullAdmin,
        isGlobalAdmin: isFullAdmin,
        canManageConnections,
        canMonitorConnections,
        canViewMonitoring: canMonitorConnections,
        canManageAccessRequests,
        canManageColumnMapping,
        canManageUsers,
        canManageSystems,
    };
}

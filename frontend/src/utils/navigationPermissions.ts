import { User, Team } from '../types';
import { getUserAdminCapabilities } from './adminCapabilities';

/**
 * Centralized authorization rules for top-level and administrative navigation tabs.
 * 
 * Reconciles role-based access control (RBAC), team-scoped permissions,
 * and delegated administrative capabilities (Four-Eyes governance).
 */
export function canAccessTab(
  user: User | null,
  tab: string,
  teams: Team[] = []
): boolean {
  if (!user) return false;

  const caps = getUserAdminCapabilities(user, teams);

  switch (tab) {
    // Core Operational Views: accessible to all authenticated operators
    case 'workspace':
    case 'team_workspace':
    case 'direct_chat':
    case 'db_explorer':
    case 'create_case':
    case 'manager_analytics':
    case 'workspace_settings':
      return true;

    // Operational Authority Center (Dual-Authorization Four-Eyes Review)
    case 'authority_center':
      return (
        caps.isFullAdmin ||
        caps.canReviewApprovals ||
        caps.canApproveMakerActions ||
        ['admin', 'supervisor', 'checker'].includes((user.role || '').toLowerCase())
      );

    // Admin & Infrastructure Panels: requires elevated system or delegated admin capabilities
    case 'admin_panel':
      return (
        caps.isFullAdmin ||
        caps.canManageConnections ||
        caps.canMonitorConnections ||
        caps.canManageAccessRequests
      );

    case 'user_admin':
      return caps.isFullAdmin || caps.canManageUsers;

    case 'txn_settings':
    case 'system_settings':
      return (
        caps.isFullAdmin ||
        caps.canManageSystems ||
        caps.canManageColumnMapping
      );

    case 'admin_team_resources':
      return (
        caps.isFullAdmin ||
        caps.canManageConnections ||
        caps.canMonitorConnections
      );

    default:
      return false;
  }
}

/**
 * Convenience alias for backward compatibility with existing component imports.
 */
export const isAuthorizedTabForUser = canAccessTab;

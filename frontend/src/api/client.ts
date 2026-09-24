/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { DatabaseColumnConfiguration, WorkspaceSettingProposal, TeamEscalationTarget, TeamAdminPrivileges, WorkflowBundle } from '../types';

const API_BASE_URL = '/api';

const TOKEN_KEY = 'operational_workflow_jwt_token';

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch (err) {
    console.warn('Could not persist auth token:', err);
  }
}

/**
 * Safely stringifies objects by discarding circular references and non-serializable properties
 */
export function safeJsonStringify(obj: any, space?: number): string {
  const seen = new WeakSet();
  try {
    return JSON.stringify(obj, (_key, value) => {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return undefined; // Break circular reference
        }
        seen.add(value);
      }
      return value;
    }, space);
  } catch (err) {
    console.warn('[safeJsonStringify] Circular serialization warning:', err);
    return '{}';
  }
}

export async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  const token = getAuthToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(options?.headers as Record<string, string> || {})
  };

  const response = await fetch(url, {
    ...options,
    headers
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

export const api = {
  // ================= Auth & Users =================
  login: async (username: string, password: string) => {
    const res = await fetchApi<{ message: string; user: any; token?: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    if (res.token) {
      setAuthToken(res.token);
    }
    return res;
  },

  register: async (username: string, email: string, role: string, password?: string) => {
    const res = await fetchApi<{ message: string; user: any; token?: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, role, password })
    });
    if (res.token) {
      setAuthToken(res.token);
    }
    return res;
  },

  getMe: () => fetchApi<{ user: any }>('/auth/me'),
  logout: () => setAuthToken(null),

  getUsers: () => fetchApi<any[]>('/auth/users'),

  approveUser: (id: string) =>
    fetchApi<any>(`/auth/users/${id}/approve`, { method: 'PUT' }),

  updateUserRole: (id: string, role: string, privileges?: { canExecuteSelect?: boolean; canExecuteUpdate?: boolean }) =>
    fetchApi<any>(`/auth/users/${id}/role`, {
      method: 'PUT',
      body: JSON.stringify({ role, ...privileges })
    }),

  deleteUser: (id: string) =>
    fetchApi<{ success: boolean }>(`/auth/users/${id}`, { method: 'DELETE' }),

  updateWorkspaceSharing: (userId: string, enabled: boolean) =>
    fetchApi<any>(`/auth/users/${userId}/workspace-sharing`, {
      method: 'PUT',
      body: JSON.stringify({ enabled })
    }),

  // ================= Issues =================
  getIssues: (userId?: string, scope?: 'personal' | 'team' | 'all') => {
    const params = new URLSearchParams();
    if (userId) params.append('userId', userId);
    if (scope) params.append('scope', scope);
    const qs = params.toString();
    return fetchApi<any[]>(`/issues${qs ? `?${qs}` : ''}`);
  },
  updateIssueVisibility: (id: string, visibility: 'TEAM_PUBLIC' | 'PERSONAL_PRIVATE') =>
    fetchApi<any>(`/issues/${id}/visibility`, {
      method: 'PATCH',
      body: JSON.stringify({ visibility })
    }),
  getIssue: (id: string) => fetchApi<any>(`/issues/${id}`),
  createIssue: (issueData: any) =>
    fetchApi<any>('/issues', {
      method: 'POST',
      body: JSON.stringify(issueData)
    }),
  updateIssue: (id: string, updates: any) =>
    fetchApi<any>(`/issues/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates)
    }),
  deleteIssue: (id: string) =>
    fetchApi<{ success: boolean }>(`/issues/${id}`, { method: 'DELETE' }),
  postIssueChat: (issueId: string, message: {
    senderId: string;
    senderName: string;
    senderRole: string;
    text?: string;
    mentions?: any[];
    attachedSummary?: any;
    solutionProposal?: any;
    issueContext?: any;
  }) =>
    fetchApi<any>(`/issues/${issueId}/chat`, {
      method: 'POST',
      body: JSON.stringify(message)
    }),
  acceptChatSolution: (issueId: string, messageId: string, acceptedBy: string, acceptedByName?: string) =>
    fetchApi<any>(`/issues/${issueId}/chat/accept-solution`, {
      method: 'POST',
      body: JSON.stringify({ messageId, acceptedBy, acceptedByName })
    }),
  revertTaskData: (issueId: string, transactionId?: string, userId?: string) =>
    fetchApi<any>(`/issues/${issueId}/revert`, {
      method: 'POST',
      body: JSON.stringify({ transactionId, userId })
    }),
  getTaskReversions: (issueId: string) =>
    fetchApi<{ taskId: string; count: number; snapshots: any[] }>(`/issues/${issueId}/reversions`),
  getAuditDossier: (issueId: string) =>
    fetchApi<any>(`/issues/${issueId}/audit-dossier`),
  updateHashtagKpis: (tag: string, kpis: any[]) =>
    fetchApi<any>(`/hashtags/${encodeURIComponent(tag)}/kpis`, {
      method: 'PUT',
      body: JSON.stringify({ kpis })
    }),
  createHashtagFromIssue: (issueId: string, data: { tag?: string; description?: string; workflowId?: string; workflowName?: string; author?: string }) =>
    fetchApi<any>(`/hashtags/create-from-issue/${issueId}`, {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  getHashtagAnalytics: () =>
    fetchApi<{ hashtagAnalytics: any[]; issuesAwaitingSolution: any[]; totalTrackedTags: number }>('/hashtags/analytics'),
  executeResolutionScript: (issueId: string, executedBy?: string) =>
    fetchApi<any>(`/issues/${issueId}/execute-script`, {
      method: 'POST',
      body: JSON.stringify({ executedBy })
    }),

  ingestTaskDataset: (issueId: string, data: { rows: any[]; headers?: string[]; fileMapping?: Record<string, string> }) =>
    fetchApi<any>(`/issues/${issueId}/dataset`, {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  getTaskTransactions: (issueId: string, page = 1, limit = 50, batchId?: string) => {
    const qs = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (batchId) qs.append('batchId', batchId);
    return fetchApi<{ taskId: string; batchId?: string; page: number; limit: number; totalCount: number; totalPages: number; rows: any[] }>(`/issues/${issueId}/transactions?${qs.toString()}`);
  },
  getTaskBatches: (issueId: string) =>
    fetchApi<{ batchId: string; count: number }[]>(`/issues/${issueId}/batches`),
  getCentralTransactions: (taskId: string) =>
    fetchApi<{ taskId: string; totalCount: number; records: any[] }>(`/investigations/${taskId}/central-records`),
  getSchemaAuditLogs: () =>
    fetchApi<any[]>('/transactions/directory/audit-logs'),
  getTaskWorkflowExecutions: (taskId: string) =>
    fetchApi<{ taskId: string; count: number; executions: any[] }>(`/investigations/${taskId}/workflow-executions`),
  clearTaskWorkflowExecutions: (taskId: string) =>
    fetchApi<{ success: boolean; taskId: string; deleted: number; message: string }>(
      `/investigations/${taskId}/workflow-executions`,
      { method: 'DELETE' }
    ),
  clearAllValidationExecutions: () =>
    fetchApi<{ success: boolean; message: string; executions: number; tasks: number; batches: number; transactions: number }>(
      '/investigations/executions/clear-all',
      { method: 'DELETE' }
    ),
  scanCrossTaskDuplicates: () =>
    fetchApi<{ success: boolean; flaggedCount: number; message: string }>('/investigations/duplicates/scan', { method: 'POST' }),
  moveTransactionToTask: (key: string, targetTaskId: string) =>
    fetchApi<{ success: boolean; message: string }>(`/investigations/transactions/${encodeURIComponent(key)}/move-to-task`, {
      method: 'POST',
      body: JSON.stringify({ targetTaskId })
    }),
  removeTransactionFromTask: (key: string, taskId: string) =>
    fetchApi<{ success: boolean; message: string }>(`/investigations/transactions/${encodeURIComponent(key)}/remove-from-task`, {
      method: 'POST',
      body: JSON.stringify({ taskId })
    }),

  // ================= Database Connections =================
  getDatabases: () => fetchApi<any[]>('/db/databases'),
  createDatabase: (dbData: any) =>
    fetchApi<any>('/db/databases', {
      method: 'POST',
      body: JSON.stringify(dbData)
    }),
  updateDatabase: (id: string, updates: any) =>
    fetchApi<any>(`/db/databases/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates)
    }),
  deleteDatabase: (id: string) =>
    fetchApi<{ success: boolean; message: string }>(`/db/databases/${id}`, {
      method: 'DELETE'
    }),
  getTeamDatabases: (teamId: string) =>
    fetchApi<any[]>(`/db/team-databases?teamId=${encodeURIComponent(teamId)}`),
  createTeamDatabase: (teamId: string, dbData: any) =>
    fetchApi<any>('/db/team-databases', {
      method: 'POST',
      body: JSON.stringify({ ...dbData, teamId })
    }),
  requestTeamDatabasePromotion: (dbId: string, requesterId: string, notes?: string) =>
    fetchApi<any>(`/db/team-databases/${dbId}/request-promotion`, {
      method: 'POST',
      body: JSON.stringify({ requesterId, notes })
    }),
  reviewTeamDatabasePromotion: (dbId: string, action: 'APPROVE' | 'REJECT', reviewerId: string, notes?: string) =>
    fetchApi<any>(`/db/team-databases/${dbId}/review-promotion`, {
      method: 'POST',
      body: JSON.stringify({ action, reviewerId, notes })
    }),
  getAdminTeamResources: () =>
    fetchApi<any[]>('/db/admin/team-resources'),
  testConnection: (data: { dbId?: string; type?: string; host?: string; port?: number; connectionString?: string; databaseName?: string; username?: string }) =>
    fetchApi<{ success: boolean; message: string; pingMs: number; lastTestedAt: string; dbInfo?: any }>('/db/test-connection', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  getDatabaseTables: (dbId: string) =>
    fetchApi<{ dbId: string; dbName: string; engine?: string; availableTables: string[]; allowedTables: string[]; tables?: string[] }>(`/db/databases/${dbId}/tables`),
  discoverDatabaseTables: (dbId: string) =>
    fetchApi<{ success: boolean; message: string; dbId: string; availableTables: string[]; allowedTables: string[] }>(`/db/databases/${dbId}/discover-tables`, {
      method: 'POST'
    }),
  updateDatabaseAllowedTables: (dbId: string, allowedTables: string[]) =>
    fetchApi<{ success: boolean; message: string; dbId: string; allowedTables: string[] }>(`/db/databases/${dbId}/allowed-tables`, {
      method: 'PUT',
      body: JSON.stringify({ allowedTables })
    }),
  getTableColumns: (dbId: string, tableName: string) =>
    fetchApi<{ dbId: string; dbName: string; tableName: string; columns: { name: string; type: string; nullable: boolean; isPrimary?: boolean }[] }>(`/db/databases/${dbId}/tables/${tableName}/columns`),

  // ================= FTP File Staging Configurations =================
  getFtpStagingConfigs: (connectionId?: string) =>
    fetchApi<any[]>(connectionId ? `/db/ftp-staging-configs?connectionId=${connectionId}` : '/db/ftp-staging-configs'),
  createFtpStagingConfig: (data: any) =>
    fetchApi<any>('/db/ftp-staging-configs', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  updateFtpStagingConfig: (id: string, updates: any) =>
    fetchApi<any>(`/db/ftp-staging-configs/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates)
    }),
  deleteFtpStagingConfig: (id: string) =>
    fetchApi<{ success: boolean; message: string }>(`/db/ftp-staging-configs/${id}`, {
      method: 'DELETE'
    }),
  inspectFtpFileStructure: (connectionId: string, filePath: string) =>
    fetchApi<{
      fileName: string;
      fileType: 'EXCEL' | 'CSV' | 'XML' | 'TXT' | 'JSON' | 'OTHER';
      fileSizeBytes: number;
      excelSheets?: { name: string; rowCount: number; colCount: number; hasMergedCells: boolean }[];
      xmlRootElement?: string;
      xmlCandidateElements?: string[];
      detectedDelimiter?: string;
      sampleLines?: string[];
      suggestedHeaderRow?: number;
      suggestedDataStartRow?: number;
      totalLinesSampled?: number;
      error?: string;
    }>('/db/ftp-staging/inspect-structure', {
      method: 'POST',
      body: JSON.stringify({ connectionId, filePath })
    }),
  discoverFtpFilesRecursive: (connectionId: string, baseDir?: string) =>
    fetchApi<{
      name: string;
      fullPath: string;
      relativeFolder: string;
      size: number;
      modifiedAt?: string;
      fileType: 'EXCEL' | 'CSV' | 'XML' | 'TXT' | 'JSON' | 'OTHER';
    }[]>('/db/ftp-staging/discover-recursive', {
      method: 'POST',
      body: JSON.stringify({ connectionId, baseDir })
    }),
  testFtpPreviewParse: (connectionId: string, config: any) =>
    fetchApi<{
      success: boolean;
      fileName: string;
      fileType: 'EXCEL' | 'CSV' | 'XML' | 'TXT' | 'JSON' | 'OTHER';
      totalLinesRead: number;
      headerRowIndex: number;
      headerRowCount: number;
      dataStartRow: number;
      headersDetected: string[];
      selectedImportantColumns: string[];
      delimiterUsed?: string;
      excelSheetSelected?: string;
      excelAvailableSheets?: string[];
      parsedRowsCount: number;
      rawLinesSample: string[];
      parsedRowsSample: Record<string, any>[];
      mappedRowsSample: Record<string, any>[];
      footerSkippedLines: string[];
      structureSummary?: {
        totalColumnsDetected: number;
        totalRowsEstimated: number;
        hasMergedCells?: boolean;
        details?: string;
      };
      error?: string;
    }>('/db/ftp-staging/test-parse', {
      method: 'POST',
      body: JSON.stringify({ connectionId, config })
    }),
  stageFtpFile: (data: { configId?: string; config?: any; connectionId?: string }) =>
    fetchApi<{
      success: boolean;
      stagingTableName: string;
      stagedCount: number;
      filesProcessedCount?: number;
      filesProcessed?: string[];
      executionTimeMs: number;
      message: string;
      skippedMismatches?: any[];
    }>('/db/ftp-staging/stage-file', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  runScheduledFtpStaging: (options: { targetType?: string; connectionId?: string; forceAll?: boolean }) =>
    fetchApi<{
      success: boolean;
      executedCount: number;
      totalStaged: number;
      totalSkippedMismatches: number;
      results: any[];
      executionTimeMs: number;
    }>('/db/ftp-staging/run-scheduled', {
      method: 'POST',
      body: JSON.stringify(options)
    }),
  getUnconfiguredFtpFolders: (connectionId?: string) =>
    fetchApi<any[]>(connectionId ? `/db/ftp-staging/unconfigured-folders?connectionId=${connectionId}` : '/db/ftp-staging/unconfigured-folders'),
  resolveUnconfiguredFtpFolder: (folderPath: string, connectionId: string) =>
    fetchApi<{ success: boolean }>('/db/ftp-staging/resolve-unconfigured-folder', {
      method: 'POST',
      body: JSON.stringify({ folderPath, connectionId })
    }),
  getSystems: () => fetchApi<any[]>('/systems'),
  createSystem: (sysData: any) =>
    fetchApi<any>('/systems', {
      method: 'POST',
      body: JSON.stringify(sysData)
    }),
  updateSystem: (id: string, updates: any) =>
    fetchApi<any>(`/systems/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates)
    }),
  deleteSystem: (id: string) =>
    fetchApi<{ success: boolean }>(`/systems/${id}`, { method: 'DELETE' }),
  executeQuery: (queryData: { 
    userId: string; 
    username: string; 
    userRole: string; 
    dbId: string; 
    dbName: string; 
    query: string;
    tableName?: string;
  }) =>
    fetchApi<{
      columns: string[];
      rows: Record<string, any>[];
      rowCount: number;
      executionTimeMs: number;
      logId: string;
      targetDb: string;
      mirroredTable?: string | null;
      mirroredCount?: number;
    }>('/db/query/execute', {
      method: 'POST',
      body: JSON.stringify(queryData)
    }),
  getQueryLogs: () => fetchApi<any[]>('/db/query/logs'),

  // ================= Query Approvals & DB Access Requests =================
  getQueryApprovals: () => fetchApi<any[]>('/db/query/approvals'),
  createQueryApproval: (reqData: any) =>
    fetchApi<any>('/db/query/approvals', {
      method: 'POST',
      body: JSON.stringify(reqData)
    }),
  resolveQueryApproval: (id: string, status: 'approved' | 'rejected') =>
    fetchApi<any>(`/db/query/approvals/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ status })
    }),
  getDbAccessRequests: () => fetchApi<any[]>('/db/access-requests'),
  createDbAccessRequest: (reqData: any) =>
    fetchApi<any>('/db/access-requests', {
      method: 'POST',
      body: JSON.stringify(reqData)
    }),
  resolveDbAccessRequest: (id: string, status: 'approved' | 'rejected') =>
    fetchApi<any>(`/db/access-requests/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ status })
    }),

  // ================= Teams & Collaboration =================
  getTeams: () => fetchApi<any[]>('/teams'),
  createTeam: (teamData: any) =>
    fetchApi<any>('/teams', {
      method: 'POST',
      body: JSON.stringify(teamData)
    }),
  updateTeam: (id: string, updates: any) =>
    fetchApi<any>(`/teams/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates)
    }),
  updateTeamMemberPrivileges: (teamId: string, memberPrivileges: Record<string, any>, callerUserId?: string, callerRole?: string) =>
    fetchApi<any>(`/teams/${teamId}/member-privileges`, {
      method: 'PUT',
      body: JSON.stringify({ memberPrivileges, callerUserId, callerRole })
    }),
  updateTeamAdminPrivileges: (teamId: string, adminPrivileges: TeamAdminPrivileges, callerUserId?: string, callerRole?: string) =>
    fetchApi<any>(`/teams/${teamId}/admin-privileges`, {
      method: 'PUT',
      body: JSON.stringify({ adminPrivileges, callerUserId, callerRole })
    }),
  allocateDatabasesToTeam: (teamId: string, allowedDbIds: string[], callerUserId?: string, callerRole?: string) =>
    fetchApi<any>(`/teams/${teamId}/allocated-databases`, {
      method: 'PUT',
      body: JSON.stringify({ allowedDbIds, callerUserId, callerRole })
    }),
  deleteTeam: (id: string) =>
    fetchApi<{ success: boolean }>(`/teams/${id}`, { method: 'DELETE' }),
  getTeamTasks: (teamId?: string) =>
    fetchApi<any[]>(`/teams/tasks/all${teamId ? `?teamId=${teamId}` : ''}`),
  createTeamTask: (taskData: any) =>
    fetchApi<any>('/teams/tasks', {
      method: 'POST',
      body: JSON.stringify(taskData)
    }),
  updateTeamTask: (id: string, updates: any) =>
    fetchApi<any>(`/teams/tasks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates)
    }),
  deleteTeamTask: (id: string) =>
    fetchApi<{ success: boolean }>(`/teams/tasks/${id}`, { method: 'DELETE' }),
  escalateTeamTask: (taskId: string, targetTeamId: string, escalationReason?: string) =>
    fetchApi<any>(`/teams/tasks/${encodeURIComponent(taskId)}/escalate`, {
      method: 'POST',
      body: JSON.stringify({ targetTeamId, escalationReason })
    }),
  getTeamEscalationMatrix: (teamId: string) =>
    fetchApi<TeamEscalationTarget[]>(`/teams/${encodeURIComponent(teamId)}/escalation-matrix`),
  getTeamInsights: (teamId?: string) =>
    fetchApi<any[]>(`/teams/insights/all${teamId ? `?teamId=${teamId}` : ''}`),
  createTeamInsight: (data: any) =>
    fetchApi<any>('/teams/insights', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  deleteTeamInsight: (id: string) =>
    fetchApi<{ success: boolean }>(`/teams/insights/${id}`, { method: 'DELETE' }),
  getTeamMessages: (teamId?: string) =>
    fetchApi<any[]>(`/teams/messages/all${teamId ? `?teamId=${teamId}` : ''}`),
  sendTeamMessage: (data: any) =>
    fetchApi<any>('/teams/messages', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  // ================= Direct Chat & Notifications =================
  getDirectMessages: (user1Id?: string, user2Id?: string) => {
    const params = new URLSearchParams();
    if (user1Id) params.append('user1Id', user1Id);
    if (user2Id) params.append('user2Id', user2Id);
    const qs = params.toString();
    return fetchApi<any[]>(`/messages/direct${qs ? `?${qs}` : ''}`);
  },
  sendDirectMessage: (data: { senderId: string; receiverId: string; content: string }) =>
    fetchApi<any>('/messages/direct', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  markDirectMessagesRead: (senderId: string, receiverId: string) =>
    fetchApi<{ success: boolean }>('/messages/direct/read', {
      method: 'PUT',
      body: JSON.stringify({ senderId, receiverId })
    }),
  getNotifications: (userId?: string) =>
    fetchApi<any[]>(`/notifications${userId ? `?userId=${userId}` : ''}`),
  createNotification: (notifData: any) =>
    fetchApi<any>('/notifications', {
      method: 'POST',
      body: JSON.stringify(notifData)
    }),
  markNotificationRead: (id: string) =>
    fetchApi<{ success: boolean }>(`/notifications/${id}/read`, { method: 'PUT' }),

  // ================= MongoDB Diagnostics =================
  getMongoStatus: () => fetchApi<{
    isConnected: boolean;
    state: string;
    readyState: number;
    databaseName: string | null;
    host: string | null;
    port: number | null;
    currentUri: string;
    rawUriConfigured: boolean;
    lastAttempt: string | null;
    lastError: string | null;
    pingMs: number | null;
    collections: { name: string; count: number }[];
    modelsLoaded: string[];
  }>('/db/mongo/status'),
  connectMongo: (uri: string) =>
    fetchApi<{ success: boolean; message: string; uri: string; error?: string }>('/db/mongo/connect', {
      method: 'POST',
      body: JSON.stringify({ uri })
    }),
  disconnectMongo: () =>
    fetchApi<{ success: boolean; message: string }>('/db/mongo/disconnect', {
      method: 'POST'
    }),
  getMongoCollections: () =>
    fetchApi<{ isConnected: boolean; databaseName?: string; message?: string; collections: { name: string; count: number; sample?: any[] }[] }>('/db/mongo/collections'),
  queryMongoCollection: (collectionName: string, filter?: any, limit?: number) =>
    fetchApi<{ mode: string; collection: string; count: number; returned: number; documents: any[] }>('/db/mongo/query', {
      method: 'POST',
      body: JSON.stringify({ collectionName, filter, limit })
    }),

  // ================= AI =================
  generateSql: (prompt: string, tableName?: string, databaseType?: string) =>
    fetchApi<{ sql: string; isFallback?: boolean }>('/ai/generate-sql', {
      method: 'POST',
      body: JSON.stringify({ prompt, tableName, databaseType })
    }),
  analyzeDiscrepancy: (transactionData: any, issueDescription: string) =>
    fetchApi<{ analysis: string }>('/ai/analyze-discrepancy', {
      method: 'POST',
      body: JSON.stringify({ transactionData, issueDescription })
    }),

  // ================= Misc =================
  getHashtags: () => fetchApi<any[]>('/hashtags'),
  createHashtag: (hashtagData: any) =>
    fetchApi<any>('/hashtags', {
      method: 'POST',
      body: JSON.stringify(hashtagData)
    }),
  getPlugins: () => fetchApi<any[]>('/plugins'),
  togglePlugin: (id: string, enabled?: boolean) =>
    fetchApi<any>(`/plugins/${id}/toggle`, {
      method: 'PUT',
      body: JSON.stringify({ enabled })
    }),
  getMetrics: () => fetchApi<any>('/metrics'),

  // ================= Transaction Settings & Templates =================
  getTransactionSettings: () => fetchApi<{ schema: any; templates: any[] }>('/transactions/settings'),
  updateTransactionSchema: (customFields: any[], defaultTemplateId?: string, updatedBy?: string) =>
    fetchApi<any>('/transactions/settings/schema', {
      method: 'POST',
      body: JSON.stringify({ customFields, defaultTemplateId, updatedBy })
    }),
  saveTransactionTemplate: (templateData: any) =>
    fetchApi<any>('/transactions/settings/templates', {
      method: 'POST',
      body: JSON.stringify(templateData)
    }),
  deleteTransactionTemplate: (id: string) =>
    fetchApi<any>(`/transactions/settings/templates/${id}`, {
      method: 'DELETE'
    }),
  uploadTransactionsToWorkingDb: (uploadData: { filename: string; uploadedBy: string; templateId?: string; templateName?: string; records: any[]; fileSizeBytes?: number }) =>
    fetchApi<any>('/transactions/upload', {
      method: 'POST',
      body: JSON.stringify(uploadData)
    }),
  getWorkingDbTransactions: (params?: { batchId?: string; search?: string; status?: string; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.batchId) query.append('batchId', params.batchId);
    if (params?.search) query.append('search', params.search);
    if (params?.status) query.append('status', params.status);
    if (params?.limit) query.append('limit', String(params.limit));
    const qs = query.toString();
    return fetchApi<{ totalCount: number; returnedCount: number; transactions: any[] }>(`/transactions/working-db${qs ? `?${qs}` : ''}`);
  },
  getUploadAuditLogs: () => fetchApi<any[]>('/transactions/audit-logs'),
  clearWorkingDb: (batchId?: string) =>
    fetchApi<any>(`/transactions/working-db/clear${batchId ? `?batchId=${batchId}` : ''}`, {
      method: 'DELETE'
    }),
  getWorkspaceTableRecords: () => fetchApi<any[]>('/transactions/workspace-table'),
  saveWorkspaceTableRecords: (records: any[]) =>
    fetchApi<any>('/transactions/workspace-table', {
      method: 'POST',
      body: JSON.stringify({ records })
    }),
  deleteWorkspaceTableRecord: (id: string) =>
    fetchApi<any>(`/transactions/workspace-table/${id}`, {
      method: 'DELETE'
    }),
  clearWorkspaceTableRecords: () =>
    fetchApi<any>(`/transactions/workspace-table/clear`, {
      method: 'DELETE'
    }),

  // ================= Workflows & Stages =================
  getWorkflows: (teamId?: string) =>
    fetchApi<any[]>(`/workflows${teamId ? `?teamId=${encodeURIComponent(teamId)}` : ''}`),
  getWorkflow: (id: string) => fetchApi<any>(`/workflows/${id}`),
  createWorkflow: (workflow: any) =>
    fetchApi<any>('/workflows', {
      method: 'POST',
      body: safeJsonStringify(workflow)
    }),
  saveWorkflow: (workflow: any) =>
    fetchApi<any>('/workflows', {
      method: 'POST',
      body: safeJsonStringify(workflow)
    }),
  updateWorkflow: (id: string, updates: any) =>
    fetchApi<any>(`/workflows/${id}`, {
      method: 'PUT',
      body: safeJsonStringify(updates)
    }),
  deleteWorkflow: (id: string) =>
    fetchApi<any>(`/workflows/${id}`, {
      method: 'DELETE'
    }),

  // ================= Query Extractions & Sandbox =================
  getQueryExtractions: (workflowId: string) =>
    fetchApi<any[]>(`/workflows/${workflowId}/query-extractions`),

  createQueryExtraction: (workflowId: string, data: any) =>
    fetchApi<any>(`/workflows/${workflowId}/query-extractions`, {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  updateQueryExtraction: (id: string, data: any) =>
    fetchApi<any>(`/workflows/query-extractions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }),

  deleteQueryExtraction: (id: string) =>
    fetchApi<any>(`/workflows/query-extractions/${id}`, {
      method: 'DELETE'
    }),

  previewQuerySandbox: (data: any) =>
    fetchApi<any>('/workflows/query-sandbox/preview', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  // ================= Investigation Execution & Planning =================
  planInvestigation: (data: any) =>
    fetchApi<any>('/investigations/plan', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  startInvestigation: (data: any) =>
    fetchApi<any>('/investigations/start', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  getInvestigation: (id: string) =>
    fetchApi<any>(`/investigations/${id}`),

  getInvestigationBatches: (id: string) =>
    fetchApi<any[]>(`/investigations/${id}/batches`),

  getInvestigationTransactions: (id: string) =>
    fetchApi<any[]>(`/investigations/${id}/transactions`),

  getInvestigationTransaction: (id: string, transactionId: string) =>
    fetchApi<any>(`/investigations/${id}/transactions/${transactionId}`),

  getInvestigationAudit: (id: string) =>
    fetchApi<any[]>(`/investigations/${id}/audit`),

  executeUniversalWorkflow: (data: {
    workflowId: string;
    records: any[];
    sourceType?: string;
    sourceId?: string;
    keyField?: string;
    keyFields?: string[];
    forceRerun?: boolean;
    priority?: string;
    options?: any;
    executedBy?: string;
  }) =>
    fetchApi<any>('/investigations/execute-universal', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  resumePausedInvestigation: (data: {
    workflowId: string;
    records: any[];
    keyField?: string;
    keyFields?: string[];
  }) =>
    fetchApi<any>('/investigations/resume-paused', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  // ================= Global Standard Directory =================
  getGlobalStandardDirectory: () =>
    fetchApi<any[]>('/transactions/directory'),

  createGlobalStandardDirectoryField: (fieldData: any) =>
    fetchApi<any>('/transactions/directory', {
      method: 'POST',
      body: JSON.stringify(fieldData)
    }),

  updateGlobalStandardDirectoryField: (id: string, fieldData: any) =>
    fetchApi<any>(`/transactions/directory/${id}`, {
      method: 'PUT',
      body: JSON.stringify(fieldData)
    }),

  deleteGlobalStandardDirectoryField: (id: string) =>
    fetchApi<any>(`/transactions/directory/${id}`, {
      method: 'DELETE'
    }),

  clearGlobalStandardDirectory: () =>
    fetchApi<any>('/transactions/directory', {
      method: 'DELETE'
    }),

  discoverGlobalFieldsFromDatabases: (userId?: string) =>
    fetchApi<{ message: string; discoveredCount: number; fields: any[]; scannedTables: any[] }>('/transactions/directory/discover-from-databases', {
      method: 'POST',
      body: JSON.stringify({ userId })
    }),

  importGlobalFieldsFromTable: (dbId: string, tableName: string, userId?: string) =>
    fetchApi<{ message: string; importedCount: number; fields: any[]; tableName: string }>('/transactions/directory/import-from-table', {
      method: 'POST',
      body: JSON.stringify({ dbId, tableName, userId })
    }),

  batchImportGlobalFields: (fields: any[], autoClassify: boolean = true, userId?: string) =>
    fetchApi<{ message: string; importedCount: number; fields: any[] }>('/transactions/directory/batch-import', {
      method: 'POST',
      body: JSON.stringify({ fields, autoClassify, userId })
    }),

  autoClassifyGlobalFields: () =>
    fetchApi<{ message: string; classifiedCount: number; fields: any[] }>('/transactions/directory/auto-classify', {
      method: 'POST'
    }),

  // ================= Versioned Global Schema & Table Mappings =================
  getGlobalSchemaConfig: () =>
    fetchApi<any>('/transactions/schema/config'),

  saveGlobalSchemaConfig: (configData: any) =>
    fetchApi<any>('/transactions/schema/config', {
      method: 'POST',
      body: JSON.stringify(configData)
    }),

  getTableMappings: () =>
    fetchApi<Record<string, any>>('/transactions/table-mappings'),

  saveTableMapping: (mappingData: any) =>
    fetchApi<any>('/transactions/table-mappings', {
      method: 'POST',
      body: JSON.stringify(mappingData)
    }),

  validateTableMapping: (dbId: string, tableName: string) =>
    fetchApi<any>(`/transactions/table-mappings/validate/${encodeURIComponent(dbId)}/${encodeURIComponent(tableName)}`),

  // ================= Validation Boxes =================
  getValidationBoxes: (boxType?: string, teamId?: string) => {
    const params = new URLSearchParams();
    if (boxType) params.append('boxType', boxType);
    if (teamId) params.append('teamId', teamId);
    const qs = params.toString();
    return fetchApi<any[]>(`/validation-boxes${qs ? `?${qs}` : ''}`);
  },
  getValidationBox: (id: string) =>
    fetchApi<any>(`/validation-boxes/${id}`),
  createValidationBox: (boxData: any) =>
    fetchApi<any>('/validation-boxes', {
      method: 'POST',
      body: JSON.stringify(boxData)
    }),
  updateValidationBox: (id: string, updates: any) =>
    fetchApi<any>(`/validation-boxes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates)
    }),
  deleteValidationBox: (id: string) =>
    fetchApi<{ success: boolean; message: string }>(`/validation-boxes/${id}`, {
      method: 'DELETE'
    }),
  testValidationBox: (box: any, sampleRecord?: any) =>
    fetchApi<any>('/validation-boxes/test', {
      method: 'POST',
      body: JSON.stringify({
        box,
        sampleRecord,
        parameters: sampleRecord,
        record: sampleRecord,
        transaction: sampleRecord
      })
    }),

  // ================= Database Column Configurations & Rules =================
  getTablePreviewData: (dbId: string, tableName: string, limit: number = 50) =>
    fetchApi<{
      columns: Array<{ name: string; type: string }>;
      rows: any[];
      rowCount: number;
      source: string;
      executionTimeMs?: number;
      warning?: string;
    }>(`/db/databases/${encodeURIComponent(dbId)}/tables/${encodeURIComponent(tableName)}/preview?limit=${limit}`),

  getColumnConfigurations: (dbId?: string, tableName?: string) => {
    const params = new URLSearchParams();
    if (dbId) params.append('dbId', dbId);
    if (tableName) params.append('tableName', tableName);
    const query = params.toString();
    return fetchApi<DatabaseColumnConfiguration[]>(`/db/column-configurations${query ? `?${query}` : ''}`);
  },

  getColumnConfigurationById: (id: string) =>
    fetchApi<DatabaseColumnConfiguration>(`/db/column-configurations/${encodeURIComponent(id)}`),

  createColumnConfiguration: (config: Partial<DatabaseColumnConfiguration>) =>
    fetchApi<DatabaseColumnConfiguration>('/db/column-configurations', {
      method: 'POST',
      body: JSON.stringify(config)
    }),

  updateColumnConfiguration: (id: string, updates: Partial<DatabaseColumnConfiguration>) =>
    fetchApi<DatabaseColumnConfiguration>(`/db/column-configurations/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(updates)
    }),

  deleteColumnConfiguration: (id: string) =>
    fetchApi<{ success: boolean; id: string }>(`/db/column-configurations/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    }),

  testColumnConfiguration: (config: Partial<DatabaseColumnConfiguration>, sampleRows: any[]) =>
    fetchApi<{
      verdict: 'PASS' | 'VIOLATIONS_FOUND' | 'ERROR';
      totalRows: number;
      violationCount: number;
      violations: Array<{
        rowIndex: number;
        rowData: Record<string, any>;
        reason: string;
        matchedPriorityValues: Record<string, any>;
      }>;
      passedCount?: number;
      passedRows?: Array<{
        rowIndex: number;
        rowData: Record<string, any>;
        info?: string;
        matchedPriorityValues?: Record<string, any>;
      }>;
    }>('/db/column-configurations/test', {
      method: 'POST',
      body: JSON.stringify({ config, sampleRows })
    }),

  // ================= Workspace Setting Proposals (Maker-Checker & Escalation) =================
  getWorkspaceSettingProposals: (params?: { teamId?: string; status?: string }) => {
    const query = new URLSearchParams();
    if (params?.teamId) query.append('teamId', params.teamId);
    if (params?.status) query.append('status', params.status);
    const qs = query.toString();
    return fetchApi<WorkspaceSettingProposal[]>(`/settings/proposals${qs ? `?${qs}` : ''}`);
  },

  getWorkspaceSettingProposalById: (id: string) =>
    fetchApi<WorkspaceSettingProposal>(`/settings/proposals/${encodeURIComponent(id)}`),

  createWorkspaceSettingProposal: (proposal: Partial<WorkspaceSettingProposal>) =>
    fetchApi<WorkspaceSettingProposal>('/settings/proposals', {
      method: 'POST',
      body: JSON.stringify(proposal)
    }),

  reviewWorkspaceSettingProposal: (id: string, action: 'APPROVE' | 'REJECT', checkerId: string, checkerName?: string, feedback?: string) =>
    fetchApi<WorkspaceSettingProposal>(`/settings/proposals/${encodeURIComponent(id)}/review`, {
      method: 'POST',
      body: JSON.stringify({ action, checkerId, checkerName, feedback })
    }),

  escalateWorkspaceSettingProposal: (id: string, targetTeamId: string, reason: string, escalatedBy?: string, escalatedByName?: string) =>
    fetchApi<WorkspaceSettingProposal>(`/settings/proposals/${encodeURIComponent(id)}/escalate`, {
      method: 'POST',
      body: JSON.stringify({ targetTeamId, reason, escalatedBy, escalatedByName })
    }),

  // ================= Composite Workflow Bundles (Operational Governance) =================
  getWorkflowBundles: (params?: { teamId?: string; scope?: string; status?: string; makerId?: string }) => {
    const query = new URLSearchParams();
    if (params?.teamId) query.append('teamId', params.teamId);
    if (params?.scope) query.append('scope', params.scope);
    if (params?.status) query.append('status', params.status);
    if (params?.makerId) query.append('makerId', params.makerId);
    const qs = query.toString();
    return fetchApi<WorkflowBundle[]>(`/workflow-bundles${qs ? `?${qs}` : ''}`);
  },

  getWorkflowBundleById: (id: string) =>
    fetchApi<WorkflowBundle>(`/workflow-bundles/${encodeURIComponent(id)}`),

  createWorkflowBundle: (bundleData: {
    name: string;
    description?: string;
    version?: string;
    scope?: string;
    workflowId: string;
    validationBoxIds?: string[];
    dbCheckIds?: string[];
    sourceTeamId: string;
    makerId: string;
    makerName?: string;
    hashtagBindings?: string[];
  }) =>
    fetchApi<WorkflowBundle>('/workflow-bundles', {
      method: 'POST',
      body: JSON.stringify(bundleData)
    }),

  proposeWorkflowBundlePromotion: (id: string, targetScope: string, makerId: string, makerName?: string) =>
    fetchApi<WorkflowBundle>(`/workflow-bundles/${encodeURIComponent(id)}/propose`, {
      method: 'POST',
      body: JSON.stringify({ targetScope, makerId, makerName })
    }),

  reviewWorkflowBundlePromotion: (id: string, action: 'APPROVE' | 'REJECT', checkerId: string, checkerName?: string, feedback?: string) =>
    fetchApi<WorkflowBundle>(`/workflow-bundles/${encodeURIComponent(id)}/review`, {
      method: 'POST',
      body: JSON.stringify({ action, checkerId, checkerName, feedback })
    }),

  // ================= Domain-Segregated Approvals (Operational Authority Center) =================
  getApprovals: (params?: { teamId?: string; status?: string; makerId?: string; type?: string }) => {
    const query = new URLSearchParams();
    if (params?.teamId) query.append('teamId', params.teamId);
    if (params?.status) query.append('status', params.status);
    if (params?.makerId) query.append('makerId', params.makerId);
    if (params?.type) query.append('type', params.type);
    const qs = query.toString();
    return fetchApi<any[]>(`/approvals${qs ? `?${qs}` : ''}`);
  },

  getTransactionApprovals: (params?: { teamId?: string; status?: string; makerId?: string }) => {
    const query = new URLSearchParams();
    if (params?.teamId) query.append('teamId', params.teamId);
    if (params?.status) query.append('status', params.status);
    if (params?.makerId) query.append('makerId', params.makerId);
    const qs = query.toString();
    return fetchApi<any[]>(`/approvals/transactions${qs ? `?${qs}` : ''}`);
  },

  approveTransactionResolution: (id: string, checkerId: string, checkerName?: string, notes?: string) =>
    fetchApi<any>(`/approvals/transactions/${encodeURIComponent(id)}/approve`, {
      method: 'POST',
      body: JSON.stringify({ checkerId, checkerName, notes })
    }),

  rejectTransactionResolution: (id: string, checkerId: string, checkerName?: string, notes?: string) =>
    fetchApi<any>(`/approvals/transactions/${encodeURIComponent(id)}/reject`, {
      method: 'POST',
      body: JSON.stringify({ checkerId, checkerName, notes })
    }),

  getWorkflowBundleApprovals: (params?: { teamId?: string; status?: string; makerId?: string }) => {
    const query = new URLSearchParams();
    if (params?.teamId) query.append('teamId', params.teamId);
    if (params?.status) query.append('status', params.status);
    if (params?.makerId) query.append('makerId', params.makerId);
    const qs = query.toString();
    return fetchApi<any[]>(`/approvals/workflow-bundles${qs ? `?${qs}` : ''}`);
  },

  reviewApproval: (id: string, action: 'APPROVE' | 'REJECT', checkerId: string, checkerName?: string, reason?: string) =>
    fetchApi<any>(`/approvals/${encodeURIComponent(id)}/review`, {
      method: 'POST',
      body: JSON.stringify({ action, checkerId, checkerName, reason })
    }),

  submitApprovalProposal: (proposalData: any) =>
    fetchApi<any>('/approvals/propose', {
      method: 'POST',
      body: JSON.stringify(proposalData)
    }),

  // ================= Messaging Integration & External Channels =================
  getTeamChannelConfigs: (teamId: string) =>
    fetchApi<any[]>(`/messages/configs/team/${encodeURIComponent(teamId)}`),

  saveTeamChannelConfig: (config: any) =>
    fetchApi<any>('/messages/configs/team', {
      method: 'POST',
      body: JSON.stringify(config)
    }),

  getPersonalChannelConfigs: (userId: string) =>
    fetchApi<any[]>(`/messages/configs/personal/${encodeURIComponent(userId)}`),

  savePersonalChannelConfig: (config: any) =>
    fetchApi<any>('/messages/configs/personal', {
      method: 'POST',
      body: JSON.stringify(config)
    }),

  simulateInboundMessage: (payload: {
    channel: 'email' | 'teams' | 'whatsapp' | 'telegram';
    senderAddress: string;
    senderName?: string;
    text: string;
    linkedIssueId?: string;
    attachments?: any[];
  }) =>
    fetchApi<{ success: boolean; result: any }>('/messages/simulator/send', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  getIncomingMessages: (params?: { teamId?: string; issueId?: string; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.teamId) query.append('teamId', params.teamId);
    if (params?.issueId) query.append('issueId', params.issueId);
    if (params?.limit) query.append('limit', String(params.limit));
    const qs = query.toString();
    return fetchApi<any[]>(`/messages/inbox${qs ? `?${qs}` : ''}`);
  },

  getOutgoingMessages: (params?: { issueId?: string; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.issueId) query.append('issueId', params.issueId);
    if (params?.limit) query.append('limit', String(params.limit));
    const qs = query.toString();
    return fetchApi<any[]>(`/messages/outbox${qs ? `?${qs}` : ''}`);
  },

  // Staged External Requests & Provider Connections
  getMessageProviders: (params?: { teamId?: string; userId?: string }) => {
    const query = new URLSearchParams();
    if (params?.teamId) query.append('teamId', params.teamId);
    if (params?.userId) query.append('userId', params.userId);
    const qs = query.toString();
    return fetchApi<any[]>(`/messages/providers${qs ? `?${qs}` : ''}`);
  },

  createMessageProvider: (payload: any) =>
    fetchApi<any>('/messages/providers', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  testMessageProvider: (id: string) =>
    fetchApi<{ success: boolean; message: string; details?: any }>(`/messages/providers/${encodeURIComponent(id)}/test`, {
      method: 'POST'
    }),

  testOAuth2Credentials: (config: any, channel: string = 'email') =>
    fetchApi<{ success: boolean; message: string; details?: any }>('/messages/oauth2/test', {
      method: 'POST',
      body: JSON.stringify({ config, channel })
    }),

  fetchProviderMessages: (id: string) =>
    fetchApi<{ success: boolean; stagedCount: number; job: any }>(`/messages/providers/${encodeURIComponent(id)}/fetch`, {
      method: 'POST'
    }),

  getStagedMessages: (params?: { teamId?: string; assignedUserId?: string; status?: string; urgency?: string; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.teamId) query.append('teamId', params.teamId);
    if (params?.assignedUserId) query.append('assignedUserId', params.assignedUserId);
    if (params?.status) query.append('status', params.status);
    if (params?.urgency) query.append('urgency', params.urgency);
    if (params?.limit) query.append('limit', String(params.limit));
    const qs = query.toString();
    return fetchApi<any[]>(`/messages/staging${qs ? `?${qs}` : ''}`);
  },

  getStagedMessageById: (id: string) =>
    fetchApi<any>(`/messages/staging/${encodeURIComponent(id)}`),

  proposeStagedMessageConversion: (id: string, payload: { makerId: string; makerName?: string; title?: string; teamId?: string; priority?: string; notes?: string }) =>
    fetchApi<any>(`/messages/staging/${encodeURIComponent(id)}/propose`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  approveStagedMessage: (id: string, payload: { checkerId: string; checkerName?: string; reviewNotes?: string }) =>
    fetchApi<any>(`/messages/staging/${encodeURIComponent(id)}/approve`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  rejectStagedMessage: (id: string, payload: { actorId?: string; actorName?: string; reason?: string }) =>
    fetchApi<any>(`/messages/staging/${encodeURIComponent(id)}/reject`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  createTaskFromStagedMessage: (id: string, payload?: { actorId?: string; actorName?: string; notes?: string }) =>
    fetchApi<any>(`/messages/staging/${encodeURIComponent(id)}/create-task`, {
      method: 'POST',
      body: JSON.stringify(payload || {})
    }),

  escalateStagedMessage: (id: string, payload: { targetTeamId: string; actorId?: string; actorName?: string; reason?: string }) =>
    fetchApi<any>(`/messages/staging/${encodeURIComponent(id)}/escalate`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  getExternalRequestSummary: (teamId?: string) => {
    const query = new URLSearchParams();
    if (teamId) query.append('teamId', teamId);
    const qs = query.toString();
    return fetchApi<any>(`/external-requests/summary${qs ? `?${qs}` : ''}`);
  },

  // Operational Asset Sharing & Verification
  shareOperationalAsset: (payload: {
    assetType: 'WORKFLOW' | 'VALIDATION_BOX' | 'DB_CONFIG';
    assetId: string;
    targetType: 'INDIVIDUAL' | 'TEAM' | 'CHAT_ROOM';
    targetId: string;
    targetName?: string;
    message?: string;
  }) =>
    fetchApi<{ success: boolean; message: string; share: any }>('/assets/share', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  adoptOperationalAsset: (assetType: string, assetId: string, customName?: string) =>
    fetchApi<{ success: boolean; message: string; newAssetId: string; asset: any }>(
      `/assets/${encodeURIComponent(assetType.toLowerCase())}/${encodeURIComponent(assetId)}/adopt`,
      {
        method: 'POST',
        body: JSON.stringify({ customName })
      }
    ),

  testOperationalAsset: (assetType: string, assetId: string, sampleLimit = 10) =>
    fetchApi<{ success: boolean; testResult: any }>(
      `/assets/${encodeURIComponent(assetType.toLowerCase())}/${encodeURIComponent(assetId)}/test`,
      {
        method: 'POST',
        body: JSON.stringify({ sampleLimit })
      }
    ),

  approveOperationalAsset: (assetType: string, assetId: string, feedback?: string) =>
    fetchApi<{ success: boolean; message: string; asset: any }>(
      `/assets/${encodeURIComponent(assetType.toLowerCase())}/${encodeURIComponent(assetId)}/approve`,
      {
        method: 'POST',
        body: JSON.stringify({ feedback })
      }
    ),

  declineOperationalAsset: (assetType: string, assetId: string, feedback: string) =>
    fetchApi<{ success: boolean; message: string; asset: any }>(
      `/assets/${encodeURIComponent(assetType.toLowerCase())}/${encodeURIComponent(assetId)}/decline`,
      {
        method: 'POST',
        body: JSON.stringify({ feedback })
      }
    ),

  unlockOperationalAsset: (assetType: string, assetId: string) =>
    fetchApi<{ success: boolean; message: string }>(
      `/assets/${encodeURIComponent(assetType.toLowerCase())}/${encodeURIComponent(assetId)}/unlock`,
      {
        method: 'POST'
      }
    ),

  getTeamStagedAssets: (teamId: string) =>
    fetchApi<{
      success: boolean;
      validationBoxes: any[];
      workflows: any[];
      dbConfigs: any[];
    }>(`/assets/team-staged/${encodeURIComponent(teamId)}`),

  getDirectShares: (userId?: string) =>
    fetchApi<{ success: boolean; shares: any[] }>(
      `/assets/direct-shares${userId ? `?userId=${encodeURIComponent(userId)}` : ''}`
    )
};





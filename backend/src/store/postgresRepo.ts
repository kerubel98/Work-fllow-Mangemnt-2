import { getPostgresPool } from '../config/postgres.js';
import {
  User, Issue, ChatMessage, DatabaseConnection, EnvironmentSystem, Team, TeamTask,
  TeamInsight, TeamDiscussionMessage, AppNotification, DirectMessage, QueryApprovalRequest,
  DbAccessRequest, ConnectionUsageLog, HashtagPreset, Plugin, Organization,
  GlobalTransactionSchemaConfig, WorkspaceTableRecord, DatabaseValidationWorkflow,
  QueryExtraction, InvestigationTask, InvestigationBatch, InvestigationTransaction,
  CentralTransactionRecord, ValidationBox, GlobalStandardDirectoryRecord, FtpFileStagingConfig
} from '../types.js';

function parseJson(val: any, fallback: any = null) {
  if (val == null) return fallback;
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch { return fallback; }
  }
  return val;
}

export const postgresRepo = {
  // ================= USERS =================
  async getUsers(): Promise<User[]> {
    const pool = getPostgresPool();
    const { rows } = await pool.query('SELECT * FROM users ORDER BY created_at ASC;');
    return rows.map(r => ({
      id: r.id,
      username: r.username,
      email: r.email,
      role: r.role,
      isApproved: r.is_approved,
      canExecuteSelect: r.can_execute_select,
      canExecuteUpdate: r.can_execute_update,
      allowedDbIds: parseJson(r.allowed_db_ids, []),
      createdAt: r.created_at?.toISOString() || new Date().toISOString()
    }));
  },

  async getUserById(id: string): Promise<User | null> {
    const pool = getPostgresPool();
    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1 LIMIT 1;', [id]);
    if (!rows.length) return null;
    const r = rows[0];
    return {
      id: r.id,
      username: r.username,
      email: r.email,
      role: r.role,
      isApproved: r.is_approved,
      canExecuteSelect: r.can_execute_select,
      canExecuteUpdate: r.can_execute_update,
      allowedDbIds: parseJson(r.allowed_db_ids, []),
      createdAt: r.created_at?.toISOString() || new Date().toISOString()
    };
  },

  async getUserByUsername(username: string): Promise<User | null> {
    const pool = getPostgresPool();
    const { rows } = await pool.query('SELECT * FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1;', [username]);
    if (!rows.length) return null;
    const r = rows[0];
    return {
      id: r.id,
      username: r.username,
      email: r.email,
      role: r.role,
      isApproved: r.is_approved,
      canExecuteSelect: r.can_execute_select,
      canExecuteUpdate: r.can_execute_update,
      allowedDbIds: parseJson(r.allowed_db_ids, []),
      createdAt: r.created_at?.toISOString() || new Date().toISOString()
    };
  },

  async createUser(userData: User): Promise<User> {
    const pool = getPostgresPool();
    await pool.query(
      `INSERT INTO users (id, username, email, role, is_approved, can_execute_select, can_execute_update, allowed_db_ids, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO UPDATE SET
         username = EXCLUDED.username,
         email = EXCLUDED.email,
         role = EXCLUDED.role,
         is_approved = EXCLUDED.is_approved,
         can_execute_select = EXCLUDED.can_execute_select,
         can_execute_update = EXCLUDED.can_execute_update,
         allowed_db_ids = EXCLUDED.allowed_db_ids;`,
      [
        userData.id,
        userData.username,
        userData.email,
        userData.role,
        userData.isApproved,
        userData.canExecuteSelect ?? true,
        userData.canExecuteUpdate ?? false,
        JSON.stringify(userData.allowedDbIds || []),
        userData.createdAt || new Date()
      ]
    );
    return userData;
  },

  async updateUser(id: string, updates: Partial<User>): Promise<User | null> {
    const existing = await this.getUserById(id);
    if (!existing) return null;
    const merged = { ...existing, ...updates };
    await this.createUser(merged);
    return merged;
  },

  async deleteUser(id: string): Promise<boolean> {
    const pool = getPostgresPool();
    const res = await pool.query('DELETE FROM users WHERE id = $1;', [id]);
    return (res.rowCount ?? 0) > 0;
  },

  // ================= ISSUES =================
  async getIssues(): Promise<Issue[]> {
    const pool = getPostgresPool();
    const { rows } = await pool.query('SELECT * FROM issues ORDER BY created_at DESC;');
    return rows.map(r => this.mapIssueRow(r));
  },

  async getIssueById(id: string): Promise<Issue | null> {
    const pool = getPostgresPool();
    const { rows } = await pool.query('SELECT * FROM issues WHERE id = $1 LIMIT 1;', [id]);
    if (!rows.length) return null;
    return this.mapIssueRow(rows[0]);
  },

  async createIssue(issue: Issue): Promise<Issue> {
    const pool = getPostgresPool();
    await pool.query(
      `INSERT INTO issues (
        id, title, description, status, priority, creator_id, creator_name, created_at, type,
        transaction_id, uploaded_file_name, uploaded_file_headers, file_mapping, transaction_count,
        dataset_status, first_level_notes, second_level_notes, solution_script, solution_test_result,
        solution_executed, solution_executed_at, linked_hashtag, chat, assigned_tech_user_id,
        assigned_tech_user_name, investigation_system_id, investigation_environment,
        investigation_table, validation_status, validation_errors, query_results, moved_to_testing,
        row_labels, added_label_column_name, custom_filters
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9,
        $10, $11, $12, $13, $14,
        $15, $16, $17, $18, $19,
        $20, $21, $22, $23, $24,
        $25, $26, $27,
        $28, $29, $30, $31, $32,
        $33, $34, $35
      ) ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        status = EXCLUDED.status,
        priority = EXCLUDED.priority,
        type = EXCLUDED.type,
        transaction_id = EXCLUDED.transaction_id,
        uploaded_file_name = EXCLUDED.uploaded_file_name,
        uploaded_file_headers = EXCLUDED.uploaded_file_headers,
        file_mapping = EXCLUDED.file_mapping,
        transaction_count = EXCLUDED.transaction_count,
        dataset_status = EXCLUDED.dataset_status,
        first_level_notes = EXCLUDED.first_level_notes,
        second_level_notes = EXCLUDED.second_level_notes,
        solution_script = EXCLUDED.solution_script,
        solution_test_result = EXCLUDED.solution_test_result,
        solution_executed = EXCLUDED.solution_executed,
        solution_executed_at = EXCLUDED.solution_executed_at,
        linked_hashtag = EXCLUDED.linked_hashtag,
        chat = EXCLUDED.chat,
        assigned_tech_user_id = EXCLUDED.assigned_tech_user_id,
        assigned_tech_user_name = EXCLUDED.assigned_tech_user_name,
        investigation_system_id = EXCLUDED.investigation_system_id,
        investigation_environment = EXCLUDED.investigation_environment,
        investigation_table = EXCLUDED.investigation_table,
        validation_status = EXCLUDED.validation_status,
        validation_errors = EXCLUDED.validation_errors,
        query_results = EXCLUDED.query_results,
        moved_to_testing = EXCLUDED.moved_to_testing,
        row_labels = EXCLUDED.row_labels,
        added_label_column_name = EXCLUDED.added_label_column_name,
        custom_filters = EXCLUDED.custom_filters;`,
      [
        issue.id,
        issue.title,
        issue.description,
        issue.status || 'Open',
        issue.priority || 'Medium',
        issue.creatorId,
        issue.creatorName,
        issue.createdAt || new Date(),
        issue.type || 'single',
        issue.transactionId || null,
        issue.uploadedFileName || null,
        JSON.stringify(issue.uploadedFileHeaders || []),
        JSON.stringify(issue.fileMapping || {}),
        issue.transactionCount || (issue.firstLevelMappedData ? issue.firstLevelMappedData.length : 0),
        issue.firstLevelMappedData && issue.firstLevelMappedData.length > 0 ? 'INGESTED' : (issue.datasetStatus || 'NONE'),
        issue.firstLevelNotes || null,
        issue.secondLevelNotes || null,
        issue.solutionScript || null,
        issue.solutionTestResult || null,
        issue.solutionExecuted ?? false,
        issue.solutionExecutedAt ? new Date(issue.solutionExecutedAt) : null,
        issue.linkedHashtag || null,
        JSON.stringify(issue.chat || []),
        issue.assignedTechUserId || null,
        issue.assignedTechUserName || null,
        issue.investigationSystemId || null,
        issue.investigationEnvironment || null,
        issue.investigationTable || null,
        issue.validationStatus || 'untested',
        JSON.stringify(issue.validationErrors || []),
        JSON.stringify(issue.queryResults || []),
        issue.movedToTesting ?? false,
        JSON.stringify(issue.rowLabels || {}),
        issue.addedLabelColumnName || null,
        JSON.stringify(issue.customFilters || [])
      ]
    );

    // If mapped data was passed, store it into task_dataset_transactions
    if (issue.firstLevelMappedData && issue.firstLevelMappedData.length > 0) {
      await this.createTaskDatasetTransactions(issue.id, issue.firstLevelMappedData);
    }

    return issue;
  },

  async updateIssue(id: string, updates: Partial<Issue>): Promise<Issue | null> {
    const existing = await this.getIssueById(id);
    if (!existing) return null;
    const merged = { ...existing, ...updates };
    await this.createIssue(merged);
    return merged;
  },

  async deleteIssue(id: string): Promise<boolean> {
    const pool = getPostgresPool();
    const res = await pool.query('DELETE FROM issues WHERE id = $1;', [id]);
    return (res.rowCount ?? 0) > 0;
  },

  async addIssueChat(issueId: string, message: ChatMessage): Promise<Issue | null> {
    const existing = await this.getIssueById(issueId);
    if (!existing) return null;
    const updatedChat = [...(existing.chat || []), message];
    return await this.updateIssue(issueId, { chat: updatedChat });
  },

  mapIssueRow(r: any): Issue {
    return {
      id: r.id,
      title: r.title,
      description: r.description,
      status: r.status,
      priority: r.priority,
      creatorId: r.creator_id,
      creatorName: r.creator_name,
      createdAt: r.created_at?.toISOString() || new Date().toISOString(),
      type: r.type,
      transactionId: r.transaction_id || undefined,
      uploadedFileName: r.uploaded_file_name || undefined,
      uploadedFileHeaders: parseJson(r.uploaded_file_headers, []),
      fileMapping: parseJson(r.file_mapping, {}),
      firstLevelNotes: r.first_level_notes || undefined,
      firstLevelMappedData: undefined, // Loaded on-demand via paginated task dataset!
      secondLevelNotes: r.second_level_notes || undefined,
      solutionScript: r.solution_script || undefined,
      solutionTestResult: r.solution_test_result || undefined,
      solutionExecuted: r.solution_executed,
      solutionExecutedAt: r.solution_executed_at?.toISOString() || undefined,
      linkedHashtag: r.linked_hashtag || undefined,
      chat: parseJson(r.chat, []),
      assignedTechUserId: r.assigned_tech_user_id || undefined,
      assignedTechUserName: r.assigned_tech_user_name || undefined,
      investigationSystemId: r.investigation_system_id || undefined,
      investigationEnvironment: r.investigation_environment || undefined,
      investigationTable: r.investigation_table || undefined,
      validationStatus: r.validation_status || 'untested',
      validationErrors: parseJson(r.validation_errors, []),
      queryResults: parseJson(r.query_results, []),
      movedToTesting: r.moved_to_testing,
      rowLabels: parseJson(r.row_labels, {}),
      addedLabelColumnName: r.added_label_column_name || undefined,
      customFilters: parseJson(r.custom_filters, [])
    };
  },

  // ================= TASK DATASET TRANSACTIONS (100k+ SCALABILITY) =================
  async createTaskDatasetTransactions(taskId: string, rows: Record<string, any>[]): Promise<number> {
    if (!rows.length) return 0;
    const pool = getPostgresPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Chunk inserts into 1,000 items per batch
      const CHUNK_SIZE = 1000;
      let inserted = 0;
      for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
        const chunk = rows.slice(i, i + CHUNK_SIZE);
        const values: any[] = [];
        const placeholders: string[] = [];

        chunk.forEach((row, idx) => {
          const paramOffset = idx * 5;
          const rowBatchId = row._batchId || `BATCH-${taskId.slice(-6)}-001`;
          placeholders.push(`($${paramOffset + 1}, $${paramOffset + 2}, $${paramOffset + 3}, $${paramOffset + 4}, $${paramOffset + 5})`);
          values.push(taskId, i + idx + 1, rowBatchId, JSON.stringify(row), JSON.stringify(row));
        });

        const query = `
          INSERT INTO task_dataset_transactions (task_id, row_number, batch_id, canonical_data, raw_data)
          VALUES ${placeholders.join(', ')}
          ON CONFLICT DO NOTHING;
        `;
        await client.query(query, values);
        inserted += chunk.length;
      }

      await client.query(
        `UPDATE issues SET transaction_count = $1, dataset_status = 'INGESTED' WHERE id = $2;`,
        [rows.length, taskId]
      );

      await client.query('COMMIT');
      return inserted;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },

  async getTaskDatasetTransactions(taskId: string, page = 1, limit = 50, batchId?: string): Promise<{ rows: any[]; totalCount: number }> {
    const pool = getPostgresPool();
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE task_id = $1';
    const queryParams: any[] = [taskId];
    if (batchId) {
      whereClause += ' AND batch_id = $2';
      queryParams.push(batchId);
    }

    const countRes = await pool.query(`SELECT COUNT(*)::int as total FROM task_dataset_transactions ${whereClause};`, queryParams);
    const totalCount = countRes.rows[0]?.total || 0;

    const dataParams = [...queryParams, limit, offset];
    const limitOffsetPlaceholders = `$${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;

    const dataRes = await pool.query(
      `SELECT row_number, batch_id, canonical_data, raw_data, created_at
       FROM task_dataset_transactions
       ${whereClause}
       ORDER BY row_number ASC
       LIMIT ${limitOffsetPlaceholders};`,
      dataParams
    );

    const rows = dataRes.rows.map(r => ({
      _rowNumber: r.row_number,
      _batchId: r.batch_id,
      ...parseJson(r.canonical_data, {})
    }));

    return { rows, totalCount };
  },

  async getTaskDatasetBatches(taskId: string): Promise<{ batchId: string; count: number }[]> {
    const pool = getPostgresPool();
    const { rows } = await pool.query(
      `SELECT COALESCE(batch_id, 'BATCH-DEFAULT') as batch_id, COUNT(*)::int as count
       FROM task_dataset_transactions
       WHERE task_id = $1
       GROUP BY batch_id
       ORDER BY batch_id ASC;`,
      [taskId]
    );
    return rows.map(r => ({ batchId: r.batch_id, count: r.count }));
  },

  // ================= DATABASE CONNECTIONS =================
  async getDatabaseConnections(): Promise<DatabaseConnection[]> {
    const pool = getPostgresPool();
    const { rows } = await pool.query('SELECT * FROM database_connections ORDER BY name ASC;');
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      type: r.type,
      host: r.host,
      port: r.port || undefined,
      connectionString: r.connection_string || undefined,
      databaseName: r.database_name || undefined,
      username: r.username || undefined,
      password: r.password || undefined,
      status: r.status,
      apiEndpoint: r.api_endpoint || '',
      createdByAdmin: r.created_by_admin,
      requiresAccessApproval: r.requires_access_approval,
      description: r.description || undefined,
      allowedRoles: parseJson(r.allowed_roles, []),
      allowedTables: parseJson(r.allowed_tables, []),
      availableTables: parseJson(r.available_tables, [])
    }));
  },

  async getDatabaseConnectionById(id: string): Promise<DatabaseConnection | null> {
    const pool = getPostgresPool();
    const { rows } = await pool.query('SELECT * FROM database_connections WHERE id = $1 LIMIT 1;', [id]);
    if (!rows.length) return null;
    const r = rows[0];
    return {
      id: r.id,
      name: r.name,
      type: r.type,
      host: r.host,
      port: r.port || undefined,
      connectionString: r.connection_string || undefined,
      databaseName: r.database_name || undefined,
      username: r.username || undefined,
      password: r.password || undefined,
      status: r.status,
      apiEndpoint: r.api_endpoint || '',
      createdByAdmin: r.created_by_admin,
      requiresAccessApproval: r.requires_access_approval,
      description: r.description || undefined,
      allowedRoles: parseJson(r.allowed_roles, []),
      allowedTables: parseJson(r.allowed_tables, []),
      availableTables: parseJson(r.available_tables, [])
    };
  },

  async createDatabaseConnection(conn: DatabaseConnection): Promise<DatabaseConnection> {
    const pool = getPostgresPool();
    await pool.query(
      `INSERT INTO database_connections (id, name, type, host, port, connection_string, database_name, username, password, status, api_endpoint, created_by_admin, requires_access_approval, description, allowed_roles, allowed_tables, available_tables)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         type = EXCLUDED.type,
         host = EXCLUDED.host,
         port = EXCLUDED.port,
         connection_string = EXCLUDED.connection_string,
         database_name = EXCLUDED.database_name,
         username = EXCLUDED.username,
         password = EXCLUDED.password,
         status = EXCLUDED.status,
         api_endpoint = EXCLUDED.api_endpoint,
         created_by_admin = EXCLUDED.created_by_admin,
         requires_access_approval = EXCLUDED.requires_access_approval,
         description = EXCLUDED.description,
         allowed_roles = EXCLUDED.allowed_roles,
         allowed_tables = EXCLUDED.allowed_tables,
         available_tables = EXCLUDED.available_tables;`,
      [
        conn.id,
        conn.name,
        conn.type,
        conn.host,
        conn.port || null,
        conn.connectionString || null,
        conn.databaseName || null,
        conn.username || null,
        conn.password || null,
        conn.status || 'offline',
        conn.apiEndpoint || '',
        conn.createdByAdmin ?? false,
        conn.requiresAccessApproval ?? false,
        conn.description || '',
        JSON.stringify(conn.allowedRoles || []),
        JSON.stringify(conn.allowedTables || []),
        JSON.stringify(conn.availableTables || [])
      ]
    );
    return conn;
  },

  async updateDatabaseConnection(id: string, updates: Partial<DatabaseConnection>): Promise<DatabaseConnection | null> {
    const existing = await this.getDatabaseConnectionById(id);
    if (!existing) return null;
    const merged = { ...existing, ...updates };
    await this.createDatabaseConnection(merged);
    return merged;
  },

  async deleteDatabaseConnection(id: string): Promise<boolean> {
    const pool = getPostgresPool();
    const res = await pool.query('DELETE FROM database_connections WHERE id = $1;', [id]);
    return (res.rowCount ?? 0) > 0;
  },

  // ================= ENVIRONMENT SYSTEMS =================
  async getEnvironmentSystems(): Promise<EnvironmentSystem[]> {
    const pool = getPostgresPool();
    const { rows } = await pool.query('SELECT * FROM environment_systems ORDER BY name ASC;');
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      description: r.description,
      testing: parseJson(r.testing, {}),
      production: parseJson(r.production, {}),
      allowedUserIds: parseJson(r.allowed_user_ids, []),
      allowedRoles: parseJson(r.allowed_roles, []),
      requireDmlApproval: r.require_dml_approval
    }));
  },

  async getEnvironmentSystemById(id: string): Promise<EnvironmentSystem | null> {
    const pool = getPostgresPool();
    const { rows } = await pool.query('SELECT * FROM environment_systems WHERE id = $1 LIMIT 1;', [id]);
    if (!rows.length) return null;
    const r = rows[0];
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      testing: parseJson(r.testing, {}),
      production: parseJson(r.production, {}),
      allowedUserIds: parseJson(r.allowed_user_ids, []),
      allowedRoles: parseJson(r.allowed_roles, []),
      requireDmlApproval: r.require_dml_approval
    };
  },

  async createEnvironmentSystem(sys: EnvironmentSystem): Promise<EnvironmentSystem> {
    const pool = getPostgresPool();
    await pool.query(
      `INSERT INTO environment_systems (id, name, description, testing, production, allowed_user_ids, allowed_roles, require_dml_approval)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         testing = EXCLUDED.testing,
         production = EXCLUDED.production,
         allowed_user_ids = EXCLUDED.allowed_user_ids,
         allowed_roles = EXCLUDED.allowed_roles,
         require_dml_approval = EXCLUDED.require_dml_approval;`,
      [
        sys.id,
        sys.name,
        sys.description,
        JSON.stringify(sys.testing || {}),
        JSON.stringify(sys.production || {}),
        JSON.stringify(sys.allowedUserIds || []),
        JSON.stringify(sys.allowedRoles || []),
        sys.requireDmlApproval ?? false
      ]
    );
    return sys;
  },

  async updateEnvironmentSystem(id: string, updates: Partial<EnvironmentSystem>): Promise<EnvironmentSystem | null> {
    const existing = await this.getEnvironmentSystemById(id);
    if (!existing) return null;
    const merged = { ...existing, ...updates };
    await this.createEnvironmentSystem(merged);
    return merged;
  },

  async deleteEnvironmentSystem(id: string): Promise<boolean> {
    const pool = getPostgresPool();
    const res = await pool.query('DELETE FROM environment_systems WHERE id = $1;', [id]);
    return (res.rowCount ?? 0) > 0;
  },

  // ================= TEAMS & TEAM TASKS =================
  async getTeams(): Promise<Team[]> {
    const pool = getPostgresPool();
    const { rows } = await pool.query('SELECT * FROM teams ORDER BY name ASC;');
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      description: r.description,
      teamType: r.team_type,
      managerId: r.manager_id,
      managerName: r.manager_name,
      memberIds: parseJson(r.member_ids, []),
      createdAt: r.created_at?.toISOString() || new Date().toISOString()
    }));
  },

  async getTeamById(id: string): Promise<Team | null> {
    const pool = getPostgresPool();
    const { rows } = await pool.query('SELECT * FROM teams WHERE id = $1 LIMIT 1;', [id]);
    if (!rows.length) return null;
    const r = rows[0];
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      teamType: r.team_type,
      managerId: r.manager_id,
      managerName: r.manager_name,
      memberIds: parseJson(r.member_ids, []),
      createdAt: r.created_at?.toISOString() || new Date().toISOString()
    };
  },

  async createTeam(team: Team): Promise<Team> {
    const pool = getPostgresPool();
    await pool.query(
      `INSERT INTO teams (id, name, description, team_type, manager_id, manager_name, member_ids, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         team_type = EXCLUDED.team_type,
         manager_id = EXCLUDED.manager_id,
         manager_name = EXCLUDED.manager_name,
         member_ids = EXCLUDED.member_ids;`,
      [
        team.id,
        team.name,
        team.description || null,
        team.teamType || 'permanent',
        team.managerId,
        team.managerName,
        JSON.stringify(team.memberIds || []),
        team.createdAt || new Date()
      ]
    );
    return team;
  },

  async updateTeam(id: string, updates: Partial<Team>): Promise<Team | null> {
    const existing = await this.getTeamById(id);
    if (!existing) return null;
    const merged = { ...existing, ...updates };
    await this.createTeam(merged);
    return merged;
  },

  async deleteTeam(id: string): Promise<boolean> {
    const pool = getPostgresPool();
    const res = await pool.query('DELETE FROM teams WHERE id = $1;', [id]);
    return (res.rowCount ?? 0) > 0;
  },

  // ================= WORKFLOWS & EXTRACTIONS =================
  async getValidationWorkflows(): Promise<DatabaseValidationWorkflow[]> {
    const pool = getPostgresPool();
    const { rows } = await pool.query('SELECT * FROM database_validation_workflows ORDER BY name ASC;');
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      description: r.description,
      targetDbId: r.target_db_id,
      targetTable: r.target_table,
      category: r.category,
      stages: parseJson(r.stages, []),
      steps: parseJson(r.steps, []),
      globalSuccessMessage: r.global_success_message,
      globalFailureMessage: r.global_failure_message,
      createdBy: r.created_by,
      createdAt: r.created_at?.toISOString(),
      updatedAt: r.updated_at?.toISOString(),
      isSystemDefault: r.is_system_default,
      version: r.version
    }));
  },

  async getValidationWorkflowById(id: string): Promise<DatabaseValidationWorkflow | null> {
    const pool = getPostgresPool();
    const { rows } = await pool.query('SELECT * FROM database_validation_workflows WHERE id = $1 LIMIT 1;', [id]);
    if (!rows.length) return null;
    const r = rows[0];
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      targetDbId: r.target_db_id,
      targetTable: r.target_table,
      category: r.category,
      stages: parseJson(r.stages, []),
      steps: parseJson(r.steps, []),
      globalSuccessMessage: r.global_success_message,
      globalFailureMessage: r.global_failure_message,
      createdBy: r.created_by,
      createdAt: r.created_at?.toISOString(),
      updatedAt: r.updated_at?.toISOString(),
      isSystemDefault: r.is_system_default,
      version: r.version
    };
  },

  async createValidationWorkflow(wf: DatabaseValidationWorkflow): Promise<DatabaseValidationWorkflow> {
    const pool = getPostgresPool();
    await pool.query(
      `INSERT INTO database_validation_workflows (id, name, description, target_db_id, target_table, category, stages, steps, global_success_message, global_failure_message, created_by, created_at, updated_at, is_system_default, version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         target_db_id = EXCLUDED.target_db_id,
         target_table = EXCLUDED.target_table,
         category = EXCLUDED.category,
         stages = EXCLUDED.stages,
         steps = EXCLUDED.steps,
         global_success_message = EXCLUDED.global_success_message,
         global_failure_message = EXCLUDED.global_failure_message,
         updated_at = NOW(),
         is_system_default = EXCLUDED.is_system_default,
         version = EXCLUDED.version;`,
      [
        wf.id,
        wf.name,
        wf.description || '',
        wf.targetDbId || null,
        wf.targetTable || '',
        wf.category || 'Custom',
        JSON.stringify(wf.stages || []),
        JSON.stringify(wf.steps || []),
        wf.globalSuccessMessage || '',
        wf.globalFailureMessage || '',
        wf.createdBy || 'system',
        wf.createdAt || new Date(),
        new Date(),
        wf.isSystemDefault ?? false,
        wf.version || '1.0.0'
      ]
    );
    return wf;
  },

  async updateValidationWorkflow(id: string, updates: Partial<DatabaseValidationWorkflow>): Promise<DatabaseValidationWorkflow | null> {
    const existing = await this.getValidationWorkflowById(id);
    if (!existing) return null;
    const merged = { ...existing, ...updates };
    await this.createValidationWorkflow(merged);
    return merged;
  },

  async deleteValidationWorkflow(id: string): Promise<boolean> {
    const pool = getPostgresPool();
    const res = await pool.query('DELETE FROM database_validation_workflows WHERE id = $1;', [id]);
    return (res.rowCount ?? 0) > 0;
  },

  // ================= INVESTIGATION TASKS, BATCHES & TRANSACTIONS =================
  async createInvestigationTask(task: InvestigationTask): Promise<InvestigationTask> {
    const pool = getPostgresPool();
    await pool.query(
      `INSERT INTO investigation_tasks (id, workflow_id, workflow_name, issue_id, team_task_id, total_transactions, processed_transactions, reconciled_transactions, flagged_transactions, closed_transactions, failed_transactions, status, execution_plan, created_at, started_at, completed_at, error_detail)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
       ON CONFLICT (id) DO UPDATE SET
         total_transactions = EXCLUDED.total_transactions,
         processed_transactions = EXCLUDED.processed_transactions,
         reconciled_transactions = EXCLUDED.reconciled_transactions,
         flagged_transactions = EXCLUDED.flagged_transactions,
         closed_transactions = EXCLUDED.closed_transactions,
         failed_transactions = EXCLUDED.failed_transactions,
         status = EXCLUDED.status,
         started_at = EXCLUDED.started_at,
         completed_at = EXCLUDED.completed_at,
         error_detail = EXCLUDED.error_detail;`,
      [
        task.id,
        task.workflowId,
        task.workflowName || '',
        task.issueId || null,
        task.teamTaskId || null,
        task.totalTransactions || 0,
        task.processedTransactions || 0,
        task.reconciledTransactions || 0,
        task.flaggedTransactions || 0,
        task.closedTransactions || 0,
        task.failedTransactions || 0,
        task.status || 'PENDING',
        JSON.stringify(task.executionPlan || {}),
        task.createdAt || new Date(),
        task.startedAt ? new Date(task.startedAt) : null,
        task.completedAt ? new Date(task.completedAt) : null,
        task.errorDetail || null
      ]
    );
    return task;
  },

  async getInvestigationTaskById(id: string): Promise<InvestigationTask | null> {
    const pool = getPostgresPool();
    const { rows } = await pool.query('SELECT * FROM investigation_tasks WHERE id = $1 LIMIT 1;', [id]);
    if (!rows.length) return null;
    const r = rows[0];
    return {
      id: r.id,
      workflowId: r.workflow_id,
      workflowName: r.workflow_name,
      issueId: r.issue_id,
      teamTaskId: r.team_task_id,
      totalTransactions: r.total_transactions,
      processedTransactions: r.processed_transactions,
      reconciledTransactions: r.reconciled_transactions,
      flaggedTransactions: r.flagged_transactions,
      closedTransactions: r.closed_transactions,
      failedTransactions: r.failed_transactions,
      status: r.status,
      executionPlan: parseJson(r.execution_plan, {}),
      createdAt: r.created_at?.toISOString(),
      startedAt: r.started_at?.toISOString(),
      completedAt: r.completed_at?.toISOString(),
      errorDetail: r.error_detail
    };
  },

  async updateInvestigationTask(id: string, updates: Partial<InvestigationTask>): Promise<InvestigationTask | null> {
    const existing = await this.getInvestigationTaskById(id);
    if (!existing) return null;
    const merged = { ...existing, ...updates };
    await this.createInvestigationTask(merged);
    return merged;
  },

  async createInvestigationBatch(batch: InvestigationBatch): Promise<InvestigationBatch> {
    const pool = getPostgresPool();
    await pool.query(
      `INSERT INTO investigation_batches (id, task_id, sequence, transaction_count, processed_count, status, started_at, completed_at, error_detail, retry_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO UPDATE SET
         processed_count = EXCLUDED.processed_count,
         status = EXCLUDED.status,
         started_at = EXCLUDED.started_at,
         completed_at = EXCLUDED.completed_at,
         error_detail = EXCLUDED.error_detail,
         retry_count = EXCLUDED.retry_count;`,
      [
        batch.id,
        batch.taskId,
        batch.sequence,
        batch.transactionCount,
        batch.processedCount,
        batch.status || 'PENDING',
        batch.startedAt ? new Date(batch.startedAt) : null,
        batch.completedAt ? new Date(batch.completedAt) : null,
        batch.errorDetail || null,
        batch.retryCount || 0
      ]
    );
    return batch;
  },

  async getInvestigationBatchesByTaskId(taskId: string): Promise<InvestigationBatch[]> {
    const pool = getPostgresPool();
    const { rows } = await pool.query('SELECT * FROM investigation_batches WHERE task_id = $1 ORDER BY sequence ASC;', [taskId]);
    return rows.map(r => ({
      id: r.id,
      taskId: r.task_id,
      sequence: r.sequence,
      transactionCount: r.transaction_count,
      processedCount: r.processed_count,
      status: r.status,
      startedAt: r.started_at?.toISOString(),
      completedAt: r.completed_at?.toISOString(),
      errorDetail: r.error_detail,
      retryCount: r.retry_count
    }));
  },

  async updateInvestigationBatch(id: string, updates: Partial<InvestigationBatch>): Promise<InvestigationBatch | null> {
    const pool = getPostgresPool();
    const { rows } = await pool.query('SELECT * FROM investigation_batches WHERE id = $1 LIMIT 1;', [id]);
    if (!rows.length) return null;
    const existing = rows[0];
    const merged: InvestigationBatch = {
      id: existing.id,
      taskId: existing.task_id,
      sequence: existing.sequence,
      transactionCount: updates.transactionCount ?? existing.transaction_count,
      processedCount: updates.processedCount ?? existing.processed_count,
      status: updates.status ?? existing.status,
      startedAt: updates.startedAt ?? existing.started_at?.toISOString(),
      completedAt: updates.completedAt ?? existing.completed_at?.toISOString(),
      errorDetail: updates.errorDetail ?? existing.error_detail,
      retryCount: updates.retryCount ?? existing.retry_count
    };
    await this.createInvestigationBatch(merged);
    return merged;
  },

  async createInvestigationTransaction(tx: InvestigationTransaction): Promise<InvestigationTransaction> {
    const pool = getPostgresPool();
    await pool.query(
      `INSERT INTO investigation_transactions (id, task_id, batch_id, transaction_id, investigation_status, status_flag_text, status_flag_color, current_stage_id, current_rule_id, final_result, final_action, audit_trail, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
       ON CONFLICT (id) DO UPDATE SET
         batch_id = EXCLUDED.batch_id,
         investigation_status = EXCLUDED.investigation_status,
         status_flag_text = EXCLUDED.status_flag_text,
         status_flag_color = EXCLUDED.status_flag_color,
         current_stage_id = EXCLUDED.current_stage_id,
         current_rule_id = EXCLUDED.current_rule_id,
         final_result = EXCLUDED.final_result,
         final_action = EXCLUDED.final_action,
         audit_trail = EXCLUDED.audit_trail,
         updated_at = NOW();`,
      [
        tx.id,
        tx.taskId,
        tx.batchId || null,
        tx.transactionId,
        tx.investigationStatus || 'UNINVESTIGATED',
        tx.statusFlagText || null,
        tx.statusFlagColor || null,
        tx.currentStageId || null,
        tx.currentRuleId || null,
        tx.finalResult || 'NOT_EVALUATED',
        tx.finalAction || 'CONTINUE',
        JSON.stringify(tx.auditTrail || [])
      ]
    );
    return tx;
  },

  async getInvestigationTransactionsByTaskId(taskId: string): Promise<InvestigationTransaction[]> {
    const pool = getPostgresPool();
    const { rows } = await pool.query('SELECT * FROM investigation_transactions WHERE task_id = $1;', [taskId]);
    return rows.map(r => ({
      id: r.id,
      taskId: r.task_id,
      batchId: r.batch_id,
      transactionId: r.transaction_id,
      investigationStatus: r.investigation_status,
      statusFlagText: r.status_flag_text,
      statusFlagColor: r.status_flag_color,
      currentStageId: r.current_stage_id,
      currentRuleId: r.current_rule_id,
      finalResult: r.final_result,
      finalAction: r.final_action,
      auditTrail: parseJson(r.audit_trail, []),
      updatedAt: r.updated_at?.toISOString()
    }));
  },

  async getInvestigationTransaction(taskId: string, transactionId: string): Promise<InvestigationTransaction | null> {
    const pool = getPostgresPool();
    const { rows } = await pool.query('SELECT * FROM investigation_transactions WHERE task_id = $1 AND transaction_id = $2 LIMIT 1;', [taskId, transactionId]);
    if (!rows.length) return null;
    const r = rows[0];
    return {
      id: r.id,
      taskId: r.task_id,
      batchId: r.batch_id,
      transactionId: r.transaction_id,
      investigationStatus: r.investigation_status,
      statusFlagText: r.status_flag_text,
      statusFlagColor: r.status_flag_color,
      currentStageId: r.current_stage_id,
      currentRuleId: r.current_rule_id,
      finalResult: r.final_result,
      finalAction: r.final_action,
      auditTrail: parseJson(r.audit_trail, []),
      updatedAt: r.updated_at?.toISOString()
    };
  },

  // ================= CENTRAL TRANSACTION REPOSITORY =================
  async upsertCentralTransactions(records: CentralTransactionRecord[]): Promise<void> {
    if (!records.length) return;
    const pool = getPostgresPool();
    for (const rec of records) {
      await pool.query(
        `INSERT INTO central_transaction_repository (
          transaction_key, original_task_id, current_task_id, all_task_ids,
          batch_id, row_number, status, is_duplicate, duplicate_from_task_id,
          workflow_ids, canonical_data, raw_data, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT (transaction_key) DO UPDATE SET
          current_task_id = EXCLUDED.current_task_id,
          all_task_ids = (
            SELECT jsonb_agg(DISTINCT elem)
            FROM jsonb_array_elements_text(central_transaction_repository.all_task_ids || EXCLUDED.all_task_ids) elem
          ),
          batch_id = EXCLUDED.batch_id,
          row_number = EXCLUDED.row_number,
          status = EXCLUDED.status,
          is_duplicate = TRUE,
          duplicate_from_task_id = central_transaction_repository.original_task_id,
          workflow_ids = (
            SELECT jsonb_agg(DISTINCT elem)
            FROM jsonb_array_elements_text(central_transaction_repository.workflow_ids || EXCLUDED.workflow_ids) elem
          ),
          canonical_data = EXCLUDED.canonical_data,
          raw_data = EXCLUDED.raw_data,
          updated_at = NOW();`,
        [
          rec.transactionKey,
          rec.originalTaskId,
          rec.currentTaskId,
          JSON.stringify(rec.allTaskIds || [rec.currentTaskId]),
          rec.batchId,
          rec.rowNumber ?? null,
          rec.status || 'INGESTED',
          rec.isDuplicate ?? false,
          rec.duplicateFromTaskId || null,
          JSON.stringify(rec.workflowIds || []),
          JSON.stringify(rec.canonicalData || {}),
          JSON.stringify(rec.rawData || {}),
          rec.createdAt ? new Date(rec.createdAt) : new Date(),
          new Date()
        ]
      );
    }
  },

  async getCentralTransaction(key: string): Promise<CentralTransactionRecord | null> {
    const pool = getPostgresPool();
    const { rows } = await pool.query('SELECT * FROM central_transaction_repository WHERE transaction_key = $1 LIMIT 1;', [key]);
    if (!rows.length) return null;
    const r = rows[0];
    return {
      transactionKey: r.transaction_key,
      originalTaskId: r.original_task_id,
      currentTaskId: r.current_task_id,
      allTaskIds: parseJson(r.all_task_ids, []),
      batchId: r.batch_id,
      rowNumber: r.row_number,
      status: r.status,
      isDuplicate: r.is_duplicate,
      duplicateFromTaskId: r.duplicate_from_task_id,
      workflowIds: parseJson(r.workflow_ids, []),
      canonicalData: parseJson(r.canonical_data, {}),
      rawData: parseJson(r.raw_data, {}),
      createdAt: r.created_at?.toISOString(),
      updatedAt: r.updated_at?.toISOString()
    };
  },

  async getCentralTransactionsByTaskId(taskId: string): Promise<CentralTransactionRecord[]> {
    const pool = getPostgresPool();
    const { rows } = await pool.query(
      'SELECT * FROM central_transaction_repository WHERE current_task_id = $1 OR original_task_id = $1 ORDER BY row_number ASC;',
      [taskId]
    );
    return rows.map(r => ({
      transactionKey: r.transaction_key,
      originalTaskId: r.original_task_id,
      currentTaskId: r.current_task_id,
      allTaskIds: parseJson(r.all_task_ids, []),
      batchId: r.batch_id,
      rowNumber: r.row_number,
      status: r.status,
      isDuplicate: r.is_duplicate,
      duplicateFromTaskId: r.duplicate_from_task_id,
      workflowIds: parseJson(r.workflow_ids, []),
      canonicalData: parseJson(r.canonical_data, {}),
      rawData: parseJson(r.raw_data, {}),
      createdAt: r.created_at?.toISOString(),
      updatedAt: r.updated_at?.toISOString()
    }));
  },

  async getCentralTransactionsByBatchId(batchId: string): Promise<CentralTransactionRecord[]> {
    const pool = getPostgresPool();
    const { rows } = await pool.query(
      'SELECT * FROM central_transaction_repository WHERE batch_id = $1 ORDER BY row_number ASC;',
      [batchId]
    );
    return rows.map(r => ({
      transactionKey: r.transaction_key,
      originalTaskId: r.original_task_id,
      currentTaskId: r.current_task_id,
      allTaskIds: parseJson(r.all_task_ids, []),
      batchId: r.batch_id,
      rowNumber: r.row_number,
      status: r.status,
      isDuplicate: r.is_duplicate,
      duplicateFromTaskId: r.duplicate_from_task_id,
      workflowIds: parseJson(r.workflow_ids, []),
      canonicalData: parseJson(r.canonical_data, {}),
      rawData: parseJson(r.raw_data, {}),
      createdAt: r.created_at?.toISOString(),
      updatedAt: r.updated_at?.toISOString()
    }));
  },

  // ================= STANDALONE VALIDATION BOXES =================
  async getValidationBoxes(): Promise<ValidationBox[]> {
    const pool = getPostgresPool();
    const { rows } = await pool.query('SELECT * FROM validation_boxes ORDER BY created_at DESC;');
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      description: r.description,
      boxType: r.box_type,
      category: r.category,
      targetDbId: r.target_db_id,
      targetTable: r.target_table,
      mirrorTableName: r.mirror_table_name,
      searchParameters: parseJson(r.search_parameters, []),
      checkStep: parseJson(r.check_step, {}),
      createdAt: r.created_at?.toISOString(),
      updatedAt: r.updated_at?.toISOString()
    }));
  },

  async getValidationBoxById(id: string): Promise<ValidationBox | null> {
    const pool = getPostgresPool();
    const { rows } = await pool.query('SELECT * FROM validation_boxes WHERE id = $1 LIMIT 1;', [id]);
    if (!rows.length) return null;
    const r = rows[0];
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      boxType: r.box_type,
      category: r.category,
      targetDbId: r.target_db_id,
      targetTable: r.target_table,
      mirrorTableName: r.mirror_table_name,
      searchParameters: parseJson(r.search_parameters, []),
      checkStep: parseJson(r.check_step, {}),
      createdAt: r.created_at?.toISOString(),
      updatedAt: r.updated_at?.toISOString()
    };
  },

  async createValidationBox(box: ValidationBox): Promise<ValidationBox> {
    const pool = getPostgresPool();
    await pool.query(
      `INSERT INTO validation_boxes (
        id, name, description, box_type, category, target_db_id, target_table,
        mirror_table_name, search_parameters, check_step, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        box_type = EXCLUDED.box_type,
        category = EXCLUDED.category,
        target_db_id = EXCLUDED.target_db_id,
        target_table = EXCLUDED.target_table,
        mirror_table_name = EXCLUDED.mirror_table_name,
        search_parameters = EXCLUDED.search_parameters,
        check_step = EXCLUDED.check_step,
        updated_at = NOW();`,
      [
        box.id,
        box.name,
        box.description || '',
        box.boxType,
        box.category || 'General',
        box.targetDbId || null,
        box.targetTable || null,
        box.mirrorTableName || null,
        JSON.stringify(box.searchParameters || []),
        JSON.stringify(box.checkStep || {}),
        box.createdAt ? new Date(box.createdAt) : new Date(),
        new Date()
      ]
    );
    return box;
  },

  async updateValidationBox(id: string, updates: Partial<ValidationBox>): Promise<ValidationBox | null> {
    const existing = await this.getValidationBoxById(id);
    if (!existing) return null;
    const merged: ValidationBox = { ...existing, ...updates, updatedAt: new Date().toISOString() };
    await this.createValidationBox(merged);
    return merged;
  },

  async deleteValidationBox(id: string): Promise<boolean> {
    const pool = getPostgresPool();
    const res = await pool.query('DELETE FROM validation_boxes WHERE id = $1;', [id]);
    return (res.rowCount ?? 0) > 0;
  },

  // ================= GLOBAL SCHEMA CONFIG & TABLE MAPPINGS =================
  async getGlobalSchemaConfig(): Promise<any | null> {
    const pool = getPostgresPool();
    const { rows } = await pool.query('SELECT * FROM global_transaction_schema_configs ORDER BY updated_at DESC LIMIT 1;');
    if (!rows.length) return null;
    const r = rows[0];
    return {
      id: r.id,
      name: r.name,
      version: r.version,
      standardFields: parseJson(r.fields, []),
      tableMappings: parseJson(r.table_mappings, {}),
      versionHistory: parseJson(r.version_history, []),
      strictMappingEnforced: r.strict_mapping_enforced ?? true,
      updatedBy: r.updated_by || 'system',
      updatedAt: r.updated_at ? r.updated_at.toISOString() : new Date().toISOString()
    };
  },

  async saveGlobalSchemaConfig(config: {
    id?: string;
    name?: string;
    version: string;
    standardFields: any[];
    tableMappings?: Record<string, any>;
    versionHistory?: any[];
    strictMappingEnforced?: boolean;
    updatedBy?: string;
  }): Promise<any> {
    const pool = getPostgresPool();
    const id = config.id || 'default_schema_config';
    const name = config.name || 'Central Standard Transaction Schema';
    const now = new Date();

    await pool.query(
      `INSERT INTO global_transaction_schema_configs (id, name, version, fields, table_mappings, version_history, strict_mapping_enforced, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         version = EXCLUDED.version,
         fields = EXCLUDED.fields,
         table_mappings = COALESCE(EXCLUDED.table_mappings, global_transaction_schema_configs.table_mappings),
         version_history = EXCLUDED.version_history,
         strict_mapping_enforced = EXCLUDED.strict_mapping_enforced,
         updated_by = EXCLUDED.updated_by,
         updated_at = EXCLUDED.updated_at;`,
      [
        id,
        name,
        config.version,
        JSON.stringify(config.standardFields || []),
        JSON.stringify(config.tableMappings || {}),
        JSON.stringify(config.versionHistory || []),
        config.strictMappingEnforced !== undefined ? config.strictMappingEnforced : true,
        config.updatedBy || 'system',
        now
      ]
    );

    return {
      id,
      name,
      version: config.version,
      standardFields: config.standardFields,
      tableMappings: config.tableMappings || {},
      versionHistory: config.versionHistory || [],
      strictMappingEnforced: config.strictMappingEnforced !== undefined ? config.strictMappingEnforced : true,
      updatedBy: config.updatedBy || 'system',
      updatedAt: now.toISOString()
    };
  },

  async getTableMappings(): Promise<Record<string, any>> {
    const pool = getPostgresPool();
    const result: Record<string, any> = {};

    try {
      const { rows } = await pool.query('SELECT * FROM database_table_mappings ORDER BY updated_at DESC;');
      for (const r of rows) {
        const item = {
          dbId: r.db_id,
          dbName: r.db_name,
          tableName: r.table_name,
          columns: parseJson(r.columns, []),
          isCustom: r.is_custom,
          updatedBy: r.updated_by,
          updatedAt: r.updated_at ? r.updated_at.toISOString() : new Date().toISOString()
        };
        result[`${r.db_id}::${r.table_name}`] = item;
        result[`${r.db_id}:${r.table_name}`] = item;
      }
    } catch (err: any) {
      console.warn('[postgresRepo] Could not query database_table_mappings:', err.message);
    }

    // Fallback / merge from global_transaction_schema_configs if table was empty
    if (Object.keys(result).length === 0) {
      const cfg = await this.getGlobalSchemaConfig();
      if (cfg?.tableMappings) {
        return cfg.tableMappings;
      }
    }

    return result;
  },

  async saveTableMapping(dbId: string, tableName: string, mappingObj: any): Promise<void> {
    const pool = getPostgresPool();
    const id = `${dbId}::${tableName}`;
    const dbName = mappingObj.dbName || dbId;
    const columns = mappingObj.columns || [];
    const isCustom = !!mappingObj.isCustom;
    const updatedBy = mappingObj.updatedBy || 'admin';
    const now = new Date();

    // 1. Direct row persistence in database_table_mappings
    await pool.query(
      `INSERT INTO database_table_mappings (id, db_id, db_name, table_name, columns, is_custom, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET
         db_name = EXCLUDED.db_name,
         columns = EXCLUDED.columns,
         is_custom = EXCLUDED.is_custom,
         updated_by = EXCLUDED.updated_by,
         updated_at = EXCLUDED.updated_at;`,
      [id, dbId, dbName, tableName, JSON.stringify(columns), isCustom, updatedBy, now]
    );

    // 2. Also update JSONB in global_transaction_schema_configs for unified config export
    const cfgId = 'default_schema_config';
    await pool.query(
      `UPDATE global_transaction_schema_configs
       SET table_mappings = jsonb_set(
         jsonb_set(COALESCE(table_mappings, '{}'::jsonb), ARRAY[$1], $2::jsonb, true),
         ARRAY[$3], $2::jsonb, true
       ),
       updated_at = NOW()
       WHERE id = $4;`,
      [`${dbId}::${tableName}`, JSON.stringify(mappingObj), `${dbId}:${tableName}`, cfgId]
    );
  },

  // ================= GLOBAL STANDARD DIRECTORY =================
  async getGlobalStandardDirectory(): Promise<GlobalStandardDirectoryRecord[]> {
    const pool = getPostgresPool();
    const { rows } = await pool.query('SELECT * FROM global_standard_directory ORDER BY is_standard DESC, created_at ASC;');
    return rows.map(r => ({
      id: r.id,
      key: r.field_name,
      label: r.display_name,
      description: r.description || '',
      dataType: (r.data_type || 'string') as any,
      required: !!r.is_required,
      isStandard: r.is_standard !== undefined ? !!r.is_standard : true,
      exampleValue: r.example_value ?? '',
      category: r.category || 'General',
      notes: r.notes || '',
      user_id: r.user_id || 'system',
      created_at: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
      updated_at: r.updated_at ? new Date(r.updated_at).toISOString() : new Date().toISOString()
    }));
  },

  async getGlobalStandardDirectoryField(idOrKey: string): Promise<GlobalStandardDirectoryRecord | null> {
    const pool = getPostgresPool();
    const { rows } = await pool.query('SELECT * FROM global_standard_directory WHERE id = $1 OR field_name = $1 LIMIT 1;', [idOrKey]);
    if (!rows.length) return null;
    const r = rows[0];
    return {
      id: r.id,
      key: r.field_name,
      label: r.display_name,
      description: r.description || '',
      dataType: (r.data_type || 'string') as any,
      required: !!r.is_required,
      isStandard: r.is_standard !== undefined ? !!r.is_standard : true,
      exampleValue: r.example_value ?? '',
      category: r.category || 'General',
      notes: r.notes || '',
      user_id: r.user_id || 'system',
      created_at: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
      updated_at: r.updated_at ? new Date(r.updated_at).toISOString() : new Date().toISOString()
    };
  },

  async saveGlobalStandardDirectoryField(record: GlobalStandardDirectoryRecord): Promise<GlobalStandardDirectoryRecord> {
    const pool = getPostgresPool();
    const now = new Date();
    const createdAt = record.created_at ? new Date(record.created_at) : now;
    const updatedAt = now;

    // Resolve target id if row already exists by field_name or id
    const existing = await pool.query(
      'SELECT id FROM global_standard_directory WHERE field_name = $1 OR id = $2 LIMIT 1;',
      [record.key, record.id]
    );
    const targetId = existing.rows.length > 0 ? existing.rows[0].id : record.id;

    await pool.query(
      `INSERT INTO global_standard_directory (
        id, field_name, display_name, data_type, description, is_required,
        default_mapping, category, example_value, notes, user_id, is_standard,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      ON CONFLICT (id) DO UPDATE SET
        field_name = EXCLUDED.field_name,
        display_name = EXCLUDED.display_name,
        data_type = EXCLUDED.data_type,
        description = EXCLUDED.description,
        is_required = EXCLUDED.is_required,
        default_mapping = EXCLUDED.default_mapping,
        category = EXCLUDED.category,
        example_value = EXCLUDED.example_value,
        notes = EXCLUDED.notes,
        user_id = EXCLUDED.user_id,
        is_standard = EXCLUDED.is_standard,
        updated_at = EXCLUDED.updated_at;`,
      [
        targetId,
        record.key,
        record.label,
        record.dataType || 'string',
        record.description || '',
        !!record.required,
        JSON.stringify({}),
        record.category || 'General',
        record.exampleValue !== undefined ? String(record.exampleValue) : '',
        record.notes || '',
        record.user_id || 'system',
        record.isStandard !== undefined ? !!record.isStandard : false,
        createdAt,
        updatedAt
      ]
    );

    const savedRecord = {
      ...record,
      id: targetId,
      created_at: createdAt.toISOString(),
      updated_at: updatedAt.toISOString()
    };

    // Synchronize to global_transaction_schema_configs.fields
    await this.syncDirectoryToGlobalSchemaConfig();

    return savedRecord;
  },

  async deleteGlobalStandardDirectoryField(idOrKey: string): Promise<boolean> {
    const pool = getPostgresPool();
    const res = await pool.query('DELETE FROM global_standard_directory WHERE id = $1 OR field_name = $1;', [idOrKey]);
    const deleted = (res.rowCount ?? 0) > 0;
    if (deleted) {
      await this.syncDirectoryToGlobalSchemaConfig();
    }
    return deleted;
  },

  async clearAllGlobalStandardDirectoryFields(): Promise<boolean> {
    const pool = getPostgresPool();
    await pool.query('DELETE FROM global_standard_directory;');
    await this.syncDirectoryToGlobalSchemaConfig();
    return true;
  },

  async seedGlobalStandardDirectoryIfEmpty(initialRecords: GlobalStandardDirectoryRecord[]): Promise<GlobalStandardDirectoryRecord[]> {
    const existing = await this.getGlobalStandardDirectory();
    if (existing.length > 0) return existing;

    for (const rec of initialRecords) {
      await this.saveGlobalStandardDirectoryField(rec);
    }
    return this.getGlobalStandardDirectory();
  },

  async syncDirectoryToGlobalSchemaConfig(): Promise<void> {
    try {
      const pool = getPostgresPool();
      const fields = await this.getGlobalStandardDirectory();
      const schemaFields = fields.map(f => ({
        id: f.id,
        key: f.key,
        label: f.label,
        description: f.description,
        dataType: f.dataType,
        required: f.required,
        isStandard: f.isStandard,
        exampleValue: f.exampleValue,
        category: f.category,
        notes: f.notes,
        user_id: f.user_id
      }));

      await pool.query(
        `UPDATE global_transaction_schema_configs
         SET fields = $1::jsonb, updated_at = NOW()
         WHERE id = 'default_schema_config';`,
        [JSON.stringify(schemaFields)]
      );
    } catch (err: any) {
      console.warn('[postgresRepo] Could not sync directory to global_transaction_schema_configs:', err.message);
    }
  },

  // ================= FTP FILE STAGING CONFIGS =================
  async getFtpStagingConfigs(): Promise<FtpFileStagingConfig[]> {
    const pool = getPostgresPool();
    const { rows } = await pool.query('SELECT * FROM ftp_file_staging_configs ORDER BY created_at DESC;');
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      ftpConnectionId: r.ftp_connection_id,
      fileNamePattern: r.file_name_pattern,
      fileFormat: r.file_format,
      customDelimiter: r.custom_delimiter,
      hasHeader: r.has_header,
      headerRowIndex: r.header_row_index,
      headerRowCount: r.header_row_count ?? 1,
      handleMergedCells: r.handle_merged_cells ?? true,
      mergedHeaderSeparator: r.merged_header_separator ?? '_',
      dataStartRow: r.data_start_row,
      skipFooterLines: r.skip_footer_lines,
      quoteChar: r.quote_char,
      encoding: r.encoding,
      dateFormat: r.date_format,
      excelSheetName: r.excel_sheet_name,
      folderTraversalMode: r.folder_traversal_mode || 'SINGLE_FILE',
      sourceDirectoryPath: r.source_directory_path,
      selectedImportantColumns: parseJson(r.selected_important_columns, []),
      xmlRootElement: r.xml_root_element,
      xmlRecordElement: r.xml_record_element,
      fieldMappings: parseJson(r.field_mappings, []),
      stagingTableName: r.staging_table_name,
      lastStagedAt: r.last_staged_at ? new Date(r.last_staged_at).toISOString() : undefined,
      lastStagedStatus: r.last_staged_status,
      lastStagedCount: r.last_staged_count,
      lastErrorMessage: r.last_error_message,
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : undefined,
      updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : undefined
    }));
  },

  async getFtpStagingConfigById(id: string): Promise<FtpFileStagingConfig | null> {
    const pool = getPostgresPool();
    const { rows } = await pool.query('SELECT * FROM ftp_file_staging_configs WHERE id = $1 LIMIT 1;', [id]);
    if (!rows.length) return null;
    const r = rows[0];
    return {
      id: r.id,
      name: r.name,
      ftpConnectionId: r.ftp_connection_id,
      fileNamePattern: r.file_name_pattern,
      fileFormat: r.file_format,
      customDelimiter: r.custom_delimiter,
      hasHeader: r.has_header,
      headerRowIndex: r.header_row_index,
      headerRowCount: r.header_row_count ?? 1,
      handleMergedCells: r.handle_merged_cells ?? true,
      mergedHeaderSeparator: r.merged_header_separator ?? '_',
      dataStartRow: r.data_start_row,
      skipFooterLines: r.skip_footer_lines,
      quoteChar: r.quote_char,
      encoding: r.encoding,
      dateFormat: r.date_format,
      excelSheetName: r.excel_sheet_name,
      folderTraversalMode: r.folder_traversal_mode || 'SINGLE_FILE',
      sourceDirectoryPath: r.source_directory_path,
      selectedImportantColumns: parseJson(r.selected_important_columns, []),
      xmlRootElement: r.xml_root_element,
      xmlRecordElement: r.xml_record_element,
      fieldMappings: parseJson(r.field_mappings, []),
      stagingTableName: r.staging_table_name,
      lastStagedAt: r.last_staged_at ? new Date(r.last_staged_at).toISOString() : undefined,
      lastStagedStatus: r.last_staged_status,
      lastStagedCount: r.last_staged_count,
      lastErrorMessage: r.last_error_message,
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : undefined,
      updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : undefined
    };
  },

  async createFtpStagingConfig(config: FtpFileStagingConfig): Promise<FtpFileStagingConfig> {
    const pool = getPostgresPool();
    await pool.query(
      `INSERT INTO ftp_file_staging_configs (
        id, name, ftp_connection_id, file_name_pattern, file_format, custom_delimiter,
        has_header, header_row_index, data_start_row, skip_footer_lines, quote_char,
        encoding, date_format, field_mappings, staging_table_name, last_staged_at,
        last_staged_status, last_staged_count, last_error_message,
        excel_sheet_name, header_row_count, handle_merged_cells, merged_header_separator,
        folder_traversal_mode, source_directory_path, selected_important_columns,
        xml_root_element, xml_record_element, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19,
        $20, $21, $22, $23, $24, $25, $26, $27, $28, NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        ftp_connection_id = EXCLUDED.ftp_connection_id,
        file_name_pattern = EXCLUDED.file_name_pattern,
        file_format = EXCLUDED.file_format,
        custom_delimiter = EXCLUDED.custom_delimiter,
        has_header = EXCLUDED.has_header,
        header_row_index = EXCLUDED.header_row_index,
        data_start_row = EXCLUDED.data_start_row,
        skip_footer_lines = EXCLUDED.skip_footer_lines,
        quote_char = EXCLUDED.quote_char,
        encoding = EXCLUDED.encoding,
        date_format = EXCLUDED.date_format,
        field_mappings = EXCLUDED.field_mappings,
        staging_table_name = EXCLUDED.staging_table_name,
        last_staged_at = EXCLUDED.last_staged_at,
        last_staged_status = EXCLUDED.last_staged_status,
        last_staged_count = EXCLUDED.last_staged_count,
        last_error_message = EXCLUDED.last_error_message,
        excel_sheet_name = EXCLUDED.excel_sheet_name,
        header_row_count = EXCLUDED.header_row_count,
        handle_merged_cells = EXCLUDED.handle_merged_cells,
        merged_header_separator = EXCLUDED.merged_header_separator,
        folder_traversal_mode = EXCLUDED.folder_traversal_mode,
        source_directory_path = EXCLUDED.source_directory_path,
        selected_important_columns = EXCLUDED.selected_important_columns,
        xml_root_element = EXCLUDED.xml_root_element,
        xml_record_element = EXCLUDED.xml_record_element,
        updated_at = NOW();`,
      [
        config.id,
        config.name,
        config.ftpConnectionId,
        config.fileNamePattern,
        config.fileFormat,
        config.customDelimiter || ',',
        config.hasHeader ?? true,
        config.headerRowIndex || 1,
        config.dataStartRow || 2,
        config.skipFooterLines || 0,
        config.quoteChar || '"',
        config.encoding || 'utf-8',
        config.dateFormat || 'YYYY-MM-DD',
        JSON.stringify(config.fieldMappings || []),
        config.stagingTableName || null,
        config.lastStagedAt || null,
        config.lastStagedStatus || 'IDLE',
        config.lastStagedCount || 0,
        config.lastErrorMessage || null,
        config.excelSheetName || null,
        config.headerRowCount ?? 1,
        config.handleMergedCells ?? true,
        config.mergedHeaderSeparator || '_',
        config.folderTraversalMode || 'SINGLE_FILE',
        config.sourceDirectoryPath || null,
        JSON.stringify(config.selectedImportantColumns || []),
        config.xmlRootElement || null,
        config.xmlRecordElement || null
      ]
    );
    return (await this.getFtpStagingConfigById(config.id)) || config;
  },

  async updateFtpStagingConfig(id: string, updates: Partial<FtpFileStagingConfig>): Promise<FtpFileStagingConfig | null> {
    const existing = await this.getFtpStagingConfigById(id);
    if (!existing) return null;
    const merged: FtpFileStagingConfig = { ...existing, ...updates, id };
    return await this.createFtpStagingConfig(merged);
  },

  async deleteFtpStagingConfig(id: string): Promise<boolean> {
    const pool = getPostgresPool();
    const res = await pool.query('DELETE FROM ftp_file_staging_configs WHERE id = $1;', [id]);
    return (res.rowCount ?? 0) > 0;
  }
};

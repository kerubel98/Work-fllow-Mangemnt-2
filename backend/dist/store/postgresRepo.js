import { getPostgresPool } from '../config/postgres.js';
function parseJson(val, fallback = null) {
    if (val == null)
        return fallback;
    if (typeof val === 'string') {
        try {
            return JSON.parse(val);
        }
        catch {
            return fallback;
        }
    }
    return val;
}
function safeJsonStringify(obj, fallback = '[]') {
    if (obj == null)
        return fallback;
    const seen = new WeakSet();
    try {
        return JSON.stringify(obj, (_key, value) => {
            if (typeof value === 'object' && value !== null) {
                if (seen.has(value))
                    return undefined;
                seen.add(value);
            }
            return value;
        });
    }
    catch {
        return fallback;
    }
}
export const postgresRepo = {
    // ================= USERS =================
    async getUsers() {
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
    async getUserById(id) {
        const pool = getPostgresPool();
        const { rows } = await pool.query('SELECT * FROM users WHERE id = $1 LIMIT 1;', [id]);
        if (!rows.length)
            return null;
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
    async getUserByUsername(username) {
        const pool = getPostgresPool();
        const { rows } = await pool.query('SELECT * FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1;', [username]);
        if (!rows.length)
            return null;
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
    async createUser(userData) {
        const pool = getPostgresPool();
        await pool.query(`INSERT INTO users (id, username, email, role, is_approved, can_execute_select, can_execute_update, allowed_db_ids, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO UPDATE SET
         username = EXCLUDED.username,
         email = EXCLUDED.email,
         role = EXCLUDED.role,
         is_approved = EXCLUDED.is_approved,
         can_execute_select = EXCLUDED.can_execute_select,
         can_execute_update = EXCLUDED.can_execute_update,
         allowed_db_ids = EXCLUDED.allowed_db_ids;`, [
            userData.id,
            userData.username,
            userData.email,
            userData.role,
            userData.isApproved,
            userData.canExecuteSelect ?? true,
            userData.canExecuteUpdate ?? false,
            JSON.stringify(userData.allowedDbIds || []),
            userData.createdAt || new Date()
        ]);
        return userData;
    },
    async updateUser(id, updates) {
        const existing = await this.getUserById(id);
        if (!existing)
            return null;
        const merged = { ...existing, ...updates };
        await this.createUser(merged);
        return merged;
    },
    async deleteUser(id) {
        const pool = getPostgresPool();
        const res = await pool.query('DELETE FROM users WHERE id = $1;', [id]);
        return (res.rowCount ?? 0) > 0;
    },
    // ================= ISSUES =================
    async getIssues() {
        const pool = getPostgresPool();
        const { rows } = await pool.query('SELECT * FROM issues ORDER BY created_at DESC;');
        return rows.map(r => this.mapIssueRow(r));
    },
    async getIssueById(id) {
        const pool = getPostgresPool();
        const { rows } = await pool.query('SELECT * FROM issues WHERE id = $1 LIMIT 1;', [id]);
        if (!rows.length)
            return null;
        return this.mapIssueRow(rows[0]);
    },
    async createIssue(issue) {
        const pool = getPostgresPool();
        await pool.query(`INSERT INTO issues (
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
        custom_filters = EXCLUDED.custom_filters;`, [
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
        ]);
        // If mapped data was passed and no transactions exist yet for this task, store it into task_dataset_transactions
        if (issue.firstLevelMappedData && issue.firstLevelMappedData.length > 0) {
            const countRes = await pool.query('SELECT COUNT(*)::int as cnt FROM task_dataset_transactions WHERE task_id = $1;', [issue.id]);
            if ((countRes.rows[0]?.cnt || 0) === 0) {
                await this.createTaskDatasetTransactions(issue.id, issue.firstLevelMappedData);
            }
        }
        return issue;
    },
    async updateIssue(id, updates) {
        const existing = await this.getIssueById(id);
        if (!existing)
            return null;
        const merged = { ...existing, ...updates };
        await this.createIssue(merged);
        return merged;
    },
    async deleteIssue(id) {
        const pool = getPostgresPool();
        const res = await pool.query('DELETE FROM issues WHERE id = $1;', [id]);
        return (res.rowCount ?? 0) > 0;
    },
    async addIssueChat(issueId, message) {
        const existing = await this.getIssueById(issueId);
        if (!existing)
            return null;
        const updatedChat = [...(existing.chat || []), message];
        return await this.updateIssue(issueId, { chat: updatedChat });
    },
    mapIssueRow(r) {
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
    async createTaskDatasetTransactions(taskId, rows) {
        if (!rows.length)
            return 0;
        const pool = getPostgresPool();
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query('DELETE FROM task_dataset_transactions WHERE task_id = $1;', [taskId]);
            // Chunk inserts into 1,000 items per batch
            const CHUNK_SIZE = 1000;
            let inserted = 0;
            for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
                const chunk = rows.slice(i, i + CHUNK_SIZE);
                const values = [];
                const placeholders = [];
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
            await client.query(`UPDATE issues SET transaction_count = $1, dataset_status = 'INGESTED' WHERE id = $2;`, [rows.length, taskId]);
            await client.query('COMMIT');
            return inserted;
        }
        catch (e) {
            await client.query('ROLLBACK');
            throw e;
        }
        finally {
            client.release();
        }
    },
    async getTaskDatasetTransactions(taskId, page = 1, limit = 50, batchId) {
        const pool = getPostgresPool();
        const offset = (page - 1) * limit;
        let whereClause = 'WHERE task_id = $1';
        const queryParams = [taskId];
        if (batchId) {
            whereClause += ' AND batch_id = $2';
            queryParams.push(batchId);
        }
        const countRes = await pool.query(`SELECT COUNT(*)::int as total FROM task_dataset_transactions ${whereClause};`, queryParams);
        const totalCount = countRes.rows[0]?.total || 0;
        const dataParams = [...queryParams, limit, offset];
        const limitOffsetPlaceholders = `$${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;
        const dataRes = await pool.query(`SELECT row_number, batch_id, canonical_data, raw_data, created_at
       FROM task_dataset_transactions
       ${whereClause}
       ORDER BY row_number ASC
       LIMIT ${limitOffsetPlaceholders};`, dataParams);
        // Check for completed validation executions from task_workflow_executions lookup table
        let resultMap = null;
        let latestWorkflowId = null;
        let latestWorkflowName = null;
        try {
            const execRes = await pool.query('SELECT workflow_id, workflow_name, execution_summary FROM task_workflow_executions WHERE task_id = $1 ORDER BY executed_at DESC LIMIT 1;', [taskId]);
            if (execRes.rows.length > 0) {
                latestWorkflowId = execRes.rows[0].workflow_id;
                latestWorkflowName = execRes.rows[0].workflow_name;
                resultMap = parseJson(execRes.rows[0].execution_summary, {})?.results || null;
            }
        }
        catch {
            // Non-fatal if table not present
        }
        const rows = dataRes.rows.map(r => {
            const canonical = parseJson(r.canonical_data, {});
            const keyCandidates = [
                canonical.transaction_id,
                canonical.transactionId,
                canonical.terminal_id,
                canonical.fe_utrnno,
                canonical.retrieval_ref_num,
                canonical.retrievalRefNum,
                canonical.refnum,
                canonical.rrn,
                canonical.id,
                `ROW-${r.row_number}`,
                r.row_number?.toString()
            ].filter(Boolean).map(String);
            for (const [k, v] of Object.entries(canonical)) {
                if (!k.startsWith('_') && v !== undefined && v !== null && typeof v !== 'object') {
                    const s = String(v).trim();
                    if (s && !keyCandidates.includes(s)) {
                        keyCandidates.push(s);
                    }
                }
            }
            let evalInfo = null;
            if (resultMap) {
                for (const candidate of keyCandidates) {
                    if (resultMap[candidate]) {
                        evalInfo = resultMap[candidate];
                        break;
                    }
                }
            }
            return {
                _rowNumber: r.row_number,
                _batchId: r.batch_id,
                ...canonical,
                _validation_status: evalInfo?.status || canonical._validation_status || 'PENDING',
                _validation_details: evalInfo?.details || canonical._validation_details || null,
                _target_record: evalInfo?.targetRecord || canonical._target_record || null,
                _target_db: evalInfo?.targetDb || canonical._target_db || null,
                _target_table: evalInfo?.targetTable || canonical._target_table || null,
                _validation_workflow_id: latestWorkflowId || canonical._validation_workflow_id,
                _validation_workflow_name: latestWorkflowName || canonical._validation_workflow_name
            };
        });
        return { rows, totalCount };
    },
    async updateTaskDatasetValidationStatus(taskId, workflowId, workflowName, evaluatedRecords) {
        const pool = getPostgresPool();
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            for (const rec of evaluatedRecords) {
                if (!rec.key)
                    continue;
                await client.query(`UPDATE task_dataset_transactions
           SET canonical_data = canonical_data || jsonb_build_object(
             '_validation_status', $1::text,
             '_validation_details', $2::jsonb,
             '_target_record', $3::jsonb,
             '_target_db', $4::text,
             '_target_table', $5::text,
             '_validation_workflow_id', $6::text,
             '_validation_workflow_name', $7::text
           )
           WHERE task_id = $8 AND (
             row_number::text = $9
             OR ('ROW-' || row_number::text) = $9
             OR canonical_data->>'terminal_id' = $9
             OR canonical_data->>'fe_utrnno' = $9
             OR canonical_data->>'reqamt' = $9
             OR canonical_data->>'transaction_id' = $9
             OR canonical_data->>'transactionId' = $9
             OR canonical_data->>'retrieval_ref_num' = $9
             OR canonical_data->>'retrievalRefNum' = $9
             OR canonical_data->>'refnum' = $9
             OR canonical_data->>'rrn' = $9
             OR canonical_data->>'id' = $9
           );`, [
                    rec.status,
                    JSON.stringify(rec.details || {}),
                    JSON.stringify(rec.targetRecord || null),
                    rec.targetDb || '',
                    rec.targetTable || '',
                    workflowId,
                    workflowName,
                    taskId,
                    rec.key
                ]);
            }
            await client.query('COMMIT');
        }
        catch (err) {
            await client.query('ROLLBACK');
            console.warn('[postgresRepo] updateTaskDatasetValidationStatus error:', err);
        }
        finally {
            client.release();
        }
    },
    async getTaskDatasetBatches(taskId) {
        const pool = getPostgresPool();
        const { rows } = await pool.query(`SELECT COALESCE(batch_id, 'BATCH-DEFAULT') as batch_id, COUNT(*)::int as count
       FROM task_dataset_transactions
       WHERE task_id = $1
       GROUP BY batch_id
       ORDER BY batch_id ASC;`, [taskId]);
        return rows.map(r => ({ batchId: r.batch_id, count: r.count }));
    },
    // ================= DATABASE CONNECTIONS =================
    async getDatabaseConnections() {
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
    async getDatabaseConnectionById(id) {
        const pool = getPostgresPool();
        const { rows } = await pool.query('SELECT * FROM database_connections WHERE id = $1 LIMIT 1;', [id]);
        if (!rows.length)
            return null;
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
    async createDatabaseConnection(conn) {
        const pool = getPostgresPool();
        await pool.query(`INSERT INTO database_connections (id, name, type, host, port, connection_string, database_name, username, password, status, api_endpoint, created_by_admin, requires_access_approval, description, allowed_roles, allowed_tables, available_tables)
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
         available_tables = EXCLUDED.available_tables;`, [
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
        ]);
        return conn;
    },
    async updateDatabaseConnection(id, updates) {
        const existing = await this.getDatabaseConnectionById(id);
        if (!existing)
            return null;
        const merged = { ...existing, ...updates };
        await this.createDatabaseConnection(merged);
        return merged;
    },
    async deleteDatabaseConnection(id) {
        const pool = getPostgresPool();
        const res = await pool.query('DELETE FROM database_connections WHERE id = $1;', [id]);
        return (res.rowCount ?? 0) > 0;
    },
    // ================= ENVIRONMENT SYSTEMS =================
    async getEnvironmentSystems() {
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
    async getEnvironmentSystemById(id) {
        const pool = getPostgresPool();
        const { rows } = await pool.query('SELECT * FROM environment_systems WHERE id = $1 LIMIT 1;', [id]);
        if (!rows.length)
            return null;
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
    async createEnvironmentSystem(sys) {
        const pool = getPostgresPool();
        await pool.query(`INSERT INTO environment_systems (id, name, description, testing, production, allowed_user_ids, allowed_roles, require_dml_approval)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         testing = EXCLUDED.testing,
         production = EXCLUDED.production,
         allowed_user_ids = EXCLUDED.allowed_user_ids,
         allowed_roles = EXCLUDED.allowed_roles,
         require_dml_approval = EXCLUDED.require_dml_approval;`, [
            sys.id,
            sys.name,
            sys.description,
            JSON.stringify(sys.testing || {}),
            JSON.stringify(sys.production || {}),
            JSON.stringify(sys.allowedUserIds || []),
            JSON.stringify(sys.allowedRoles || []),
            sys.requireDmlApproval ?? false
        ]);
        return sys;
    },
    async updateEnvironmentSystem(id, updates) {
        const existing = await this.getEnvironmentSystemById(id);
        if (!existing)
            return null;
        const merged = { ...existing, ...updates };
        await this.createEnvironmentSystem(merged);
        return merged;
    },
    async deleteEnvironmentSystem(id) {
        const pool = getPostgresPool();
        const res = await pool.query('DELETE FROM environment_systems WHERE id = $1;', [id]);
        return (res.rowCount ?? 0) > 0;
    },
    // ================= TEAMS & TEAM TASKS =================
    async getTeams() {
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
    async getTeamById(id) {
        const pool = getPostgresPool();
        const { rows } = await pool.query('SELECT * FROM teams WHERE id = $1 LIMIT 1;', [id]);
        if (!rows.length)
            return null;
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
    async createTeam(team) {
        const pool = getPostgresPool();
        await pool.query(`INSERT INTO teams (id, name, description, team_type, manager_id, manager_name, member_ids, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         team_type = EXCLUDED.team_type,
         manager_id = EXCLUDED.manager_id,
         manager_name = EXCLUDED.manager_name,
         member_ids = EXCLUDED.member_ids;`, [
            team.id,
            team.name,
            team.description || null,
            team.teamType || 'permanent',
            team.managerId,
            team.managerName,
            JSON.stringify(team.memberIds || []),
            team.createdAt || new Date()
        ]);
        return team;
    },
    async updateTeam(id, updates) {
        const existing = await this.getTeamById(id);
        if (!existing)
            return null;
        const merged = { ...existing, ...updates };
        await this.createTeam(merged);
        return merged;
    },
    async deleteTeam(id) {
        const pool = getPostgresPool();
        const res = await pool.query('DELETE FROM teams WHERE id = $1;', [id]);
        return (res.rowCount ?? 0) > 0;
    },
    // ================= WORKFLOWS & EXTRACTIONS =================
    async getWorkflows() {
        return await this.getValidationWorkflows();
    },
    async getWorkflowById(id) {
        return await this.getValidationWorkflowById(id);
    },
    async createWorkflow(wf) {
        return await this.createValidationWorkflow(wf);
    },
    async updateWorkflow(id, updates) {
        return await this.updateValidationWorkflow(id, updates);
    },
    async deleteWorkflow(id) {
        return await this.deleteValidationWorkflow(id);
    },
    async getValidationWorkflows() {
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
            version: r.version,
            messageAggregations: parseJson(r.message_aggregations, [])
        }));
    },
    async getValidationWorkflowById(id) {
        const pool = getPostgresPool();
        const { rows } = await pool.query('SELECT * FROM database_validation_workflows WHERE id = $1 LIMIT 1;', [id]);
        if (!rows.length)
            return null;
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
            version: r.version,
            messageAggregations: parseJson(r.message_aggregations, [])
        };
    },
    async createValidationWorkflow(wf) {
        const pool = getPostgresPool();
        await pool.query(`INSERT INTO database_validation_workflows (id, name, description, target_db_id, target_table, category, stages, steps, global_success_message, global_failure_message, created_by, created_at, updated_at, is_system_default, version, message_aggregations)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
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
         version = EXCLUDED.version,
         message_aggregations = EXCLUDED.message_aggregations;`, [
            wf.id,
            wf.name,
            wf.description || '',
            wf.targetDbId || null,
            wf.targetTable || '',
            wf.category || 'Custom',
            safeJsonStringify(wf.stages, '[]'),
            safeJsonStringify(wf.steps, '[]'),
            wf.globalSuccessMessage || '',
            wf.globalFailureMessage || '',
            wf.createdBy || 'system',
            wf.createdAt || new Date(),
            new Date(),
            wf.isSystemDefault ?? false,
            wf.version || '1.0.0',
            safeJsonStringify(wf.messageAggregations, '[]')
        ]);
        return wf;
    },
    async updateValidationWorkflow(id, updates) {
        const existing = await this.getValidationWorkflowById(id);
        if (!existing)
            return null;
        const merged = { ...existing, ...updates };
        await this.createValidationWorkflow(merged);
        return merged;
    },
    async deleteValidationWorkflow(id) {
        const pool = getPostgresPool();
        try {
            await pool.query('DELETE FROM query_extractions WHERE workflow_id = $1;', [id]);
        }
        catch { }
        const res = await pool.query('DELETE FROM database_validation_workflows WHERE id = $1;', [id]);
        return (res.rowCount ?? 0) > 0;
    },
    async deleteQueryExtraction(id) {
        const pool = getPostgresPool();
        const res = await pool.query('DELETE FROM query_extractions WHERE id = $1;', [id]);
        return (res.rowCount ?? 0) > 0;
    },
    // ================= INVESTIGATION TASKS, BATCHES & TRANSACTIONS =================
    async createInvestigationTask(task) {
        const pool = getPostgresPool();
        await pool.query(`INSERT INTO investigation_tasks (id, workflow_id, workflow_name, issue_id, team_task_id, total_transactions, processed_transactions, reconciled_transactions, flagged_transactions, closed_transactions, failed_transactions, status, execution_plan, created_at, started_at, completed_at, error_detail)
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
         error_detail = EXCLUDED.error_detail;`, [
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
        ]);
        return task;
    },
    async getInvestigationTaskById(id) {
        const pool = getPostgresPool();
        const { rows } = await pool.query('SELECT * FROM investigation_tasks WHERE id = $1 LIMIT 1;', [id]);
        if (!rows.length)
            return null;
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
    async updateInvestigationTask(id, updates) {
        const existing = await this.getInvestigationTaskById(id);
        if (!existing)
            return null;
        const merged = { ...existing, ...updates };
        await this.createInvestigationTask(merged);
        return merged;
    },
    async createInvestigationBatch(batch) {
        const pool = getPostgresPool();
        await pool.query(`INSERT INTO investigation_batches (id, task_id, sequence, transaction_count, processed_count, status, started_at, completed_at, error_detail, retry_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO UPDATE SET
         processed_count = EXCLUDED.processed_count,
         status = EXCLUDED.status,
         started_at = EXCLUDED.started_at,
         completed_at = EXCLUDED.completed_at,
         error_detail = EXCLUDED.error_detail,
         retry_count = EXCLUDED.retry_count;`, [
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
        ]);
        return batch;
    },
    async getInvestigationBatchesByTaskId(taskId) {
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
    async updateInvestigationBatch(id, updates) {
        const pool = getPostgresPool();
        const { rows } = await pool.query('SELECT * FROM investigation_batches WHERE id = $1 LIMIT 1;', [id]);
        if (!rows.length)
            return null;
        const existing = rows[0];
        const merged = {
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
    async createInvestigationTransaction(tx) {
        const pool = getPostgresPool();
        await pool.query(`INSERT INTO investigation_transactions (id, task_id, batch_id, transaction_id, investigation_status, status_flag_text, status_flag_color, current_stage_id, current_rule_id, final_result, final_action, audit_trail, updated_at)
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
         updated_at = NOW();`, [
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
        ]);
        return tx;
    },
    async getInvestigationTransactionsByTaskId(taskId) {
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
    async getInvestigationTransaction(taskId, transactionId) {
        const pool = getPostgresPool();
        const { rows } = await pool.query('SELECT * FROM investigation_transactions WHERE task_id = $1 AND transaction_id = $2 LIMIT 1;', [taskId, transactionId]);
        if (!rows.length)
            return null;
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
    _centralColsCache: null,
    async getCentralRepoPhysicalColumns() {
        if (!this._centralColsCache) {
            try {
                const pool = getPostgresPool();
                const res = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'central_transaction_repository';");
                this._centralColsCache = new Set(res.rows.map((r) => r.column_name.toLowerCase()));
            }
            catch (err) {
                console.warn('Could not query central_transaction_repository columns:', err);
                return new Set();
            }
        }
        return this._centralColsCache;
    },
    async upsertCentralTransactions(records) {
        if (!records.length)
            return;
        const pool = getPostgresPool();
        const physicalCols = await this.getCentralRepoPhysicalColumns();
        const baseCols = new Set([
            'transaction_key', 'task_id', 'original_task_id', 'current_task_id',
            'all_task_ids', 'batch_id', 'row_number', 'status', 'is_duplicate',
            'duplicate_from_task_id', 'workflow_ids', 'canonical_data', 'raw_data',
            'created_at', 'updated_at'
        ]);
        for (const rec of records) {
            const taskId = rec.currentTaskId || rec.originalTaskId;
            const canonical = rec.canonicalData || {};
            // Build dynamic column list matching central_transaction_repository physical schema
            const insertCols = [
                'transaction_key', 'task_id', 'original_task_id', 'current_task_id',
                'all_task_ids', 'batch_id', 'row_number', 'status', 'is_duplicate',
                'duplicate_from_task_id', 'workflow_ids', 'canonical_data', 'raw_data',
                'created_at', 'updated_at'
            ];
            const params = [
                rec.transactionKey,
                taskId,
                rec.originalTaskId,
                rec.currentTaskId,
                JSON.stringify(rec.allTaskIds || [rec.currentTaskId]),
                rec.batchId,
                rec.rowNumber ?? null,
                rec.status || 'INGESTED',
                rec.isDuplicate ?? false,
                rec.duplicateFromTaskId || null,
                JSON.stringify(rec.workflowIds || []),
                JSON.stringify(canonical),
                JSON.stringify(rec.rawData || {}),
                rec.createdAt ? new Date(rec.createdAt) : new Date(),
                new Date()
            ];
            // Add each physical column present in canonical data
            const updateClauses = [
                'task_id = EXCLUDED.task_id',
                'current_task_id = EXCLUDED.current_task_id',
                'all_task_ids = (SELECT jsonb_agg(DISTINCT elem) FROM jsonb_array_elements_text(central_transaction_repository.all_task_ids || EXCLUDED.all_task_ids) elem)',
                'batch_id = EXCLUDED.batch_id',
                'row_number = EXCLUDED.row_number',
                'status = EXCLUDED.status',
                'is_duplicate = TRUE',
                'duplicate_from_task_id = central_transaction_repository.original_task_id',
                'workflow_ids = (SELECT jsonb_agg(DISTINCT elem) FROM jsonb_array_elements_text(central_transaction_repository.workflow_ids || EXCLUDED.workflow_ids) elem)',
                'canonical_data = EXCLUDED.canonical_data',
                'raw_data = EXCLUDED.raw_data',
                'updated_at = NOW()'
            ];
            for (const [key, val] of Object.entries(canonical)) {
                const normKey = key.toLowerCase().replace(/[^a-z0-9_]/g, '_');
                if (physicalCols.has(normKey) && !baseCols.has(normKey) && val !== null && val !== undefined) {
                    insertCols.push(`"${normKey}"`);
                    params.push(val);
                    updateClauses.push(`"${normKey}" = EXCLUDED."${normKey}"`);
                }
            }
            const placeholders = insertCols.map((_, idx) => `$${idx + 1}`).join(', ');
            const joinedUpdates = updateClauses.join(', ');
            await pool.query(`INSERT INTO central_transaction_repository (${insertCols.join(', ')})
         VALUES (${placeholders})
         ON CONFLICT (transaction_key) DO UPDATE SET
           ${joinedUpdates};`, params);
        }
    },
    async getCentralTransaction(key) {
        const pool = getPostgresPool();
        const { rows } = await pool.query('SELECT * FROM central_transaction_repository WHERE transaction_key = $1 LIMIT 1;', [key]);
        if (!rows.length)
            return null;
        const r = rows[0];
        return {
            transactionKey: r.transaction_key,
            originalTaskId: r.original_task_id,
            currentTaskId: r.current_task_id,
            allTaskIds: parseJson(r.all_task_ids, []),
            batchId: r.batch_id,
            rowNumber: r.row_number,
            status: r.status,
            isDuplicate: !!r.is_duplicate,
            duplicateFromTaskId: r.duplicate_from_task_id,
            duplicateCount: r.duplicate_count || 1,
            duplicateStatus: r.duplicate_status || 'ORIGINAL',
            workflowIds: parseJson(r.workflow_ids, []),
            canonicalData: parseJson(r.canonical_data, {}),
            rawData: parseJson(r.raw_data, {}),
            createdAt: r.created_at?.toISOString(),
            updatedAt: r.updated_at?.toISOString()
        };
    },
    async getCentralTransactionsByTaskId(taskId) {
        const pool = getPostgresPool();
        const { rows } = await pool.query(`SELECT * FROM central_transaction_repository 
       WHERE task_id = $1 
          OR current_task_id = $1 
          OR original_task_id = $1 
          OR all_task_ids @> jsonb_build_array($1)
       ORDER BY row_number ASC;`, [taskId]);
        return rows.map(r => ({
            transactionKey: r.transaction_key,
            originalTaskId: r.original_task_id,
            currentTaskId: r.current_task_id,
            allTaskIds: parseJson(r.all_task_ids, []),
            batchId: r.batch_id,
            rowNumber: r.row_number,
            status: r.status,
            isDuplicate: !!r.is_duplicate,
            duplicateFromTaskId: r.duplicate_from_task_id,
            duplicateCount: r.duplicate_count || 1,
            duplicateStatus: r.duplicate_status || 'ORIGINAL',
            workflowIds: parseJson(r.workflow_ids, []),
            canonicalData: parseJson(r.canonical_data, {}),
            rawData: parseJson(r.raw_data, {}),
            createdAt: r.created_at?.toISOString(),
            updatedAt: r.updated_at?.toISOString()
        }));
    },
    async getCentralTransactionsByBatchId(batchId) {
        const pool = getPostgresPool();
        const { rows } = await pool.query('SELECT * FROM central_transaction_repository WHERE batch_id = $1 ORDER BY row_number ASC;', [batchId]);
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
    // ================= TASK WORKFLOW EXECUTIONS (LOOKUP TABLE) =================
    async getTaskWorkflowExecution(taskId, workflowId) {
        const pool = getPostgresPool();
        const { rows } = await pool.query('SELECT * FROM task_workflow_executions WHERE task_id = $1 AND workflow_id = $2 LIMIT 1;', [taskId, workflowId]);
        if (!rows.length)
            return null;
        const r = rows[0];
        return {
            id: r.id,
            taskId: r.task_id,
            workflowId: r.workflow_id,
            workflowName: r.workflow_name,
            status: r.status,
            totalRecords: r.total_records,
            passedCount: r.passed_count,
            failedCount: r.failed_count,
            durationMs: r.duration_ms,
            executionSummary: parseJson(r.execution_summary, {}),
            executedAt: r.executed_at?.toISOString(),
            executedBy: r.executed_by
        };
    },
    async recordTaskWorkflowExecution(exec) {
        const pool = getPostgresPool();
        const { rows } = await pool.query(`INSERT INTO task_workflow_executions (
        task_id, workflow_id, workflow_name, status, total_records,
        passed_count, failed_count, duration_ms, execution_summary, executed_at, executed_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), $10)
      ON CONFLICT (task_id, workflow_id) DO UPDATE SET
        workflow_name = EXCLUDED.workflow_name,
        status = EXCLUDED.status,
        total_records = EXCLUDED.total_records,
        passed_count = EXCLUDED.passed_count,
        failed_count = EXCLUDED.failed_count,
        duration_ms = EXCLUDED.duration_ms,
        execution_summary = EXCLUDED.execution_summary,
        executed_at = NOW(),
        executed_by = EXCLUDED.executed_by
      RETURNING *;`, [
            exec.taskId,
            exec.workflowId,
            exec.workflowName || 'Workflow',
            exec.status || 'COMPLETED',
            exec.totalRecords || 0,
            exec.passedCount || 0,
            exec.failedCount || 0,
            exec.durationMs || 0,
            JSON.stringify(exec.executionSummary || {}),
            exec.executedBy || 'system'
        ]);
        const r = rows[0];
        return {
            id: r.id,
            taskId: r.task_id,
            workflowId: r.workflow_id,
            workflowName: r.workflow_name,
            status: r.status,
            totalRecords: r.total_records,
            passedCount: r.passed_count,
            failedCount: r.failed_count,
            durationMs: r.duration_ms,
            executionSummary: parseJson(r.execution_summary, {}),
            executedAt: r.executed_at?.toISOString(),
            executedBy: r.executed_by
        };
    },
    async getTaskWorkflowExecutionsByTaskId(taskId) {
        const pool = getPostgresPool();
        const { rows } = await pool.query('SELECT * FROM task_workflow_executions WHERE task_id = $1 ORDER BY executed_at DESC;', [taskId]);
        return rows.map(r => ({
            id: r.id,
            taskId: r.task_id,
            workflowId: r.workflow_id,
            workflowName: r.workflow_name,
            status: r.status,
            totalRecords: r.total_records,
            passedCount: r.passed_count,
            failedCount: r.failed_count,
            durationMs: r.duration_ms,
            executionSummary: parseJson(r.execution_summary, {}),
            executedAt: r.executed_at?.toISOString(),
            executedBy: r.executed_by
        }));
    },
    async clearTaskWorkflowExecutions(taskId) {
        const pool = getPostgresPool();
        const res = await pool.query('DELETE FROM task_workflow_executions WHERE task_id = $1;', [taskId]);
        return res.rowCount ?? 0;
    },
    async clearAllValidationExecutions() {
        const pool = getPostgresPool();
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const r1 = await client.query('DELETE FROM task_workflow_executions;');
            const r2 = await client.query('DELETE FROM investigation_transactions;');
            const r3 = await client.query('DELETE FROM investigation_batches;');
            const r4 = await client.query('DELETE FROM investigation_tasks;');
            await client.query('COMMIT');
            return {
                executions: r1.rowCount ?? 0,
                transactions: r2.rowCount ?? 0,
                batches: r3.rowCount ?? 0,
                tasks: r4.rowCount ?? 0
            };
        }
        catch (err) {
            await client.query('ROLLBACK');
            throw err;
        }
        finally {
            client.release();
        }
    },
    // ================= CROSS-TASK DUPLICATE STORED PROCEDURES =================
    async runCrossTaskDuplicateScan() {
        const pool = getPostgresPool();
        const { rows } = await pool.query('SELECT * FROM sp_detect_and_flag_cross_task_duplicates();');
        return rows[0]?.flagged_count || 0;
    },
    async moveTransactionToTask(transactionKey, targetTaskId) {
        const pool = getPostgresPool();
        await pool.query('SELECT sp_move_transaction_to_task($1, $2);', [transactionKey, targetTaskId]);
    },
    async removeTransactionFromTask(transactionKey, taskId) {
        const pool = getPostgresPool();
        await pool.query('SELECT sp_remove_transaction_from_task($1, $2);', [transactionKey, taskId]);
    },
    // ================= STANDALONE VALIDATION BOXES =================
    async getValidationBoxes() {
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
            columnConfigurationIds: parseJson(r.column_configuration_ids, []),
            createdAt: r.created_at?.toISOString(),
            updatedAt: r.updated_at?.toISOString()
        }));
    },
    async getValidationBoxById(id) {
        const pool = getPostgresPool();
        const { rows } = await pool.query('SELECT * FROM validation_boxes WHERE id = $1 LIMIT 1;', [id]);
        if (!rows.length)
            return null;
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
            columnConfigurationIds: parseJson(r.column_configuration_ids, []),
            createdAt: r.created_at?.toISOString(),
            updatedAt: r.updated_at?.toISOString()
        };
    },
    async createValidationBox(box) {
        const pool = getPostgresPool();
        const colConfigIds = box.columnConfigurationIds || box.checkStep?.columnConfigurationIds || [];
        await pool.query(`INSERT INTO validation_boxes (
        id, name, description, box_type, category, target_db_id, target_table,
        mirror_table_name, search_parameters, check_step, column_configuration_ids, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
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
        column_configuration_ids = EXCLUDED.column_configuration_ids,
        updated_at = NOW();`, [
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
            JSON.stringify(colConfigIds),
            box.createdAt ? new Date(box.createdAt) : new Date(),
            new Date()
        ]);
        return box;
    },
    async updateValidationBox(id, updates) {
        const existing = await this.getValidationBoxById(id);
        if (!existing)
            return null;
        const merged = { ...existing, ...updates, updatedAt: new Date().toISOString() };
        await this.createValidationBox(merged);
        return merged;
    },
    async deleteValidationBox(id) {
        const pool = getPostgresPool();
        const res = await pool.query('DELETE FROM validation_boxes WHERE id = $1;', [id]);
        return (res.rowCount ?? 0) > 0;
    },
    // ================= GLOBAL SCHEMA CONFIG & TABLE MAPPINGS =================
    async getGlobalSchemaConfig() {
        const pool = getPostgresPool();
        const { rows } = await pool.query('SELECT * FROM global_transaction_schema_configs ORDER BY updated_at DESC LIMIT 1;');
        if (!rows.length)
            return null;
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
    async saveGlobalSchemaConfig(config) {
        const pool = getPostgresPool();
        const id = config.id || 'default_schema_config';
        const name = config.name || 'Central Standard Transaction Schema';
        const now = new Date();
        await pool.query(`INSERT INTO global_transaction_schema_configs (id, name, version, fields, table_mappings, version_history, strict_mapping_enforced, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         version = EXCLUDED.version,
         fields = EXCLUDED.fields,
         table_mappings = COALESCE(EXCLUDED.table_mappings, global_transaction_schema_configs.table_mappings),
         version_history = EXCLUDED.version_history,
         strict_mapping_enforced = EXCLUDED.strict_mapping_enforced,
         updated_by = EXCLUDED.updated_by,
         updated_at = EXCLUDED.updated_at;`, [
            id,
            name,
            config.version,
            JSON.stringify(config.standardFields || []),
            JSON.stringify(config.tableMappings || {}),
            JSON.stringify(config.versionHistory || []),
            config.strictMappingEnforced !== undefined ? config.strictMappingEnforced : true,
            config.updatedBy || 'system',
            now
        ]);
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
    async getTableMappings() {
        const pool = getPostgresPool();
        const result = {};
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
        }
        catch (err) {
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
    async saveTableMapping(dbId, tableName, mappingObj) {
        const pool = getPostgresPool();
        const id = `${dbId}::${tableName}`;
        const dbName = mappingObj.dbName || dbId;
        const columns = mappingObj.columns || [];
        const isCustom = !!mappingObj.isCustom;
        const updatedBy = mappingObj.updatedBy || 'admin';
        const now = new Date();
        // 1. Direct row persistence in database_table_mappings
        await pool.query(`INSERT INTO database_table_mappings (id, db_id, db_name, table_name, columns, is_custom, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET
         db_name = EXCLUDED.db_name,
         columns = EXCLUDED.columns,
         is_custom = EXCLUDED.is_custom,
         updated_by = EXCLUDED.updated_by,
         updated_at = EXCLUDED.updated_at;`, [id, dbId, dbName, tableName, JSON.stringify(columns), isCustom, updatedBy, now]);
        // 2. Also update JSONB in global_transaction_schema_configs for unified config export
        const cfgId = 'default_schema_config';
        await pool.query(`UPDATE global_transaction_schema_configs
       SET table_mappings = jsonb_set(
         jsonb_set(COALESCE(table_mappings, '{}'::jsonb), ARRAY[$1], $2::jsonb, true),
         ARRAY[$3], $2::jsonb, true
       ),
       updated_at = NOW()
       WHERE id = $4;`, [`${dbId}::${tableName}`, JSON.stringify(mappingObj), `${dbId}:${tableName}`, cfgId]);
    },
    // ================= GLOBAL STANDARD DIRECTORY =================
    async getGlobalStandardDirectory() {
        const pool = getPostgresPool();
        const { rows } = await pool.query('SELECT * FROM global_standard_directory ORDER BY is_standard DESC, created_at ASC;');
        return rows.map(r => ({
            id: r.id,
            key: r.field_name,
            label: r.display_name,
            description: r.description || '',
            dataType: (r.data_type || 'string'),
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
    async getGlobalStandardDirectoryField(idOrKey) {
        const pool = getPostgresPool();
        const { rows } = await pool.query('SELECT * FROM global_standard_directory WHERE id = $1 OR field_name = $1 LIMIT 1;', [idOrKey]);
        if (!rows.length)
            return null;
        const r = rows[0];
        return {
            id: r.id,
            key: r.field_name,
            label: r.display_name,
            description: r.description || '',
            dataType: (r.data_type || 'string'),
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
    async saveGlobalStandardDirectoryField(record) {
        const pool = getPostgresPool();
        const now = new Date();
        const createdAt = record.created_at ? new Date(record.created_at) : now;
        const updatedAt = now;
        // Resolve target id if row already exists by field_name or id
        const existing = await pool.query('SELECT id FROM global_standard_directory WHERE field_name = $1 OR id = $2 LIMIT 1;', [record.key, record.id]);
        const targetId = existing.rows.length > 0 ? existing.rows[0].id : record.id;
        await pool.query(`INSERT INTO global_standard_directory (
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
        updated_at = EXCLUDED.updated_at;`, [
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
        ]);
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
    async deleteGlobalStandardDirectoryField(idOrKey) {
        const pool = getPostgresPool();
        const res = await pool.query('DELETE FROM global_standard_directory WHERE id = $1 OR field_name = $1;', [idOrKey]);
        const deleted = (res.rowCount ?? 0) > 0;
        if (deleted) {
            await this.syncDirectoryToGlobalSchemaConfig();
        }
        return deleted;
    },
    async clearAllGlobalStandardDirectoryFields() {
        const pool = getPostgresPool();
        await pool.query('DELETE FROM global_standard_directory;');
        await this.syncDirectoryToGlobalSchemaConfig();
        return true;
    },
    async seedGlobalStandardDirectoryIfEmpty(initialRecords) {
        const existing = await this.getGlobalStandardDirectory();
        if (existing.length > 0)
            return existing;
        for (const rec of initialRecords) {
            await this.saveGlobalStandardDirectoryField(rec);
        }
        return this.getGlobalStandardDirectory();
    },
    async syncDirectoryToGlobalSchemaConfig() {
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
            await pool.query(`UPDATE global_transaction_schema_configs
         SET fields = $1::jsonb, updated_at = NOW()
         WHERE id = 'default_schema_config';`, [JSON.stringify(schemaFields)]);
        }
        catch (err) {
            console.warn('[postgresRepo] Could not sync directory to global_transaction_schema_configs:', err.message);
        }
    },
    // ================= FTP FILE STAGING CONFIGS =================
    async getFtpStagingConfigs() {
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
    async getFtpStagingConfigById(id) {
        const pool = getPostgresPool();
        const { rows } = await pool.query('SELECT * FROM ftp_file_staging_configs WHERE id = $1 LIMIT 1;', [id]);
        if (!rows.length)
            return null;
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
    async createFtpStagingConfig(config) {
        const pool = getPostgresPool();
        await pool.query(`INSERT INTO ftp_file_staging_configs (
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
        updated_at = NOW();`, [
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
        ]);
        return (await this.getFtpStagingConfigById(config.id)) || config;
    },
    async updateFtpStagingConfig(id, updates) {
        const existing = await this.getFtpStagingConfigById(id);
        if (!existing)
            return null;
        const merged = { ...existing, ...updates, id };
        return await this.createFtpStagingConfig(merged);
    },
    async deleteFtpStagingConfig(id) {
        const pool = getPostgresPool();
        const res = await pool.query('DELETE FROM ftp_file_staging_configs WHERE id = $1;', [id]);
        return (res.rowCount ?? 0) > 0;
    },
    // ================= ORGANIZATIONS =================
    async getOrganizations() {
        const pool = getPostgresPool();
        const { rows } = await pool.query('SELECT * FROM organizations ORDER BY created_at ASC;');
        return rows.map((r) => ({
            id: r.id,
            name: r.name,
            slug: r.slug || r.id,
            domain: r.domain,
            description: r.description || '',
            blogPostContent: r.blog_post_content || '',
            category: r.category || 'General',
            logoUrl: r.logo_url || undefined,
            ownerId: r.owner_id || 'system',
            ownerName: r.owner_name || 'System Administrator',
            memberIds: parseJson(r.member_ids, []),
            pendingJoinRequestUserIds: parseJson(r.pending_join_request_user_ids, []),
            associatedTeamIds: parseJson(r.associated_team_ids, []),
            associatedDbIds: parseJson(r.associated_db_ids, []),
            createdAt: r.created_at?.toISOString() || new Date().toISOString(),
            settings: parseJson(r.settings, {})
        }));
    },
    async createOrganization(org) {
        const pool = getPostgresPool();
        await pool.query(`INSERT INTO organizations (id, name, domain, created_at, settings)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, domain = EXCLUDED.domain, settings = EXCLUDED.settings;`, [org.id, org.name, org.domain || null, org.createdAt || new Date(), JSON.stringify(org.settings || {})]);
        return org;
    },
    // ================= HASHTAG PRESETS =================
    async getHashtags() {
        const pool = getPostgresPool();
        const { rows } = await pool.query('SELECT * FROM hashtag_presets ORDER BY created_at ASC;');
        return rows.map((r) => ({
            id: r.id,
            tag: r.tag,
            description: r.description,
            criteria: r.criteria,
            expectedFileStructure: parseJson(r.expected_file_structure, []),
            solutionTemplate: r.solution_template,
            author: r.author,
            createdAt: r.created_at?.toISOString() || new Date().toISOString(),
            fileTemplateData: parseJson(r.file_template_data, []),
            criteriaRules: parseJson(r.criteria_rules, [])
        }));
    },
    async createHashtag(tag) {
        const pool = getPostgresPool();
        await pool.query(`INSERT INTO hashtag_presets (id, tag, description, criteria, expected_file_structure, solution_template, author, created_at, file_template_data, criteria_rules)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO UPDATE SET tag = EXCLUDED.tag, description = EXCLUDED.description, criteria = EXCLUDED.criteria;`, [
            tag.tag, tag.tag, tag.description, tag.criteria,
            JSON.stringify(tag.expectedFileStructure || []),
            tag.solutionTemplate, tag.author,
            tag.createdAt || new Date(),
            JSON.stringify(tag.fileTemplateData || []),
            JSON.stringify(tag.criteriaRules || [])
        ]);
        return tag;
    },
    // ================= PLUGINS =================
    async getPlugins() {
        const pool = getPostgresPool();
        const { rows } = await pool.query('SELECT * FROM plugins ORDER BY name ASC;');
        return rows.map((r) => ({
            id: r.id,
            name: r.name,
            description: r.description,
            enabled: r.enabled,
            category: r.category,
            config: parseJson(r.config, {})
        }));
    },
    async togglePlugin(id, enabled) {
        const pool = getPostgresPool();
        const { rows: current } = await pool.query('SELECT * FROM plugins WHERE id = $1 LIMIT 1;', [id]);
        if (!current.length)
            return null;
        const newEnabled = enabled !== undefined ? enabled : !current[0].enabled;
        const { rows } = await pool.query('UPDATE plugins SET enabled = $1 WHERE id = $2 RETURNING *;', [newEnabled, id]);
        if (!rows.length)
            return null;
        const r = rows[0];
        return { id: r.id, name: r.name, description: r.description, enabled: r.enabled, category: r.category, config: parseJson(r.config, {}) };
    },
    // ================= METRICS =================
    async getMetrics() {
        const pool = getPostgresPool();
        const [totalRes, openRes, resolvedRes, pendingUsersRes, totalUsersRes, dbConnRes] = await Promise.all([
            pool.query("SELECT COUNT(*)::int as count FROM issues;"),
            pool.query("SELECT COUNT(*)::int as count FROM issues WHERE status IN ('Open','Investigating');"),
            pool.query("SELECT COUNT(*)::int as count FROM issues WHERE status IN ('Resolved','Closed');"),
            pool.query("SELECT COUNT(*)::int as count FROM users WHERE is_approved = false;"),
            pool.query("SELECT COUNT(*)::int as count FROM users;"),
            pool.query("SELECT COUNT(*)::int as count FROM database_connections;")
        ]);
        const totalIssues = totalRes.rows[0].count;
        const openIssues = openRes.rows[0].count;
        const resolvedIssues = resolvedRes.rows[0].count;
        return {
            totalIssues,
            openIssues,
            resolvedIssues,
            pendingUsers: pendingUsersRes.rows[0].count,
            totalUsers: totalUsersRes.rows[0].count,
            dbConnections: dbConnRes.rows[0].count,
            reconciliationRate: totalIssues > 0 ? Math.round((resolvedIssues / totalIssues) * 100) : 100
        };
    },
    // ================= TEAM TASKS =================
    async getTeamTasks(teamId) {
        const pool = getPostgresPool();
        const { rows } = teamId
            ? await pool.query('SELECT * FROM team_tasks WHERE team_id = $1 ORDER BY created_at DESC;', [teamId])
            : await pool.query('SELECT * FROM team_tasks ORDER BY created_at DESC;');
        return rows.map((r) => ({
            id: r.id, teamId: r.team_id, title: r.title, description: r.description,
            assigneeId: r.assignee_id, assigneeName: r.assignee_name,
            creatorId: r.creator_id, creatorName: r.creator_name,
            status: r.status, priority: r.priority,
            createdAt: r.created_at?.toISOString() || new Date().toISOString(),
            dueDate: r.due_date?.toISOString() || undefined,
            startDate: r.start_date?.toISOString() || undefined,
            milestone: r.milestone || undefined
        }));
    },
    async createTeamTask(task) {
        const pool = getPostgresPool();
        await pool.query(`INSERT INTO team_tasks (id, team_id, title, description, assignee_id, assignee_name, creator_id, creator_name, status, priority, created_at, due_date, start_date, milestone)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (id) DO NOTHING;`, [
            task.id, task.teamId, task.title, task.description,
            task.assigneeId, task.assigneeName, task.creatorId, task.creatorName,
            task.status || 'To Do', task.priority || 'Medium',
            task.createdAt || new Date(),
            task.dueDate ? new Date(task.dueDate) : null,
            task.startDate ? new Date(task.startDate) : null,
            task.milestone || null
        ]);
        return task;
    },
    async updateTeamTask(id, updates) {
        const pool = getPostgresPool();
        const { rows: curr } = await pool.query('SELECT * FROM team_tasks WHERE id = $1 LIMIT 1;', [id]);
        if (!curr.length)
            return null;
        const r = curr[0];
        const merged = {
            id: r.id, teamId: r.team_id, title: r.title, description: r.description,
            assigneeId: r.assignee_id, assigneeName: r.assignee_name, creatorId: r.creator_id, creatorName: r.creator_name,
            status: r.status, priority: r.priority, createdAt: r.created_at?.toISOString() || new Date().toISOString(),
            ...updates
        };
        await pool.query(`UPDATE team_tasks SET title=$1, description=$2, assignee_id=$3, assignee_name=$4, status=$5, priority=$6, due_date=$7, start_date=$8, milestone=$9 WHERE id=$10;`, [merged.title, merged.description, merged.assigneeId, merged.assigneeName,
            merged.status, merged.priority,
            merged.dueDate ? new Date(merged.dueDate) : null,
            merged.startDate ? new Date(merged.startDate) : null,
            merged.milestone || null, id]);
        return merged;
    },
    async deleteTeamTask(id) {
        const pool = getPostgresPool();
        const res = await pool.query('DELETE FROM team_tasks WHERE id = $1;', [id]);
        return (res.rowCount ?? 0) > 0;
    },
    // ================= TEAM INSIGHTS =================
    async getTeamInsights(teamId) {
        const pool = getPostgresPool();
        const { rows } = teamId
            ? await pool.query('SELECT * FROM team_insights WHERE team_id = $1 ORDER BY created_at DESC;', [teamId])
            : await pool.query('SELECT * FROM team_insights ORDER BY created_at DESC;');
        return rows.map((r) => ({
            id: r.id, teamId: r.team_id, title: r.title, content: r.content,
            authorId: r.author_id, authorName: r.author_name, authorRole: r.author_role,
            tags: parseJson(r.tags, []),
            createdAt: r.created_at?.toISOString() || new Date().toISOString()
        }));
    },
    async createTeamInsight(insight) {
        const pool = getPostgresPool();
        await pool.query(`INSERT INTO team_insights (id, team_id, title, content, author_id, author_name, author_role, tags, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO NOTHING;`, [insight.id, insight.teamId, insight.title, insight.content,
            insight.authorId, insight.authorName, insight.authorRole,
            JSON.stringify(insight.tags || []), insight.createdAt || new Date()]);
        return insight;
    },
    async deleteTeamInsight(id) {
        const pool = getPostgresPool();
        const res = await pool.query('DELETE FROM team_insights WHERE id = $1;', [id]);
        return (res.rowCount ?? 0) > 0;
    },
    // ================= TEAM DISCUSSION MESSAGES =================
    async getTeamMessages(teamId) {
        const pool = getPostgresPool();
        const { rows } = teamId
            ? await pool.query('SELECT * FROM team_discussion_messages WHERE team_id = $1 ORDER BY timestamp ASC;', [teamId])
            : await pool.query('SELECT * FROM team_discussion_messages ORDER BY timestamp ASC;');
        return rows.map((r) => ({
            id: r.id, teamId: r.team_id, senderId: r.sender_id, senderName: r.sender_name,
            senderRole: r.sender_role, content: r.content,
            timestamp: r.timestamp?.toISOString() || new Date().toISOString()
        }));
    },
    async createTeamMessage(msg) {
        const pool = getPostgresPool();
        await pool.query(`INSERT INTO team_discussion_messages (id, team_id, sender_id, sender_name, sender_role, content, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO NOTHING;`, [msg.id, msg.teamId, msg.senderId, msg.senderName, msg.senderRole, msg.content, msg.timestamp ? new Date(msg.timestamp) : new Date()]);
        return msg;
    },
    // ================= DIRECT MESSAGES =================
    async getDirectMessages(userId1, userId2) {
        const pool = getPostgresPool();
        let rows;
        if (userId1 && userId2) {
            ({ rows } = await pool.query(`SELECT * FROM direct_messages WHERE (sender_id=$1 AND receiver_id=$2) OR (sender_id=$2 AND receiver_id=$1) ORDER BY timestamp ASC;`, [userId1, userId2]));
        }
        else if (userId1) {
            ({ rows } = await pool.query(`SELECT * FROM direct_messages WHERE sender_id=$1 OR receiver_id=$1 ORDER BY timestamp ASC;`, [userId1]));
        }
        else {
            ({ rows } = await pool.query('SELECT * FROM direct_messages ORDER BY timestamp ASC;'));
        }
        return rows.map((r) => ({
            id: r.id, senderId: r.sender_id, senderName: r.sender_name, senderRole: r.sender_role,
            receiverId: r.receiver_id, receiverName: r.receiver_name, content: r.content,
            timestamp: r.timestamp?.toISOString() || new Date().toISOString(),
            isRead: r.is_read
        }));
    },
    async createDirectMessage(msg) {
        const pool = getPostgresPool();
        await pool.query(`INSERT INTO direct_messages (id, sender_id, sender_name, sender_role, receiver_id, receiver_name, content, timestamp, is_read)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (id) DO NOTHING;`, [msg.id, msg.senderId, msg.senderName, msg.senderRole,
            msg.receiverId, msg.receiverName, msg.content,
            msg.timestamp ? new Date(msg.timestamp) : new Date(), msg.isRead ?? false]);
        return msg;
    },
    async markDirectMessagesRead(senderId, receiverId) {
        const pool = getPostgresPool();
        await pool.query('UPDATE direct_messages SET is_read = true WHERE sender_id = $1 AND receiver_id = $2;', [senderId, receiverId]);
    },
    // ================= NOTIFICATIONS =================
    async getNotifications(userId) {
        const pool = getPostgresPool();
        const { rows } = userId
            ? await pool.query('SELECT * FROM notifications WHERE user_id = $1 ORDER BY timestamp DESC;', [userId])
            : await pool.query('SELECT * FROM notifications ORDER BY timestamp DESC;');
        return rows.map((r) => ({
            id: r.id, userId: r.user_id, type: r.type, title: r.title, message: r.message,
            timestamp: r.timestamp?.toISOString() || new Date().toISOString(),
            isRead: r.is_read,
            linkTab: r.link_tab || undefined, targetTeamId: r.target_team_id || undefined,
            targetTaskId: r.target_task_id || undefined, targetIssueId: r.target_issue_id || undefined,
            targetDirectUserId: r.target_direct_user_id || undefined,
            targetSubTab: r.target_sub_tab || undefined, actorName: r.actor_name || undefined
        }));
    },
    async createNotification(notif) {
        const pool = getPostgresPool();
        await pool.query(`INSERT INTO notifications (id, user_id, type, title, message, timestamp, is_read, link_tab, target_team_id, target_task_id, target_issue_id, target_direct_user_id, target_sub_tab, actor_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) ON CONFLICT (id) DO NOTHING;`, [notif.id, notif.userId, notif.type, notif.title, notif.message,
            notif.timestamp ? new Date(notif.timestamp) : new Date(), notif.isRead ?? false,
            notif.linkTab || null, notif.targetTeamId || null, notif.targetTaskId || null,
            notif.targetIssueId || null, notif.targetDirectUserId || null,
            notif.targetSubTab || null, notif.actorName || null]);
        return notif;
    },
    async markNotificationRead(id) {
        const pool = getPostgresPool();
        const res = await pool.query('UPDATE notifications SET is_read = true WHERE id = $1;', [id]);
        return (res.rowCount ?? 0) > 0;
    },
    // ================= QUERY APPROVAL REQUESTS =================
    async getQueryApprovals() {
        const pool = getPostgresPool();
        const { rows } = await pool.query('SELECT * FROM query_approval_requests ORDER BY request_date DESC;');
        return rows.map((r) => ({
            id: r.id, systemId: r.system_id, systemName: r.system_name, environment: r.environment,
            tableName: r.table_name, query: r.query, requesterId: r.requester_id,
            requesterName: r.requester_name, requesterRole: r.requester_role,
            status: r.status, requestDate: r.request_date?.toISOString() || new Date().toISOString(),
            issueId: r.issue_id || undefined, issueTitle: r.issue_title || undefined
        }));
    },
    async createQueryApproval(req) {
        const pool = getPostgresPool();
        await pool.query(`INSERT INTO query_approval_requests (id, system_id, system_name, environment, table_name, query, requester_id, requester_name, requester_role, status, request_date, issue_id, issue_title)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) ON CONFLICT (id) DO NOTHING;`, [req.id, req.systemId, req.systemName, req.environment, req.tableName, req.query,
            req.requesterId, req.requesterName, req.requesterRole,
            req.status || 'pending', req.requestDate ? new Date(req.requestDate) : new Date(),
            req.issueId || null, req.issueTitle || null]);
        return req;
    },
    async updateQueryApproval(id, status) {
        const pool = getPostgresPool();
        const { rows } = await pool.query('UPDATE query_approval_requests SET status = $1 WHERE id = $2 RETURNING *;', [status, id]);
        if (!rows.length)
            return null;
        const r = rows[0];
        return {
            id: r.id, systemId: r.system_id, systemName: r.system_name, environment: r.environment,
            tableName: r.table_name, query: r.query, requesterId: r.requester_id,
            requesterName: r.requester_name, requesterRole: r.requester_role,
            status: r.status, requestDate: r.request_date?.toISOString() || new Date().toISOString(),
            issueId: r.issue_id || undefined, issueTitle: r.issue_title || undefined
        };
    },
    // ================= DB ACCESS REQUESTS =================
    async getDbAccessRequests() {
        const pool = getPostgresPool();
        const { rows } = await pool.query('SELECT * FROM db_access_requests ORDER BY created_at DESC;');
        return rows.map((r) => ({
            id: r.id,
            userId: r.user_id,
            username: r.username,
            userRole: (r.user_role || 'viewer'),
            dbId: r.db_id,
            dbName: r.db_name,
            requestedPrivilege: (r.requested_privilege || 'SELECT'),
            reason: r.reason || undefined,
            status: r.status,
            requestDate: r.created_at?.toISOString() || new Date().toISOString()
        }));
    },
    async createDbAccessRequest(req) {
        const pool = getPostgresPool();
        await pool.query(`INSERT INTO db_access_requests (id, user_id, username, user_role, db_id, db_name, requested_privilege, reason, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT (id) DO NOTHING;`, [req.id, req.userId, req.username, req.userRole || 'viewer', req.dbId, req.dbName,
            req.requestedPrivilege || 'SELECT', req.reason || null, req.status || 'pending',
            req.requestDate ? new Date(req.requestDate) : new Date()]);
        return req;
    },
    async updateDbAccessRequest(id, status) {
        const pool = getPostgresPool();
        const { rows } = await pool.query('UPDATE db_access_requests SET status = $1 WHERE id = $2 RETURNING *;', [status, id]);
        if (!rows.length)
            return null;
        const r = rows[0];
        return {
            id: r.id,
            userId: r.user_id,
            username: r.username,
            userRole: (r.user_role || 'viewer'),
            dbId: r.db_id,
            dbName: r.db_name,
            requestedPrivilege: (r.requested_privilege || 'SELECT'),
            reason: r.reason || undefined,
            status: r.status,
            requestDate: r.created_at?.toISOString() || new Date().toISOString()
        };
    },
    // ================= CONNECTION USAGE LOGS =================
    async getConnectionLogs() {
        const pool = getPostgresPool();
        const { rows } = await pool.query('SELECT * FROM connection_usage_logs ORDER BY timestamp DESC LIMIT 200;');
        return rows.map((r) => ({
            id: r.id,
            dbId: r.db_id,
            dbName: r.db_name || 'Primary Database',
            userId: r.user_id,
            username: r.username,
            userRole: (r.user_role || 'viewer'),
            queryType: (r.query_type || 'SELECT'),
            queryStatement: r.query_statement || '',
            timestamp: r.timestamp?.toISOString() || new Date().toISOString(),
            executionTimeMs: Number(r.execution_time_ms || 0)
        }));
    },
    async createConnectionLog(log) {
        const pool = getPostgresPool();
        await pool.query(`INSERT INTO connection_usage_logs (id, db_id, db_name, user_id, username, user_role, query_type, query_statement, timestamp, execution_time_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT (id) DO NOTHING;`, [log.id, log.dbId, log.dbName || 'Primary Database', log.userId, log.username,
            log.userRole || 'viewer', log.queryType || 'SELECT', log.queryStatement || '',
            log.timestamp ? new Date(log.timestamp) : new Date(), log.executionTimeMs || 0]);
        return log;
    },
    // ================= TRANSACTION SCHEMA (delegates to global schema config) =================
    async getTransactionSchema() {
        const config = await this.getGlobalSchemaConfig();
        return {
            version: config?.version || '1.0',
            updatedAt: config?.updatedAt || new Date().toISOString(),
            updatedBy: config?.updatedBy || 'system',
            standardFields: (config?.standardFields || config?.systemStandardFields || []),
            customFields: (config?.customFields || []),
            defaultTemplateId: config?.defaultTemplateId
        };
    },
    async updateTransactionSchema(config) {
        const current = await this.getTransactionSchema();
        const updated = { ...current, ...config, updatedAt: new Date().toISOString() };
        await this.saveGlobalSchemaConfig({
            version: updated.version,
            updatedBy: updated.updatedBy || 'system',
            standardFields: updated.standardFields,
            tableMappings: await this.getTableMappings()
        });
        return updated;
    },
    // ================= TRANSACTION TEMPLATES =================
    // NOTE: No dedicated PG table yet — returns empty gracefully.
    // TODO(migration-004): CREATE TABLE transaction_templates (id VARCHAR(64) PRIMARY KEY, data JSONB NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW());
    async getTransactionTemplates() {
        try {
            const pool = getPostgresPool();
            const { rows } = await pool.query('SELECT * FROM transaction_templates ORDER BY created_at ASC;');
            return rows.map((r) => ({ ...parseJson(r.data, {}), id: r.id }));
        }
        catch {
            return [];
        }
    },
    async saveTransactionTemplate(tmpl) {
        try {
            const pool = getPostgresPool();
            await pool.query(`INSERT INTO transaction_templates (id, data, created_at) VALUES ($1, $2, NOW())
         ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data;`, [tmpl.id, JSON.stringify(tmpl)]);
        }
        catch { /* Table may not exist yet */ }
        return tmpl;
    },
    async deleteTransactionTemplate(id) {
        try {
            const pool = getPostgresPool();
            const res = await pool.query('DELETE FROM transaction_templates WHERE id = $1;', [id]);
            return (res.rowCount ?? 0) > 0;
        }
        catch {
            return false;
        }
    },
    // ================= UPLOADED TRANSACTIONS =================
    // NOTE: Uploaded records persist via task_dataset_transactions. No standalone table.
    async getUploadedTransactions(_params) {
        return { totalCount: 0, returnedCount: 0, transactions: [] };
    },
    async saveUploadedTransactions(_records) { },
    async clearUploadedTransactions(_batchId) { },
    // ================= UPLOAD AUDIT LOGS =================
    // NOTE: No dedicated PG table yet. Returns empty gracefully.
    // TODO(migration-004): CREATE TABLE upload_audit_logs (id VARCHAR(64) PRIMARY KEY, data JSONB NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW());
    async getUploadAuditLogs() { return []; },
    async createUploadAuditLog(log) { return log; },
    // ================= WORKSPACE TABLE RECORDS =================
    async getWorkspaceTableRecords() {
        const pool = getPostgresPool();
        const { rows } = await pool.query('SELECT * FROM workspace_table_records ORDER BY created_at ASC;');
        return rows.map((r) => ({
            id: r.id,
            file_name: r.file_name || 'dataset.csv',
            user: r.user_name || 'operator',
            user_id: r.user_id || 'usr-1',
            tag: r.tag || 'general',
            task_id: r.task_id || 'task-1',
            transformed_data: parseJson(r.transformed_data, {}),
            createdAt: r.created_at?.toISOString() || new Date().toISOString()
        }));
    },
    async saveWorkspaceTableRecords(records) {
        const pool = getPostgresPool();
        for (const record of records) {
            await pool.query(`INSERT INTO workspace_table_records (id, file_name, user_name, user_id, tag, task_id, transformed_data, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE SET file_name = EXCLUDED.file_name, user_name = EXCLUDED.user_name,
           user_id = EXCLUDED.user_id, tag = EXCLUDED.tag, task_id = EXCLUDED.task_id, transformed_data = EXCLUDED.transformed_data;`, [record.id, record.file_name, record.user, record.user_id, record.tag, record.task_id,
                JSON.stringify(record.transformed_data || {}), record.createdAt ? new Date(record.createdAt) : new Date()]);
        }
        return records;
    },
    async deleteWorkspaceTableRecord(id) {
        const pool = getPostgresPool();
        const res = await pool.query('DELETE FROM workspace_table_records WHERE id = $1;', [id]);
        return (res.rowCount ?? 0) > 0;
    },
    async clearWorkspaceTableRecords() {
        const pool = getPostgresPool();
        await pool.query('DELETE FROM workspace_table_records;');
    },
    // ===========================================================================
    // DATABASE COLUMN CONFIGURATIONS & RULES
    // ===========================================================================
    async getColumnConfigurations(dbId, tableName) {
        const pool = getPostgresPool();
        let query = 'SELECT * FROM database_column_configurations';
        const params = [];
        const conditions = [];
        if (dbId) {
            params.push(dbId);
            conditions.push(`db_id = $${params.length}`);
        }
        if (tableName) {
            params.push(tableName);
            conditions.push(`table_name = $${params.length}`);
        }
        if (conditions.length > 0) {
            query += ` WHERE ${conditions.join(' AND ')}`;
        }
        query += ' ORDER BY created_at DESC;';
        try {
            const { rows } = await pool.query(query, params);
            return rows.map((r) => ({
                id: r.id,
                name: r.name,
                dbId: r.db_id,
                dbName: r.db_name || undefined,
                tableName: r.table_name,
                ruleType: r.rule_type,
                description: r.description || undefined,
                columns: parseJson(r.columns, []),
                groupByColumns: parseJson(r.group_by_columns, []),
                aggregationRules: parseJson(r.aggregation_rules, []),
                primaryKeyColumn: r.primary_key_column || undefined,
                roleColumn: r.role_column || undefined,
                semanticRoles: parseJson(r.semantic_roles, []),
                crossRowRules: parseJson(r.cross_row_rules, []),
                typeGroups: parseJson(r.type_groups, []),
                typeGroupColumns: parseJson(r.type_group_columns, []),
                valueLabels: parseJson(r.value_labels, []),
                unmappedValueAction: r.unmapped_value_action || 'FLAG',
                violationAction: r.violation_action || 'FLAG',
                severity: r.severity || 'CRITICAL',
                violationMessage: r.violation_message || undefined,
                isActive: r.is_active !== false,
                createdBy: r.created_by || undefined,
                createdAt: r.created_at?.toISOString() || new Date().toISOString(),
                updatedAt: r.updated_at?.toISOString() || new Date().toISOString()
            }));
        }
        catch (err) {
            console.warn('[postgresRepo] getColumnConfigurations error:', err.message);
            return [];
        }
    },
    async getColumnConfigurationById(id) {
        const pool = getPostgresPool();
        try {
            const { rows } = await pool.query('SELECT * FROM database_column_configurations WHERE id = $1 LIMIT 1;', [id]);
            if (!rows.length)
                return null;
            const r = rows[0];
            return {
                id: r.id,
                name: r.name,
                dbId: r.db_id,
                dbName: r.db_name || undefined,
                tableName: r.table_name,
                ruleType: r.rule_type,
                description: r.description || undefined,
                columns: parseJson(r.columns, []),
                groupByColumns: parseJson(r.group_by_columns, []),
                aggregationRules: parseJson(r.aggregation_rules, []),
                primaryKeyColumn: r.primary_key_column || undefined,
                roleColumn: r.role_column || undefined,
                semanticRoles: parseJson(r.semantic_roles, []),
                crossRowRules: parseJson(r.cross_row_rules, []),
                typeGroups: parseJson(r.type_groups, []),
                typeGroupColumns: parseJson(r.type_group_columns, []),
                valueLabels: parseJson(r.value_labels, []),
                unmappedValueAction: r.unmapped_value_action || 'FLAG',
                violationAction: r.violation_action || 'FLAG',
                severity: r.severity || 'CRITICAL',
                violationMessage: r.violation_message || undefined,
                isActive: r.is_active !== false,
                createdBy: r.created_by || undefined,
                createdAt: r.created_at?.toISOString() || new Date().toISOString(),
                updatedAt: r.updated_at?.toISOString() || new Date().toISOString()
            };
        }
        catch (err) {
            console.warn('[postgresRepo] getColumnConfigurationById error:', err.message);
            return null;
        }
    },
    async createColumnConfiguration(config) {
        const pool = getPostgresPool();
        const id = config.id || `colcfg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
        const now = new Date();
        await pool.query(`INSERT INTO database_column_configurations (
        id, name, db_id, db_name, table_name, rule_type, description,
        columns, group_by_columns, aggregation_rules, primary_key_column, role_column, semantic_roles, cross_row_rules,
        type_groups, type_group_columns, value_labels, unmapped_value_action, violation_action,
        severity, violation_message, is_active, created_by, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        db_id = EXCLUDED.db_id,
        db_name = EXCLUDED.db_name,
        table_name = EXCLUDED.table_name,
        rule_type = EXCLUDED.rule_type,
        description = EXCLUDED.description,
        columns = EXCLUDED.columns,
        group_by_columns = EXCLUDED.group_by_columns,
        aggregation_rules = EXCLUDED.aggregation_rules,
        primary_key_column = EXCLUDED.primary_key_column,
        role_column = EXCLUDED.role_column,
        semantic_roles = EXCLUDED.semantic_roles,
        cross_row_rules = EXCLUDED.cross_row_rules,
        type_groups = EXCLUDED.type_groups,
        type_group_columns = EXCLUDED.type_group_columns,
        value_labels = EXCLUDED.value_labels,
        unmapped_value_action = EXCLUDED.unmapped_value_action,
        violation_action = EXCLUDED.violation_action,
        severity = EXCLUDED.severity,
        violation_message = EXCLUDED.violation_message,
        is_active = EXCLUDED.is_active,
        updated_at = NOW();`, [
            id,
            config.name,
            config.dbId,
            config.dbName || null,
            config.tableName,
            config.ruleType,
            config.description || null,
            safeJsonStringify(config.columns || []),
            safeJsonStringify(config.groupByColumns || []),
            safeJsonStringify(config.aggregationRules || []),
            config.primaryKeyColumn || null,
            config.roleColumn || null,
            safeJsonStringify(config.semanticRoles || []),
            safeJsonStringify(config.crossRowRules || []),
            safeJsonStringify(config.typeGroups || []),
            safeJsonStringify(config.typeGroupColumns || []),
            safeJsonStringify(config.valueLabels || []),
            config.unmappedValueAction || 'FLAG',
            config.violationAction || 'FLAG',
            config.severity || 'CRITICAL',
            config.violationMessage || null,
            config.isActive !== false,
            config.createdBy || 'admin',
            config.createdAt ? new Date(config.createdAt) : now,
            now
        ]);
        const saved = await this.getColumnConfigurationById(id);
        return saved || { ...config, id };
    },
    async updateColumnConfiguration(id, updates) {
        const pool = getPostgresPool();
        const existing = await this.getColumnConfigurationById(id);
        if (!existing)
            return null;
        const merged = {
            ...existing,
            ...updates,
            id
        };
        await pool.query(`UPDATE database_column_configurations SET
        name = $1,
        db_id = $2,
        db_name = $3,
        table_name = $4,
        rule_type = $5,
        description = $6,
        columns = $7,
        group_by_columns = $8,
        aggregation_rules = $9,
        primary_key_column = $10,
        role_column = $11,
        semantic_roles = $12,
        cross_row_rules = $13,
        type_groups = $14,
        type_group_columns = $15,
        value_labels = $16,
        unmapped_value_action = $17,
        violation_action = $18,
        severity = $19,
        violation_message = $20,
        is_active = $21,
        updated_at = NOW()
       WHERE id = $22;`, [
            merged.name,
            merged.dbId,
            merged.dbName || null,
            merged.tableName,
            merged.ruleType,
            merged.description || null,
            safeJsonStringify(merged.columns || []),
            safeJsonStringify(merged.groupByColumns || []),
            safeJsonStringify(merged.aggregationRules || []),
            merged.primaryKeyColumn || null,
            merged.roleColumn || null,
            safeJsonStringify(merged.semanticRoles || []),
            safeJsonStringify(merged.crossRowRules || []),
            safeJsonStringify(merged.typeGroups || []),
            safeJsonStringify(merged.typeGroupColumns || []),
            safeJsonStringify(merged.valueLabels || []),
            merged.unmappedValueAction || 'FLAG',
            merged.violationAction || 'FLAG',
            merged.severity || 'CRITICAL',
            merged.violationMessage || null,
            merged.isActive !== false,
            id
        ]);
        return this.getColumnConfigurationById(id);
    },
    async deleteColumnConfiguration(id) {
        const pool = getPostgresPool();
        try {
            const res = await pool.query('DELETE FROM database_column_configurations WHERE id = $1;', [id]);
            return (res.rowCount ?? 0) > 0;
        }
        catch (err) {
            console.warn('[postgresRepo] deleteColumnConfiguration error:', err.message);
            return false;
        }
    }
};

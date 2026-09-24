/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { queryPg } from '../config/postgres.js';
import { eventService } from './events.js';
export const workflowBundleService = {
    /**
     * Assembles and creates a composite workflow bundle.
     * Atomically snapshots the workflow DAG, validation boxes, and database check configs.
     */
    async createBundle(input) {
        if (!input.name || !input.workflowId || !input.sourceTeamId || !input.makerId) {
            throw new Error('name, workflowId, sourceTeamId, and makerId are required to create a workflow bundle.');
        }
        const version = input.version || '1.0.0';
        if (!/^\d+\.\d+\.\d+/.test(version)) {
            throw new Error(`Invalid semantic version format: '${version}'. Expected format X.Y.Z.`);
        }
        const scope = (input.scope || 'TEAM').toUpperCase();
        if (!['PERSONAL', 'TEAM', 'GLOBAL_ENTERPRISE'].includes(scope)) {
            throw new Error(`Invalid bundle scope: '${scope}'. Must be PERSONAL, TEAM, or GLOBAL_ENTERPRISE.`);
        }
        // 1. Fetch Workflow definition
        const wfRes = await queryPg(`SELECT * FROM database_validation_workflows WHERE id = $1`, [input.workflowId]);
        if (wfRes.rows.length === 0) {
            throw new Error(`Referenced workflow '${input.workflowId}' does not exist.`);
        }
        const wf = wfRes.rows[0];
        // 2. Fetch Validation Boxes
        const boxIds = input.validationBoxIds || [];
        let boxes = [];
        if (boxIds.length > 0) {
            const boxRes = await queryPg(`SELECT * FROM validation_boxes WHERE id = ANY($1::varchar[])`, [boxIds]);
            boxes = boxRes.rows;
        }
        // 3. Fetch Database Checks / Mappings
        const dbCheckIds = input.dbCheckIds || [];
        let dbChecks = [];
        if (dbCheckIds.length > 0) {
            const dbRes = await queryPg(`SELECT * FROM database_table_mappings WHERE id = ANY($1::varchar[])`, [dbCheckIds]);
            dbChecks = dbRes.rows;
        }
        // 4. Generate Immutable Evidence Snapshot
        const evidenceSnapshot = {
            workflow: {
                id: wf.id,
                name: wf.name,
                stages: wf.stages || [],
                steps: wf.steps || [],
                nodes: wf.nodes || [],
                connections: wf.connections || []
            },
            validationBoxes: boxes.map(b => ({
                id: b.id,
                name: b.name,
                boxType: b.box_type,
                category: b.category,
                checkStep: b.check_step,
                searchParameters: b.search_parameters,
                matchKeyInput: b.match_key_input,
                matchKeyExternal: b.match_key_external
            })),
            dbChecks: dbChecks.map(c => ({
                id: c.id,
                databaseId: c.database_id,
                tableName: c.table_name,
                mapping: c.mapping
            })),
            snapshottedAt: new Date().toISOString()
        };
        const id = `bundle-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const bundleCode = `WB-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
        const hashtagBindings = input.hashtagBindings || [];
        const insertSql = `
      INSERT INTO workflow_bundles (
        id, bundle_code, name, description, version, scope,
        workflow_id, validation_box_ids, db_check_ids, source_team_id,
        status, maker_id, maker_name, evidence_snapshot, hashtag_bindings,
        created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, 'DRAFT', $11, $12, $13::jsonb, $14::jsonb, NOW(), NOW())
      RETURNING *;
    `;
        const res = await queryPg(insertSql, [
            id,
            bundleCode,
            input.name,
            input.description || null,
            version,
            scope,
            input.workflowId,
            JSON.stringify(boxIds),
            JSON.stringify(dbCheckIds),
            input.sourceTeamId,
            input.makerId,
            input.makerName,
            JSON.stringify(evidenceSnapshot),
            JSON.stringify(hashtagBindings)
        ]);
        const row = res.rows[0];
        const bundle = this._mapRowToBundle(row, wf.name);
        eventService.broadcastEvent('workflow_bundle:created', bundle);
        return bundle;
    },
    /**
     * Submits a bundle for promotion review (Maker step).
     */
    async proposePromotion(bundleId, targetScope, makerId, makerName) {
        const checkRes = await queryPg(`SELECT * FROM workflow_bundles WHERE id = $1`, [bundleId]);
        if (checkRes.rows.length === 0) {
            throw new Error(`Workflow bundle '${bundleId}' not found.`);
        }
        const updateSql = `
      UPDATE workflow_bundles
      SET status = 'PENDING_CHECKER_REVIEW',
          scope = $1,
          maker_id = $2,
          maker_name = $3,
          checker_id = NULL,
          checker_name = NULL,
          checker_feedback = NULL,
          updated_at = NOW()
      WHERE id = $4
      RETURNING *;
    `;
        const res = await queryPg(updateSql, [targetScope, makerId, makerName, bundleId]);
        const bundle = this._mapRowToBundle(res.rows[0]);
        eventService.broadcastEvent('workflow_bundle:proposed', bundle);
        return bundle;
    },
    /**
     * Reviews a bundle promotion (Checker step).
     * Enforces Anti-Self-Approval: makerId !== checkerId.
     */
    async reviewPromotion(bundleId, checkerId, checkerName, action, feedback) {
        const checkRes = await queryPg(`SELECT * FROM workflow_bundles WHERE id = $1`, [bundleId]);
        if (checkRes.rows.length === 0) {
            throw new Error(`Workflow bundle '${bundleId}' not found.`);
        }
        const current = checkRes.rows[0];
        // Anti-Self-Approval Enforcement (Rule 7)
        if (current.maker_id === checkerId) {
            throw new Error(`Anti-Self-Approval Violation: Maker '${current.maker_name}' cannot approve their own workflow bundle promotion.`);
        }
        const isApprove = action === 'APPROVE';
        const newStatus = isApprove ? 'APPROVED' : 'REJECTED';
        await queryPg('BEGIN;');
        try {
            const updateSql = `
        UPDATE workflow_bundles
        SET status = $1,
            checker_id = $2,
            checker_name = $3,
            checker_feedback = $4,
            approved_at = ${isApprove ? 'NOW()' : 'NULL'},
            updated_at = NOW()
        WHERE id = $5
        RETURNING *;
      `;
            const res = await queryPg(updateSql, [
                newStatus,
                checkerId,
                checkerName,
                feedback || null,
                bundleId
            ]);
            const row = res.rows[0];
            // If approved, update workflow visibility to match the bundle scope
            if (isApprove) {
                const visibility = row.scope === 'GLOBAL_ENTERPRISE' ? 'public' : 'team';
                const isPublic = row.scope === 'GLOBAL_ENTERPRISE';
                await queryPg(`UPDATE database_validation_workflows 
           SET visibility = $1, is_public = $2, updated_at = NOW() 
           WHERE id = $3`, [visibility, isPublic, row.workflow_id]);
            }
            await queryPg('COMMIT;');
            const bundle = this._mapRowToBundle(row);
            eventService.broadcastEvent('workflow_bundle:reviewed', bundle);
            return bundle;
        }
        catch (err) {
            await queryPg('ROLLBACK;');
            throw err;
        }
    },
    /**
     * Retrieves workflow bundles with optional filtering.
     */
    async getBundles(filters = {}) {
        let sql = `
      SELECT wb.*, w.name as workflow_name, t.name as team_name
      FROM workflow_bundles wb
      LEFT JOIN database_validation_workflows w ON wb.workflow_id = w.id
      LEFT JOIN teams t ON wb.source_team_id = t.id
      WHERE 1=1
    `;
        const params = [];
        if (filters.status) {
            params.push(filters.status.toUpperCase());
            sql += ` AND wb.status = $${params.length}`;
        }
        if (filters.teamId) {
            params.push(filters.teamId);
            sql += ` AND wb.source_team_id = $${params.length}`;
        }
        if (filters.scope) {
            params.push(filters.scope.toUpperCase());
            sql += ` AND wb.scope = $${params.length}`;
        }
        if (filters.makerId) {
            params.push(filters.makerId);
            sql += ` AND wb.maker_id = $${params.length}`;
        }
        sql += ` ORDER BY wb.created_at DESC LIMIT 200`;
        const res = await queryPg(sql, params);
        return res.rows.map(r => this._mapRowToBundle(r, r.workflow_name, r.team_name));
    },
    /**
     * Retrieves a single bundle by ID.
     */
    async getBundleById(id) {
        const sql = `
      SELECT wb.*, w.name as workflow_name, t.name as team_name
      FROM workflow_bundles wb
      LEFT JOIN database_validation_workflows w ON wb.workflow_id = w.id
      LEFT JOIN teams t ON wb.source_team_id = t.id
      WHERE wb.id = $1
    `;
        const res = await queryPg(sql, [id]);
        if (res.rows.length === 0)
            return null;
        const r = res.rows[0];
        return this._mapRowToBundle(r, r.workflow_name, r.team_name);
    },
    _mapRowToBundle(row, workflowName, teamName) {
        return {
            id: row.id,
            bundleCode: row.bundle_code,
            name: row.name,
            description: row.description || undefined,
            version: row.version,
            scope: row.scope,
            workflowId: row.workflow_id,
            workflowName: workflowName || row.workflow_name || undefined,
            validationBoxIds: Array.isArray(row.validation_box_ids) ? row.validation_box_ids : [],
            dbCheckIds: Array.isArray(row.db_check_ids) ? row.db_check_ids : [],
            sourceTeamId: row.source_team_id,
            sourceTeamName: teamName || row.team_name || undefined,
            status: row.status,
            makerId: row.maker_id,
            makerName: row.maker_name,
            checkerId: row.checker_id || undefined,
            checkerName: row.checker_name || undefined,
            checkerFeedback: row.checker_feedback || undefined,
            evidenceSnapshot: row.evidence_snapshot || {},
            hashtagBindings: Array.isArray(row.hashtag_bindings) ? row.hashtag_bindings : [],
            createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
            approvedAt: row.approved_at ? new Date(row.approved_at).toISOString() : undefined,
            updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString()
        };
    }
};

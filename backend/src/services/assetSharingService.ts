/**
 * Operational Asset Sharing & 1-Click Adoption Service
 * Scopes assets to makers, handles visual peer-to-peer chat shares,
 * 1-click personal workspace adoption (cloning), and staging into Team Resource Centers.
 */

import { getPostgresPool } from '../config/postgres.js';
import { randomUUID } from 'crypto';

export type AssetType = 'WORKFLOW' | 'VALIDATION_BOX' | 'DB_CONFIG';
export type ShareTargetType = 'INDIVIDUAL' | 'TEAM' | 'CHAT_ROOM';
export type AssetStatus = 'DRAFT' | 'PENDING_CHECKER_TEST' | 'APPROVED' | 'DECLINED';

export interface AssetShareRecord {
  id: string;
  assetType: AssetType;
  assetId: string;
  senderId: string;
  senderName: string;
  targetType: ShareTargetType;
  targetId: string;
  targetName?: string;
  message?: string;
  visualPayload: Record<string, any>;
  createdAt: string;
}

export interface OperationalAssetSummary {
  id: string;
  name: string;
  assetType: AssetType;
  description?: string;
  status: AssetStatus;
  isLocked: boolean;
  makerId: string;
  makerName: string;
  teamId?: string;
  approvedByUserId?: string;
  approvedByUserName?: string;
  approvedAt?: string;
  checkerFeedback?: string;
  sharedSourceId?: string;
  visualPayload: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
}

export class AssetSharingService {
  /**
   * Fetches an operational asset by type and ID with its full visual payload.
   */
  async getAssetPayload(assetType: AssetType, assetId: string): Promise<{ asset: any; visualPayload: Record<string, any> } | null> {
    const pool = getPostgresPool();

    if (assetType === 'VALIDATION_BOX') {
      const { rows } = await pool.query('SELECT * FROM validation_boxes WHERE id = $1 LIMIT 1;', [assetId]);
      if (rows.length === 0) return null;
      const r = rows[0];
      const visualPayload = {
        title: r.name,
        category: r.category,
        boxType: r.box_type,
        targetDb: r.target_db_id,
        targetTable: r.target_table,
        searchParameters: typeof r.search_parameters === 'string' ? JSON.parse(r.search_parameters) : r.search_parameters || [],
        checkStep: typeof r.check_step === 'string' ? JSON.parse(r.check_step) : r.check_step || {},
        description: r.description
      };
      return { asset: r, visualPayload };
    }

    if (assetType === 'WORKFLOW') {
      const { rows } = await pool.query('SELECT * FROM database_validation_workflows WHERE id = $1 LIMIT 1;', [assetId]);
      if (rows.length === 0) return null;
      const r = rows[0];
      const visualPayload = {
        title: r.name,
        description: r.description,
        stepsCount: Array.isArray(r.steps) ? r.steps.length : (typeof r.steps === 'string' ? JSON.parse(r.steps).length : 0),
        steps: typeof r.steps === 'string' ? JSON.parse(r.steps) : r.steps || [],
        targetTable: r.target_table
      };
      return { asset: r, visualPayload };
    }

    if (assetType === 'DB_CONFIG') {
      const { rows } = await pool.query('SELECT * FROM database_table_mappings WHERE id = $1 LIMIT 1;', [assetId]);
      if (rows.length === 0) return null;
      const r = rows[0];
      const visualPayload = {
        title: `${r.database_name}.${r.table_name}`,
        databaseName: r.database_name,
        tableName: r.table_name,
        columnsCount: Object.keys(r.column_mappings || {}).length,
        columnMappings: typeof r.column_mappings === 'string' ? JSON.parse(r.column_mappings) : r.column_mappings || {}
      };
      return { asset: r, visualPayload };
    }

    return null;
  }

  /**
   * Shares an operational asset with an Individual (Direct Chat) or Team (Resource Center).
   */
  async shareAsset(params: {
    assetType: AssetType;
    assetId: string;
    senderId: string;
    senderName: string;
    targetType: ShareTargetType;
    targetId: string;
    targetName?: string;
    message?: string;
  }): Promise<AssetShareRecord> {
    const payloadData = await this.getAssetPayload(params.assetType, params.assetId);
    if (!payloadData) {
      throw new Error(`Asset not found: [${params.assetType}] ID ${params.assetId}`);
    }

    const pool = getPostgresPool();
    const shareId = `share-${Date.now()}-${randomUUID().slice(0, 8)}`;

    const visualPayload = {
      ...payloadData.visualPayload,
      assetId: params.assetId,
      assetType: params.assetType,
      senderId: params.senderId,
      senderName: params.senderName,
      status: payloadData.asset.status || 'DRAFT',
      isLocked: Boolean(payloadData.asset.is_locked),
      shareId
    };

    // If sharing to a TEAM, update the asset's team staging state
    if (params.targetType === 'TEAM') {
      let tableName = '';
      if (params.assetType === 'VALIDATION_BOX') tableName = 'validation_boxes';
      else if (params.assetType === 'WORKFLOW') tableName = 'database_validation_workflows';
      else if (params.assetType === 'DB_CONFIG') tableName = 'database_table_mappings';

      if (tableName) {
        await pool.query(
          `UPDATE ${tableName} 
           SET team_id = $1, status = 'PENDING_CHECKER_TEST', updated_at = NOW() 
           WHERE id = $2;`,
          [params.targetId, params.assetId]
        );
      }
    }

    // Persist share audit log
    const { rows } = await pool.query(
      `INSERT INTO asset_shares (
        id, asset_type, asset_id, sender_id, sender_name,
        target_type, target_id, target_name, message, visual_payload, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      RETURNING *;`,
      [
        shareId,
        params.assetType,
        params.assetId,
        params.senderId,
        params.senderName,
        params.targetType,
        params.targetId,
        params.targetName || null,
        params.message || null,
        JSON.stringify(visualPayload)
      ]
    );

    const r = rows[0];
    return {
      id: r.id,
      assetType: r.asset_type,
      assetId: r.asset_id,
      senderId: r.sender_id,
      senderName: r.sender_name,
      targetType: r.target_type,
      targetId: r.target_id,
      targetName: r.target_name,
      message: r.message,
      visualPayload: typeof r.visual_payload === 'string' ? JSON.parse(r.visual_payload) : r.visual_payload,
      createdAt: r.created_at?.toISOString()
    };
  }

  /**
   * 1-Click Adoption ("Add to My Workspace").
   * Clones the target asset into the recipient's personal collection as an editable copy.
   */
  async adoptAsset(params: {
    assetType: AssetType;
    assetId: string;
    recipientId: string;
    recipientName: string;
    customName?: string;
  }): Promise<{ newAssetId: string; message: string; asset: any }> {
    const payloadData = await this.getAssetPayload(params.assetType, params.assetId);
    if (!payloadData) {
      throw new Error(`Asset not found to adopt: [${params.assetType}] ID ${params.assetId}`);
    }

    const pool = getPostgresPool();
    const orig = payloadData.asset;

    if (params.assetType === 'VALIDATION_BOX') {
      const newId = `vbox-${Date.now()}-${randomUUID().slice(0, 6)}`;
      const newName = params.customName || `${orig.name} (My Copy)`;

      const { rows } = await pool.query(
        `INSERT INTO validation_boxes (
          id, name, description, box_type, category, target_db_id, target_table,
          mirror_table_name, search_parameters, check_step, column_configuration_ids,
          match_key_input, match_key_external, multi_row_policy, group_config,
          dual_source_condition, output_columns, status_binding, message_template,
          team_id, is_public, visibility, maker_id, maker_name, status, is_locked,
          shared_source_id, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
          $16, $17, $18, $19, NULL, false, 'personal', $20, $21, 'DRAFT', false,
          $22, NOW(), NOW()
        ) RETURNING *;`,
        [
          newId,
          newName,
          orig.description,
          orig.box_type,
          orig.category,
          orig.target_db_id,
          orig.target_table,
          orig.mirror_table_name,
          JSON.stringify(orig.search_parameters || []),
          JSON.stringify(orig.check_step || {}),
          JSON.stringify(orig.column_configuration_ids || []),
          orig.match_key_input,
          orig.match_key_external,
          orig.multi_row_policy,
          JSON.stringify(orig.group_config || null),
          JSON.stringify(orig.dual_source_condition || null),
          JSON.stringify(orig.output_columns || []),
          JSON.stringify(orig.status_binding || null),
          orig.message_template,
          params.recipientId,
          params.recipientName,
          params.assetId
        ]
      );
      return { newAssetId: newId, message: 'Validation Box added to personal workspace', asset: rows[0] };
    }

    if (params.assetType === 'WORKFLOW') {
      const newId = `wf-${Date.now()}-${randomUUID().slice(0, 6)}`;
      const newName = params.customName || `${orig.name} (My Copy)`;

      const { rows } = await pool.query(
        `INSERT INTO database_validation_workflows (
          id, name, description, steps, target_db_id,
          team_id, maker_id, maker_name, status, is_locked,
          shared_source_id, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, NULL, $6, $7, 'DRAFT', false,
          $8, NOW(), NOW()
        ) RETURNING *;`,
        [
          newId,
          newName,
          orig.description,
          JSON.stringify(orig.steps || []),
          orig.target_db_id || null,
          params.recipientId,
          params.recipientName,
          params.assetId
        ]
      );
      return { newAssetId: newId, message: 'Workflow DAG added to personal workspace', asset: rows[0] };
    }

    if (params.assetType === 'DB_CONFIG') {
      const newId = `mapping-${Date.now()}-${randomUUID().slice(0, 6)}`;

      const { rows } = await pool.query(
        `INSERT INTO database_table_mappings (
          id, database_id, database_name, table_name, column_mappings,
          team_id, maker_id, maker_name, status, is_locked,
          shared_source_id, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, NULL, $6, $7, 'DRAFT', false,
          $8, NOW(), NOW()
        ) RETURNING *;`,
        [
          newId,
          orig.database_id,
          orig.database_name,
          orig.table_name,
          JSON.stringify(orig.column_mappings || {}),
          params.recipientId,
          params.recipientName,
          params.assetId
        ]
      );
      return { newAssetId: newId, message: 'Database Configuration added to personal workspace', asset: rows[0] };
    }

    throw new Error(`Unsupported asset type: ${params.assetType}`);
  }

  /**
   * Retrieves all assets staged for a team in the Team Resource Center.
   */
  async getTeamStagedAssets(teamId: string): Promise<{
    validationBoxes: OperationalAssetSummary[];
    workflows: OperationalAssetSummary[];
    dbConfigs: OperationalAssetSummary[];
  }> {
    const pool = getPostgresPool();

    const [vboxesRes, wfRes, dbRes] = await Promise.all([
      pool.query(
        `SELECT * FROM validation_boxes 
         WHERE team_id = $1 
         ORDER BY created_at DESC;`,
        [teamId]
      ),
      pool.query(
        `SELECT * FROM database_validation_workflows 
         WHERE team_id = $1 
         ORDER BY created_at DESC;`,
        [teamId]
      ),
      pool.query(
        `SELECT * FROM database_table_mappings 
         WHERE team_id = $1 
         ORDER BY updated_at DESC;`,
        [teamId]
      )
    ]);

    const formatVBox = (r: any): OperationalAssetSummary => ({
      id: r.id,
      name: r.name,
      assetType: 'VALIDATION_BOX',
      description: r.description,
      status: r.status || 'DRAFT',
      isLocked: Boolean(r.is_locked),
      makerId: r.maker_id || 'unknown',
      makerName: r.maker_name || 'System',
      teamId: r.team_id,
      approvedByUserId: r.approved_by_user_id,
      approvedByUserName: r.approved_by_user_name,
      approvedAt: r.approved_at?.toISOString(),
      checkerFeedback: r.checker_feedback,
      sharedSourceId: r.shared_source_id,
      visualPayload: {
        category: r.category,
        boxType: r.box_type,
        targetDb: r.target_db_id,
        targetTable: r.target_table
      },
      createdAt: r.created_at?.toISOString(),
      updatedAt: r.updated_at?.toISOString()
    });

    const formatWorkflow = (r: any): OperationalAssetSummary => ({
      id: r.id,
      name: r.name,
      assetType: 'WORKFLOW',
      description: r.description,
      status: r.status || 'DRAFT',
      isLocked: Boolean(r.is_locked),
      makerId: r.maker_id || 'unknown',
      makerName: r.maker_name || 'System',
      teamId: r.team_id,
      approvedByUserId: r.approved_by_user_id,
      approvedByUserName: r.approved_by_user_name,
      approvedAt: r.approved_at?.toISOString(),
      checkerFeedback: r.checker_feedback,
      sharedSourceId: r.shared_source_id,
      visualPayload: {
        stepsCount: Array.isArray(r.steps) ? r.steps.length : 0,
        primaryKey: r.primary_key
      },
      createdAt: r.created_at?.toISOString(),
      updatedAt: r.updated_at?.toISOString()
    });

    const formatDbConfig = (r: any): OperationalAssetSummary => ({
      id: r.id,
      name: `${r.database_name}.${r.table_name}`,
      assetType: 'DB_CONFIG',
      status: r.status || 'DRAFT',
      isLocked: Boolean(r.is_locked),
      makerId: r.maker_id || 'unknown',
      makerName: r.maker_name || 'System',
      teamId: r.team_id,
      approvedByUserId: r.approved_by_user_id,
      approvedByUserName: r.approved_by_user_name,
      approvedAt: r.approved_at?.toISOString(),
      checkerFeedback: r.checker_feedback,
      sharedSourceId: r.shared_source_id,
      visualPayload: {
        databaseName: r.database_name,
        tableName: r.table_name
      },
      createdAt: r.created_at?.toISOString(),
      updatedAt: r.updated_at?.toISOString()
    });

    return {
      validationBoxes: vboxesRes.rows.map(formatVBox),
      workflows: wfRes.rows.map(formatWorkflow),
      dbConfigs: dbRes.rows.map(formatDbConfig)
    };
  }

  /**
   * Retrieves asset shares received by a user in direct chats.
   */
  async getDirectSharesForUser(userId: string): Promise<AssetShareRecord[]> {
    const pool = getPostgresPool();
    const { rows } = await pool.query(
      `SELECT * FROM asset_shares 
       WHERE target_type = 'INDIVIDUAL' AND target_id = $1 
       ORDER BY created_at DESC LIMIT 50;`,
      [userId]
    );

    return rows.map(r => ({
      id: r.id,
      assetType: r.asset_type,
      assetId: r.asset_id,
      senderId: r.sender_id,
      senderName: r.sender_name,
      targetType: r.target_type,
      targetId: r.target_id,
      targetName: r.target_name,
      message: r.message,
      visualPayload: typeof r.visual_payload === 'string' ? JSON.parse(r.visual_payload) : r.visual_payload,
      createdAt: r.created_at?.toISOString()
    }));
  }
}

export const assetSharingService = new AssetSharingService();

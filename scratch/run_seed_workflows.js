const { Pool } = require('pg');
require('dotenv').config({ path: '.env' });

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432', 10),
  database: process.env.PG_DATABASE || 'operational_workflow_db',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || '123456'
});

const DEFAULT_SEED_WORKFLOWS = [
  {
    id: 'wf-recon-multi-stage-1',
    name: 'End-to-End Multi-Stage Transaction Reconciliation',
    description: 'Stage-aware investigation pipeline verifying ingestion, authorization response codes, and downstream settlement reconciliation.',
    targetDbId: 'db-1788895559870',
    targetTable: 'auth_log_tab',
    category: 'Reconciliation',
    version: '2.1.0',
    stages: [
      {
        id: 'stage-1-auth',
        name: 'Stage 1: Authorization & Ingress Verification',
        description: 'Verify transaction presence and gateway authorization response status in the primary database node.',
        order: 1,
        enabled: true,
        targetDbId: 'db-1788895559870',
        targetDataSource: 'auth_log_tab',
        businessMeaning: 'Authorization Ingress'
      },
      {
        id: 'stage-2-settlement',
        name: 'Stage 2: Clearing & Settlement Verification',
        description: 'Cross-verify settled charge amounts and ledger posting state in the secondary settlement repository.',
        order: 2,
        enabled: true,
        targetDbId: 'db-1788895559870',
        targetDataSource: 'sv_fin_tab',
        businessMeaning: 'Financial Settlement'
      }
    ],
    steps: [
      {
        id: 'step-auth-existence',
        stepNumber: 1,
        name: 'Auth Ingress Existence Check',
        description: 'Verify transaction identifier is registered in the authorization node.',
        stageId: 'stage-1-auth',
        checkType: 'EXISTENCE_CHECK',
        targetDbId: 'db-1788895559870',
        targetTable: 'auth_log_tab',
        sourceField: 'refnum',
        requiredParams: ['refnum'],
        optionalParams: ['terminal_id'],
        dependencyCondition: 'ALWAYS',
        onPassAction: 'CONTINUE',
        onFailAction: 'STOP',
        onErrorAction: 'STOP',
        successMessage: 'Transaction confirmed in authorization ingress stage.',
        failureMessage: 'Transaction not found in authorization ingress node (404 Missing).',
        severityOnFailure: 'CRITICAL'
      },
      {
        id: 'step-auth-decline',
        stepNumber: 2,
        name: 'ISO-8583 Response Code Validation',
        description: 'Confirm gateway returned 00 (Approved) without card issuer decline codes.',
        stageId: 'stage-1-auth',
        checkType: 'ISO_DECLINE_CODE',
        targetDbId: 'db-1788895559870',
        targetTable: 'auth_log_tab',
        sourceField: 'respcode',
        compareValue: '00',
        requiredParams: ['respcode'],
        optionalParams: [],
        dependencyCondition: 'IF_PREV_SUCCESS',
        onPassAction: 'CONTINUE',
        onFailAction: 'CONTINUE',
        onErrorAction: 'STOP',
        successMessage: 'Transaction approved clean with code 00.',
        failureMessage: 'Card issuer decline code detected in authorization stage.',
        severityOnFailure: 'WARNING'
      },
      {
        id: 'step-settlement-amount',
        stepNumber: 3,
        name: 'Settlement Amount Match Check',
        description: 'Validate settled charge amount matches auth record exactly.',
        stageId: 'stage-2-settlement',
        checkType: 'AMOUNT_MATCH',
        targetDbId: 'db-1788895559870',
        targetTable: 'sv_fin_tab',
        sourceField: 'reqamt',
        requiredParams: ['reqamt'],
        optionalParams: [],
        dependencyCondition: 'IF_PREV_SUCCESS',
        onPassAction: 'CLOSE',
        onFailAction: 'STOP',
        onErrorAction: 'STOP',
        successMessage: 'Settlement amount balanced. Investigation reconciled clean.',
        failureMessage: 'Settlement amount mismatch detected in clearing stage.',
        severityOnFailure: 'CRITICAL'
      }
    ],
    nodes: [
      { id: 'node-search-auth', type: 'SEARCH_BLOCK', name: 'Auth Log Ingress Search', targetDbId: 'db-1788895559870', targetTable: 'auth_log_tab', position: { x: 100, y: 80 } },
      { id: 'node-cond-respcode', type: 'CONDITION_CHECK', name: 'Response Code == 00', operator: 'EQUALS', compareValue: '00', inputField: 'respcode', position: { x: 100, y: 220 } },
      { id: 'node-settle-match', type: 'SETTLEMENT_MATCH', name: 'Settlement Balance Match', targetDbId: 'db-1788895559870', targetTable: 'sv_fin_tab', position: { x: 100, y: 360 } }
    ],
    connections: [
      { id: 'conn-1', from: 'node-search-auth', to: 'node-cond-respcode', condition: 'ON_PASS' },
      { id: 'conn-2', from: 'node-cond-respcode', to: 'node-settle-match', condition: 'ON_PASS' }
    ],
    globalSuccessMessage: 'All processing stages reconciled successfully. Transaction verified.',
    globalFailureMessage: 'Discrepancies identified across processing stages.',
    createdBy: 'system',
    isSystemDefault: true,
    version: '2.1.0'
  }
];

const DEFAULT_SEED_VALIDATION_BOXES = [
  {
    id: 'vbox-auth-existence',
    name: 'Authorization Ingress Existence Check',
    description: 'Searches auth_log_tab by refnum to confirm ingress registration in the gateway node.',
    boxType: 'EXISTENCE_CHECK',
    category: 'Ingress',
    targetDbId: 'db-1788895559870',
    targetTable: 'auth_log_tab',
    matchKeyInput: 'refnum',
    matchKeyExternal: 'REFNUM',
    searchParameters: [{ inputField: 'refnum', targetField: 'REFNUM', required: true }],
    checkStep: {
      id: 'step-box-existence',
      name: 'RefNum Exists',
      checkType: 'EXISTENCE_CHECK',
      sourceField: 'refnum',
      onPassAction: 'CONTINUE',
      onFailAction: 'STOP',
      severityOnFailure: 'CRITICAL'
    }
  },
  {
    id: 'vbox-response-code',
    name: 'ISO-8583 Approval Code Verification',
    description: 'Confirms gateway returned 00 (Approved) without card issuer decline codes.',
    boxType: 'VALUE_MATCH',
    category: 'Authorization',
    targetDbId: 'db-1788895559870',
    targetTable: 'auth_log_tab',
    matchKeyInput: 'respcode',
    matchKeyExternal: 'RESPCODE',
    searchParameters: [{ inputField: 'respcode', targetField: 'RESPCODE', required: true }],
    checkStep: {
      id: 'step-box-respcode',
      name: 'ISO Code 00 Check',
      checkType: 'ISO_DECLINE_CODE',
      sourceField: 'respcode',
      compareValue: '00',
      onPassAction: 'CONTINUE',
      onFailAction: 'CONTINUE',
      severityOnFailure: 'WARNING'
    }
  },
  {
    id: 'vbox-settlement-amount',
    name: 'Settlement Amount Balancing',
    description: 'Reconciles transaction REQAMT against clearing CONAMT in sv_fin_tab.',
    boxType: 'AMOUNT_MATCH',
    category: 'Settlement',
    targetDbId: 'db-1788895559870',
    targetTable: 'sv_fin_tab',
    matchKeyInput: 'reqamt',
    matchKeyExternal: 'CONAMT',
    searchParameters: [{ inputField: 'reqamt', targetField: 'CONAMT', required: true }],
    checkStep: {
      id: 'step-box-amount',
      name: 'Amount Reconciliation',
      checkType: 'AMOUNT_MATCH',
      sourceField: 'reqamt',
      onPassAction: 'CLOSE',
      onFailAction: 'STOP',
      severityOnFailure: 'CRITICAL'
    }
  }
];

async function seed() {
  try {
    for (const wf of DEFAULT_SEED_WORKFLOWS) {
      await pool.query(
        `INSERT INTO database_validation_workflows (
          id, name, description, target_db_id, target_table, category,
          stages, steps, nodes, connections, global_success_message, global_failure_message,
          created_by, is_system_default, version, is_public, visibility
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          stages = EXCLUDED.stages,
          steps = EXCLUDED.steps,
          nodes = EXCLUDED.nodes,
          connections = EXCLUDED.connections;`,
        [
          wf.id,
          wf.name,
          wf.description,
          wf.targetDbId,
          wf.targetTable,
          wf.category,
          JSON.stringify(wf.stages),
          JSON.stringify(wf.steps),
          JSON.stringify(wf.nodes),
          JSON.stringify(wf.connections),
          wf.globalSuccessMessage,
          wf.globalFailureMessage,
          wf.createdBy,
          wf.isSystemDefault,
          wf.version,
          true,
          'public'
        ]
      );
    }
    console.log('✅ Seeded default workflows into database_validation_workflows.');

    for (const box of DEFAULT_SEED_VALIDATION_BOXES) {
      await pool.query(
        `INSERT INTO validation_boxes (
          id, name, description, box_type, category, target_db_id, target_table,
          search_parameters, check_step, match_key_input, match_key_external,
          is_public, visibility
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          search_parameters = EXCLUDED.search_parameters,
          check_step = EXCLUDED.check_step;`,
        [
          box.id,
          box.name,
          box.description,
          box.boxType,
          box.category,
          box.targetDbId,
          box.targetTable,
          JSON.stringify(box.searchParameters),
          JSON.stringify(box.checkStep),
          box.matchKeyInput,
          box.matchKeyExternal,
          true,
          'public'
        ]
      );
    }
    console.log('✅ Seeded default validation boxes into validation_boxes.');

    await pool.query(
      `UPDATE hashtag_presets 
       SET workflow_id = 'wf-recon-multi-stage-1', 
           workflow_name = 'End-to-End Multi-Stage Transaction Reconciliation'
       WHERE workflow_id IS NULL;`
    );
    console.log('✅ Updated hashtag presets.');

    const wfs = await pool.query('SELECT id, name FROM database_validation_workflows');
    console.log('Current workflows in DB:', wfs.rows);

    const boxes = await pool.query('SELECT id, name FROM validation_boxes');
    console.log('Current boxes in DB:', boxes.rows);
  } catch (err) {
    console.error('Seeding error:', err);
  } finally {
    await pool.end();
  }
}

seed();

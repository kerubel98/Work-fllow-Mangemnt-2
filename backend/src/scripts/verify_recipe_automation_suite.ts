/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * ============================================================================
 * DOMAIN 18: VERIFICATION SUITE FOR EXECUTABLE MAPPING & RECIPE ENGINE
 * ============================================================================
 * Governance Standard: AGENTS.md Rules 1, 4, 11, 14, 18, 19, 20, 22, 23
 * Master Plan: TASK_MAPPING_RECIPE_AUTOMATION_EXECUTION_PLAN.md
 * 
 * Tests:
 * 1. PostgreSQL Schema Validation (issues, ftp_file_staging_configs, file_ingestion_mapping_templates)
 * 2. Relational Template Persistence & Hydration (ordered steps, splits, merges, transforms, cleanings)
 * 3. Step-by-Step Backend Recipe Engine Execution (7 stages, audit trail, row mutations)
 * 4. Task Intake Binding & Execution Log Persistence (createIssue, recipe_snapshot, execution log)
 * 5. Automation FTP File Staging with Linked Recipe Execution
 * ============================================================================
 */

import { postgresRepo as repo } from '../store/postgresRepo.js';
import { getPostgresPool } from '../config/postgres.js';
import { recipeExecutionService } from '../services/recipeExecutionService.js';
import { FileIngestionMappingTemplate, Issue, FtpFileStagingConfig } from '../types.js';

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, msg: string) {
  totalTests++;
  if (!condition) {
    console.error(`❌ FAIL: ${msg}`);
    throw new Error(`Assertion failed: ${msg}`);
  }
  passedTests++;
  console.log(`✅ PASS: ${msg}`);
}

async function runVerificationSuite() {
  console.log('====================================================================');
  console.log('🚀 STARTING DOMAIN 18: EXECUTABLE MAPPING & RECIPE ENGINE VERIFICATION');
  console.log('====================================================================\n');

  const pool = getPostgresPool();

  // --------------------------------------------------------------------------
  // SUITE 1: PostgreSQL Schema Invariance (Rule 1, Migration 047)
  // --------------------------------------------------------------------------
  console.log('--- Suite 1: PostgreSQL Schema Verification ---');
  
  const issueColsRes = await pool.query(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'issues' 
      AND column_name IN ('mapping_template_id', 'recipe_snapshot', 'recipe_execution_log');
  `);
  const issueCols = issueColsRes.rows.map(r => r.column_name);
  assert(issueCols.includes('mapping_template_id'), 'issues table has mapping_template_id column');
  assert(issueCols.includes('recipe_snapshot'), 'issues table has recipe_snapshot JSONB column');
  assert(issueCols.includes('recipe_execution_log'), 'issues table has recipe_execution_log JSONB column');

  const ftpColsRes = await pool.query(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'ftp_file_staging_configs' 
      AND column_name = 'mapping_template_id';
  `);
  assert(ftpColsRes.rows.length === 1, 'ftp_file_staging_configs table has mapping_template_id column');

  const tplColsRes = await pool.query(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'file_ingestion_mapping_templates' 
      AND column_name IN ('ordered_recipe_steps', 'split_operations', 'merge_operations', 'transform_operations', 'cleaning_actions', 'version');
  `);
  const tplCols = tplColsRes.rows.map(r => r.column_name);
  assert(tplCols.includes('ordered_recipe_steps'), 'file_ingestion_mapping_templates has ordered_recipe_steps column');
  assert(tplCols.includes('split_operations'), 'file_ingestion_mapping_templates has split_operations column');
  assert(tplCols.includes('merge_operations'), 'file_ingestion_mapping_templates has merge_operations column');
  assert(tplCols.includes('transform_operations'), 'file_ingestion_mapping_templates has transform_operations column');
  assert(tplCols.includes('cleaning_actions'), 'file_ingestion_mapping_templates has cleaning_actions column');
  assert(tplCols.includes('version'), 'file_ingestion_mapping_templates has version column');

  // --------------------------------------------------------------------------
  // SUITE 2: Relational Template Persistence & Hydration (Rule 1, Rule 19)
  // --------------------------------------------------------------------------
  console.log('\n--- Suite 2: Template Persistence & Hydration ---');

  const testTemplateId = `tpl_test_${Date.now()}`;
  const sampleTemplate: FileIngestionMappingTemplate = {
    id: testTemplateId,
    name: 'Automated Settlement Clearing Recipe',
    description: 'Deterministic recipe for ATM / POS clearing feeds',
    sourceType: 'csv',
    headerMode: 'ROW_INDEX',
    headerRowIndex: 1,
    manualHeaders: {},
    deletedColumns: ['unwanted_tag', 'debug_trace'],
    requiredColumns: ['transaction_id', 'amount', 'currency'],
    columnMappings: {
      'TXN_REF': 'transaction_id',
      'AMT_RAW': 'amount',
      'CURR': 'currency',
      'full_account': 'account_number',
      'txn_type': 'transaction_type'
    },
    cleaningRecipe: {},
    orderedRecipeSteps: [
      { step: 1, name: 'Strip unwanted columns' },
      { step: 2, name: 'Split transaction description' },
      { step: 3, name: 'Merge branch code and account' },
      { step: 4, name: 'Normalize dates and amounts' },
      { step: 5, name: 'Mask PAN numbers' },
      { step: 6, name: 'Map to canonical standard fields' }
    ],
    splitOperations: [
      {
        id: 'split_1',
        column: 'TRANS_DESC',
        delimiterType: 'CUSTOM',
        customDelimiter: ' - ',
        partNames: ['txn_type', 'channel'],
        keepOriginal: false
      }
    ],
    mergeOperations: [
      {
        id: 'merge_1',
        col1: 'BRANCH_CODE',
        col2: 'ACC_NUM',
        separatorType: 'HYPHEN',
        resultColumnName: 'full_account',
        keepSources: false
      }
    ],
    transformOperations: [
      {
        id: 'trans_1',
        column: 'STATUS',
        ruleType: 'UPPERCASE'
      },
      {
        id: 'trans_2',
        column: 'AMT_RAW',
        ruleType: 'STRIP_CURRENCY'
      }
    ],
    cleaningActions: ['TRIM_WHITESPACE', 'NORMALIZE_DATES', 'MASK_PAN', 'DEDUPLICATE'],
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const savedTemplate = await repo.createOrUpdateFileMappingTemplate(sampleTemplate);
  assert(savedTemplate.id === testTemplateId, 'Template saved successfully to PostgreSQL');

  const fetchedTemplate = await repo.getFileMappingTemplateById(testTemplateId);
  assert(fetchedTemplate !== null, 'Template fetched by ID from PostgreSQL');
  assert(fetchedTemplate?.name === sampleTemplate.name, 'Template name preserved');
  assert(fetchedTemplate?.splitOperations?.length === 1, 'splitOperations hydrated properly from PostgreSQL');
  assert(fetchedTemplate?.splitOperations?.[0].column === 'TRANS_DESC', 'Split column preserved');
  assert(fetchedTemplate?.mergeOperations?.length === 1, 'mergeOperations hydrated properly from PostgreSQL');
  assert(fetchedTemplate?.mergeOperations?.[0].resultColumnName === 'full_account', 'Merge result column preserved');
  assert(fetchedTemplate?.transformOperations?.length === 2, 'transformOperations hydrated properly from PostgreSQL');
  assert(fetchedTemplate?.cleaningActions?.length === 4, 'cleaningActions hydrated properly from PostgreSQL');
  assert(fetchedTemplate?.orderedRecipeSteps?.length === 6, 'orderedRecipeSteps hydrated properly from PostgreSQL');
  assert(fetchedTemplate?.version === 1, 'Template version hydrated properly');

  // --------------------------------------------------------------------------
  // SUITE 3: Core Backend Recipe Execution Engine (Rule 23)
  // --------------------------------------------------------------------------
  console.log('\n--- Suite 3: Step-by-Step Recipe Engine Execution ---');

  const rawTestRows = [
    {
      'TXN_REF': '  TXN-001  ',
      'TRANS_DESC': 'WITHDRAWAL - ATM_01',
      'BRANCH_CODE': '001',
      'ACC_NUM': '987654321',
      'AMT_RAW': 'ETB 1,500.50',
      'CURR': 'etb',
      'STATUS': 'completed',
      'CARD_PAN': '4111111234561234',
      'TXN_DATE': '15/11/2026',
      'unwanted_tag': 'JUNK_DATA'
    },
    {
      'TXN_REF': 'TXN-002',
      'TRANS_DESC': 'DEPOSIT - POS_02',
      'BRANCH_CODE': '002',
      'ACC_NUM': '123456789',
      'AMT_RAW': '2.450,75', // European notation
      'CURR': 'usd',
      'STATUS': 'pending',
      'CARD_PAN': '5500009876544321',
      'TXN_DATE': '2026.11.16',
      'unwanted_tag': 'MORE_JUNK'
    },
    // Duplicate row for dedup testing
    {
      'TXN_REF': 'TXN-002',
      'TRANS_DESC': 'DEPOSIT - POS_02',
      'BRANCH_CODE': '002',
      'ACC_NUM': '123456789',
      'AMT_RAW': '2.450,75',
      'CURR': 'usd',
      'STATUS': 'pending',
      'CARD_PAN': '5500009876544321',
      'TXN_DATE': '2026.11.16',
      'unwanted_tag': 'MORE_JUNK'
    }
  ];

  const executionResult = await recipeExecutionService.executeRecipe(rawTestRows, fetchedTemplate!, {
    projectToCanonical: true,
    preserveRawPayload: true
  });

  assert(executionResult.success === true, 'Recipe executed successfully without errors');
  assert(executionResult.totalRowsIn === 3, 'Total input rows tracked correctly (3)');
  assert(executionResult.totalRowsOut === 2, 'Deduplication dropped duplicate row (3 -> 2)');
  assert(executionResult.auditTrail.length >= 6, `Audit trail recorded all steps (${executionResult.auditTrail.length} steps logged)`);

  const row1 = executionResult.processedRows[0];
  // 1. Column Deletions
  assert(row1.unwanted_tag === undefined, 'Excluded column unwanted_tag stripped from output');
  // 2. Split operation
  assert(row1.transaction_type === 'WITHDRAWAL', 'Split operation extracted txn_type = WITHDRAWAL');
  assert(row1.channel === 'ATM_01', 'Split operation extracted channel = ATM_01');
  assert(row1.TRANS_DESC === undefined, 'Original split column dropped as keepOriginal=false');
  // 3. Merge operation
  assert(row1.account_number === '001-987654321', 'Merge operation created 001-987654321 and projected to account_number');
  assert(row1.BRANCH_CODE === undefined, 'Merge source column BRANCH_CODE dropped as keepSources=false');
  // 4. Transform & Cleaning
  assert(row1.amount === 1500.5, `Amount cleaned from 'ETB 1,500.50' to numeric 1500.5 (got ${row1.amount})`);
  assert(row1.STATUS === 'COMPLETED', `Status transformed to uppercase 'COMPLETED' (got ${row1.STATUS})`);
  assert(row1.CARD_PAN === '411111******1234', `PAN masked correctly (got ${row1.CARD_PAN})`);
  assert(row1.TXN_DATE === '2026-11-15', `Date normalized to ISO-8601 '2026-11-15' (got ${row1.TXN_DATE})`);
  // 5. Canonical mapping
  assert(row1.transaction_id === 'TXN-001', 'TXN_REF projected to canonical transaction_id with whitespace trimmed');
  // 6. Raw preservation
  assert(row1._raw !== undefined, 'Raw input payload preserved in _raw coordinate');

  // Verify European notation row 2
  const row2 = executionResult.processedRows[1];
  assert(row2.amount === 2450.75, `European amount '2.450,75' parsed to 2450.75 (got ${row2.amount})`);
  assert(row2.CARD_PAN === '550000******4321', `Row 2 PAN masked correctly (got ${row2.CARD_PAN})`);
  assert(row2.TXN_DATE === '2026-11-16', `Row 2 Date normalized to ISO '2026-11-16' (got ${row2.TXN_DATE})`);

  // --------------------------------------------------------------------------
  // SUITE 4: Task Intake Binding & Execution Log Persistence (Rule 1, Rule 20)
  // --------------------------------------------------------------------------
  console.log('\n--- Suite 4: Task Creation with Bound Recipe & Audit Trail ---');

  const testTaskId = `ISS-RECIPE-TEST-${Date.now()}`;
  const testIssue: Issue = {
    id: testTaskId,
    title: 'Clearing Discrepancy Task with Bound Recipe',
    description: 'Task intake verifying recipe persistence and execution logging',
    status: 'Open',
    priority: 'High',
    creatorId: 'system_operator',
    creatorName: 'Lead Operator',
    createdAt: new Date().toISOString(),
    type: 'file',
    uploadedFileName: 'clearing_batch_20261120.csv',
    uploadedFileHeaders: executionResult.headers,
    fileMapping: sampleTemplate.columnMappings,
    firstLevelMappedData: executionResult.processedRows,
    mappingTemplateId: testTemplateId,
    recipeSnapshot: {
      templateId: testTemplateId,
      templateName: sampleTemplate.name,
      orderedRecipeSteps: sampleTemplate.orderedRecipeSteps,
      columnMappings: sampleTemplate.columnMappings
    },
    recipeExecutionLog: executionResult.auditTrail,
    visibility: 'TEAM_PUBLIC'
  };

  const createdIssue = await repo.createIssue(testIssue);
  assert(createdIssue.id === testTaskId, 'Task created successfully');

  const fetchedIssue = await repo.getIssueById(testTaskId);
  assert(fetchedIssue !== null, 'Task fetched from PostgreSQL');
  assert(fetchedIssue?.mappingTemplateId === testTemplateId, 'mappingTemplateId persisted and hydrated on issue');
  assert(fetchedIssue?.recipeSnapshot?.templateName === sampleTemplate.name, 'recipeSnapshot persisted and hydrated on issue');
  assert(Array.isArray(fetchedIssue?.recipeExecutionLog) && fetchedIssue.recipeExecutionLog.length > 0, 'recipeExecutionLog persisted and hydrated on issue');

  // Verify task dataset transactions in PostgreSQL
  const taskDatasetRows = await repo.getTaskDatasetTransactions(testTaskId, 1, 10);
  assert(taskDatasetRows.totalCount === 2, `task_dataset_transactions populated with 2 clean rows (got ${taskDatasetRows.totalCount})`);

  // --------------------------------------------------------------------------
  // SUITE 5: Automated FTP File Staging with Linked Recipe Execution (Phase 4)
  // --------------------------------------------------------------------------
  console.log('\n--- Suite 5: FTP Staging Configuration with Linked Recipe ---');

  const connRes = await pool.query('SELECT id FROM database_connections LIMIT 1;');
  let effectiveConnId = connRes.rows[0]?.id;
  let createdTempConn = false;
  if (!effectiveConnId) {
    effectiveConnId = `conn_test_${Date.now()}`;
    await pool.query(
      `INSERT INTO database_connections (id, name, type, host, port, database_name, username, created_at, updated_at)
       VALUES ($1, 'Test Conn', 'postgresql', 'localhost', 5432, 'test_db', 'postgres', NOW(), NOW());`,
      [effectiveConnId]
    );
    createdTempConn = true;
  }

  const testFtpConfigId = `ftp_cfg_recipe_${Date.now()}`;
  const sampleFtpConfig: FtpFileStagingConfig = {
    id: testFtpConfigId,
    name: 'Clearing Settlement Feed with Linked Recipe',
    ftpConnectionId: effectiveConnId,
    fileNamePattern: 'clearing_settlement_*.csv',
    fileFormat: 'CSV',
    hasHeader: true,
    headerRowIndex: 1,
    dataStartRow: 2,
    skipFooterLines: 0,
    fieldMappings: [],
    mappingTemplateId: testTemplateId,
    scheduleConfig: {
      enabled: true,
      frequency: 'DAILY',
      scheduledTime: '02:00',
      targetType: 'ALL'
    }
  };

  const savedFtpConfig = await repo.createFtpStagingConfig(sampleFtpConfig);
  assert(savedFtpConfig.id === testFtpConfigId, 'FTP staging config created in PostgreSQL');

  const fetchedFtpConfig = await repo.getFtpStagingConfigById(testFtpConfigId);
  assert(fetchedFtpConfig !== null, 'FTP staging config fetched from PostgreSQL');
  assert(fetchedFtpConfig?.mappingTemplateId === testTemplateId, 'mappingTemplateId hydrated correctly on FTP config');

  // --------------------------------------------------------------------------
  // CLEANUP: Clean synthetic test records
  // --------------------------------------------------------------------------
  console.log('\n--- Cleanup Synthetic Verification Records ---');
  await repo.deleteIssue(testTaskId);
  await repo.deleteFtpStagingConfig(testFtpConfigId);
  await repo.deleteFileMappingTemplate(testTemplateId);
  if (createdTempConn) {
    await pool.query('DELETE FROM database_connections WHERE id = $1;', [effectiveConnId]);
  }
  console.log('Cleaned up synthetic task, FTP config, and mapping template.');

  console.log('\n====================================================================');
  console.log(`🎉 ALL TESTS PASSED: ${passedTests} / ${totalTests} assertions passed 100%`);
  console.log('====================================================================\n');
}

runVerificationSuite()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Verification Suite Error:', err);
    process.exit(1);
  });

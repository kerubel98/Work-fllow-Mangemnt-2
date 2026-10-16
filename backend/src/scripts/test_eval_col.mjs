import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432', 10),
  database: process.env.PG_DATABASE || 'operational_workflow_db',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || '123456',
});

// Simulate resolveRecordField from investigationEngine.ts
function resolveRecordField(record, fieldKey) {
  if (!record || typeof record !== 'object' || !fieldKey) return undefined;
  if (record[fieldKey] !== undefined && record[fieldKey] !== null) return record[fieldKey];
  const directEnvelopes = [record._inputData, record.canonical_data, record.raw_data, record.payload, record._mirrorData, record._externalData];
  for (const env of directEnvelopes) {
    if (env && typeof env === 'object' && env[fieldKey] !== undefined && env[fieldKey] !== null) return env[fieldKey];
  }
  const targetLower = String(fieldKey).trim().toLowerCase();
  for (const k of Object.keys(record)) {
    if (k.toLowerCase() === targetLower) return record[k];
  }
  for (const env of directEnvelopes) {
    if (env && typeof env === 'object') {
      for (const k of Object.keys(env)) {
        if (k.toLowerCase() === targetLower) return env[k];
      }
    }
  }
  return undefined;
}

function evaluateAttachedColumnConfigurations(record, configurations) {
  if (!Array.isArray(configurations) || configurations.length === 0) {
    return { status: 'PASS', badgeText: 'Passed', message: 'All checks passed' };
  }
  const evalTarget = record._target_record ?? record.canonical_data?._target_record ?? record._mirrorData ?? record._externalData ?? record.canonical_data ?? record;
  const activeConfigs = configurations.filter(c => c && c.isActive !== false);

  for (const cfg of activeConfigs) {
    const cols = Array.isArray(cfg.columns) ? cfg.columns : [];
    console.log('Evaluating cfg:', cfg.name, 'ruleType:', cfg.ruleType, 'on evalTarget keys:', Object.keys(evalTarget));

    switch (cfg.ruleType) {
      case 'DUPLICATE_CHECK':
      case 'UNIQUE_CONSTRAINT': {
        for (const col of cols) {
          const val = resolveRecordField(evalTarget, col.columnName);
          console.log(`Checking col "${col.columnName}":`, val);
          if (val === undefined || val === null || String(val).trim() === '') {
            return {
              status: 'FAIL',
              badgeText: 'Missing Key Col',
              message: cfg.violationMessage || `Duplicate Check prerequisite failed on [${cfg.name}]: key column '${col.columnName}' is null or empty.`,
              detail: `Uniqueness key missing: ${col.columnName}`
            };
          }
        }
        break;
      }
    }
  }
  return { status: 'PASS', badgeText: 'OK', message: 'Verified' };
}

async function main() {
  try {
    const wfRes = await pool.query("SELECT * FROM database_validation_workflows WHERE id = 'wf-1791494381096'");
    const workflow = wfRes.rows[0];

    const rowRes = await pool.query("SELECT row_number, canonical_data FROM task_dataset_transactions WHERE task_id = 'ISS-6362' AND row_number = 1");
    const row = rowRes.rows[0].canonical_data;

    // Simulate row as prepared in mergedEffectiveRows:
    const mergedRow = {
      ...row,
      _target_record: row._target_record,
      _target_db: 'db-1788895559870',
      _target_table: 'tran_log_tab'
    };

    const step = workflow.steps[0];
    console.log('Step checkType:', step.checkType);
    console.log('Step attached columnConfigurations:', step.columnConfigurations?.length);

    const colResult = evaluateAttachedColumnConfigurations(mergedRow, step.columnConfigurations);
    console.log('\ncolResult:', colResult);
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

main();

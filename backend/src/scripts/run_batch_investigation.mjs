import { executeBatchInvestigation } from '../../../frontend/src/services/investigationEngine.ts';
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432', 10),
  database: process.env.PG_DATABASE || 'operational_workflow_db',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || '123456',
});

async function main() {
  try {
    const wfRes = await pool.query("SELECT * FROM database_validation_workflows WHERE id = 'wf-1791494381096'");
    const workflow = wfRes.rows[0];

    const rowRes = await pool.query("SELECT row_number, batch_id, canonical_data, raw_data, returned_data FROM task_dataset_transactions WHERE task_id = 'ISS-6362' AND row_number = 22");
    const r = rowRes.rows[0];
    const row = {
      ...r.canonical_data,
      _rowNumber: r.row_number,
      _batchId: r.batch_id,
      _target_db: 'db-1788895559870',
      _target_table: 'tran_log_tab',
      _target_record: r.canonical_data._target_record // which is null
    };

    console.log('Testing executeBatchInvestigation with row 22:');
    const batchSummaries = executeBatchInvestigation([row], workflow);
    console.log('Summary result for row 22:');
    console.log(JSON.stringify(batchSummaries, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

main();

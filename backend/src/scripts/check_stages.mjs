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

    const rowRes = await pool.query("SELECT row_number, canonical_data FROM task_dataset_transactions WHERE task_id = 'ISS-6362' AND row_number = 1");
    const row = rowRes.rows[0].canonical_data;

    // Check what stages are in the workflow:
    console.log('workflow.stages:', JSON.stringify(workflow.stages, null, 2));
    console.log('workflow.steps:', JSON.stringify(workflow.steps, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

main();

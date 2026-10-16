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
    const res = await pool.query(
      "SELECT id, name, target_table, target_db_id, steps, message_aggregations FROM database_validation_workflows WHERE id IN ('wf-1791494381096', 'wf-1790660651185')"
    );
    for (const wf of res.rows) {
      console.log('=== Workflow:', wf.id, wf.name, '===');
      console.log('target_table:', wf.target_table, 'target_db_id:', wf.target_db_id);
      console.log('steps:', JSON.stringify(wf.steps, null, 2));
      console.log('message_aggregations:', JSON.stringify(wf.message_aggregations, null, 2));
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

main();

import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:123456@localhost:5432/operational_workflow_db',
});

async function main() {
  try {
    const wfs = await pool.query('SELECT count(*) AS cnt FROM database_validation_workflows');
    const tables = await pool.query("SELECT count(*) AS cnt FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'");
    const mirrors = await pool.query("SELECT count(*) AS cnt FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'mirror_%'");
    const executions = await pool.query('SELECT count(*) AS cnt FROM task_workflow_executions');

    console.log(`Workflows in DB: ${wfs.rows[0].cnt}`);
    console.log(`Workflow executions in DB: ${executions.rows[0].cnt}`);
    console.log(`Total public base tables: ${tables.rows[0].cnt}`);
    console.log(`Mirror tables: ${mirrors.rows[0].cnt}`);
  } catch (err) {
    console.error('Error during verification:', err);
  } finally {
    await pool.end();
  }
}

main();

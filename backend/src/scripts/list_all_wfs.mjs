import pg from 'pg';
const { Pool } = pg;

async function listAllWorkflows() {
  const pool = new Pool({
    connectionString: 'postgresql://postgres:123456@localhost:5432/operational_workflow_db'
  });

  try {
    const res = await pool.query("SELECT id, name, steps FROM database_validation_workflows");
    console.log(`Found ${res.rows.length} workflows:`);
    for (const row of res.rows) {
      console.log(`\nID: ${row.id} | Name: ${row.name}`);
      console.log('Steps:', JSON.stringify(row.steps, null, 2));
    }
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

listAllWorkflows();

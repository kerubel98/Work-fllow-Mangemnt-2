import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgres://postgres:123456@localhost:5432/operational_workflow_db'
});

async function main() {
  try {
    const { rows } = await pool.query(`SELECT task_id, COUNT(*) as count FROM task_dataset_transactions GROUP BY task_id ORDER BY count DESC;`);
    console.log('Task transaction counts in DB:');
    console.table(rows);
  } catch (err) {
    console.error('Query error:', err);
  } finally {
    await pool.end();
  }
}

main();

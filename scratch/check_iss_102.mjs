import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgres://postgres:123456@localhost:5432/operational_workflow_db'
});

async function main() {
  try {
    const { rows } = await pool.query(`SELECT task_id, COUNT(*) as count FROM task_dataset_transactions GROUP BY task_id;`);
    console.log('Task transactions in DB:', rows);
    const { rows: issRows } = await pool.query(`SELECT * FROM task_dataset_transactions WHERE task_id ILIKE '%102%';`);
    console.log('ISS-102 rows in DB:', issRows);
  } catch (err) {
    console.error('Query error:', err);
  } finally {
    await pool.end();
  }
}

main();

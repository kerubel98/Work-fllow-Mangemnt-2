import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgres://postgres:123456@localhost:5432/operational_workflow_db'
});

async function main() {
  try {
    const issue = await pool.query('SELECT * FROM issues WHERE id = $1', ['ISS-102']);
    console.log('Issue in DB:', issue.rows[0]);
    const txnCount = await pool.query('SELECT count(*), batch_id FROM task_dataset_transactions WHERE task_id = $1 GROUP BY batch_id', ['ISS-102']);
    console.log('Transactions for ISS-102 by batch:', txnCount.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}
main();

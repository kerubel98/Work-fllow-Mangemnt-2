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
    const txExecs = await pool.query(
      "SELECT * FROM task_workflow_executions WHERE task_id = 'ISS-6362'"
    );
    console.log('task_workflow_executions for ISS-6362:', txExecs.rows);

    const issue = await pool.query(
      "SELECT id, validation_status, validation_errors FROM issues WHERE id = 'ISS-6362'"
    );
    console.log('Issue validation_status:', issue.rows);

    const row1 = await pool.query(
      "SELECT row_number, canonical_data FROM task_dataset_transactions WHERE task_id = 'ISS-6362' AND row_number = 1"
    );
    console.log('Row 1 canonical_data keys:', Object.keys(row1.rows[0].canonical_data));
    console.log('Row 1 validation fields:', {
      _validation_status: row1.rows[0].canonical_data._validation_status,
      _validation_action: row1.rows[0].canonical_data._validation_action,
      _validation_workflow_id: row1.rows[0].canonical_data._validation_workflow_id,
      _validation_workflow_name: row1.rows[0].canonical_data._validation_workflow_name,
      _validation_details: row1.rows[0].canonical_data._validation_details,
    });
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

main();

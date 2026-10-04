import pg from 'pg';

const pool = new pg.Pool({
  connectionString: 'postgres://postgres:123456@localhost:5432/operational_workflow_db',
});

async function main() {
  const wfs = await pool.query('SELECT id, name, team_id FROM database_validation_workflows');
  console.log('Workflows:', wfs.rows);

  const wfIds = wfs.rows.map(r => r.id);
  if (wfIds.length > 0) {
    const execs = await pool.query('SELECT id, workflow_id FROM task_workflow_executions WHERE workflow_id = ANY($1)', [wfIds]);
    console.log('Executions referencing workflows:', execs.rows.length);

    const shares = await pool.query("SELECT id, asset_id FROM asset_shares WHERE asset_id = ANY($1) OR asset_type = 'WORKFLOW'", [wfIds]);
    console.log('Shares referencing workflows:', shares.rows.length);
  }

  const vboxes = await pool.query('SELECT id, name, team_id FROM validation_boxes');
  console.log('Validation boxes total:', vboxes.rows.length);
  console.log('Validation boxes:', vboxes.rows);

  await pool.end();
}

main().catch(console.error);

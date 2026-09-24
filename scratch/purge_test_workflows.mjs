import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:123456@localhost:5432/operational_workflow_db'
});

async function purgeTestWorkflows() {
  console.log('--- PURGING TEST WORKFLOWS ---');
  
  // 1. Delete workflow executions of test workflows
  const execRes = await pool.query(`
    DELETE FROM task_workflow_executions 
    WHERE workflow_id LIKE 'wf-%' 
    RETURNING id, workflow_id;
  `);
  console.log(`Deleted ${execRes.rowCount} test workflow executions from task_workflow_executions.`);

  // 2. Delete test asset shares referencing test workflows
  const shareRes = await pool.query(`
    DELETE FROM asset_shares
    WHERE asset_id LIKE 'wf-%'
    RETURNING id;
  `);
  console.log(`Deleted ${shareRes.rowCount} test asset shares.`);

  // 3. Delete all test workflows from database_validation_workflows
  const wfRes = await pool.query(`
    DELETE FROM database_validation_workflows
    WHERE id LIKE 'wf-%'
    RETURNING id, name;
  `);
  console.log(`Deleted ${wfRes.rowCount} test workflows from database_validation_workflows:`);
  for (const row of wfRes.rows) {
    console.log(`  - [${row.id}] ${row.name}`);
  }

  // 4. Delete test database connections created by tests (team-db-1789*, team-db-1790*, test-governance dbs)
  const connRes = await pool.query(`
    DELETE FROM database_connections
    WHERE id LIKE 'team-db-%'
       OR id IN ('db-1789926066368', 'db-1789926066358')
    RETURNING id, name;
  `);
  console.log(`Deleted ${connRes.rowCount} test database connections from database_connections.`);

  // 5. Delete test teams created by tests
  const teamRes = await pool.query(`
    DELETE FROM teams
    WHERE id LIKE 'team-share-test-%'
       OR id = 'team-test-gov'
    RETURNING id, name;
  `);
  console.log(`Deleted ${teamRes.rowCount} test teams from teams.`);

  // 6. Delete test validation boxes created by tests
  const vboxRes = await pool.query(`
    DELETE FROM validation_boxes
    WHERE id LIKE 'vbox-share-%'
       OR id LIKE 'box-gov-%'
    RETURNING id, name;
  `);
  console.log(`Deleted ${vboxRes.rowCount} test validation boxes from validation_boxes.`);

  // 7. Verify counts
  const remainingWfs = await pool.query('SELECT count(*)::int as count FROM database_validation_workflows;');
  console.log(`Remaining workflows in database_validation_workflows: ${remainingWfs.rows[0].count}`);

  const remainingConns = await pool.query('SELECT count(*)::int as count FROM database_connections;');
  console.log(`Remaining connections in database_connections: ${remainingConns.rows[0].count}`);

  await pool.end();
}

purgeTestWorkflows().catch(err => {
  console.error('Purge error:', err);
  process.exit(1);
});

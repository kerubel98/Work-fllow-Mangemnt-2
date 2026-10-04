import pg from 'pg';

const pool = new pg.Pool({
  connectionString: 'postgres://postgres:123456@localhost:5432/operational_workflow_db',
});

async function main() {
  console.log('=== Cleaning Test Data and Obsolete Mirror Tables ===');

  // 1. Drop the 16 leftover mirror tables
  const mirrorRes = await pool.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_name LIKE 'mirror_%'
  `);
  console.log(`Found ${mirrorRes.rows.length} mirror tables to drop:`, mirrorRes.rows.map(r => r.table_name));
  for (const row of mirrorRes.rows) {
    await pool.query(`DROP TABLE IF EXISTS "${row.table_name}" CASCADE;`);
  }
  console.log('Successfully dropped all mirror tables.');

  // 2. Clear test task_workflow_executions
  const delExecs = await pool.query('DELETE FROM task_workflow_executions RETURNING id');
  console.log(`Deleted ${delExecs.rowCount} task_workflow_executions.`);

  // 3. Clear test asset_shares referencing workflows or vbox
  const delShares = await pool.query("DELETE FROM asset_shares WHERE asset_type IN ('WORKFLOW', 'VALIDATION_BOX') RETURNING id");
  console.log(`Deleted ${delShares.rowCount} asset_shares.`);

  // 4. Delete all remaining test workflows
  const delWfs = await pool.query('DELETE FROM database_validation_workflows RETURNING id, name');
  console.log(`Deleted ${delWfs.rowCount} test workflows:`, delWfs.rows);

  // 5. Delete all test validation boxes
  const delVbox = await pool.query('DELETE FROM validation_boxes RETURNING id, name');
  console.log(`Deleted ${delVbox.rowCount} test validation boxes:`, delVbox.rows);

  // 6. Delete orphaned / test column configurations
  const validConns = await pool.query('SELECT id FROM database_connections');
  const validConnIds = validConns.rows.map(r => r.id);
  const delColCfg = await pool.query(`
    DELETE FROM database_column_configurations 
    WHERE db_id IS NULL OR NOT (db_id = ANY($1))
    RETURNING id, name, db_id
  `, [validConnIds]);
  console.log(`Deleted ${delColCfg.rowCount} orphaned column configurations:`, delColCfg.rows.length);

  // 7. Verify remaining database tables
  const remainingTables = await pool.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `);
  console.log(`\nRemaining physical tables in DB (${remainingTables.rows.length}):`);
  console.log(remainingTables.rows.map(r => r.table_name));

  // 8. Verify remaining workflows and validation boxes
  const finalWfs = await pool.query('SELECT count(*) FROM database_validation_workflows');
  const finalVbox = await pool.query('SELECT count(*) FROM validation_boxes');
  console.log(`Final workflows count: ${finalWfs.rows[0].count}`);
  console.log(`Final validation boxes count: ${finalVbox.rows[0].count}`);

  await pool.end();
}

main().catch(console.error);

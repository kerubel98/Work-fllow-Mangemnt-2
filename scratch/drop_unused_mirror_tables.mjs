import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:123456@localhost:5432/operational_workflow_db'
});

async function dropUnusedMirrorTables() {
  console.log('--- AUDITING AND DROPPING UNUSED MIRROR TABLES ---');
  
  const { rows } = await pool.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_name LIKE 'mirror_%'
    ORDER BY table_name;
  `);

  console.log(`Found ${rows.length} mirror tables in physical database.`);

  let droppedCount = 0;
  for (const r of rows) {
    const tbl = r.table_name;
    await pool.query(`DROP TABLE IF EXISTS "${tbl}" CASCADE;`);
    droppedCount++;
    console.log(`  - Dropped table: ${tbl}`);
  }

  console.log(`Successfully dropped ${droppedCount} unused mirror tables.`);

  // Verify remaining tables
  const remainingRes = await pool.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name;
  `);

  console.log(`\nRemaining physical tables in operational_workflow_db (${remainingRes.rows.length} tables):`);
  for (const r of remainingRes.rows) {
    console.log(`  * ${r.table_name}`);
  }

  await pool.end();
}

dropUnusedMirrorTables().catch(err => {
  console.error('Error dropping unused mirror tables:', err);
  process.exit(1);
});

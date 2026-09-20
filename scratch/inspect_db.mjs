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
  const client = await pool.connect();
  console.log('--- CONNECTED TO POSTGRESQL ---');
  
  // 1. Tables list
  const tablesRes = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name;
  `);
  console.log('\n--- PUBLIC TABLES (' + tablesRes.rows.length + ') ---');
  console.log(tablesRes.rows.map(r => r.table_name).join(', '));

  // 2. validation_boxes columns
  const vbCols = await client.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns 
    WHERE table_name = 'validation_boxes' 
    ORDER BY ordinal_position;
  `);
  console.log('--- VALIDATION_BOXES COLUMNS (' + vbCols.rows.length + ') ---');
  vbCols.rows.forEach(r => console.log(`  ${r.column_name.padEnd(25)} : ${r.data_type} (nullable: ${r.is_nullable})`));

  // 3. database_validation_workflows columns
  const wfCols = await client.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns 
    WHERE table_name = 'database_validation_workflows' 
    ORDER BY ordinal_position;
  `);
  console.log('\n--- DATABASE_VALIDATION_WORKFLOWS COLUMNS (' + wfCols.rows.length + ') ---');
  wfCols.rows.forEach(r => console.log(`  ${r.column_name.padEnd(25)} : ${r.data_type} (nullable: ${r.is_nullable})`));

  // 5. Check migrations table if exists
  const migTable = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_name = 'migrations';
  `);
  if (migTable.rows.length > 0) {
    const migs = await client.query(`SELECT * FROM migrations;`);
    console.log('\n--- RECORDED MIGRATIONS ---');
    console.table(migs.rows);
  } else {
    console.log('\n--- NO migrations TABLE FOUND ---');
  }

  // 6. Check counts in tables
  const counts = await client.query(`
    SELECT 
      (SELECT COUNT(*) FROM validation_boxes) AS vb_count,
      (SELECT COUNT(*) FROM database_validation_workflows) AS wf_count,
      (SELECT COUNT(*) FROM database_column_configurations) AS col_cfg_count;
  `);
  console.log('\n--- RECORD COUNTS ---');
  console.table(counts.rows);

  client.release();
  await pool.end();
}

main().catch(err => {
  console.error('Inspection failed:', err);
  process.exit(1);
});

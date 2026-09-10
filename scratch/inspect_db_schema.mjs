import pg from 'pg';

const pool = new pg.Pool({
  host: 'localhost',
  port: 5432,
  database: 'operational_workflow_db',
  user: 'postgres',
  password: '123456'
});

async function run() {
  const res = await pool.query(`
    SELECT table_name, column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name LIKE 'mirror_sett_%' AND column_name NOT LIKE '\\_%' 
    ORDER BY table_name, ordinal_position;
  `);
  console.log(`Found ${res.rows.length} real database columns from Sett mirror tables:`);
  res.rows.forEach(r => {
    console.log(`  ${r.table_name}.${r.column_name} (${r.data_type})`);
  });

  const dirRes = await pool.query('SELECT * FROM global_standard_directory;');
  console.log(`\nCurrent global_standard_directory records in database: ${dirRes.rows.length}`);
  dirRes.rows.forEach(r => {
    console.log(`  ${r.field_name} (${r.display_name}) - ${r.data_type}`);
  });

  await pool.end();
}

run();

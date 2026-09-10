import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432', 10),
  database: process.env.PG_DATABASE || 'operational_workflow_db',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || '123456'
});

async function run() {
  const { rows } = await pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'global_standard_directory';
  `);
  console.log('Columns of global_standard_directory:', rows.map(r => `${r.column_name} (${r.data_type})`));
  const count = await pool.query('SELECT count(*) FROM global_standard_directory;');
  console.log('Rows count in global_standard_directory:', count.rows[0].count);
  await pool.end();
}

run().catch(console.error);

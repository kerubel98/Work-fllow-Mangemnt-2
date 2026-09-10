import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432'),
  database: process.env.PG_DATABASE || 'operational_workflow_db',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || '123456'
});

async function main() {
  const { rows } = await pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'global_transaction_schema_configs';
  `);
  console.log('Columns of global_transaction_schema_configs:', rows);
  const data = await pool.query('SELECT * FROM global_transaction_schema_configs LIMIT 5;');
  console.log('Data in global_transaction_schema_configs:', data.rows);
  await pool.end();
}

main().catch(console.error);

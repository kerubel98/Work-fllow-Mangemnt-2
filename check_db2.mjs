import pg from 'pg';

const pool = new pg.Pool({
  host: 'localhost',
  port: 5432,
  database: 'operational_workflow_db',
  user: 'postgres',
  password: '123456'
});

async function main() {
  try {
    const res1 = await pool.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'database_connections'`);
    console.log('database_connections columns:', res1.rows.map(r => r.column_name));
  } catch (e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}

main();

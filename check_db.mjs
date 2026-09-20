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
    const res1 = await pool.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'validation_boxes'`);
    console.log('validation_boxes columns:', res1.rows);
    
    const res2 = await pool.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'database_validation_workflows'`);
    console.log('database_validation_workflows columns:', res2.rows);
  } catch (e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}

main();

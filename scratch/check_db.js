const { Pool } = require('pg');
require('dotenv').config({ path: '.env' });
const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432', 10),
  database: 'BO',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || '123456'
});
async function check() {
  try {
    const tbls = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;");
    console.log('Tables in BO:', tbls.rows.map(r => r.table_name));
    if (tbls.rows.some(r => r.table_name === 'validation_boxes')) {
      const vb = await pool.query('SELECT id, name FROM validation_boxes;');
      console.log('Validation boxes in BO:', vb.rows);
    }
    if (tbls.rows.some(r => r.table_name === 'database_validation_workflows')) {
      const wf = await pool.query('SELECT id, name FROM database_validation_workflows;');
      console.log('Workflows in BO:', wf.rows);
    }
  } catch (err) {
    console.error('Error in BO:', err.message);
  } finally {
    await pool.end();
  }
}
check();

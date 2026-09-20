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
  console.log('Cleaning up inaccurate seed team memberships...');
  
  // admin (usr-1) belongs only to permanent_team_id 'team-parent-ops'
  await client.query(`UPDATE teams SET member_ids = $1 WHERE id = 'team-1'`, [JSON.stringify(['usr-2', 'usr-3', 'usr-4'])]);
  await client.query(`UPDATE teams SET member_ids = $1 WHERE id = 'team-cards'`, [JSON.stringify(['usr-2', 'usr-4'])]);
  await client.query(`UPDATE teams SET member_ids = $1 WHERE id = 'team-audit'`, [JSON.stringify(['usr-3', 'usr-4'])]);
  await client.query(`UPDATE teams SET member_ids = $1 WHERE id = 'team-fraud-working'`, [JSON.stringify(['usr-3', 'usr-6'])]);

  const { rows } = await client.query('SELECT id, name, manager_id, member_ids FROM teams ORDER BY id ASC');
  console.log('Cleaned teams:', JSON.stringify(rows, null, 2));

  client.release();
  await pool.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

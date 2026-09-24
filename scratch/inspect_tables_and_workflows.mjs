import pg from 'pg';

async function main() {
  const client = new pg.Client({
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || '5432', 10),
    database: process.env.PG_DATABASE || 'operational_workflow_db',
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || '123456',
  });
  await client.connect();

  const tablesRes = await client.query(`
    SELECT table_name, table_type 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name;
  `);

  console.log('=== TOTAL TABLES FOUND IN operational_workflow_db: ' + tablesRes.rows.length + ' ===');
  for (const row of tablesRes.rows) {
    const countRes = await client.query(`SELECT count(*) FROM "${row.table_name}";`).catch(err => ({ rows: [{ count: `ERROR: ${err.message}` }] }));
    console.log(`- ${row.table_name} (${row.table_type}): ${countRes.rows[0].count} rows`);
  }

  const workflowsRes = await client.query(`
    SELECT id, name, team_id, created_at, is_active 
    FROM workflows 
    ORDER BY created_at DESC;
  `).catch(err => ({ rows: [] }));

  console.log('\n=== WORKFLOWS IN DATABASE: ' + workflowsRes.rows.length + ' ===');
  for (const wf of workflowsRes.rows) {
    console.log(`- [${wf.id}] "${wf.name}" (team: ${wf.team_id}, active: ${wf.is_active}, created: ${wf.created_at})`);
  }

  await client.end();
}

main().catch(console.error);

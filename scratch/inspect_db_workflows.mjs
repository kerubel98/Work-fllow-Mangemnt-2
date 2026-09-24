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

  const res = await client.query(`SELECT * FROM database_validation_workflows ORDER BY created_at DESC;`);

  console.log(`=== DATABASE_VALIDATION_WORKFLOWS (${res.rows.length}) ===`);
  for (const wf of res.rows) {
    console.log(`- [${wf.id}] "${wf.name}" (team: ${wf.team_id || 'none'}, created: ${wf.created_at})`);
  }

  await client.end();
}

main().catch(console.error);

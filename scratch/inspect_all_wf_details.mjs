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

  const res = await client.query(`
    SELECT id, name, team_id, tags, created_at, user_id
    FROM database_validation_workflows 
    ORDER BY created_at ASC;
  `);

  console.log(`=== ALL 39 WORKFLOWS IN database_validation_workflows ===`);
  for (const wf of res.rows) {
    console.log(`ID: ${wf.id} | Name: "${wf.name}" | Team: ${wf.team_id || 'none'} | User: ${wf.user_id || 'none'} | Tags: ${JSON.stringify(wf.tags)} | Created: ${wf.created_at}`);
  }

  await client.end();
}

main().catch(console.error);

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

  const colRes = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'database_validation_workflows' 
    ORDER BY ordinal_position;
  `);
  console.log('Columns in database_validation_workflows:', colRes.rows.map(c => c.column_name));

  const rowsRes = await client.query(`SELECT id, name, team_id, created_at, updated_at FROM database_validation_workflows ORDER BY created_at ASC;`);
  for (const r of rowsRes.rows) {
    console.log(`[${r.id}] "${r.name}" | team: ${r.team_id} | created: ${r.created_at}`);
  }

  await client.end();
}

main().catch(console.error);

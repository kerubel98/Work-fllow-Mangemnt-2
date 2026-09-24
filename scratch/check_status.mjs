import pg from 'pg';

async function check() {
  const client = new pg.Client({ connectionString: 'postgres://postgres:123456@localhost:5432/operational_workflow_db' });
  await client.connect();
  const tables = await client.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;");
  console.log('Total public tables:', tables.rows.length);
  const mirrorTables = tables.rows.filter(r => r.tablename.startsWith('mirror_'));
  console.log('Mirror tables:', mirrorTables.map(r => r.tablename));
  const wfs = await client.query('SELECT count(*) FROM database_validation_workflows;');
  console.log('Workflows in database:', wfs.rows[0].count);
  await client.end();
}

check().catch(console.error);

import fs from 'fs';
import path from 'path';
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

  console.log(`Analyzing ${tablesRes.rows.length} tables...`);

  const results = [];
  for (const row of tablesRes.rows) {
    const tName = row.table_name;
    const countRes = await client.query(`SELECT count(*) FROM "${tName}";`).catch(err => ({ rows: [{ count: -1 }] }));
    const count = parseInt(countRes.rows[0].count, 10);
    results.push({ name: tName, rows: count });
  }

  // Group tables
  const mirrorTables = results.filter(r => r.name.startsWith('mirror_'));
  const nonMirrorTables = results.filter(r => !r.name.startsWith('mirror_'));

  console.log(`\n=== MIRROR TABLES (${mirrorTables.length}) ===`);
  for (const m of mirrorTables) {
    console.log(`- ${m.name} (${m.rows} rows)`);
  }

  console.log(`\n=== SYSTEM / APPLICATION TABLES (${nonMirrorTables.length}) ===`);
  for (const s of nonMirrorTables) {
    console.log(`- ${s.name} (${s.rows} rows)`);
  }

  await client.end();
}

main().catch(console.error);

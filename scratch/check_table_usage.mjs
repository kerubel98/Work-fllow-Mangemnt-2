import fs from 'fs';
import path from 'path';
import pg from 'pg';

const migrationsDir = path.resolve('backend/src/database/migrations');
const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql'));

const createdTables = new Set();

for (const file of files) {
  const content = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
  const matches = content.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_]+)/gi);
  for (const m of matches) {
    createdTables.add(m[1].toLowerCase());
  }
}

console.log('Tables defined in migrations:', Array.from(createdTables).sort());

const pool = new pg.Pool({
  connectionString: 'postgres://postgres:123456@localhost:5432/operational_workflow_db',
});

async function compare() {
  const res = await pool.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `);

  const dbTables = res.rows.map(r => r.table_name);
  console.log('\nTotal DB tables:', dbTables.length);

  const notInMigrations = dbTables.filter(t => !createdTables.has(t));
  console.log('\nTables in DB but NOT in migrations (size:', notInMigrations.length, '):');
  console.log(notInMigrations);

  const missingFromDb = Array.from(createdTables).filter(t => !dbTables.includes(t));
  console.log('\nTables in migrations but NOT in DB (size:', missingFromDb.length, '):');
  console.log(missingFromDb);

  await pool.end();
}

compare().catch(console.error);

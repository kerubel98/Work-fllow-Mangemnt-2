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
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name;
  `);

  const allDbTables = tablesRes.rows.map(r => r.table_name);

  // Read all backend and frontend ts/tsx/js files
  const searchDirs = ['backend/src', 'frontend/src'];
  const allCodeFiles = [];

  function collectFiles(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        collectFiles(full);
      } else if (ent.isFile() && (ent.name.endsWith('.ts') || ent.name.endsWith('.tsx') || ent.name.endsWith('.js'))) {
        allCodeFiles.push({ path: full, content: fs.readFileSync(full, 'utf-8') });
      }
    }
  }

  for (const d of searchDirs) collectFiles(d);

  console.log(`Scanned ${allCodeFiles.length} source code files.`);

  const tableUsage = [];
  for (const tbl of allDbTables) {
    let references = 0;
    const matchedFiles = [];
    for (const file of allCodeFiles) {
      if (file.content.includes(tbl)) {
        references++;
        matchedFiles.push(path.basename(file.path));
      }
    }
    const countRes = await client.query(`SELECT count(*) FROM "${tbl}";`).catch(() => ({ rows: [{ count: -1 }] }));
    tableUsage.push({
      table: tbl,
      isMirror: tbl.startsWith('mirror_'),
      rowCount: parseInt(countRes.rows[0].count, 10),
      refCount: references,
      files: matchedFiles.slice(0, 5)
    });
  }

  console.log('\n=== TABLES WITH ZERO CODE REFERENCES (UNUSED IN SYSTEM) ===');
  const zeroRefs = tableUsage.filter(t => t.refCount === 0);
  for (const z of zeroRefs) {
    console.log(`- ${z.table} (rows: ${z.rowCount}, isMirror: ${z.isMirror})`);
  }

  console.log('\n=== MIRROR TABLES STATUS ===');
  const mirrors = tableUsage.filter(t => t.isMirror);
  console.log(`Total mirror tables: ${mirrors.length}`);
  const emptyMirrors = mirrors.filter(m => m.rowCount === 0);
  console.log(`Empty mirror tables (0 rows): ${emptyMirrors.length}`);
  const nonEmptyMirrors = mirrors.filter(m => m.rowCount > 0);
  console.log(`Non-empty mirror tables: ${nonEmptyMirrors.length}`);
  for (const nem of nonEmptyMirrors) {
    console.log(`  * ${nem.table}: ${nem.rowCount} rows (code refs: ${nem.refCount})`);
  }

  console.log('\n=== NON-MIRROR SYSTEM TABLES USAGE ===');
  const systemTables = tableUsage.filter(t => !t.isMirror);
  for (const s of systemTables) {
    console.log(`- ${s.table}: ${s.rowCount} rows, ${s.refCount} code refs [${s.files.join(', ')}]`);
  }

  await client.end();
}

main().catch(console.error);

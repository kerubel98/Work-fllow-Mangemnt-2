import { queryPg } from '../config/postgres.js';

async function main() {
  const res = await queryPg(`
    SELECT id, db_name, table_name, updated_at
    FROM database_table_mappings
    WHERE table_name LIKE 'mirror_ftp_%'
    ORDER BY table_name;
  `);

  console.log(`Found ${res.rows.length} table mappings for mirror_ftp_%:`);
  for (const r of res.rows) {
    console.log(`  - id: ${r.id} | table: ${r.table_name}`);
  }

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

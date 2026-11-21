import { queryPg } from '../config/postgres.js';
import { postgresRepo as repo } from '../store/postgresRepo.js';

async function main() {
  console.log('--- STARTING CLEANUP OF FTP MIRROR TABLES FOR FRESH TESTING ---');

  // 1. Identify all mirror_ftp_% tables
  const res = await queryPg(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_name LIKE 'mirror_ftp_%'
    ORDER BY table_name;
  `);

  const tablesToDrop = res.rows.map(r => r.table_name);
  console.log(`Identified ${tablesToDrop.length} FTP mirror tables to drop:`);
  tablesToDrop.forEach(t => console.log(`  - ${t}`));

  // 2. Drop each mirror table
  for (const tableName of tablesToDrop) {
    try {
      await queryPg(`DROP TABLE IF EXISTS "${tableName}" CASCADE;`);
      console.log(`[DROPPED] Table "${tableName}" successfully dropped.`);
    } catch (err: any) {
      console.warn(`[ERROR] Could not drop "${tableName}":`, err.message);
    }
  }

  // 3. Reset ftp_ingested_files ledger so user can test ingestion from scratch
  const ledgerDelRes = await queryPg(`DELETE FROM ftp_ingested_files WHERE target_table_name LIKE 'mirror_ftp_%';`);
  console.log(`[CLEANED] Removed ${ledgerDelRes.rowCount || 0} entries from ftp_ingested_files ledger.`);

  // 4. Remove stale table mappings for mirror_ftp_%
  const mappingDelRes = await queryPg(`DELETE FROM database_table_mappings WHERE table_name LIKE 'mirror_ftp_%';`);
  console.log(`[CLEANED] Removed ${mappingDelRes.rowCount || 0} stale entries from database_table_mappings.`);

  // 5. Verify final state
  const verifyRes = await queryPg(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_name LIKE 'mirror_ftp_%';
  `);

  console.log(`\nVerification: Remaining FTP mirror tables: ${verifyRes.rows.length}`);
  if (verifyRes.rows.length === 0) {
    console.log('[SUCCESS] All FTP mirror tables have been completely deleted.');
    console.log('The system is ready for testing from scratch.');
  } else {
    console.warn('[WARNING] Some tables could not be removed:', verifyRes.rows.map(r => r.table_name));
  }

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

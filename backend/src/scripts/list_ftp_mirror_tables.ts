import { queryPg } from '../config/postgres.js';

async function main() {
  const res = await queryPg(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_name LIKE 'mirror_ftp_%'
    ORDER BY table_name;
  `);

  console.log(`Found ${res.rows.length} FTP mirror tables:`);
  for (const r of res.rows) {
    try {
      const countRes = await queryPg(`SELECT count(*) as c FROM "${r.table_name}"`);
      console.log(`  - ${r.table_name} (${countRes.rows[0].c} rows)`);
    } catch (e: any) {
      console.log(`  - ${r.table_name} (error reading count: ${e.message})`);
    }
  }

  const ledgerRes = await queryPg(`SELECT count(*) as c FROM ftp_ingested_files;`);
  console.log(`\nftp_ingested_files records: ${ledgerRes.rows[0].c}`);

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

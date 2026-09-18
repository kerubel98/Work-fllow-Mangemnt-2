import { queryPg } from '../backend/dist/config/postgres.js';

async function main() {
  const tables = await queryPg(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name
  `);
  console.log('Tables:', tables.rows.map(r => r.table_name));
  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});

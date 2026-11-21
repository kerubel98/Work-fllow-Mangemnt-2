import { connectPostgres, queryPg } from '../config/postgres.js';

async function main() {
  await connectPostgres();
  const res = await queryPg(`
    SELECT field_name, display_name, data_type, category 
    FROM global_standard_directory 
    WHERE category = 'sv_fin_tab' 
    LIMIT 20;
  `);
  console.log('Sample sv_fin_tab fields:', res.rows);
  process.exit(0);
}

main();

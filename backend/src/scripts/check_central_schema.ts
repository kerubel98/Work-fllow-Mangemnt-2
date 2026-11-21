import { queryPg } from '../config/postgres.js';

async function main() {
  const res = await queryPg('SELECT id, name, version, fields FROM global_transaction_schema_configs;');
  console.log('Configs fields length:', res.rows[0]?.fields?.length);
  console.log('Sample fields from global_transaction_schema_configs:', JSON.stringify(res.rows[0]?.fields?.slice(0, 15), null, 2));

  const centralCols = await queryPg(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'central_transaction_repository'
    ORDER BY ordinal_position;
  `);
  console.log('central_transaction_repository columns count:', centralCols.rows.length);
  console.log('central_transaction_repository columns:', centralCols.rows.map(c => `${c.column_name} (${c.data_type})`));

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

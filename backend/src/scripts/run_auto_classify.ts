import { connectPostgres } from '../config/postgres.js';
import { GlobalSchemaDiscoveryService } from '../services/globalSchemaDiscoveryService.js';
import { queryPg } from '../config/postgres.js';

async function main() {
  await connectPostgres();
  console.log('Running autoClassifyAllFields...');
  const res = await GlobalSchemaDiscoveryService.autoClassifyAllFields();
  console.log('Classified / changed count:', res.classifiedCount);

  const cats = await queryPg(`
    SELECT category, count(*)::int 
    FROM global_standard_directory 
    GROUP BY category 
    ORDER BY count DESC;
  `);
  console.log('Categories after autoClassify:', cats.rows);

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

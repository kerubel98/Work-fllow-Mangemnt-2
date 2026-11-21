import { queryPg } from '../config/postgres.js';
import { GlobalSchemaDiscoveryService } from '../services/globalSchemaDiscoveryService.js';

async function main() {
  const cats = await queryPg(`
    SELECT category, count(*)::int 
    FROM global_standard_directory 
    GROUP BY category 
    ORDER BY count DESC;
  `);
  console.log('Current categories:', cats.rows);

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

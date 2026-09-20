import { connectPostgres } from '../backend/src/config/postgres.js';

async function run() {
  const res = await connectPostgres();
  console.log('Migration result:', res);
  process.exit(0);
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});

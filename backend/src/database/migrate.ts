import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPostgresPool, connectPostgres } from '../config/postgres.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations() {
  console.log('🔄 Running PostgreSQL migrations...');
  const connResult = await connectPostgres();
  if (!connResult.success) {
    throw new Error(`Migration aborted: ${connResult.error}`);
  }

  const pool = getPostgresPool();
  const sqlFilePath = path.join(__dirname, 'migrations', '001_initial_schema.sql');
  const sql = fs.readFileSync(sqlFilePath, 'utf8');

  const client = await pool.connect();
  try {
    console.log('⚡ Executing 001_initial_schema.sql...');
    await client.query(sql);
    console.log('✅ 001_initial_schema.sql applied successfully!');
  } finally {
    client.release();
  }

  const { seedPostgres } = await import('../config/seedPostgres.js');
  await seedPostgres();
}

// If executed directly from CLI
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations()
    .then(() => {
      console.log('🎉 Migrations complete.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Migration failed:', err);
      process.exit(1);
    });
}

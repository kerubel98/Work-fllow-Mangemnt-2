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
  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    for (const file of files) {
      const { rows } = await client.query('SELECT version FROM schema_migrations WHERE version = $1;', [file]);
      if (rows.length > 0) {
        continue;
      }
      console.log(`⚡ Executing migration ${file}...`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1);', [file]);
        await client.query('COMMIT');
        console.log(`✅ ${file} applied successfully!`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }
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

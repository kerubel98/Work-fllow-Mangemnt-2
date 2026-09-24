import pg from 'pg';
import fs from 'fs';

const pool = new pg.Pool({
  host: 'localhost',
  port: 5432,
  database: 'operational_workflow_db',
  user: 'postgres',
  password: '123456'
});

try {
  const sql = fs.readFileSync('backend/src/database/migrations/017_messaging_intake_and_channels.sql', 'utf-8');
  await pool.query(sql);
  const res = await pool.query("SELECT COUNT(*) FROM information_schema.tables WHERE table_name IN ('team_channel_configurations', 'personal_channel_configurations', 'incoming_messages', 'message_attachments', 'outgoing_messages');");
  console.log('SUCCESS: migration 017 applied, verified tables count:', res.rows[0].count);
} catch (err) {
  console.error('Migration failed:', err);
} finally {
  await pool.end();
}

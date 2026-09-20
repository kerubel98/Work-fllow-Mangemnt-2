import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432', 10),
  database: process.env.PG_DATABASE || 'operational_workflow_db',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || '123456',
});

async function main() {
  const client = await pool.connect();
  console.log('Connected to PostgreSQL database');

  console.log('\n--- 1. database_validation_workflows columns ---');
  const wf = await client.query(`
    SELECT column_name, data_type, column_default, is_nullable
    FROM information_schema.columns 
    WHERE table_name = 'database_validation_workflows' 
      AND column_name IN ('team_id', 'is_public', 'visibility');
  `);
  console.table(wf.rows);

  console.log('\n--- 2. validation_boxes columns ---');
  const vb = await client.query(`
    SELECT column_name, data_type, column_default, is_nullable
    FROM information_schema.columns 
    WHERE table_name = 'validation_boxes' 
      AND column_name IN ('team_id', 'is_public', 'visibility');
  `);
  console.table(vb.rows);

  console.log('\n--- 3. team_tasks columns ---');
  const tt = await client.query(`
    SELECT column_name, data_type, column_default, is_nullable
    FROM information_schema.columns 
    WHERE table_name = 'team_tasks' 
      AND column_name IN ('is_public', 'visibility', 'escalated_to_team_id', 'escalation_reason', 'escalated_at');
  `);
  console.table(tt.rows);

  console.log('\n--- 4. workspace_setting_proposals table ---');
  const wsp = await client.query(`
    SELECT column_name, data_type, column_default, is_nullable
    FROM information_schema.columns 
    WHERE table_name = 'workspace_setting_proposals'
    ORDER BY ordinal_position;
  `);
  console.table(wsp.rows);

  console.log('\n--- 5. Foreign Keys and Constraints on workspace_setting_proposals ---');
  const cons = await client.query(`
    SELECT tc.constraint_name, tc.constraint_type, kcu.column_name, ccu.table_name AS foreign_table_name, ccu.column_name AS foreign_column_name 
    FROM information_schema.table_constraints AS tc 
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    LEFT JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
    WHERE tc.table_name = 'workspace_setting_proposals';
  `);
  console.table(cons.rows);

  client.release();
  await pool.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

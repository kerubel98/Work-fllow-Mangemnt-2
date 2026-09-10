import http from 'http';
import pg from 'pg';
const { Pool } = pg;

const BASE_URL = 'http://localhost:5002';
const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432', 10),
  database: process.env.PG_DATABASE || 'operational_workflow_db',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || '123456'
});

async function postMapping(body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(`${BASE_URL}/api/transactions/table-mappings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, (res) => {
      let responseBody = '';
      res.on('data', chunk => responseBody += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(responseBody) }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  console.log('--- Testing PostgreSQL Direct Table Mapping Persistence ---');

  // 1. Send Save Table Mapping request for settlemnt database -> auth_log_tab
  console.log('1. Calling POST /api/transactions/table-mappings for auth_log_tab...');
  const res = await postMapping({
    dbId: 'db-1788629375982',
    dbName: 'settlemnt',
    tableName: 'auth_log_tab',
    columns: [
      { physicalColumn: 'auth_id', globalKey: 'transaction_id' },
      { physicalColumn: 'pan', globalKey: 'card_number' },
      { physicalColumn: 'auth_amount', globalKey: 'amount_usd' },
      { physicalColumn: 'resp_code', globalKey: 'status_state' },
      { physicalColumn: 'auth_time', globalKey: 'created_at' }
    ],
    updatedBy: 'admin'
  });

  console.log('API Response Status:', res.status);
  console.log('API Response Validation:', res.body.validation);

  // 2. Query PostgreSQL database_table_mappings directly
  console.log('\n2. Querying PostgreSQL table [database_table_mappings] directly...');
  const { rows } = await pool.query(`
    SELECT id, db_id, db_name, table_name, columns, updated_by, updated_at
    FROM database_table_mappings
    WHERE id = 'db-1788629375982::auth_log_tab';
  `);

  console.log('PostgreSQL Found Rows:', rows.length);
  if (rows.length === 0) {
    throw new Error('❌ Record was NOT found in database_table_mappings in PostgreSQL!');
  }

  const row = rows[0];
  console.log('Row ID in PostgreSQL:', row.id);
  console.log('Database Name in PostgreSQL:', row.db_name);
  console.log('Table Name in PostgreSQL:', row.table_name);
  console.log('Columns stored in PostgreSQL JSONB:', row.columns);
  console.log('Updated at in PostgreSQL:', row.updated_at);

  await pool.end();
  console.log('\n✅ TABLE MAPPINGS ARE NOW SUCCESSFULLY STORED AND VERIFIED IN POSTGRESQL [database_table_mappings]!');
}

main().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});

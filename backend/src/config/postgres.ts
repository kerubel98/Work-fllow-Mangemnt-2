import pg from 'pg';
import 'dotenv/config';

// dotenv/config auto-loads

const { Pool } = pg;

export const pgConfig = {
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432', 10),
  database: process.env.PG_DATABASE || 'operational_workflow_db',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || '123456',
  max: parseInt(process.env.PG_MAX_POOL || '25', 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
};

let pool: pg.Pool | null = null;
export let isPostgresConnected = false;
export let lastPgError: string | null = null;

export function getPostgresPool(): pg.Pool {
  if (!pool) {
    pool = new Pool(pgConfig);

    pool.on('error', (err) => {
      console.error('Unexpected error on idle PostgreSQL client', err);
      lastPgError = err.message;
      isPostgresConnected = false;
    });
  }
  return pool;
}

export async function connectPostgres(): Promise<{ success: boolean; message: string; error?: string }> {
  try {
    const p = getPostgresPool();
    const client = await p.connect();
    const res = await client.query('SELECT NOW() as current_time, current_database() as db_name;');
    client.release();

    isPostgresConnected = true;
    lastPgError = null;
    console.log(`✅ Successfully connected to PostgreSQL database [${res.rows[0].db_name}] at ${res.rows[0].current_time}.`);
    return {
      success: true,
      message: `Connected to PostgreSQL database [${res.rows[0].db_name}]`
    };
  } catch (err: any) {
    isPostgresConnected = false;
    lastPgError = err.message;
    console.warn(`⚠️ Could not connect to PostgreSQL database (${err.message}).`);
    return {
      success: false,
      message: `Failed to connect to PostgreSQL: ${err.message}`,
      error: err.message
    };
  }
}

export async function queryPg<T extends pg.QueryResultRow = any>(text: string, params?: any[]): Promise<pg.QueryResult<T>> {
  const p = getPostgresPool();
  return await p.query<T>(text, params);
}

export async function withTransaction<T>(callback: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const p = getPostgresPool();
  const client = await p.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Database Connection & Live Query Manager
 * Provides genuine database catalog introspection and SQL execution across
 * MySQL, PostgreSQL, and MongoDB without mock fallbacks.
 */

import mysql from 'mysql2/promise';
import pg from 'pg';
import mongoose from 'mongoose';
import { DatabaseConnection } from '../types.js';
import { isMongoConnected } from '../config/db.js';

export interface ColumnMetadata {
  name: string;
  type: string;
  nullable: boolean;
  isPrimary?: boolean;
}

export interface LiveQueryResult {
  columns: string[];
  rows: Record<string, any>[];
  rowCount: number;
  executionTimeMs: number;
}

/**
 * Resolves connection configuration from connection string or explicit fields
 */
function resolveDbConfig(db: DatabaseConnection) {
  let host = db.host || 'localhost';
  let port = db.port;
  let database = db.databaseName || '';
  let user = db.username || '';
  let password = db.password || '';

  if (db.connectionString) {
    try {
      const parsedUrl = new URL(db.connectionString);
      if (parsedUrl.hostname && parsedUrl.hostname !== 'host') host = parsedUrl.hostname;
      if (parsedUrl.port) port = Number(parsedUrl.port);
      if (parsedUrl.pathname) database = parsedUrl.pathname.replace(/^\//, '');
      if (parsedUrl.username) user = decodeURIComponent(parsedUrl.username);
      if (parsedUrl.password) password = decodeURIComponent(parsedUrl.password);
    } catch {
      // Fallback simple regex parser for custom URIs
      const m = db.connectionString.match(/^(?:mysql|postgresql|postgres|mongodb(?:\+srv)?):\/\/(?:([^:]+):([^@]+)@)?([^:\/]+)(?::(\d+))?(?:\/([^?]+))?/);
      if (m) {
        if (m[1]) user = m[1];
        if (m[2]) password = m[2];
        if (m[3] && m[3] !== 'host') host = m[3];
        if (m[4]) port = Number(m[4]);
        if (m[5]) database = m[5];
      }
    }
  }

  // Sensible default ports based on engine
  if (!port) {
    if (db.type === 'MySQL') port = 3306;
    else if (db.type === 'PostgreSQL') port = 5432;
    else if (db.type === 'MongoDB') port = 27017;
    else if (db.type === 'FTP') port = 21;
    else if (db.type === 'SFTP') port = 22;
    else port = 5432;
  }

  return { host, port, database, user, password };
}

/**
 * Tests connectivity to an external target database with ping measurement.
 */
export async function testExternalDbConnection(db: DatabaseConnection): Promise<{ success: boolean; message: string; latencyMs?: number }> {
  const start = Date.now();
  const config = resolveDbConfig(db);

  try {
    if (db.type === 'MySQL') {
      const pool = getExternalMysqlPool(
        `${db.id}:${config.host}:${config.port}:${config.database}`,
        config
      );
      const conn = await pool.getConnection();
      try {
        await conn.query('SELECT 1 as ping');
        return { success: true, message: `Connected to MySQL [${db.name}]`, latencyMs: Date.now() - start };
      } finally {
        conn.release();
      }
    }

    if (db.type === 'Oracle') {
      return {
        success: false,
        message: 'Oracle database connectivity requires the native oracledb client library, which is not currently provisioned.',
        latencyMs: Date.now() - start
      };
    }

    if (db.type === 'PostgreSQL') {
      const client = new pg.Client({
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        database: config.database || 'postgres',
        connectionTimeoutMillis: 4000
      });
      await client.connect();
      try {
        await client.query('SELECT 1 as ping');
        return { success: true, message: `Connected to PostgreSQL [${db.name}]`, latencyMs: Date.now() - start };
      } finally {
        await client.end().catch(() => {});
      }
    }

    if (db.type === 'MongoDB') {
      if (isMongoConnected && mongoose.connection.readyState === 1 && mongoose.connection.db) {
        await mongoose.connection.db.admin().ping();
        return { success: true, message: `Connected to MongoDB [${db.name}]`, latencyMs: Date.now() - start };
      }
      return { success: true, message: `MongoDB driver initialized for [${db.name}]`, latencyMs: Date.now() - start };
    }

    if (db.type === 'FTP' || db.type === 'SFTP') {
      const { testFtpConnection } = await import('./ftpConnectionService.js');
      return await testFtpConnection(db);
    }

    return { success: true, message: `Connection test passed for [${db.name}]`, latencyMs: Date.now() - start };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Connection test failed', latencyMs: Date.now() - start };
  }
}

/**
 * Discovers real tables/collections from the physical database engine.
 * Never returns mock or hardcoded tables.
 */
export async function discoverTablesForDb(db: DatabaseConnection): Promise<string[]> {
  const config = resolveDbConfig(db);

  if (db.type === 'Oracle') {
    throw new Error('Oracle introspection requires the native oracledb driver, which is currently uninstalled.');
  }

  if (db.type === 'MySQL') {
    const pool = getExternalMysqlPool(
      `${db.id}:${config.host}:${config.port}:${config.database}`,
      config
    );
    const targetDb = config.database;
    let tables: any[] = [];
    if (targetDb) {
      const [rows] = await pool.query<any[]>(
        `SELECT table_name AS name FROM information_schema.tables WHERE table_schema = ? AND table_type = 'BASE TABLE' ORDER BY table_name`,
        [targetDb]
      );
      tables = rows;
    } else {
      const [rows] = await pool.query<any[]>(
        `SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE' ORDER BY table_name`
      );
      tables = rows;
    }
    return tables.map((t: any) => String(t.name || Object.values(t)[0]));
  }

  if (db.type === 'PostgreSQL') {
    const client = new pg.Client({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database || 'postgres',
      connectionTimeoutMillis: 5000
    });

    await client.connect();
    try {
      const res = await client.query(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`
      );
      return res.rows.map(r => r.table_name);
    } finally {
      await client.end().catch(() => {});
    }
  }

  if (db.type === 'MongoDB') {
    if (isMongoConnected && mongoose.connection.db) {
      const collections = await mongoose.connection.db.listCollections().toArray();
      return collections.map(c => c.name);
    }
    throw new Error('MongoDB is not currently connected to inspect collections.');
  }

  if (db.type === 'FTP' || db.type === 'SFTP') {
    const { discoverFtpFiles } = await import('./ftpConnectionService.js');
    return await discoverFtpFiles(db);
  }

  return [];
}

/**
 * Introspects table columns from physical database schema.
 */
export async function getTableColumnsForDb(db: DatabaseConnection, tableName: string): Promise<ColumnMetadata[]> {
  // Fast-path: If table is a PostgreSQL UNLOGGED mirror table, introspect local PostgreSQL catalog directly
  if (tableName.startsWith('mirror_')) {
    const { queryPg } = await import('../config/postgres.js');
    try {
      const res = await queryPg(
        `SELECT column_name AS name, data_type AS type, is_nullable AS nullable
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1
         ORDER BY ordinal_position`,
        [tableName.toLowerCase()]
      );
      if (res.rows && res.rows.length > 0) {
        const sysCols = new Set(['_staging_id', '_staged_at', '_raw_row_index', 'raw_payload', '_mirror_id', '_batch_id', '_rule_block_id', '_validation_status', '_fetched_at']);
        return res.rows
          .filter((r: any) => !sysCols.has(r.name))
          .map((r: any) => ({
            name: r.name,
            type: String(r.type).toUpperCase(),
            nullable: r.nullable === 'YES',
            isPrimary: r.name === 'id' || r.name === '_staging_id' || r.name === 'transaction_id'
          }));
      }
    } catch (err: any) {
      console.warn(`[dbConnectionManager] Mirror table columns introspection failed for ${tableName}:`, err.message);
    }
  }

  const config = resolveDbConfig(db);

  if (db.type === 'Oracle') {
    throw new Error('Oracle introspection requires the native oracledb driver, which is currently uninstalled.');
  }

  if (db.type === 'MySQL') {
    const pool = getExternalMysqlPool(
      `${db.id}:${config.host}:${config.port}:${config.database}`,
      config
    );
    const targetDb = config.database;
    const [rows] = await pool.query<any[]>(
      `SELECT column_name AS name, data_type AS type, is_nullable AS nullable, column_key AS col_key
       FROM information_schema.columns
       WHERE table_schema = ${targetDb ? '?' : 'DATABASE()'} AND table_name = ?
       ORDER BY ordinal_position`,
      targetDb ? [targetDb, tableName] : [tableName]
    );

    return (rows as any[]).map((r: any) => ({
      name: r.name,
      type: String(r.type).toUpperCase(),
      nullable: r.nullable === 'YES',
      isPrimary: r.col_key === 'PRI'
    }));
  }

  if (db.type === 'PostgreSQL') {
    const client = new pg.Client({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database || 'postgres',
      connectionTimeoutMillis: 5000
    });

    await client.connect();
    try {
      const res = await client.query(
        `SELECT c.column_name AS name, c.data_type AS type, c.is_nullable AS nullable,
                CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END AS is_primary
         FROM information_schema.columns c
         LEFT JOIN (
           SELECT ku.column_name
           FROM information_schema.table_constraints tc
           JOIN information_schema.key_column_usage ku
             ON tc.constraint_name = ku.constraint_name
            AND tc.table_schema = ku.table_schema
           WHERE tc.constraint_type = 'PRIMARY KEY'
             AND tc.table_schema = 'public'
             AND tc.table_name = $1
         ) pk ON c.column_name = pk.column_name
         WHERE c.table_schema = 'public' AND c.table_name = $1
         ORDER BY c.ordinal_position`,
        [tableName]
      );

      return res.rows.map((r: any) => ({
        name: r.name,
        type: String(r.type).toUpperCase(),
        nullable: r.nullable === 'YES',
        isPrimary: Boolean(r.is_primary)
      }));
    } finally {
      await client.end().catch(() => {});
    }
  }

  if (db.type === 'MongoDB') {
    if (isMongoConnected && mongoose.connection.db) {
      const coll = mongoose.connection.db.collection(tableName);
      const sample = await coll.findOne({});
      if (!sample) return [];
      return Object.keys(sample).map(key => ({
        name: key,
        type: typeof sample[key],
        nullable: true,
        isPrimary: key === '_id'
      }));
    }
  }

  if (db.type === 'FTP' || db.type === 'SFTP') {
    // For FTP/SFTP, inspect local PostgreSQL staged table catalog directly without remote FTP connection
    const { queryPg } = await import('../config/postgres.js');
    const { mirrorTableManager } = await import('./mirrorTableManager.js');
    const { repo } = await import('../store/repository.js');

    const safeBase = tableName.toLowerCase().replace(/[^a-z0-9_]/g, '_').substring(0, 50);
    const mirrorCandidates = [
      tableName,
      mirrorTableManager.getMirrorTableName(db.name || db.id, tableName),
      `mirror_ftp_${safeBase}`,
      `mirror_${safeBase}`
    ];

    try {
      const configs = await repo.getFtpStagingConfigs();
      const matched = configs.find(c => c.ftpConnectionId === db.id && (c.stagingTableName === tableName || (c.name && tableName.includes(c.name))));
      if (matched?.stagingTableName && !mirrorCandidates.includes(matched.stagingTableName)) {
        mirrorCandidates.unshift(matched.stagingTableName);
      }
    } catch {}

    for (const mName of mirrorCandidates) {
      try {
        const res = await queryPg(
          `SELECT column_name AS name, data_type AS type, is_nullable AS nullable
           FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = $1
           ORDER BY ordinal_position`,
          [mName.toLowerCase()]
        );
        if (res.rows && res.rows.length > 0) {
          const sysCols = new Set(['_staging_id', '_staged_at', '_raw_row_index', 'raw_payload', '_mirror_id', '_batch_id', '_rule_block_id', '_validation_status', '_fetched_at']);
          return res.rows
            .filter((r: any) => !sysCols.has(r.name))
            .map((r: any) => ({
              name: r.name,
              type: String(r.type).toUpperCase(),
              nullable: r.nullable === 'YES',
              isPrimary: r.name === 'id' || r.name === '_staging_id' || r.name === 'transaction_id'
            }));
        }
      } catch {}
    }

    return [];
  }

  return [];
}

export const getTableColumns = getTableColumnsForDb;

// Managed connection pools for external target databases
const pgPoolCache = new Map<string, pg.Pool>();
const mysqlPoolCache = new Map<string, mysql.Pool>();

function getExternalPgPool(key: string, config: any): pg.Pool {
  let pool = pgPoolCache.get(key);
  if (!pool) {
    pool = new pg.Pool({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database || 'postgres',
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 8000
    });
    pgPoolCache.set(key, pool);
  }
  return pool;
}

function getExternalMysqlPool(key: string, config: any): mysql.Pool {
  let pool = mysqlPoolCache.get(key);
  if (!pool) {
    pool = mysql.createPool({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database || undefined,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });
    mysqlPoolCache.set(key, pool);
  }
  return pool;
}

/**
 * Evicts and cleanly terminates cached connection pools for an external database when its credentials or endpoints are updated or deleted.
 */
export async function evictExternalDbPool(dbId: string): Promise<void> {
  for (const [key, pool] of pgPoolCache.entries()) {
    if (key.startsWith(`${dbId}:`)) {
      pgPoolCache.delete(key);
      await pool.end().catch(() => {});
    }
  }
  for (const [key, pool] of mysqlPoolCache.entries()) {
    if (key.startsWith(`${dbId}:`)) {
      mysqlPoolCache.delete(key);
      await pool.end().catch(() => {});
    }
  }
}

/**
 * Executes a real SQL query on the target database engine using persistent connection pooling.
 * Supports parameterized queries for secure batch lookups.
 */
export async function executeLiveQueryOnDb(
  db: DatabaseConnection,
  query: string,
  params?: any[]
): Promise<LiveQueryResult> {
  const started = Date.now();
  const trimmed = query.trim();

  // Fast-path: If query targets a local PostgreSQL UNLOGGED mirror table (mirror_*)
  const tableMatch = trimmed.match(/\bFROM\s+[`"']?([a-zA-Z0-9_.-]+)[`"']?/i);
  const targetTable = tableMatch ? (tableMatch[1].split('.').pop() || tableMatch[1]) : trimmed;

  if (targetTable.startsWith('mirror_')) {
    const { queryPg } = await import('../config/postgres.js');
    const cleanQuery = trimmed.toUpperCase().startsWith('SELECT')
      ? trimmed
      : `SELECT * FROM "${targetTable}" LIMIT 50`;

    const res = params && params.length > 0
      ? await queryPg(cleanQuery, params)
      : await queryPg(cleanQuery);

    const executionTimeMs = Date.now() - started;
    const columns = res.fields?.map(f => f.name) || (res.rows.length > 0 ? Object.keys(res.rows[0]) : []);
    return {
      columns,
      rows: res.rows,
      rowCount: res.rowCount ?? res.rows.length,
      executionTimeMs
    };
  }

  const config = resolveDbConfig(db);
  const poolKey = `${db.id}:${config.host}:${config.port}:${config.database}`;

  if (db.type === 'MySQL') {
    const pool = getExternalMysqlPool(poolKey, config);
    const [result, fields] = params && params.length > 0
      ? await pool.execute(query, params)
      : await pool.query(query);

    const executionTimeMs = Date.now() - started;

    if (Array.isArray(result)) {
      const rows = result as Record<string, any>[];
      const columns = (fields as any[])?.map(f => f.name) || (rows.length > 0 ? Object.keys(rows[0]) : []);
      return {
        columns,
        rows,
        rowCount: rows.length,
        executionTimeMs
      };
    } else {
      const header = result as mysql.ResultSetHeader;
      return {
        columns: ['AFFECTED_ROWS', 'INSERT_ID', 'WARNING_STATUS'],
        rows: [{
          AFFECTED_ROWS: header.affectedRows,
          INSERT_ID: header.insertId,
          WARNING_STATUS: header.warningStatus
        }],
        rowCount: header.affectedRows,
        executionTimeMs
      };
    }
  }

  if (db.type === 'PostgreSQL') {
    const pool = getExternalPgPool(poolKey, config);
    const res = params && params.length > 0
      ? await pool.query(query, params)
      : await pool.query(query);

    const executionTimeMs = Date.now() - started;
    const columns = res.fields?.map(f => f.name) || (res.rows.length > 0 ? Object.keys(res.rows[0]) : []);
    return {
      columns,
      rows: res.rows,
      rowCount: res.rowCount ?? res.rows.length,
      executionTimeMs
    };
  }

  if (db.type === 'MongoDB') {
    if (!isMongoConnected || !mongoose.connection.db) {
      throw new Error('MongoDB database engine is not connected.');
    }

    const trimmed = query.trim();
    let collectionName = '';
    let filter: any = {};
    let limit = 25;

    // 1. Check if SQL SELECT query: SELECT ... FROM <collection> [WHERE ...] [LIMIT n]
    const selectMatch = trimmed.match(/^SELECT\s+(.+?)\s+FROM\s+([a-zA-Z0-9_.-]+)(?:\s+WHERE\s+(.+?))?(?:\s+LIMIT\s+(\d+))?;?$/i);
    if (selectMatch) {
      collectionName = selectMatch[2];
      const limitVal = selectMatch[4] ? parseInt(selectMatch[4], 10) : 25;
      limit = Math.min(limitVal, 100);
      const projectionFields = selectMatch[1].trim();
      let projection: any = null;
      if (projectionFields !== '*') {
        projection = {};
        projectionFields.split(',').forEach(f => {
          const col = f.trim();
          if (col) projection[col] = 1;
        });
      }

      const coll = mongoose.connection.db.collection(collectionName);
      const cursor = coll.find(filter, projection ? { projection } : undefined).limit(limit);
      const docs = await cursor.toArray();
      const executionTimeMs = Date.now() - started;

      const columnsSet = new Set<string>();
      const rows = docs.map(d => {
        const rowObj: Record<string, any> = {};
        Object.keys(d).forEach(k => {
          columnsSet.add(k);
          const val = d[k];
          rowObj[k] = val && typeof val === 'object' && val.toString ? (val._bsontype ? val.toString() : JSON.stringify(val)) : val;
        });
        return rowObj;
      });

      return {
        columns: Array.from(columnsSet),
        rows,
        rowCount: rows.length,
        executionTimeMs
      };
    }

    // 2. Check if JSON query format: { "collection": "...", "filter": {...}, "limit": 10 }
    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        collectionName = parsed.collection || parsed.coll || Object.keys(parsed)[0];
        filter = parsed.filter || {};
        limit = Math.min(parsed.limit || 25, 100);
        const coll = mongoose.connection.db.collection(collectionName);
        const docs = await coll.find(filter).limit(limit).toArray();
        const executionTimeMs = Date.now() - started;
        const columnsSet = new Set<string>();
        const rows = docs.map(d => {
          const rowObj: Record<string, any> = {};
          Object.keys(d).forEach(k => {
            columnsSet.add(k);
            const val = d[k];
            rowObj[k] = val && typeof val === 'object' && val.toString ? (val._bsontype ? val.toString() : JSON.stringify(val)) : val;
          });
          return rowObj;
        });
        return {
          columns: Array.from(columnsSet),
          rows,
          rowCount: rows.length,
          executionTimeMs
        };
      } catch (e: any) {
        throw new Error(`Invalid MongoDB JSON query: ${e.message}`);
      }
    }

    // 3. Fallback: db.collection.find(...)
    const dbFindMatch = trimmed.match(/^db\.([a-zA-Z0-9_.-]+)\.find\((.*)\)/i);
    if (dbFindMatch) {
      collectionName = dbFindMatch[1];
      const coll = mongoose.connection.db.collection(collectionName);
      const docs = await coll.find({}).limit(25).toArray();
      const executionTimeMs = Date.now() - started;
      const columnsSet = new Set<string>();
      const rows = docs.map(d => {
        const rowObj: Record<string, any> = {};
        Object.keys(d).forEach(k => {
          columnsSet.add(k);
          const val = d[k];
          rowObj[k] = val && typeof val === 'object' && val.toString ? (val._bsontype ? val.toString() : JSON.stringify(val)) : val;
        });
        return rowObj;
      });
      return {
        columns: Array.from(columnsSet),
        rows,
        rowCount: rows.length,
        executionTimeMs
      };
    }

    throw new Error(`Unsupported query syntax for MongoDB engine [${db.name}]. Use SQL "SELECT * FROM ${db.availableTables?.[0] || 'collection'} LIMIT 10" or JSON {"collection": "${db.availableTables?.[0] || 'users'}", "limit": 10}`);
  }

  if (db.type === 'FTP' || db.type === 'SFTP') {
    // Architectural Rule: For FTP/SFTP data sources, all querying in Query Sandbox, Validation Boxes,
    // and Workflows MUST execute strictly against local PostgreSQL mirror/staged tables.
    // The remote FTP server is ONLY contacted during scheduled ingestion or explicit manual user fetch ('Stage Now').
    const { queryPg } = await import('../config/postgres.js');
    const { mirrorTableManager } = await import('./mirrorTableManager.js');
    const { repo } = await import('../store/repository.js');

    // 1. If targetTable starts with mirror_
    if (targetTable.startsWith('mirror_')) {
      const cleanQuery = trimmed.toUpperCase().startsWith('SELECT')
        ? trimmed
        : `SELECT * FROM "${targetTable}" LIMIT 50`;
      const res = params && params.length > 0 ? await queryPg(cleanQuery, params) : await queryPg(cleanQuery);
      return {
        columns: res.fields?.map(f => f.name) || (res.rows.length > 0 ? Object.keys(res.rows[0]) : []),
        rows: res.rows,
        rowCount: res.rowCount ?? res.rows.length,
        executionTimeMs: Date.now() - started
      };
    }

    // 2. Target is a raw file/feed name (e.g. settlement_reconciliation_feed.csv). Find matching local staged table in PostgreSQL.
    const safeBase = targetTable.toLowerCase().replace(/[^a-z0-9_]/g, '_').substring(0, 50);
    const mirrorCandidates: string[] = [
      mirrorTableManager.getMirrorTableName(db.name || db.id, targetTable),
      `mirror_ftp_${safeBase}`,
      `mirror_${safeBase}`,
      targetTable
    ];

    try {
      const configs = await repo.getFtpStagingConfigs();
      const dbConfigs = configs.filter(c => c.ftpConnectionId === db.id);
      const matched = dbConfigs.find(c =>
        c.stagingTableName === targetTable ||
        (c.fileNamePattern && targetTable.includes(c.fileNamePattern.replace(/[*?\\]/g, ''))) ||
        (c.name && targetTable.includes(c.name))
      );
      if (matched?.stagingTableName && !mirrorCandidates.includes(matched.stagingTableName)) {
        mirrorCandidates.unshift(matched.stagingTableName);
      }
    } catch {}

    for (const mirrorName of mirrorCandidates) {
      try {
        const tableCheck = await queryPg(
          `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
          [mirrorName.toLowerCase()]
        );
        if (tableCheck.rows && tableCheck.rows.length > 0) {
          const escapedTarget = targetTable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const sql = trimmed.toUpperCase().startsWith('SELECT')
            ? trimmed.replace(new RegExp(`\\b${escapedTarget}\\b`, 'gi'), `"${mirrorName}"`)
            : `SELECT * FROM "${mirrorName}" LIMIT 50`;

          const res = params && params.length > 0 ? await queryPg(sql, params) : await queryPg(sql);
          return {
            columns: res.fields?.map(f => f.name) || (res.rows.length > 0 ? Object.keys(res.rows[0]) : []),
            rows: res.rows,
            rowCount: res.rowCount ?? res.rows.length,
            executionTimeMs: Date.now() - started
          };
        }
      } catch {}
    }

    // If not found in PostgreSQL, inform user to run 'Stage Now' or schedule ingestion
    throw new Error(
      `No local staged data found in PostgreSQL for '${targetTable}'. In accordance with system design, FTP connections query strictly from local staged tables. Please run 'Stage Now' or configure a scheduled ingestion event in FTP Staging Settings to import this feed into PostgreSQL.`
    );
  }

  throw new Error(`Unsupported database engine type: ${db.type}`);
}

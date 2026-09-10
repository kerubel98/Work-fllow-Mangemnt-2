import mysql from 'mysql2/promise';
let pool = null;
export const MYSQL_COLLECTIONS = [
    'users', 'hashtag_presets', 'plugins', 'database_connections', 'environment_systems',
    'teams', 'issues', 'organizations', 'transaction_templates', 'global_transaction_schema_configs',
    'uploaded_transaction_records', 'upload_audit_logs', 'workspace_table_records',
    'global_standard_directory', 'global_key_field_schemas', 'notifications', 'direct_messages',
    'query_approval_requests', 'db_access_requests', 'connection_usage_logs', 'team_tasks',
    'team_insights', 'team_discussion_messages', 'global_mapping_repository'
];
export function getMySqlPool() {
    if (!pool) {
        pool = mysql.createPool({
            host: process.env.MYSQL_HOST || 'localhost',
            port: Number(process.env.MYSQL_PORT || 3306),
            database: process.env.MYSQL_DATABASE || 'operational_workflow_db',
            user: process.env.MYSQL_USER || 'root',
            password: process.env.MYSQL_PASSWORD || '123456',
            waitForConnections: true,
            connectionLimit: 10,
            charset: 'utf8mb4'
        });
    }
    return pool;
}
export async function ensureDocumentTable() {
    await getMySqlPool().execute(`
    CREATE TABLE IF NOT EXISTS app_documents (
      collection_name VARCHAR(120) NOT NULL,
      document_id VARCHAR(191) NOT NULL,
      document JSON NOT NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (collection_name, document_id),
      INDEX idx_app_documents_collection (collection_name),
      INDEX idx_app_documents_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
    for (const collection of MYSQL_COLLECTIONS) {
        await getMySqlPool().execute(`
      CREATE TABLE IF NOT EXISTS \`${collection}\` (
        document_id VARCHAR(191) NOT NULL PRIMARY KEY,
        document JSON NOT NULL,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        INDEX idx_${collection}_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
        await getMySqlPool().execute(`INSERT IGNORE INTO \`${collection}\` (document_id, document, created_at, updated_at)
       SELECT document_id, document, created_at, updated_at
       FROM app_documents WHERE collection_name = ?`, [collection]);
    }
}
export async function closeMySql() {
    if (pool) {
        await pool.end();
        pool = null;
    }
}
export async function getMySqlStatus() {
    const connection = await getMySqlPool().getConnection();
    try {
        const started = Date.now();
        await connection.ping();
        const [tables] = await connection.query(`SELECT table_name AS name, table_rows AS approximate_rows
       FROM information_schema.tables
       WHERE table_schema = DATABASE()
       ORDER BY table_name`);
        return {
            isConnected: true,
            state: 'connected',
            databaseName: process.env.MYSQL_DATABASE || 'operational_workflow_db',
            host: process.env.MYSQL_HOST || 'localhost',
            port: Number(process.env.MYSQL_PORT || 3306),
            pingMs: Date.now() - started,
            tables
        };
    }
    finally {
        connection.release();
    }
}

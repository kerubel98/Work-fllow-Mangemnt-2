import pg from 'pg';
import { discoverFtpFilesRecursive } from '../services/ftpConnectionService.ts';
const pool = new pg.Pool({
    connectionString: 'postgresql://postgres:123456@localhost:5432/operational_workflow_db'
});
async function main() {
    try {
        const dbRes = await pool.query("SELECT * FROM database_connections WHERE id = 'db-1789318844365'");
        if (dbRes.rows.length === 0) {
            console.log('Database connection not found');
            return;
        }
        const db = dbRes.rows[0];
        console.log('FTP DB:', { name: db.name, type: db.type, host: db.host, port: db.port, user: db.username, baseDir: db.database_name });
        console.log('Scanning all files on FTP server recursively...');
        const files = await discoverFtpFilesRecursive(db, undefined, 8);
        console.log(`Found ${files.length} files on FTP server:`);
        files.forEach(f => {
            console.log(` - fullPath: "${f.fullPath}" | relativeFolder: "${f.relativeFolder}" | name: "${f.name}"`);
        });
    }
    catch (err) {
        console.error('Error scanning FTP:', err);
    }
    finally {
        await pool.end();
    }
}
main();

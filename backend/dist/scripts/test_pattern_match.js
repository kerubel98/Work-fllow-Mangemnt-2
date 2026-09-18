import pg from 'pg';
import { discoverFtpFilesRecursive } from '../services/ftpConnectionService.ts';
const pool = new pg.Pool({
    connectionString: 'postgresql://postgres:123456@localhost:5432/operational_workflow_db'
});
async function main() {
    const dbRes = await pool.query("SELECT * FROM database_connections WHERE id = 'db-1789318844365'");
    const db = dbRes.rows[0];
    const files = await discoverFtpFilesRecursive(db, '/', 8);
    const patterns = [
        '*/Card/Settlemnt/*/*/*_Settlemnt.xls',
        '*/Card/*/*/*Settlem*.xls',
        '*/Card/*Settl*/*_Settlemnt.xls',
        '*/Card/*/*_settlemnt.xls'
    ];
    console.log(`Total files found on FTP: ${files.length}`);
    for (const pat of patterns) {
        const rx = new RegExp('^' + pat.toLowerCase().replace(/\*/g, '.*') + '$', 'i');
        const matched = files.filter(f => rx.test(f.fullPath) || rx.test(f.name));
        console.log(`\nPattern: "${pat}" matched ${matched.length} files:`);
        matched.forEach(m => console.log('  ->', m.fullPath));
    }
    await pool.end();
}
main();

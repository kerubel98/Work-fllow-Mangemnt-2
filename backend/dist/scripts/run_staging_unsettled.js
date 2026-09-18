import pg from 'pg';
import { ftpFileStagingService } from '../services/ftpFileStagingService.ts';
const pool = new pg.Pool({
    connectionString: 'postgresql://postgres:123456@localhost:5432/operational_workflow_db'
});
async function main() {
    try {
        const dbRes = await pool.query("SELECT * FROM database_connections WHERE id = 'db-1789318844365'");
        const db = dbRes.rows[0];
        // Fetch Unsettled config
        const cfgRes = await pool.query("SELECT * FROM ftp_file_staging_configs WHERE id = 'stg-1789418738032-s6mv'");
        const config = cfgRes.rows[0];
        console.log(`Executing staging for Unsettled with pattern: "${config.file_name_pattern}"...`);
        const clientConfig = {
            ...config,
            fileNamePattern: config.file_name_pattern,
            fieldMappings: config.field_mappings,
            excelSheetName: config.excel_sheet_name,
            headerRowIndex: config.header_row_index,
            dataStartRow: config.data_start_row,
            stagingTableName: config.staging_table_name,
            stagingMode: 'APPEND'
        };
        const result = await ftpFileStagingService.stageFtpFileForValidation(db, clientConfig);
        console.log('Staging result:', result);
        const check = await pool.query(`
      SELECT 
        _source_folder, 
        _source_file, 
        count(*) as row_count 
      FROM "${config.staging_table_name}" 
      GROUP BY _source_folder, _source_file
      ORDER BY _source_folder
    `);
        console.log('\n--- VERIFIED UNSETTLED ROWS IN MIRROR TABLE ---');
        console.table(check.rows);
    }
    catch (err) {
        console.error('Error during unsettled staging:', err);
    }
    finally {
        await pool.end();
    }
}
main();

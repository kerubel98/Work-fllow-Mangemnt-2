import pg from 'pg';
import { ftpFileStagingService } from '../services/ftpFileStagingService.ts';
const pool = new pg.Pool({
    connectionString: 'postgresql://postgres:123456@localhost:5432/operational_workflow_db'
});
async function main() {
    try {
        const dbRes = await pool.query("SELECT * FROM database_connections WHERE id = 'db-1789318844365'");
        const db = dbRes.rows[0];
        console.log('--- Inspecting AIB Settlement ---');
        const aib = await ftpFileStagingService.inspectFtpFileStructure(db, '/AIB/Card/Settlemnt/2026/sep/AIB_2026.08.29_Settlemnt.xls');
        console.log('AIB sheets:', aib.excelSheets);
        console.log('AIB header:', aib.suggestedHeaderRow, 'data start:', aib.suggestedDataStartRow);
        console.log('\n--- Inspecting BIB Settlement ---');
        const bib = await ftpFileStagingService.inspectFtpFileStructure(db, '/BIB/Card/Settlement/2026/sep/CBE BRR_2854_Settlemnt.xls');
        console.log('BIB sheets:', bib.excelSheets);
        console.log('BIB header:', bib.suggestedHeaderRow, 'data start:', bib.suggestedDataStartRow);
        const aibPreview = await ftpFileStagingService.testPreviewParse(db, {
            fileFormat: 'EXCEL',
            fileNamePattern: '/AIB/Card/Settlemnt/2026/sep/AIB_2026.08.29_Settlemnt.xls',
            hasHeader: true,
            headerRowIndex: aib.suggestedHeaderRow,
            dataStartRowIndex: aib.suggestedDataStartRow,
            excelSheetName: aib.excelSheets?.[0]?.name
        });
        const bibPreview = await ftpFileStagingService.testPreviewParse(db, {
            fileFormat: 'EXCEL',
            fileNamePattern: '/BIB/Card/Settlement/2026/sep/CBE BRR_2854_Settlemnt.xls',
            hasHeader: true,
            headerRowIndex: bib.suggestedHeaderRow,
            dataStartRowIndex: bib.suggestedDataStartRow,
            excelSheetName: bib.excelSheets?.[0]?.name
        });
        console.log('\nAIB columns (sample row keys):', Object.keys(aibPreview.parsedRowsSample[0] || {}));
        console.log('BIB columns (sample row keys):', Object.keys(bibPreview.parsedRowsSample[0] || {}));
        console.log('AIB row count sample:', aibPreview.parsedRowsSample.length);
        console.log('BIB row count sample:', bibPreview.parsedRowsSample.length);
    }
    catch (err) {
        console.error('Error inspecting:', err);
    }
    finally {
        await pool.end();
    }
}
main();

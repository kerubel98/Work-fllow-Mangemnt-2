import { Client } from 'ssh2';
import * as XLSX from 'xlsx';

const conn = new Client();
conn.on('ready', () => {
  conn.sftp((err, sftp) => {
    if (err) throw err;
    const remotePath = 'AIB/Card/Unsettled/2026/Sep/AIB_9-10-26-Unsettled.xls';
    const stream = sftp.createReadStream(remotePath);
    const chunks = [];
    stream.on('data', chunk => chunks.push(chunk));
    stream.on('end', () => {
      const buffer = Buffer.concat(chunks);
      console.log(`Downloaded ${buffer.length} bytes for ${remotePath}`);
      const wb = XLSX.read(buffer, { type: 'buffer' });
      console.log('Sheet names:', wb.SheetNames);
      const firstSheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
      console.log('First 5 rows:');
      rows.slice(0, 5).forEach((r, i) => console.log(` Row ${i + 1}:`, r));
      conn.end();
    });
  });
}).connect({
  host: '127.0.0.1',
  port: 22,
  username: 'ftpuser1',
  password: '123456'
});

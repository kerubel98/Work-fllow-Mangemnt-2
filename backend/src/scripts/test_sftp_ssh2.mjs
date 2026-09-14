import { Client } from 'ssh2';

const conn = new Client();

conn.on('ready', () => {
  conn.sftp((err, sftp) => {
    if (err) {
      console.error('SFTP error:', err);
      conn.end();
      return;
    }

    async function walk(dir) {
      return new Promise((resolve) => {
        sftp.readdir(dir, async (err, list) => {
          if (err) {
            console.error(`Error reading ${dir}:`, err.message);
            return resolve([]);
          }
          console.log(`\n=== Directory: ${dir} ===`);
          const items = [];
          for (const item of list) {
            const isDir = item.longname.startsWith('d') || (item.attrs.mode & 0o40000) === 0o40000;
            console.log(` [${isDir ? 'DIR' : 'FILE'}] ${item.filename} (Size: ${item.attrs.size} bytes)`);
            const subpath = dir === '.' || dir === '/' ? item.filename : `${dir}/${item.filename}`;
            if (isDir && item.filename !== '.' && item.filename !== '..') {
              await walk(subpath);
            }
          }
          resolve(items);
        });
      });
    }

    walk('.').then(() => {
      conn.end();
    });
  });
}).on('error', (err) => {
  // ignore
}).connect({
  host: '127.0.0.1',
  port: 22,
  username: 'ftpuser1',
  password: '123456'
});

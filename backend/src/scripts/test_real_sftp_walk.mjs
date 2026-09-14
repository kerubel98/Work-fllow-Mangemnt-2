import { Client } from 'ssh2';

function resolveFileType(name) {
  const ext = name.toLowerCase().slice(name.lastIndexOf('.'));
  if (ext === '.xlsx' || ext === '.xls') return 'EXCEL';
  if (ext === '.csv' || ext === '.tsv') return 'CSV';
  if (ext === '.xml') return 'XML';
  if (ext === '.txt' || ext === '.dat') return 'TXT';
  if (ext === '.json') return 'JSON';
  return 'OTHER';
}

function readdirAsync(sftp, dir) {
  return new Promise((resolve, reject) => {
    sftp.readdir(dir, (err, list) => {
      if (err) return reject(err);
      resolve(list);
    });
  });
}

export async function discoverSftpFilesRecursive(config, baseDirOverride, maxDepth = 6) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn.on('error', (err) => {
      // ignore ECONNRESET on close
    });

    conn.on('ready', async () => {
      conn.sftp(async (err, sftp) => {
        if (err) {
          conn.end();
          return reject(err);
        }

        const results = [];
        const rootDir = baseDirOverride || config.baseDirectory || '.';
        const validExtensions = new Set(['.csv', '.tsv', '.txt', '.json', '.dat', '.xml', '.xlsx', '.xls']);

        async function walk(currentDir, depth) {
          if (depth > maxDepth) return;
          try {
            const list = await readdirAsync(sftp, currentDir);
            for (const item of list) {
              if (item.filename === '.' || item.filename === '..') continue;
              const isDir = item.longname.startsWith('d') || (item.attrs.mode & 0o40000) === 0o40000;
              const fullPath = currentDir === '.' || currentDir === '/'
                ? item.filename
                : `${currentDir.replace(/\/+$/, '')}/${item.filename}`;

              const relativeFolder = currentDir === '.' ? '/' : (currentDir.startsWith('/') ? currentDir : `/${currentDir}`);

              if (!isDir) {
                const ext = item.filename.toLowerCase().slice(item.filename.lastIndexOf('.'));
                if (validExtensions.has(ext) || !item.filename.includes('.')) {
                  results.push({
                    name: item.filename,
                    fullPath: fullPath.startsWith('/') ? fullPath : `/${fullPath}`,
                    relativeFolder,
                    size: item.attrs.size || 0,
                    modifiedAt: item.attrs.mtime ? new Date(item.attrs.mtime * 1000).toISOString() : undefined,
                    fileType: resolveFileType(item.filename)
                  });
                }
              } else {
                await walk(fullPath, depth + 1);
              }
            }
          } catch (walkErr) {
            console.warn(`[sftp] Cannot read dir ${currentDir}:`, walkErr.message);
          }
        }

        try {
          const startDir = rootDir === '/' ? '.' : rootDir;
          await walk(startDir, 1);
          conn.end();
          resolve(results);
        } catch (e) {
          conn.end();
          reject(e);
        }
      });
    });

    conn.connect({
      host: config.host,
      port: config.port,
      username: config.user,
      password: config.password,
      readyTimeout: 10000
    });
  });
}

const config = {
  host: '127.0.0.1',
  port: 22,
  user: 'ftpuser1',
  password: '123456',
  baseDirectory: '.'
};

discoverSftpFilesRecursive(config).then(files => {
  console.log('REAL DISCOVERED SFTP FILES (Total count: ' + files.length + '):');
  console.log(JSON.stringify(files, null, 2));
}).catch(err => {
  console.error('Error:', err);
});

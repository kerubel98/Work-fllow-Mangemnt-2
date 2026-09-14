import { Client } from 'ssh2';

const conn = new Client();
conn.on('ready', () => {
  conn.sftp((err, sftp) => {
    if (err) throw err;
    sftp.readdir('.', (err, list) => {
      console.log('List of . ->', list);
      conn.end();
    });
  });
}).connect({
  host: '127.0.0.1',
  port: 22,
  username: 'ftpuser1',
  password: '123456'
});

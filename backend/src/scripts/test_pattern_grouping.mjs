import { discoverSftpFilesRecursive } from './test_real_sftp_walk.mjs';
import { groupFilesBySemanticPattern } from '../utils/ftpPatternGrouping.js';

async function test() {
  const files = await discoverSftpFilesRecursive({ host: '127.0.0.1', port: 22, user: 'ftpuser1', password: '123456' }, '/');
  const groups = groupFilesBySemanticPattern(files);
  console.log('DETECTED PATTERN GROUPS (Count: ' + groups.length + '):');
  for (const g of groups) {
    console.log('====================================');
    console.log('PATTERN:', g.pattern);
    console.log('FILE TYPE:', g.fileType);
    console.log('FILES COUNT:', g.fileCount);
    console.log('FOLDERS:', g.folders);
    console.log('SUGGESTED TABLE:', g.suggestedTableName);
    console.log('SAMPLE FILE:', g.sampleFile.fullPath);
  }
}
test().catch(e => console.error(e));


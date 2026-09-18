import fs from 'fs';
import path from 'path';

function search(dir) {
  const files = fs.readdirSync(dir);
  for (const f of files) {
    const full = path.join(dir, f);
    if (f === 'node_modules' || f === '.git' || f === 'dist') continue;
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      search(full);
    } else if (/\.(tsx|ts|jsx|js)$/.test(f)) {
      const text = fs.readFileSync(full, 'utf8');
      const lines = text.split('\n');
      lines.forEach((line, idx) => {
        const l = line.toLowerCase();
        if (l.includes('report') && (l.includes('inspect') || l.includes('fail') || l.includes('pass') || l.includes('verdict'))) {
          console.log(`${full}:${idx+1}: ${line.trim().slice(0, 130)}`);
        }
      });
    }
  }
}

search('frontend/src');
search('backend/src');

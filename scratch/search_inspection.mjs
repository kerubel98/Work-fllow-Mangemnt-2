import fs from 'fs';
import path from 'path';

function searchDir(dir, patterns) {
  const files = fs.readdirSync(dir);
  for (const f of files) {
    const full = path.join(dir, f);
    if (f === 'node_modules' || f === '.git' || f === 'dist') continue;
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      searchDir(full, patterns);
    } else if (/\.(tsx|ts|jsx|js)$/.test(f)) {
      const content = fs.readFileSync(full, 'utf8');
      const lines = content.split('\n');
      lines.forEach((line, idx) => {
        for (const p of patterns) {
          if (line.toLowerCase().includes(p.toLowerCase())) {
            console.log(`${full}:${idx+1} [${p}] ${line.trim().slice(0, 120)}`);
          }
        }
      });
    }
  }
}

searchDir('frontend/src', ['report inspect', 'inspection', 'report status', 'overallStatus', 'report say', 'all passed']);

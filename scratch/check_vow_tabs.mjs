import fs from 'fs';

const content = fs.readFileSync('frontend/src/components/investigation/ValidationOrchestratorWorkspace.tsx', 'utf8');
const lines = content.split('\n');

lines.forEach((line, idx) => {
  const l = line.toLowerCase();
  if (l.includes('activetab') || l.includes('tab ===') || l.includes('tabs.') || l.includes('report') || l.includes('inspect')) {
    if (line.includes('button') || line.includes('onClick') || line.includes('Tab') || line.includes('inspect') || line.includes('Report')) {
      console.log(`${idx+1}: ${line.trim().slice(0, 120)}`);
    }
  }
});

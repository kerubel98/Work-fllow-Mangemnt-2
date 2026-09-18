import fs from 'fs';

const content = fs.readFileSync('frontend/src/components/investigation/ValidationOrchestratorWorkspace.tsx', 'utf8');
const lines = content.split('\n');

lines.forEach((line, idx) => {
  const l = line.toLowerCase();
  if (l.includes('fail') || l.includes('pass') || l.includes('verdict') || l.includes('status') || l.includes('inspect') || l.includes('report') || l.includes('discrepan')) {
    if (l.includes('badge') || l.includes('text-red') || l.includes('bg-red') || l.includes('text-emerald') || l.includes('bg-emerald') || l.includes('verdict') || l.includes('severity') || l.includes('accuracy') || l.includes('evaluat')) {
      console.log(`${idx+1}: ${line.trim().slice(0, 140)}`);
    }
  }
});

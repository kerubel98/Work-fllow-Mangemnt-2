import fs from 'fs';

const file = 'backend/src/store/postgresRepo.ts';
let content = fs.readFileSync(file, 'utf-8');
content = content.replace(
  `            JSON.stringify(effectiveLegs),\r\n            JSON.stringify(wfTablesEnvelope)`,
  `            JSON.stringify(effectiveLegs)`
);
content = content.replace(
  `            JSON.stringify(effectiveLegs),\n            JSON.stringify(wfTablesEnvelope)`,
  `            JSON.stringify(effectiveLegs)`
);
fs.writeFileSync(file, content, 'utf-8');
console.log('Removed wfTablesEnvelope parameter successfully!');

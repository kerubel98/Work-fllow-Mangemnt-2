import fs from 'fs';
const text = fs.readFileSync('frontend/src/types.ts', 'utf8');
const lines = text.split('\n');
lines.forEach((l, i) => {
  if (l.includes('ValidationResultStatus')) {
    console.log(`${i+1}: ${l}`);
  }
});

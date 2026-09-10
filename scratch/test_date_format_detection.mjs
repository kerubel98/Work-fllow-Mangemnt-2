function detectDateFormat(sampleValues) {
  const nonNull = (sampleValues || []).filter(v => v !== null && v !== undefined && String(v).trim() !== '');
  if (nonNull.length === 0) {
    return { format: 'UNKNOWN', confidence: 0, sampleNormalized: '', description: 'No date values available' };
  }

  let ddmmyyyyCount = 0;
  let mmddyyyyCount = 0;
  let yyyymmddCount = 0;
  let isoCount = 0;
  let epochCount = 0;

  for (const raw of nonNull) {
    const s = String(raw).trim();
    if (/^\d{10}(\d{3})?$/.test(s)) {
      epochCount++;
      continue;
    }
    if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}(T|\s|$)/.test(s)) {
      if (s.includes('T') || s.endsWith('Z')) {
        isoCount++;
      } else {
        yyyymmddCount++;
      }
      continue;
    }
    const slashMatch = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
    if (slashMatch) {
      const part1 = parseInt(slashMatch[1], 10);
      const part2 = parseInt(slashMatch[2], 10);
      if (part1 > 12 && part2 <= 12) {
        ddmmyyyyCount += 2;
      } else if (part2 > 12 && part1 <= 12) {
        mmddyyyyCount += 2;
      } else {
        ddmmyyyyCount++;
      }
    }
  }

  const sample = String(nonNull[0]);
  if (isoCount >= ddmmyyyyCount && isoCount >= mmddyyyyCount && isoCount >= yyyymmddCount && isoCount > 0) {
    return { format: 'ISO 8601', confidence: 0.95, sampleNormalized: sample, description: 'Standard ISO 8601' };
  }
  if (yyyymmddCount >= ddmmyyyyCount && yyyymmddCount >= mmddyyyyCount && yyyymmddCount > 0) {
    return { format: 'YYYY-MM-DD', confidence: 0.9, sampleNormalized: sample, description: 'Year-Month-Day' };
  }
  if (mmddyyyyCount > ddmmyyyyCount) {
    return { format: 'MM/DD/YYYY', confidence: 0.85, sampleNormalized: sample, description: 'US Month/Day/Year' };
  }
  if (ddmmyyyyCount > 0) {
    return { format: 'DD/MM/YYYY', confidence: 0.85, sampleNormalized: sample, description: 'Day/Month/Year' };
  }
  if (epochCount > 0) {
    return { format: 'Epoch Timestamp', confidence: 0.9, sampleNormalized: sample, description: 'Unix timestamp' };
  }
  return { format: 'Custom String Date', confidence: 0.5, sampleNormalized: sample, description: 'Unrecognized format' };
}

console.log('Testing Date Format Detection:');
const d1 = detectDateFormat(['15/08/2026', '24/12/2026', '01/01/2026']);
console.log('15/08/2026 ->', d1.format, '(Confidence:', d1.confidence, ')');
if (d1.format !== 'DD/MM/YYYY') throw new Error('Expected DD/MM/YYYY');

const d2 = detectDateFormat(['08/24/2026', '12/31/2026']);
console.log('08/24/2026 ->', d2.format, '(Confidence:', d2.confidence, ')');
if (d2.format !== 'MM/DD/YYYY') throw new Error('Expected MM/DD/YYYY');

const d3 = detectDateFormat(['2026-09-06 14:30:00']);
console.log('2026-09-06 14:30:00 ->', d3.format);
if (d3.format !== 'YYYY-MM-DD') throw new Error('Expected YYYY-MM-DD');

const d4 = detectDateFormat(['1725633600000']);
console.log('1725633600000 ->', d4.format);
if (d4.format !== 'Epoch Timestamp') throw new Error('Expected Epoch Timestamp');

console.log('✅ ALL DATE FORMAT DETECTION TESTS PASSED!');

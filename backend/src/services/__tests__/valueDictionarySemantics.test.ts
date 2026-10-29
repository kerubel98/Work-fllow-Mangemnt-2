import { describe, it, expect } from 'vitest';
import { translateWithDictionary, findUntranslatedValues } from '../valueDictionaryService.js';
import { ValueTranslationDictionary } from '../../types.js';

const base: ValueTranslationDictionary = {
  id: 'dict-sem-test',
  name: 'Institution IDs',
  description: '',
  category: 'BANK_CODES',
  mappings: [
    { sourceValue: '01', targetValue: 'Commercial Bank of Ethiopia' },
    { sourceValue: '02', targetValue: 'Awash Bank' }
  ]
};

describe('translateWithDictionary', () => {
  it('translates FORWARD by default and keeps legacy behaviour (trim + case-insensitive)', () => {
    const r = translateWithDictionary(base, ' 02 ');
    expect(r.matched).toBe(true);
    expect(r.output).toBe('Awash Bank');
    expect(r.matchedSide).toBe('source');
  });

  it('translates REVERSE using the target side only', () => {
    const d = { ...base, direction: 'REVERSE' as const };
    expect(translateWithDictionary(d, 'awash bank').output).toBe('02');
    expect(translateWithDictionary(d, '02').matched).toBe(false);
  });

  it('translates BOTH directions', () => {
    const d = { ...base, direction: 'BOTH' as const };
    expect(translateWithDictionary(d, '01').output).toBe('Commercial Bank of Ethiopia');
    expect(translateWithDictionary(d, 'Awash Bank').output).toBe('02');
  });

  it('honours case-sensitive and trim settings', () => {
    const d = {
      ...base,
      mappings: [{ sourceValue: 'ab', targetValue: 'x' }],
      caseSensitive: true,
      trimWhitespace: false
    };
    expect(translateWithDictionary(d, 'AB').matched).toBe(false);
    expect(translateWithDictionary(d, ' ab').matched).toBe(false);
    expect(translateWithDictionary(d, 'ab').matched).toBe(true);
  });

  it('applies each no-match policy', () => {
    expect(translateWithDictionary(base, '77').output).toBe('77');
    expect(translateWithDictionary({ ...base, noMatchPolicy: 'BLANK' }, '77').output).toBe('');
    expect(translateWithDictionary({ ...base, noMatchPolicy: 'USE_FALLBACK', defaultFallback: 'Unknown' }, '77').output).toBe('Unknown');
    const flagged = translateWithDictionary({ ...base, noMatchPolicy: 'FLAG' }, '77');
    expect(flagged.flagged).toBe(true);
    expect(flagged.output).toBe('77');
  });
});

describe('findUntranslatedValues', () => {
  it('returns unmatched values sorted by count and ignores blanks', () => {
    const out = findUntranslatedValues(base, [
      { value: '01', count: 500 },
      { value: '11', count: 9 },
      { value: '07', count: 128 },
      { value: '', count: 3 },
      { value: null, count: 2 }
    ]);
    expect(out).toEqual([
      { value: '07', count: 128 },
      { value: '11', count: 9 }
    ]);
  });

  it('is unaffected by a BLANK no-match policy on the dictionary', () => {
    const out = findUntranslatedValues({ ...base, noMatchPolicy: 'BLANK' }, [{ value: '07', count: 1 }]);
    expect(out).toHaveLength(1);
  });
});

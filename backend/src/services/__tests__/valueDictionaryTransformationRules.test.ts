import { describe, it, expect } from 'vitest';
import {
  translateWithDictionary,
  applyTransformationRule
} from '../valueDictionaryService.js';
import { ValueTranslationDictionary } from '../../types.js';

describe('Value Dictionary Transformation Rules', () => {
  describe('applyTransformationRule helper', () => {
    it('applies TRIM rule properly', () => {
      expect(applyTransformationRule('TRIM', '   hello world   ')).toBe('hello world');
    });

    it('applies UPPERCASE rule properly', () => {
      expect(applyTransformationRule('UPPERCASE', 'telebirr')).toBe('TELEBIRR');
    });

    it('applies LOWERCASE rule properly', () => {
      expect(applyTransformationRule('LOWERCASE', 'AWASH_BANK')).toBe('awash_bank');
    });

    it('applies TITLECASE rule properly', () => {
      expect(applyTransformationRule('TITLECASE', 'commercial bank of ethiopia')).toBe('Commercial Bank Of Ethiopia');
    });

    it('applies STRIP_CURRENCY / CLEAN_AMOUNT properly', () => {
      expect(applyTransformationRule('STRIP_CURRENCY', '$1,250.50')).toBe('1250.50');
      expect(applyTransformationRule('STRIP_CURRENCY', 'ETB 50,000.00')).toBe('50000.00');
    });

    it('applies PHONE_ET properly', () => {
      expect(applyTransformationRule('PHONE_ET', '0911223344')).toBe('+251911223344');
      expect(applyTransformationRule('PHONE_ET', '0711223344')).toBe('+251711223344');
      expect(applyTransformationRule('PHONE_ET', '251911223344')).toBe('+251911223344');
      expect(applyTransformationRule('PHONE_ET', '+251911223344')).toBe('+251911223344');
    });

    it('applies MASK_PAN properly', () => {
      expect(applyTransformationRule('MASK_PAN', '4111222233334444')).toBe('4111********4444');
    });

    it('applies DATE_ISO properly', () => {
      expect(applyTransformationRule('DATE_ISO', '2026-11-21T18:00:00Z')).toBe('2026-11-21');
    });
  });

  describe('translateWithDictionary with Pre- and Post-Transform Rules', () => {
    const bankDict: ValueTranslationDictionary = {
      id: 'dict-bank-test',
      name: 'Test Bank Code Dictionary',
      description: 'Mapping bank codes with pre-transform',
      category: 'BANK_CODES',
      direction: 'FORWARD',
      caseSensitive: false,
      trimWhitespace: true,
      mappings: [
        { sourceValue: '01', targetValue: 'Commercial Bank of Ethiopia' },
        { sourceValue: '02', targetValue: 'Awash International Bank' },
        { sourceValue: '1000', targetValue: 'One Thousand ETB Tier' }
      ]
    };

    it('normalizes currency input via preTransformRule before dictionary lookup', () => {
      const dictWithPre: ValueTranslationDictionary = {
        ...bankDict,
        preTransformRule: 'STRIP_CURRENCY'
      };

      // Raw input has currency symbols and commas "$1,000"
      const res = translateWithDictionary(dictWithPre, '$1,000');
      expect(res.matched).toBe(true);
      expect(res.preTransformedInput).toBe('1000');
      expect(res.output).toBe('One Thousand ETB Tier');
    });

    it('normalizes Ethiopian phone via preTransformRule before dictionary lookup', () => {
      const phoneDict: ValueTranslationDictionary = {
        id: 'dict-phone-test',
        name: 'Phone Provider Dictionary',
        description: 'Mapping normalized phone to operator',
        category: 'CUSTOM',
        direction: 'FORWARD',
        preTransformRule: 'PHONE_ET',
        mappings: [
          { sourceValue: '+251911223344', targetValue: 'Ethio Telecom VIP' },
          { sourceValue: '+251711223344', targetValue: 'Safaricom Direct' }
        ]
      };

      // Input is local Ethiopian format "0911223344"
      const res1 = translateWithDictionary(phoneDict, '0911223344');
      expect(res1.matched).toBe(true);
      expect(res1.preTransformedInput).toBe('+251911223344');
      expect(res1.output).toBe('Ethio Telecom VIP');

      // Input is Safaricom local "0711223344"
      const res2 = translateWithDictionary(phoneDict, '0711223344');
      expect(res2.matched).toBe(true);
      expect(res2.preTransformedInput).toBe('+251711223344');
      expect(res2.output).toBe('Safaricom Direct');
    });

    it('applies postTransformRule on matched target value', () => {
      const dictWithPost: ValueTranslationDictionary = {
        ...bankDict,
        postTransformRule: 'UPPERCASE'
      };

      const res = translateWithDictionary(dictWithPost, '01');
      expect(res.matched).toBe(true);
      expect(res.output).toBe('COMMERCIAL BANK OF ETHIOPIA');
      expect(res.postTransformedOutput).toBe('COMMERCIAL BANK OF ETHIOPIA');
    });

    it('chains preTransformRule and postTransformRule together', () => {
      const chainedDict: ValueTranslationDictionary = {
        ...bankDict,
        preTransformRule: 'TRIM',
        postTransformRule: 'UPPERCASE'
      };

      const res = translateWithDictionary(chainedDict, '   02   ');
      expect(res.matched).toBe(true);
      expect(res.output).toBe('AWASH INTERNATIONAL BANK');
    });
  });
});

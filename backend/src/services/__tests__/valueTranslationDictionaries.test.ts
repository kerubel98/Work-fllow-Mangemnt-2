import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { repo } from '../../store/repository.js';
import { ValueTranslationDictionary } from '../../types.js';

describe('Value Translation Dictionaries (PostgreSQL Relational Persistence - Governance Rule 23)', () => {
  const testDictId = `dict-test-${Date.now()}`;

  const sampleDict: ValueTranslationDictionary = {
    id: testDictId,
    name: 'Custom Acquirer Branch Mapping',
    description: 'Maps physical branch names to internal routing codes',
    category: 'BANK_CODES',
    mappings: [
      { sourceValue: 'Main Branch Addis', targetValue: '01001', notes: 'HQ' },
      { sourceValue: 'Bole Medhanealem Branch', targetValue: '01002', notes: 'Airport area' }
    ],
    isSystemDefault: false,
    createdBy: 'test_admin',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  beforeAll(async () => {
    await repo.createOrUpdateValueTranslationDictionary(sampleDict);
  });

  afterAll(async () => {
    try {
      await repo.deleteValueTranslationDictionary(testDictId);
    } catch (_) {}
  });

  it('correctly persists and retrieves ValueTranslationDictionary from PostgreSQL', async () => {
    const fetched = await repo.getValueTranslationDictionaryById(testDictId);
    expect(fetched).not.toBeNull();
    expect(fetched?.name).toBe('Custom Acquirer Branch Mapping');
    expect(fetched?.category).toBe('BANK_CODES');
    expect(fetched?.mappings).toHaveLength(2);
    expect(fetched?.mappings[0].targetValue).toBe('01001');
  });

  it('retrieves system default seeded dictionaries from PostgreSQL', async () => {
    const allDicts = await repo.getValueTranslationDictionaries();
    expect(allDicts.length).toBeGreaterThan(0);
    const bankDict = allDicts.find(d => d.id === 'dict-bank-codes');
    expect(bankDict).toBeDefined();
    expect(bankDict?.isSystemDefault).toBe(true);
    expect(bankDict?.category).toBe('BANK_CODES');
    expect(bankDict?.mappings.length).toBeGreaterThanOrEqual(20);
  });

  it('supports updating translation pairs in PostgreSQL', async () => {
    const updatedDict: ValueTranslationDictionary = {
      ...sampleDict,
      name: 'Updated Acquirer Branch Mapping',
      mappings: [
        ...sampleDict.mappings,
        { sourceValue: 'Kazanchis Branch', targetValue: '01003', notes: 'Kazanchis' }
      ]
    };

    await repo.createOrUpdateValueTranslationDictionary(updatedDict);
    const reFetched = await repo.getValueTranslationDictionaryById(testDictId);
    expect(reFetched?.name).toBe('Updated Acquirer Branch Mapping');
    expect(reFetched?.mappings).toHaveLength(3);
    expect(reFetched?.mappings.some(m => m.sourceValue === 'Kazanchis Branch')).toBe(true);
  });

  it('filters dictionaries by category', async () => {
    const channelDicts = await repo.getValueTranslationDictionaries('CHANNEL_CODES');
    expect(channelDicts.every(d => d.category === 'CHANNEL_CODES')).toBe(true);
  });

  it('correctly deletes dictionary from PostgreSQL', async () => {
    const toDeleteId = `dict-del-${Date.now()}`;
    await repo.createOrUpdateValueTranslationDictionary({
      id: toDeleteId,
      name: 'Temporary Dict',
      description: 'Will be deleted',
      category: 'CUSTOM',
      mappings: []
    });

    const deleted = await repo.deleteValueTranslationDictionary(toDeleteId);
    expect(deleted).toBe(true);
    const verifyNull = await repo.getValueTranslationDictionaryById(toDeleteId);
    expect(verifyNull).toBeNull();
  });
});

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { repo } from '../../store/repository.js';
import { SystemTransformationRule } from '../../types.js';

describe('System Transformation Rules (PostgreSQL Relational Persistence - Governance Rule 23)', () => {
  const testRuleId = `rule-test-${Date.now()}`;

  const sampleRule: SystemTransformationRule = {
    id: testRuleId,
    name: 'Custom Swift BIC Cleaner',
    description: 'Strips trailing XXX padding from SWIFT BIC codes',
    category: 'Sanitization',
    type: 'TRIM',
    pattern: 'XXX$',
    replacement: '',
    isSystem: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  beforeAll(async () => {
    await repo.createOrUpdateSystemTransformationRule(sampleRule);
  });

  afterAll(async () => {
    try {
      await repo.deleteSystemTransformationRule(testRuleId);
    } catch (_) {}
  });

  it('correctly persists and retrieves SystemTransformationRule from PostgreSQL', async () => {
    const fetched = await repo.getSystemTransformationRuleById(testRuleId);
    expect(fetched).not.toBeNull();
    expect(fetched?.name).toBe('Custom Swift BIC Cleaner');
    expect(fetched?.category).toBe('Sanitization');
    expect(fetched?.type).toBe('TRIM');
    expect(fetched?.isSystem).toBe(false);
  });

  it('retrieves system default seeded transformation rules from PostgreSQL', async () => {
    const allRules = await repo.getSystemTransformationRules();
    expect(allRules.length).toBeGreaterThan(0);
    const phoneRule = allRules.find(r => r.id === 'rule-phone-et');
    expect(phoneRule).toBeDefined();
    expect(phoneRule?.isSystem).toBe(true);
    expect(phoneRule?.category).toBe('Sanitization');
    expect(phoneRule?.type).toBe('PHONE_ET');
  });

  it('supports category filtering in PostgreSQL queries', async () => {
    const splittingRules = await repo.getSystemTransformationRules('Splitting');
    expect(splittingRules.length).toBeGreaterThanOrEqual(1);
    expect(splittingRules.every(r => r.category === 'Splitting')).toBe(true);
  });

  it('supports updating transformation rules in PostgreSQL', async () => {
    const updatedRule: SystemTransformationRule = {
      ...sampleRule,
      name: 'Updated Swift BIC Cleaner',
      description: 'Updated description for testing'
    };
    const saved = await repo.createOrUpdateSystemTransformationRule(updatedRule);
    expect(saved.name).toBe('Updated Swift BIC Cleaner');
    expect(saved.description).toBe('Updated description for testing');

    const refetched = await repo.getSystemTransformationRuleById(testRuleId);
    expect(refetched?.name).toBe('Updated Swift BIC Cleaner');
  });

  it('correctly deletes transformation rule from PostgreSQL', async () => {
    const delId = `rule-del-${Date.now()}`;
    await repo.createOrUpdateSystemTransformationRule({
      ...sampleRule,
      id: delId,
      name: 'Temporary Rule for Deletion'
    });

    const success = await repo.deleteSystemTransformationRule(delId);
    expect(success).toBe(true);

    const check = await repo.getSystemTransformationRuleById(delId);
    expect(check).toBeNull();
  });
});

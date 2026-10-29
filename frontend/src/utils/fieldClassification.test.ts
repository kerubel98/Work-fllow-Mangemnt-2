import test from 'node:test';
import assert from 'node:assert/strict';

import { isUnclassifiedField, displayCategory } from './fieldClassification';

test('empty and General categories are unclassified', () => {
  assert.equal(isUnclassifiedField({ category: undefined }), true);
  assert.equal(isUnclassifiedField({ category: '' }), true);
  assert.equal(isUnclassifiedField({ category: 'General' }), true);
});

test('a table-name category recorded in discovery provenance is unclassified', () => {
  const f = {
    category: 'auth_log_tab',
    notes: "Discovered from database 'Sett', table 'auth_log_tab'",
    description: 'Physical database column from auth_log_tab (varchar)'
  };
  assert.equal(isUnclassifiedField(f), true);
  assert.equal(displayCategory(f), 'Unclassified');
});

test('real business categories are never marked unclassified', () => {
  const f = {
    category: 'Financial & Amounts',
    notes: "Discovered from database 'Sett', table 'sv_fin_tab'",
    description: 'Physical database column from sv_fin_tab (decimal)'
  };
  assert.equal(isUnclassifiedField(f), false);
  assert.equal(displayCategory(f), 'Financial & Amounts');
});

test('a custom category typed by a user without matching provenance stays classified', () => {
  assert.equal(isUnclassifiedField({ category: 'Fraud signals', notes: '', description: 'Manual field' }), false);
});

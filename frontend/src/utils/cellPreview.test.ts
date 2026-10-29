import test from 'node:test';
import assert from 'node:assert/strict';

import { previewCell, sampleValuesHint, isColumnEmptyInSample } from './cellPreview';

test('objects never render as [object Object]', () => {
  const p = previewCell({ hpan: '1', trace: '2', ttime: '3', extra: 4 });
  assert.equal(p.text, '{ hpan, trace, ttime, … }');
  assert.equal(p.isJson, true);
  assert.ok(!p.text.includes('[object Object]'));
  assert.ok(p.full.includes('"hpan"'));
});

test('empty object and arrays have compact previews', () => {
  assert.equal(previewCell({}).text, '{ }');
  assert.equal(previewCell([]).text, '[ ]');
  assert.equal(previewCell([1, 2]).text, '[ 2 items ]');
});

test('JSON strings are previewed as structures', () => {
  const p = previewCell('{"a":1,"b":2}');
  assert.equal(p.text, '{ a, b }');
  assert.equal(p.isJson, true);
});

test('null, blank and plain values', () => {
  assert.equal(previewCell(null).isEmpty, true);
  assert.equal(previewCell('   ').isEmpty, true);
  assert.equal(previewCell('CONTINUE').text, 'CONTINUE');
  assert.equal(previewCell('x'.repeat(100)).text.length, 48);
});

test('sample hint and empty-column detection use previews', () => {
  const rows = [{ a: null, b: 'x' }, { a: '', b: 'y' }, { a: undefined, b: 'z' }];
  assert.equal(sampleValuesHint(rows, 'b'), 'x · y · z');
  assert.equal(isColumnEmptyInSample(rows, 'a'), true);
  assert.equal(isColumnEmptyInSample(rows, 'b'), false);
  assert.equal(isColumnEmptyInSample([], 'a'), false);
});

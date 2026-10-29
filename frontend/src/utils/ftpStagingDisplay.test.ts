import test from 'node:test';
import assert from 'node:assert/strict';

import { groupUnconfiguredFolders, summariseConnectionError } from './ftpStagingDisplay';

test('rotating month folders under one parent collapse to a {month} root pattern', () => {
  const groups = groupUnconfiguredFolders([
    { folderPath: '/wegagen/IPS/aug_2026', fileCount: 64 },
    { folderPath: '/wegagen/IPS/Sep-2026', fileCount: 96 },
    { folderPath: '/wegagen/IPS/jul_2026', fileCount: 10 }
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].pattern, '/wegagen/IPS/{month}');
  assert.equal(groups[0].isRotating, true);
  assert.equal(groups[0].totalFiles, 170);
  assert.equal(groups[0].folders.length, 3);
});

test('numeric date folders use {date}', () => {
  const groups = groupUnconfiguredFolders([
    { folderPath: '/in/20260101', fileCount: 1 },
    { folderPath: '/in/20260102', fileCount: 1 }
  ]);
  assert.equal(groups[0].pattern, '/in/{date}');
});

test('non-period siblings get a * wildcard and are not marked rotating', () => {
  const groups = groupUnconfiguredFolders([
    { folderPath: '/data/alpha', fileCount: 2 },
    { folderPath: '/data/beta', fileCount: 3 }
  ]);
  assert.equal(groups[0].pattern, '/data/*');
  assert.equal(groups[0].isRotating, false);
});

test('a lone folder stays literal and groups are ordered by size', () => {
  const groups = groupUnconfiguredFolders([
    { folderPath: '/solo/one', fileCount: 5 },
    { folderPath: '/a/x1', fileCount: 1 },
    { folderPath: '/a/x2', fileCount: 1 }
  ]);
  assert.equal(groups[0].parent, '/a');
  assert.equal(groups[1].pattern, '/solo/one');
  assert.equal(groups[1].folders.length, 1);
});

test('root-level folders do not produce a double slash', () => {
  const groups = groupUnconfiguredFolders([
    { folderPath: '/aug_2026' }, { folderPath: '/sep_2026' }
  ]);
  assert.equal(groups[0].pattern, '/{month}');
});

test('timeouts become a plain-language error without leaking raw text', () => {
  const s = summariseConnectionError('Error: connect ETIMEDOUT 192.168.22.210:2222 (Timed out while waiting for handshake)', 'SettlemFTP');
  assert.equal(s.kind, 'TIMEOUT');
  assert.equal(s.title, 'Could not reach SettlemFTP');
  assert.ok(!s.detail.includes('192.168'));
});

test('other failure kinds are classified', () => {
  assert.equal(summariseConnectionError('ECONNREFUSED', 'x').kind, 'REFUSED');
  assert.equal(summariseConnectionError('530 Login incorrect', 'x').kind, 'AUTH');
  assert.equal(summariseConnectionError('getaddrinfo ENOTFOUND host', 'x').kind, 'NOT_FOUND');
  assert.equal(summariseConnectionError('weird', 'x').kind, 'UNKNOWN');
});

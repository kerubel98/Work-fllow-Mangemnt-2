import { describe, it, expect, vi } from 'vitest';
import { dataSanitizerService } from '../dataSanitizerService.js';

describe('dataSanitizerService', () => {
  it('identifies missing required fields in fileMapping', async () => {
    // Only refnum mapped, missing reqamt and terminal_id
    const incompleteMapping = {
      'Txn_Ref': 'refnum'
    };

    const res = await dataSanitizerService.validateMapping(incompleteMapping);
    expect(res.valid).toBe(false);
    expect(res.missingFields).toContain('reqamt');
    expect(res.missingFields).toContain('terminal_id');
  });

  it('accepts mapping when all required standard fields are mapped', async () => {
    const completeMapping = {
      'Txn_Ref': 'refnum',
      'Amount': 'reqamt',
      'Term_Code': 'terminal_id'
    };

    const res = await dataSanitizerService.validateMapping(completeMapping);
    expect(res.valid).toBe(true);
    expect(res.missingFields.length).toBe(0);
  });

  it('automatically strips unmapped raw headers from rows', async () => {
    const rawRows = [
      {
        'Txn_Ref': 'REF-1001',
        'Amount': '250.75',
        'Term_Code': 'TERM-01',
        'Internal_Debug_Data': 'strip-me',
        'Temporary_Session_Id': 'ignore-this'
      }
    ];

    const fileMapping = {
      'Txn_Ref': 'refnum',
      'Amount': 'reqamt',
      'Term_Code': 'terminal_id'
    };

    const result = await dataSanitizerService.sanitizeRows(rawRows, fileMapping);
    expect(result.sanitizedRows.length).toBe(1);
    const row = result.sanitizedRows[0];

    // Mapped standard columns must exist
    expect(row.refnum).toBe('REF-1001');
    expect(row.reqamt).toBe(250.75);
    expect(row.terminal_id).toBe('TERM-01');

    // Unmapped columns must be stripped
    expect(row.Internal_Debug_Data).toBeUndefined();
    expect(row.Temporary_Session_Id).toBeUndefined();
    expect(result.droppedKeysCount).toBe(2);
  });

  it('automatically prunes null, undefined, and empty string values', async () => {
    const rawRows = [
      {
        'Txn_Ref': 'REF-1002',
        'Amount': '500.00',
        'Term_Code': 'TERM-02',
        'Notes': null,
        'Auth_Code': undefined,
        'Blank_Field': '   ',
        'Null_String': 'null'
      }
    ];

    const fileMapping = {
      'Txn_Ref': 'refnum',
      'Amount': 'reqamt',
      'Term_Code': 'terminal_id',
      'Notes': 'notes',
      'Auth_Code': 'authidresp',
      'Blank_Field': 'cardseqno',
      'Null_String': 'atm_resp'
    };

    const result = await dataSanitizerService.sanitizeRows(rawRows, fileMapping);
    const row = result.sanitizedRows[0];

    expect(row.refnum).toBe('REF-1002');
    expect(row.reqamt).toBe(500);
    expect(row.notes).toBeUndefined();
    expect(row.authidresp).toBeUndefined();
    expect(row.cardseqno).toBeUndefined();
    expect(row.atm_resp).toBeUndefined();
    expect(result.droppedNullsCount).toBeGreaterThanOrEqual(4);
  });

  it('normalizes string amounts with commas and dollar signs into valid numbers', async () => {
    const rawRows = [
      { 'Txn_Ref': 'REF-1003', 'Amount': '$1,450.50', 'Term_Code': 'TERM-03' }
    ];

    const fileMapping = {
      'Txn_Ref': 'refnum',
      'Amount': 'reqamt',
      'Term_Code': 'terminal_id'
    };

    const result = await dataSanitizerService.sanitizeRows(rawRows, fileMapping);
    expect(result.sanitizedRows[0].reqamt).toBe(1450.5);
  });
});

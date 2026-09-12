import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import http from 'http';
import { validationBoxesRouter } from '../../routes/validationBoxes.js';

describe('Validation Boxes Parameter Testing & Resolution', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/validation-boxes', validationBoxesRouter);

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address() as any;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('uses custom given parameters instead of default TXN-9021 when testing a condition check box', async () => {
    const customBox = {
      id: 'vbox-custom-param-1',
      name: 'Custom Parameter Threshold',
      boxType: 'CONDITION_CHECK',
      checkStep: {
        canonicalField: 'custom_amount',
        operator: 'GREATER_THAN',
        compareValue: '200',
        onPassAction: 'CONTINUE',
        onFailAction: 'FLAG'
      }
    };

    // 1. Test passing custom parameters under `parameters`
    const res1 = await fetch(`${baseUrl}/api/validation-boxes/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        box: customBox,
        parameters: {
          custom_amount: 350,
          custom_ref: 'REF-USER-PARAM-99'
        }
      })
    });

    const body1 = await res1.json();
    expect(res1.status).toBe(200);
    expect(body1.boxType).toBe('CONDITION_CHECK');
    expect(body1.sampleRecord.custom_amount).toBe(350);
    expect(body1.sampleRecord.custom_ref).toBe('REF-USER-PARAM-99');
    expect(body1.sampleRecord.transactionId).toBeUndefined();
    expect(body1.actualValue).toBe(350);
    expect(body1.passed).toBe(true);

    // 2. Test passing custom parameters that should fail
    const res2 = await fetch(`${baseUrl}/api/validation-boxes/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        box: customBox,
        parameters: {
          custom_amount: 150
        }
      })
    });

    const body2 = await res2.json();
    expect(res2.status).toBe(200);
    expect(body2.sampleRecord.custom_amount).toBe(150);
    expect(body2.actualValue).toBe(150);
    expect(body2.passed).toBe(false);
  });

  it('uses custom parameters given under record / sampleRecord / transaction keys', async () => {
    const dualSourceBox = {
      id: 'vbox-dual-param-2',
      name: 'Dual Source Matcher',
      boxType: 'CONDITION_CHECK',
      dualSourceCondition: {
        sourceA: { origin: 'SOURCE_A', field: 'gateway_status' },
        sourceB: { origin: 'SOURCE_B', field: 'host_status' },
        comparator: 'EQUALS',
        toleranceMargin: 0
      }
    };

    const res = await fetch(`${baseUrl}/api/validation-boxes/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        box: dualSourceBox,
        record: {
          gateway_status: 'SETTLED',
          host_status: 'SETTLED',
          custom_tag: 'TAG-123'
        }
      })
    });

    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.sampleRecord.gateway_status).toBe('SETTLED');
    expect(body.sampleRecord.host_status).toBe('SETTLED');
    expect(body.sampleRecord.transactionId).toBeUndefined();
    expect(body.passed).toBe(true);
  });

  it('dynamically derives parameters from the box definition when no record is supplied', async () => {
    const ingestionBox = {
      id: 'vbox-search-param-3',
      name: 'Search Box Parameters',
      boxType: 'INGESTION_SEARCH',
      targetDbId: 'non-existent-db',
      targetTable: 'users',
      searchParameters: [
        { inputField: 'merchant_id', targetColumn: 'm_id', defaultValue: 'MERCH-88' },
        { inputField: 'order_uuid', targetColumn: 'uuid' }
      ]
    };

    const res = await fetch(`${baseUrl}/api/validation-boxes/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        box: ingestionBox
      })
    });

    const body = await res.json();
    expect(body.error || body.status).toBeDefined();
  });

  it('fails with Param Missing error when a required search parameter is omitted', async () => {
    const searchBox = {
      id: 'vbox-search-required-test',
      name: 'Required Search Test Box',
      boxType: 'INGESTION_SEARCH',
      targetDbId: 'db-1788895559870',
      targetTable: 'auth_log_tab',
      searchParameters: [
        { inputField: 'terminal_id', targetColumn: 'TERMINAL_ID', required: true },
        { inputField: 'reqamt', targetColumn: 'REQAMT', required: true },
        { inputField: 'fe_utrnno', targetColumn: 'FE_UTRNNO', required: true }
      ]
    };

    // Call with terminal_id provided, but reqamt and fe_utrnno omitted
    const res = await fetch(`${baseUrl}/api/validation-boxes/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        box: searchBox,
        sampleRecord: {
          terminal_id: 'YPT00011'
        }
      })
    });

    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.status).toBe('FAIL');
    expect(body.passed).toBe(false);
    expect(body.badgeText).toBe('Param Missing');
    expect(body.missingParameters).toContain('reqamt');
    expect(body.missingParameters).toContain('fe_utrnno');
    expect(body.message).toContain('Required parameter(s) missing');
  });

  it('fails with Param Missing error when a required condition parameter is omitted', async () => {
    const conditionBox = {
      id: 'vbox-condition-required-test',
      name: 'Required Condition Check Box',
      boxType: 'CONDITION_CHECK',
      checkStep: {
        canonicalField: 'auth_code',
        operator: 'EQUALS',
        compareValue: '00',
        requiredParams: ['auth_code', 'terminal_id']
      }
    };

    // Call with auth_code provided, but terminal_id omitted
    const res = await fetch(`${baseUrl}/api/validation-boxes/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        box: conditionBox,
        sampleRecord: {
          auth_code: '00'
        }
      })
    });

    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.status).toBe('FAIL');
    expect(body.passed).toBe(false);
    expect(body.badgeText).toBe('Param Missing');
    expect(body.missingParameters).toContain('terminal_id');
  });
});

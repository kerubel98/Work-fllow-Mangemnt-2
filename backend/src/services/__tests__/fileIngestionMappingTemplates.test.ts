import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { repo } from '../../store/repository.js';
import { FileIngestionMappingTemplate, HashtagPreset } from '../../types.js';
import { dataSanitizerService } from '../dataSanitizerService.js';
import { executeFileIngestionHashtag, testPreFlight } from '../hashtagService.js';

describe('File Ingestion Mapping Templates & Template-Scoped Required Column Enforcement', () => {
  const testTemplateId = `tpl-test-${Date.now()}`;
  const testHashtagTag = `#TEST_TEMPLATE_ABSORB_${Date.now()}`;

  const sampleTemplate: FileIngestionMappingTemplate = {
    id: testTemplateId,
    name: 'Visa Settlement Clearing Feed',
    description: 'Enforces transaction_id, auth_code, and amount',
    sourceType: 'csv',
    headerMode: 'ROW_INDEX',
    headerRowIndex: 1,
    manualHeaders: {},
    deletedColumns: ['internal_trace_note'],
    requiredColumns: ['transaction_id', 'amount', 'auth_code'],
    columnMappings: {
      'TX_ID': 'transaction_id',
      'AMT': 'amount',
      'APPROVAL': 'auth_code'
    },
    cleaningRecipe: {
      emptyRowsAction: 'DROP',
      duplicateRowsAction: 'DROP_EXACT',
      trimWhitespace: true,
      normalizeDatesToIso: true,
      maskCardPan: true,
      fillBlanksWithNa: false
    },
    createdBy: 'admin_test',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  beforeAll(async () => {
    // Save template
    await repo.createOrUpdateFileMappingTemplate(sampleTemplate);
  });

  afterAll(async () => {
    // Cleanup
    try {
      await repo.deleteFileMappingTemplate(testTemplateId);
      await repo.deleteHashtag(testHashtagTag);
    } catch (_) {}
  });

  it('correctly persists and retrieves FileIngestionMappingTemplate from PostgreSQL', async () => {
    const fetched = await repo.getFileMappingTemplateById(testTemplateId);
    expect(fetched).not.toBeNull();
    expect(fetched?.name).toBe('Visa Settlement Clearing Feed');
    expect(fetched?.requiredColumns).toEqual(['transaction_id', 'amount', 'auth_code']);
    expect(fetched?.columnMappings).toEqual({
      'TX_ID': 'transaction_id',
      'AMT': 'amount',
      'APPROVAL': 'auth_code'
    });
    expect(fetched?.deletedColumns).toEqual(['internal_trace_note']);
  });

  it('dataSanitizerService does not enforce rigid global standard columns when no template required fields provided', async () => {
    // Ad-hoc row without refnum/reqamt
    const sampleRow = { custom_field_1: 'valueA', custom_field_2: '100' };
    const res = await dataSanitizerService.validateMapping({}, sampleRow);
    expect(res.valid).toBe(true);
    expect(res.missingFields).toHaveLength(0);
  });

  it('dataSanitizerService strictly enforces template required columns when specified', async () => {
    // Missing auth_code
    const incompleteRow = { transaction_id: 'TX-100', amount: 50.25 };
    const failRes = await dataSanitizerService.validateMapping({}, incompleteRow, sampleTemplate.requiredColumns);
    expect(failRes.valid).toBe(false);
    expect(failRes.missingFields).toContain('auth_code');

    // Complete row
    const completeRow = { transaction_id: 'TX-100', amount: 50.25, auth_code: 'AUTH-999' };
    const passRes = await dataSanitizerService.validateMapping({}, completeRow, sampleTemplate.requiredColumns);
    expect(passRes.valid).toBe(true);
    expect(passRes.missingFields).toHaveLength(0);
  });

  it('hashtag absorbs transactions: enforces linked template required columns during execution', async () => {
    const tagPreset = {
      tag: testHashtagTag,
      description: 'Directive bound to Visa Settlement Clearing Feed',
      hashtagType: 'FILE_INGESTION',
      dataSourceMode: 'FILE_UPLOAD',
      mappingTemplateId: testTemplateId,
      minimumRequiredColumns: [], // Left empty so template dictates requirements
      author: 'system_test',
      createdAt: new Date().toISOString()
    } as any as HashtagPreset;
    await repo.createHashtag(tagPreset);

    // 1. Transaction batch missing 'auth_code' and 'amount'
    const invalidBatch = [
      { transaction_id: 'TX-001', note: 'test' }
    ];
    const invalidResult = await executeFileIngestionHashtag(tagPreset, invalidBatch);
    expect(invalidResult.valid).toBe(false);
    expect(invalidResult.missingColumns).toContain('amount');
    expect(invalidResult.missingColumns).toContain('auth_code');
    expect(invalidResult.errors[0]).toContain("mandated by template 'Visa Settlement Clearing Feed'");

    // 2. Transaction batch with all mandated columns
    const validBatch = [
      { transaction_id: 'TX-001', amount: '120.00', auth_code: 'APPR-1' }
    ];
    const validResult = await executeFileIngestionHashtag(tagPreset, validBatch);
    expect(validResult.valid).toBe(true);
    expect(validResult.missingColumns).toHaveLength(0);
    expect(validResult.rowCount).toBe(1);
  });

  it('testPreFlight enforces template required columns for preview datasets', async () => {
    const tagPreset = {
      tag: testHashtagTag,
      description: 'Test preflight',
      hashtagType: 'FILE_INGESTION',
      mappingTemplateId: testTemplateId
    } as any as HashtagPreset;

    const invalidSample = [{ transaction_id: 'TX-1' }];
    const preFlightRes = await testPreFlight(tagPreset, invalidSample);
    expect(preFlightRes.success).toBe(false);
    expect(preFlightRes.errors.length).toBeGreaterThan(0);
    expect(preFlightRes.errors[0]).toContain("mandated by template 'Visa Settlement Clearing Feed'");

    const validSample = [{ transaction_id: 'TX-1', amount: '99.00', auth_code: 'APPR-1' }];
    const passPreFlight = await testPreFlight(tagPreset, validSample);
    expect(passPreFlight.success).toBe(true);
    expect(passPreFlight.errors).toHaveLength(0);
  });

  it('templates act as auto-cleaners and data transformers: captures splits, merges, transforms, and cleaning rules', async () => {
    const complexTemplateId = `tpl-transform-${Date.now()}`;
    const complexTemplate: FileIngestionMappingTemplate = {
      id: complexTemplateId,
      name: 'Omni-Channel Auto-Cleaner Recipe Template',
      description: 'Splits customer names, merges phone parts, translates status, and masks PAN',
      sourceType: 'csv',
      headerMode: 'ROW_INDEX',
      headerRowIndex: 1,
      manualHeaders: {},
      deletedColumns: ['unwanted_col'],
      requiredColumns: ['First_Name', 'Last_Name', 'Full_Phone', 'Card_Num'],
      columnMappings: {
        'First_Name': 'first_name',
        'Last_Name': 'last_name',
        'Full_Phone': 'phone_number',
        'Card_Num': 'pan'
      },
      splitOperations: [
        {
          id: 'split-1',
          column: 'Customer_Name',
          delimiterType: 'SPACE',
          partNames: ['First_Name', 'Last_Name'],
          keepOriginal: false
        }
      ],
      mergeOperations: [
        {
          id: 'merge-1',
          col1: 'Dial_Code',
          col2: 'Local_Number',
          separatorType: 'HYPHEN',
          resultColumnName: 'Full_Phone',
          keepSources: false
        }
      ],
      transformOperations: [
        {
          id: 'trans-1',
          column: 'Raw_Status',
          ruleType: 'UPPERCASE'
        },
        {
          id: 'trans-2',
          column: 'Tx_Date',
          ruleType: 'DATE_ISO'
        }
      ],
      cleaningActions: ['DEDUPLICATE', 'REMOVE_EMPTY_ROWS', 'TRIM_WHITESPACE', 'MASK_PAN'],
      cleaningRecipe: {
        emptyRowsAction: 'DROP',
        duplicateRowsAction: 'DROP_EXACT',
        trimWhitespace: true,
        normalizeDatesToIso: true,
        maskCardPan: true,
        fillBlanksWithNa: false,
        splitOperations: [
          {
            id: 'split-1',
            column: 'Customer_Name',
            delimiterType: 'SPACE',
            partNames: ['First_Name', 'Last_Name'],
            keepOriginal: false
          }
        ],
        mergeOperations: [
          {
            id: 'merge-1',
            col1: 'Dial_Code',
            col2: 'Local_Number',
            separatorType: 'HYPHEN',
            resultColumnName: 'Full_Phone',
            keepSources: false
          }
        ],
        transformOperations: [
          {
            id: 'trans-1',
            column: 'Raw_Status',
            ruleType: 'UPPERCASE'
          },
          {
            id: 'trans-2',
            column: 'Tx_Date',
            ruleType: 'DATE_ISO'
          }
        ],
        cleaningActions: ['DEDUPLICATE', 'REMOVE_EMPTY_ROWS', 'TRIM_WHITESPACE', 'MASK_PAN']
      },
      createdBy: 'recipe_architect',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // 1. Persist template to PostgreSQL
    const saved = await repo.createOrUpdateFileMappingTemplate(complexTemplate);
    expect(saved.id).toBe(complexTemplateId);

    // 2. Retrieve template from PostgreSQL and verify full operational recipe fidelity
    const fetched = await repo.getFileMappingTemplateById(complexTemplateId);
    expect(fetched).not.toBeNull();
    expect(fetched?.splitOperations).toHaveLength(1);
    expect(fetched?.splitOperations?.[0].column).toBe('Customer_Name');
    expect(fetched?.splitOperations?.[0].partNames).toEqual(['First_Name', 'Last_Name']);
    expect(fetched?.mergeOperations).toHaveLength(1);
    expect(fetched?.mergeOperations?.[0].resultColumnName).toBe('Full_Phone');
    expect(fetched?.transformOperations).toHaveLength(2);
    expect(fetched?.cleaningActions).toEqual(['DEDUPLICATE', 'REMOVE_EMPTY_ROWS', 'TRIM_WHITESPACE', 'MASK_PAN']);

    // 3. Replay template on a raw, messy dataset
    const messyRawRows = [
      {
        Customer_Name: '  Abebe  Bikila ',
        Dial_Code: '+251',
        Local_Number: '911223344',
        Raw_Status: ' success ',
        Tx_Date: '10/05/2026',
        Card_Num: '4111111111111111',
        unwanted_col: 'drop_me'
      },
      // Duplicate row to test deduplication
      {
        Customer_Name: '  Abebe  Bikila ',
        Dial_Code: '+251',
        Local_Number: '911223344',
        Raw_Status: ' success ',
        Tx_Date: '10/05/2026',
        Card_Num: '4111111111111111',
        unwanted_col: 'drop_me'
      },
      // Empty row to test empty row drop
      {
        Customer_Name: '',
        Dial_Code: '',
        Local_Number: '',
        Raw_Status: '',
        Tx_Date: '',
        Card_Num: '',
        unwanted_col: ''
      },
      // Second distinct record
      {
        Customer_Name: 'Derartu Tulu',
        Dial_Code: '+251',
        Local_Number: '922334455',
        Raw_Status: 'settled',
        Tx_Date: '2026-06-15',
        Card_Num: '5105105105105100',
        unwanted_col: 'drop_me'
      }
    ];

    const replayResult = dataSanitizerService.replayTemplateOperations(messyRawRows, fetched!);
    expect(replayResult.processedRows).toHaveLength(2); // 1 duplicate dropped, 1 empty dropped

    const row1 = replayResult.processedRows[0];

    // Verify split operation occurred
    expect(row1.First_Name).toBe('Abebe');
    expect(row1.Last_Name).toBe('Bikila');
    expect(row1.Customer_Name).toBeUndefined(); // Deleted because keepOriginal: false

    // Verify merge operation occurred
    expect(row1.Full_Phone).toBe('+251-911223344');
    expect(row1.Dial_Code).toBeUndefined(); // Deleted because keepSources: false
    expect(row1.Local_Number).toBeUndefined();

    // Verify transformation rules applied
    expect(row1.Raw_Status).toBe('SUCCESS'); // Uppercased and trimmed
    expect(row1.Tx_Date).toBe('2026-10-05'); // Normalized to ISO YYYY-MM-DD

    // Verify PAN masking
    expect(row1.Card_Num).toBe('411111******1111');

    // Verify deleted column excluded
    expect(row1.unwanted_col).toBeUndefined();

    // Clean up
    await repo.deleteFileMappingTemplate(complexTemplateId);
  });
});

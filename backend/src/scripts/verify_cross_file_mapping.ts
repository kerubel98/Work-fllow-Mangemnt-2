/**
 * Verification Script: Cross-File Mapping Template & Recipe Execution
 * Tests that a template created for File 1 successfully applies to File 2
 * despite differences in column name casing, delimiters, formatting, or target key names.
 */

import { recipeExecutionService } from '../services/recipeExecutionService.js';
import { FileIngestionMappingTemplate } from '../types.js';

async function main() {
  console.log('================================================================');
  console.log('RUNNING CROSS-FILE MAPPING TEMPLATE VERIFICATION SUITE');
  console.log('================================================================');

  // 1. Template created from File 1
  // In File 1, headers were: [Date, Reference, Acc No, Amount, Fee, Customer_Name]
  const templateFromFile1: FileIngestionMappingTemplate = {
    id: `tpl_test_${Date.now()}`,
    name: 'Standard Settlement Template 2026',
    sourceType: 'csv',
    headerMode: 'ROW_INDEX',
    headerRowIndex: 1,
    dataStartRow: 2,
    manualHeaders: {},
    deletedColumns: [],
    requiredColumns: ['transaction_reference', 'account_number', 'transaction_amount'],
    columnMappings: {
      'Date': 'transaction_date',
      'Reference': 'transaction_reference',
      'Acc No': 'account_number',
      'Amount': 'transaction_amount',
      'Fee': 'fee_amount'
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
    cleaningRecipe: {
      headerRowIndex: 1,
      dataStartRow: 2,
      trimWhitespace: true,
      splitOperations: [
        {
          id: 'split-1',
          column: 'Customer_Name',
          delimiterType: 'SPACE',
          partNames: ['First_Name', 'Last_Name'],
          keepOriginal: false
        }
      ]
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  // 2. File 2 arrives with DIFFERENT casing, spacing, and delimiters:
  // e.g. "acc_no" instead of "Acc No", "reference" instead of "Reference",
  // "DATE" instead of "Date", "Customer Name" instead of "Customer_Name", "amount" instead of "Amount"
  const file2Rows = [
    {
      'date': '2026-11-21',
      'reference': 'TXN_CROSS_99901',
      'acc_no': '1000987654321',
      'amount': '1500.50',
      'fee': '15.00',
      'Customer Name': 'Kenenisa Bekele'
    },
    {
      'date': '2026-11-21',
      'reference': 'TXN_CROSS_99902',
      'acc_no': '1000987654322',
      'amount': '2750.00',
      'fee': '25.00',
      'Customer Name': 'Tirunesh Dibaba'
    }
  ];

  console.log('\n[Step 1] Executing template against File 2 (different casing & delimiters)...');
  const result = await recipeExecutionService.executeRecipe(file2Rows, templateFromFile1, {
    projectToCanonical: true,
    preserveRawPayload: true
  });

  if (!result.success) {
    console.error('FAILED: Recipe execution returned success=false');
    process.exit(1);
  }

  console.log(`Execution succeeded in ${result.executionTimeMs}ms with ${result.totalRowsOut} rows.`);
  const row0 = result.processedRows[0];
  console.log('Processed Row 0 Canonical Projection:', JSON.stringify(row0, null, 2));

  // Assertions
  console.log('\n[Step 2] Verifying canonical column projections for File 2:');

  // Verify account_number was resolved from 'acc_no'
  if (row0.account_number === '1000987654321') {
    console.log('✓ PASS: "acc_no" in File 2 matched "Acc No" mapping -> "account_number": 1000987654321');
  } else {
    console.error(`✗ FAIL: Expected row0.account_number="1000987654321", got "${row0.account_number}"`);
    process.exit(1);
  }

  // Verify transaction_reference was resolved from 'reference'
  if (row0.transaction_reference === 'TXN_CROSS_99901') {
    console.log('✓ PASS: "reference" in File 2 matched "Reference" mapping -> "transaction_reference": TXN_CROSS_99901');
  } else {
    console.error(`✗ FAIL: Expected row0.transaction_reference="TXN_CROSS_99901", got "${row0.transaction_reference}"`);
    process.exit(1);
  }

  // Verify transaction_amount was resolved from 'amount'
  if (row0.transaction_amount === '1500.50') {
    console.log('✓ PASS: "amount" in File 2 matched "Amount" mapping -> "transaction_amount": 1500.50');
  } else {
    console.error(`✗ FAIL: Expected row0.transaction_amount="1500.50", got "${row0.transaction_amount}"`);
    process.exit(1);
  }

  // Verify fee_amount was resolved from 'fee'
  if (row0.fee_amount === '15.00') {
    console.log('✓ PASS: "fee" in File 2 matched "Fee" mapping -> "fee_amount": 15.00');
  } else {
    console.error(`✗ FAIL: Expected row0.fee_amount="15.00", got "${row0.fee_amount}"`);
    process.exit(1);
  }

  // Verify Customer Name split occurred despite "Customer Name" vs "Customer_Name"
  if (row0.First_Name === 'Kenenisa' && row0.Last_Name === 'Bekele') {
    console.log('✓ PASS: "Customer Name" in File 2 matched splitOp "Customer_Name" -> First_Name: "Kenenisa", Last_Name: "Bekele"');
  } else {
    console.error(`✗ FAIL: Expected First_Name="Kenenisa", Last_Name="Bekele", got First_Name="${row0.First_Name}", Last_Name="${row0.Last_Name}"`);
    process.exit(1);
  }

  // 3. Test File 3 with Positional / Headerless variations (col_0, col_1)
  console.log('\n[Step 3] Testing File 3 with positional columns (col_0, col_1, col_2)...');
  const positionalTemplate: FileIngestionMappingTemplate = {
    ...templateFromFile1,
    id: `tpl_pos_${Date.now()}`,
    columnMappings: {
      'col_0': 'transaction_date',
      'col_1': 'transaction_reference',
      'col_2': 'account_number',
      'col_3': 'transaction_amount'
    }
  };

  const file3Rows = [
    {
      'col_0': '2026-11-21',
      'col_1': 'TXN_POS_001',
      'col_2': '4000111222333',
      'col_3': '999.99'
    }
  ];

  const posResult = await recipeExecutionService.executeRecipe(file3Rows, positionalTemplate, {
    projectToCanonical: true
  });

  const posRow0 = posResult.processedRows[0];
  if (posRow0.transaction_reference === 'TXN_POS_001' && posRow0.account_number === '4000111222333') {
    console.log('✓ PASS: Positional col_0/col_1 mapping correctly projected to canonical keys!');
  } else {
    console.error('✗ FAIL: Positional mapping failed:', posRow0);
    process.exit(1);
  }

  console.log('\n================================================================');
  console.log('ALL CROSS-FILE MAPPING TESTS PASSED SUCCESSFULLY! (100% VERIFIED)');
  console.log('================================================================\n');
}

main().catch(err => {
  console.error('Unexpected test error:', err);
  process.exit(1);
});

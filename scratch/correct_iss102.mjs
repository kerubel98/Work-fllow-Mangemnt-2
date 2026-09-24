import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgres://postgres:123456@localhost:5432/operational_workflow_db'
});

async function correctIssue102() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('1. Updating issues table for ISS-102...');
    await client.query(`
      UPDATE issues SET
        title = $1,
        description = $2,
        status = $3,
        priority = $4,
        type = $5,
        transaction_id = $6,
        linked_hashtag = $7,
        first_level_notes = $8,
        transaction_count = 1,
        dataset_status = 'INGESTED',
        uploaded_file_name = NULL,
        uploaded_file_headers = '[]'::jsonb,
        file_mapping = '{}'::jsonb,
        validation_status = 'untested',
        validation_errors = '[]'::jsonb,
        query_results = '[]'::jsonb,
        updated_at = NOW()
      WHERE id = 'ISS-102';
    `, [
      'Luxury Watch transaction over-limit stuck',
      'Transaction TXN-8840 of $1250.00 shows pending state on merchant site, but user received alert of withdrawal. Need immediate first-level investigation or pending status forced decline.',
      'Open',
      'High',
      'single',
      'TXN-8840',
      '#STUCK_PENDING',
      'Identified stuck transaction TXN-8840 for $1250.00 at LUXURY WATCH DISTRIBUTORS in PENDING status in Core Retail Banking DB.'
    ]);

    console.log('2. Cleaning up task_dataset_transactions for ISS-102...');
    const delDataset = await client.query(`DELETE FROM task_dataset_transactions WHERE task_id = 'ISS-102';`);
    console.log(`Deleted ${delDataset.rowCount} misplaced dataset rows from ISS-102.`);

    const txn8840Data = {
      Transaction_ID: 'TXN-8840',
      transaction_id: 'TXN-8840',
      id: 'TXN-8840',
      Card_Number: '5224********0014',
      cardNumber: '5224********0014',
      hpan: '5224********0014',
      Amount_USD: '1250.00',
      amount: 1250.0,
      reqamt: 1250.0,
      Currency: 'USD',
      currency: 'USD',
      Merchant: 'LUXURY WATCH DISTRIBUTORS',
      merchant: 'LUXURY WATCH DISTRIBUTORS',
      Status: 'PENDING',
      status: 'PENDING',
      Auth_Time: '2026-07-10T18:22:00Z',
      ttime: '2026-07-10T18:22:00Z',
      DB_Origin: 'Core Retail Banking DB',
      responseCode: '00',
      resp: '00'
    };

    console.log('3. Inserting proper TXN-8840 record into task_dataset_transactions...');
    await client.query(`
      INSERT INTO task_dataset_transactions (
        task_id, row_number, batch_id, canonical_data, raw_data, created_at
      ) VALUES ($1, $2, $3, $4, $5, NOW());
    `, [
      'ISS-102',
      1,
      'BATCH-TXN8840',
      JSON.stringify(txn8840Data),
      JSON.stringify(txn8840Data)
    ]);

    console.log('4. Cleaning up and fixing central_transaction_repository...');
    // Delete any rows that had original_task_id = 'ISS-102' but were from the misplaced ATM batch
    const delCentralMisplaced = await client.query(`
      DELETE FROM central_transaction_repository 
      WHERE (original_task_id = 'ISS-102' OR current_task_id = 'ISS-102') 
        AND transaction_key != 'TXN-8840';
    `);
    console.log(`Deleted ${delCentralMisplaced.rowCount} misplaced central repo records.`);

    // Remove 'ISS-102' from all_task_ids array where it was falsely attached to ATM records
    await client.query(`
      UPDATE central_transaction_repository
      SET all_task_ids = (
        SELECT jsonb_agg(elem)
        FROM jsonb_array_elements(all_task_ids) elem
        WHERE elem #>> '{}' != 'ISS-102'
      )
      WHERE all_task_ids @> '["ISS-102"]'::jsonb
        AND transaction_key != 'TXN-8840';
    `);

    // Ensure all_task_ids is not null
    await client.query(`
      UPDATE central_transaction_repository
      SET all_task_ids = '["ISS-101"]'::jsonb
      WHERE all_task_ids IS NULL OR all_task_ids = '[]'::jsonb;
    `);

    // Insert or update TXN-8840 in central_transaction_repository
    await client.query(`
      DELETE FROM central_transaction_repository WHERE transaction_key = 'TXN-8840' OR task_id = 'ISS-102';
    `);

    await client.query(`
      INSERT INTO central_transaction_repository (
        transaction_key, original_task_id, current_task_id, all_task_ids,
        batch_id, row_number, status, is_duplicate, task_id,
        hpan, merchant, reqamt, currency, trans_status,
        canonical_data, raw_data, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7, $8, $9,
        $10, $11, $12, $13, $14,
        $15, $16, NOW(), NOW()
      );
    `, [
      'TXN-8840',
      'ISS-102',
      'ISS-102',
      JSON.stringify(['ISS-102']),
      'BATCH-TXN8840',
      1,
      'INGESTED',
      false,
      'ISS-102',
      '5224********0014',
      'LUXURY WATCH DISTRIBUTORS',
      1250.00,
      'USD',
      'PENDING',
      JSON.stringify(txn8840Data),
      JSON.stringify(txn8840Data)
    ]);

    console.log('5. Clearing task_workflow_executions for ISS-102...');
    await client.query(`DELETE FROM task_workflow_executions WHERE task_id = 'ISS-102';`);

    await client.query('COMMIT');
    console.log('✅ ISS-102 successfully corrected in PostgreSQL!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error correcting ISS-102:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

correctIssue102().catch(e => {
  console.error(e);
  process.exit(1);
});

import { queryPg } from '../../dist/config/postgres.js';

async function main() {
  const taskId = 'ISS-6362';
  const activeWfId = 'wf-1790956098575';
  const targetTable = 'tran_log_tab';

  // 1. Get the latest batch id
  const batchRes = await queryPg(`
    SELECT _batch_id
    FROM mirror_sett_tran_log_tab
    WHERE _task_id = $1
    GROUP BY _batch_id
    ORDER BY MAX(_mirrored_at) DESC
    LIMIT 1
  `, [taskId]);
  const latestBatchId = batchRes.rows[0]?._batch_id;
  console.log(`Using latest batch: ${latestBatchId}`);

  // 2. Fetch clean legs for matched rows (stripping internal metadata)
  const mirrorRes = await queryPg(`
    SELECT _row_number, jsonb_agg(
      COALESCE(m.payload, to_jsonb(m)) - '_batch_id' - '_rule_block_id' - '_task_id' - '_mirrored_at' - '_validation_status' - '_validation_action' - '_validation_details' - '_row_number' - 'row_num' - '_mirror_id'
    ) AS legs
    FROM mirror_sett_tran_log_tab m
    WHERE _task_id = $1 AND _batch_id = $2
    GROUP BY _row_number
  `, [taskId, latestBatchId]);

  const matchedRowNumbers = new Set(mirrorRes.rows.map(r => Number(r._row_number)));
  console.log(`Found ${matchedRowNumbers.size} matched rows.`);

  // 3. For ALL rows in this task that are UNMATCHED:
  // Set returned_data = NULL, _target_records = NULL, _target_record = NULL
  await queryPg(`
    UPDATE task_dataset_transactions
    SET 
      returned_data = NULL,
      canonical_data = (canonical_data - '_target_records' - '_target_record' - 'auditTrail' - 'stageResults') || jsonb_build_object(
        '_validation_status', 'FAIL',
        'reconciliation_status', 'FAIL',
        '_validation_action', 'STOP',
        '_target_record', null,
        '_validation_details', jsonb_build_object(
          'stage_id', 'stage-box-node-1790956029441-uyt',
          'rule_block_id', 'rb-wf-1790956098575',
          'mirror_table', 'mirror_sett_tran_log_tab',
          'legs_count', 0,
          'existence', 'NOT_FOUND_IN_TARGET_DB',
          'reconciled_at', NOW()
        )
      )
    WHERE task_id = $1 AND row_number NOT IN (${Array.from(matchedRowNumbers).join(',')})
  `, [taskId]);
  console.log(`Reset all unmatched rows to returned_data = NULL.`);

  // 4. For MATCHED rows:
  // Store clean structure: returned_data = { [workflowId]: { [targetTable]: [ leg1, leg2, ... ] } }
  let matchedUpdated = 0;
  for (const r of mirrorRes.rows) {
    const rowNum = Number(r._row_number);
    const legs = r.legs;
    const returnedDataObj = {
      [activeWfId]: {
        [targetTable]: legs
      }
    };

    await queryPg(`
      UPDATE task_dataset_transactions
      SET 
        returned_data = $2::jsonb,
        canonical_data = (canonical_data - 'auditTrail' - 'stageResults') || jsonb_build_object(
          '_validation_status', 'PASS',
          'reconciliation_status', 'PASS',
          '_validation_action', 'CONTINUE',
          '_target_records', $3::jsonb,
          '_target_record', $3::jsonb->0,
          '_validation_details', jsonb_build_object(
            'stage_id', 'stage-box-node-1790956029441-uyt',
            'rule_block_id', 'rb-wf-1790956098575',
            'mirror_table', 'mirror_sett_tran_log_tab',
            'legs_count', jsonb_array_length($3::jsonb),
            'reconciled_at', NOW()
          )
        )
      WHERE task_id = $1 AND row_number = $4
    `, [taskId, JSON.stringify(returnedDataObj), JSON.stringify(legs), rowNum]);
    matchedUpdated++;
  }
  console.log(`Updated ${matchedUpdated} matched rows with clean [workflowId][targetTable] structure.`);

  // 5. Verification
  const sampleMatched = await queryPg(`
    SELECT row_number, returned_data, canonical_data->'_target_records' as target_recs
    FROM task_dataset_transactions
    WHERE task_id = $1 AND row_number = 1
  `, [taskId]);
  console.log('\n--- Matched Row 1 Verification ---');
  console.log('returned_data:', JSON.stringify(sampleMatched.rows[0].returned_data, null, 2));

  const sampleUnmatched = await queryPg(`
    SELECT row_number, returned_data, canonical_data->'_validation_status' as status, canonical_data->'_target_record' as target_rec
    FROM task_dataset_transactions
    WHERE task_id = $1 AND row_number = 22
  `, [taskId]);
  console.log('\n--- Unmatched Row 22 Verification ---');
  console.log('returned_data:', sampleUnmatched.rows[0].returned_data);
  console.log('status:', sampleUnmatched.rows[0].status);
  console.log('target_rec:', sampleUnmatched.rows[0].target_rec);

  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});

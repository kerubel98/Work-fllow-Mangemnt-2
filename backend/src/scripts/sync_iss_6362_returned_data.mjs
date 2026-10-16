import { queryPg } from '../../dist/config/postgres.js';

async function syncTaskReturnedData(taskId = 'ISS-6362') {
  console.log(`Syncing all returned legs for task ${taskId}...`);

  // 1. Get the workflows attached or executed for this task
  const execs = await queryPg(
    "SELECT workflow_id, workflow_name FROM task_workflow_executions WHERE task_id = $1 ORDER BY executed_at DESC",
    [taskId]
  );
  const activeWfId = execs.rows[0]?.workflow_id || 'wf-1790956098575';
  console.log(`Using active workflow: ${activeWfId}`);

  // 2. Query all grouped legs from mirror_sett_tran_log_tab
  const mirrorRes = await queryPg(`
    SELECT _row_number, jsonb_agg(
      to_jsonb(m) - '_batch_id' - '_rule_block_id' - '_task_id' - '_mirrored_at' - '_validation_status' - '_validation_action' - '_validation_details'
    ) AS legs
    FROM mirror_sett_tran_log_tab m
    WHERE _task_id = $1
    GROUP BY _row_number
  `, [taskId]);

  console.log(`Found ${mirrorRes.rows.length} rows with staged legs in mirror_sett_tran_log_tab.`);

  let updatedCount = 0;
  for (const row of mirrorRes.rows) {
    const rowNum = Number(row._row_number);
    const legs = row.legs;
    if (!Array.isArray(legs) || legs.length === 0) continue;

    const legsJson = JSON.stringify(legs);

    await queryPg(`
      UPDATE task_dataset_transactions
      SET returned_data = jsonb_set(
        jsonb_set(
          COALESCE(returned_data, '{}'::jsonb) || jsonb_build_object(
            $2::text,
            COALESCE(returned_data->$2::text, '{}'::jsonb) || jsonb_build_object('tran_log_tab', $3::jsonb)
          ) || jsonb_build_object(
            'stages',
            COALESCE(returned_data->'stages', '{}'::jsonb)
          ),
          ARRAY[$2::text, 'tran_log_tab'],
          $3::jsonb,
          true
        ),
        ARRAY['stages', 'tran_log_tab'],
        jsonb_build_object(
          'targetDb', 'db-1788895559870',
          'targetTable', 'tran_log_tab',
          'queriedAt', NOW(),
          'matchCount', jsonb_array_length($3::jsonb),
          'legs', $3::jsonb,
          'aggregatedMetrics', jsonb_build_object('legCount', jsonb_array_length($3::jsonb))
        ),
        true
      ) || jsonb_build_object(
        'audit', jsonb_build_object(
          'lastExecutedAt', NOW(),
          'statusVersion', COALESCE((returned_data->'audit'->>'statusVersion')::int, 0) + 1
        )
      ),
      canonical_data = canonical_data || jsonb_build_object(
        '_target_records', $3::jsonb,
        '_target_record', $3::jsonb->0
      )
      WHERE task_id = $1 AND row_number = $4
    `, [taskId, activeWfId, legsJson, rowNum]);

    updatedCount++;
  }

  console.log(`Successfully synced ${updatedCount} transaction rows for task ${taskId}.`);
  process.exit(0);
}

syncTaskReturnedData().catch(err => {
  console.error('Sync failed:', err);
  process.exit(1);
});

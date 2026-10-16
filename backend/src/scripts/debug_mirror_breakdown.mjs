import { queryPg } from '../../dist/config/postgres.js';

async function main() {
  const q1 = await queryPg(`
    SELECT DISTINCT _batch_id, _rule_block_id, count(*) 
    FROM mirror_sett_tran_log_tab 
    WHERE _task_id = 'ISS-6362'
    GROUP BY _batch_id, _rule_block_id
  `);
  console.log('Batches in mirror_sett_tran_log_tab:', q1.rows);

  const q2 = await queryPg(`
    SELECT _batch_id, count(distinct _row_number) as distinct_rows, count(*) as total_rows
    FROM mirror_sett_tran_log_tab 
    WHERE _task_id = 'ISS-6362'
    GROUP BY _batch_id
  `);
  console.log('Per batch distinct row counts:', q2.rows);

  // Check what fe_utrnno are in task_dataset_transactions for row 1 and row 2
  const taskRows = await queryPg(`
    SELECT row_number, canonical_data->>'fe_utrnno' as fe_utrnno, canonical_data->>'fe_type' as fe_type
    FROM task_dataset_transactions
    WHERE task_id = 'ISS-6362'
    ORDER BY row_number
    LIMIT 5
  `);
  console.log('Task transaction rows 1-5:', taskRows.rows);

  // Check what fe_utrnno are in mirror_sett_tran_log_tab for _row_number = 1
  const m1 = await queryPg(`
    SELECT DISTINCT fe_utrnno, count(*) 
    FROM mirror_sett_tran_log_tab
    WHERE _task_id = 'ISS-6362' AND _row_number = 1
    GROUP BY fe_utrnno
    LIMIT 5
  `);
  console.log('Mirror _row_number=1 fe_utrnno breakdown:', m1.rows);

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

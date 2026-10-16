import { queryPg } from '../../dist/config/postgres.js';

async function main() {
  const wfs = await queryPg('SELECT id, name, target_db_id, target_table FROM database_validation_workflows');
  console.log('Workflows:', wfs.rows);

  const tables = await queryPg("SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'mirror_%'");
  console.log('Mirror tables:', tables.rows.map(r => r.table_name));

  const countSett = await queryPg("SELECT count(*) FROM mirror_sett_tran_log_tab").catch(e => ({ rows: [{ count: e.message }] }));
  console.log('mirror_sett_tran_log_tab total count:', countSett.rows[0]);

  const countSettTask = await queryPg("SELECT count(*) FROM mirror_sett_tran_log_tab WHERE _task_id = 'ISS-6362'").catch(e => ({ rows: [{ count: e.message }] }));
  console.log('mirror_sett_tran_log_tab for ISS-6362 count:', countSettTask.rows[0]);

  const row2 = await queryPg("SELECT row_number, returned_data FROM task_dataset_transactions WHERE task_id = 'ISS-6362' AND row_number = 2");
  const rd = row2.rows[0]?.returned_data;
  console.log('Top keys in returned_data:', Object.keys(rd || {}));
  console.log('Leg count under wf-1790956098575:', rd['wf-1790956098575']?.tran_log_tab?.length);
  console.log('Leg count under stages.tran_log_tab.legs:', rd?.stages?.tran_log_tab?.legs?.length);
  console.log('Leg 0:', rd['wf-1790956098575']?.tran_log_tab?.[0]?.acct_num1, rd['wf-1790956098575']?.tran_log_tab?.[0]?.amnt1);
  console.log('Leg 1:', rd['wf-1790956098575']?.tran_log_tab?.[1]?.acct_num1, rd['wf-1790956098575']?.tran_log_tab?.[1]?.amnt1);

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

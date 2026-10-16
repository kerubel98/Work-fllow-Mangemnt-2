import { queryPg } from '../../dist/config/postgres.js';

async function main() {
  const cols = await queryPg("SELECT column_name FROM information_schema.columns WHERE table_name = 'mirror_sett_tran_log_tab'");
  console.log('Columns in mirror_sett_tran_log_tab:', cols.rows.map(r => r.column_name));

  const sample = await queryPg("SELECT * FROM mirror_sett_tran_log_tab WHERE _task_id = 'ISS-6362' AND _row_number = 1 LIMIT 1");
  console.log('Sample row 1 keys and values:', sample.rows[0]);

  const sample2 = await queryPg("SELECT * FROM mirror_sett_tran_log_tab WHERE _task_id = 'ISS-6362' AND _row_number = 2 LIMIT 1");
  console.log('Sample row 2 keys and values:', sample2.rows[0]);

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

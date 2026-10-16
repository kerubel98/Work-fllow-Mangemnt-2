import { queryPg } from '../../dist/config/postgres.js';

async function main() {
  const b = await queryPg(`
    SELECT _batch_id, _row_number, count(*) as c
    FROM mirror_sett_tran_log_tab
    WHERE _task_id = 'ISS-6362' AND _batch_id = 'job-newpipe-1791744904731'
    GROUP BY _batch_id, _row_number
    ORDER BY _row_number
    LIMIT 10
  `);
  console.log('Batch job-newpipe-1791744904731 breakdown:', b.rows);

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

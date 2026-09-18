import { queryPg } from '../backend/dist/config/postgres.js';

async function main() {
  const res = await queryPg(`SELECT * FROM issues WHERE id = 'ISS-110'`);
  console.log('ISS-110 issue:', res.rows[0]);
  
  if (res.rows[0]?.workflow_id) {
    const wf = await queryPg(`SELECT * FROM workflows WHERE id = $1`, [res.rows[0].workflow_id]);
    console.log('ISS-110 workflow:', wf.rows[0]);
  }
  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});

import { queryPg } from '../backend/dist/config/postgres.js';

async function main() {
  const res = await queryPg(`SELECT chat FROM issues WHERE id = 'ISS-110'`);
  console.log('Chat attachedSummary:');
  console.log(JSON.stringify(res.rows[0]?.chat?.[0]?.attachedSummary, null, 2));
  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});

import { queryPg } from '../config/postgres.js';

async function main() {
  const result = await queryPg(`
    SELECT column_name, data_type, ordinal_position
    FROM information_schema.columns
    WHERE table_name = 'mirror_ftp_settlemnt'
    ORDER BY ordinal_position;
  `);
  console.log('--- COLUMNS IN mirror_ftp_settlemnt ---');
  for (const c of result.rows) {
    console.log(`  ${c.ordinal_position}. ${c.column_name} (${c.data_type})`);
  }

  const sampleResult = await queryPg(`SELECT * FROM "mirror_ftp_settlemnt" LIMIT 1;`);
  console.log('\n--- SAMPLE ROW ---');
  if (sampleResult.rows.length > 0) {
    const row = sampleResult.rows[0];
    console.log('Keys in sample row:', Object.keys(row));
    console.log('transaction_id:', row.transaction_id);
    console.log('amount:', row.amount);
    console.log('currency:', row.currency);
    console.log('issuer:', row.issuer);
    console.log('acquirer:', row.acquirer);
    console.log('mti:', row.mti);
    console.log('card_number:', row.card_number);
    console.log('terminal_id:', row.terminal_id);
    console.log('stan_f11:', row.stan_f11);
    console.log('refnum_f37:', row.refnum_f37);
    console.log('fe_utrnno:', row.fe_utrnno);
    console.log('bo_utrnno:', row.bo_utrnno);
    console.log('transaction_date:', row.transaction_date);
    console.log('raw_payload sample:', JSON.stringify(row.raw_payload).slice(0, 300));
  } else {
    console.log('No rows in table.');
  }

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

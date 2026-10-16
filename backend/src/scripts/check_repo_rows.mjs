import { repo } from '../store/repository.js';

async function main() {
  try {
    const res = await repo.getTaskDatasetTransactions('ISS-6362', 1, 50);
    console.log('Total rows:', res.rows.length);
    const row22 = res.rows.find(r => r._rowNumber === 22);
    console.log('Row 22:', {
      _rowNumber: row22._rowNumber,
      _validation_status: row22._validation_status,
      _validation_details: row22._validation_details,
      has_target_rec: Boolean(row22._target_record),
    });
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}

main();

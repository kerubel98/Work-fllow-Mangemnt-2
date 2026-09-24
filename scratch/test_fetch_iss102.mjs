async function test() {
  try {
    const res = await fetch('http://localhost:5002/api/issues/ISS-102/transactions?page=1&limit=5');
    const json = await res.json();
    console.log('Status:', res.status);
    console.log('Total Count:', json.totalCount);
    console.log('First 2 rows:', json.rows ? json.rows.slice(0, 2) : json);
  } catch (e) {
    console.error('Fetch error:', e);
  }
}
test();

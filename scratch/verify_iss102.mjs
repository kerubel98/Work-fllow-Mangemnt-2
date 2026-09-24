async function verify() {
  try {
    const issueRes = await fetch('http://localhost:5002/api/issues/ISS-102');
    const issue = await issueRes.json();
    console.log('--- Issue Details ---');
    console.log({
      id: issue.id,
      title: issue.title,
      type: issue.type,
      transactionId: issue.transactionId,
      status: issue.status,
      linkedHashtag: issue.linkedHashtag,
      transactionCount: issue.transactionCount,
      datasetStatus: issue.datasetStatus
    });

    const txnsRes = await fetch('http://localhost:5002/api/issues/ISS-102/transactions');
    const txns = await txnsRes.json();
    console.log('--- Task Transactions ---');
    console.log('Total Count:', txns.totalCount);
    console.log('Rows:', txns.rows);

    const batchesRes = await fetch('http://localhost:5002/api/issues/ISS-102/batches');
    const batches = await batchesRes.json();
    console.log('--- Batches ---', batches);

    const centralRes = await fetch('http://localhost:5002/api/investigations/ISS-102/central-records');
    const central = await centralRes.json();
    console.log('--- Central Records ---');
    console.log('Total Count:', central.totalCount);
    console.log('First Record:', central.records?.[0]);

  } catch (err) {
    console.error('Verification error:', err);
  }
}

verify();

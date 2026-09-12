import pg from 'pg';
const { Pool } = pg;

async function sanitizeWorkflow() {
  const pool = new Pool({
    connectionString: 'postgresql://postgres:123456@localhost:5432/operational_workflow_db'
  });

  try {
    const res = await pool.query("SELECT id, name, steps FROM database_validation_workflows WHERE id = 'wf-1789236087854'");
    if (res.rows.length === 0) {
      console.log('Workflow wf-1789236087854 not found');
      return;
    }

    const wf = res.rows[0];
    console.log('Found workflow:', wf.name);
    console.log('Current steps:', JSON.stringify(wf.steps, null, 2));

    let modified = false;
    for (const step of wf.steps) {
      if (Array.isArray(step.requiredParams) && step.requiredParams.length > 0) {
        if (step.sourceField === 'transaction_id' && !step.requiredParams.includes('transaction_id')) {
          step.sourceField = step.requiredParams[0];
          modified = true;
        }
        if (step.targetField === 'transaction_id' && !step.requiredParams.includes('transaction_id')) {
          step.targetField = step.requiredParams[0];
          modified = true;
        }
      }
    }

    if (modified) {
      await pool.query('UPDATE database_validation_workflows SET steps = $1 WHERE id = $2', [JSON.stringify(wf.steps), wf.id]);
      console.log('Successfully updated workflow steps in PostgreSQL to eliminate stale transaction_id!');
    } else {
      console.log('No steps required modification.');
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

sanitizeWorkflow();

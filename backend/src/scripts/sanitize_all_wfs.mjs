import pg from 'pg';
const { Pool } = pg;

async function sanitizeAllWorkflows() {
  const pool = new Pool({
    connectionString: 'postgresql://postgres:123456@localhost:5432/operational_workflow_db'
  });

  try {
    const res = await pool.query("SELECT id, name, steps FROM database_validation_workflows");
    for (const wf of res.rows) {
      let modified = false;
      const steps = Array.isArray(wf.steps) ? wf.steps : [];
      for (const step of steps) {
        // If step uses 'transaction_id' but has other fields configured
        if (step.sourceField === 'transaction_id') {
          const replacement = (Array.isArray(step.requiredParams) && step.requiredParams[0]) ||
            step.reportField ||
            'terminal_id';
          step.sourceField = replacement;
          modified = true;
        }
        if (step.targetField === 'transaction_id') {
          const replacement = (Array.isArray(step.requiredParams) && step.requiredParams[0]) ||
            step.reportField ||
            'terminal_id';
          step.targetField = replacement;
          modified = true;
        }
      }

      if (modified) {
        await pool.query('UPDATE database_validation_workflows SET steps = $1 WHERE id = $2', [JSON.stringify(steps), wf.id]);
        console.log(`Successfully updated workflow ${wf.name} (${wf.id})`);
      }
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

sanitizeAllWorkflows();

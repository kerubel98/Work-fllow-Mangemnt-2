import pg from 'pg';

const pool = new pg.Pool({
  connectionString: 'postgres://postgres:123456@localhost:5432/operational_workflow_db',
});

async function main() {
  const delCol = await pool.query(
    "DELETE FROM database_column_configurations WHERE table_name IN ('auth_log_tab', 'tran_log_tab', 'sv_fin_tab', 'cur_trans_log', 'usonas_fin_tab') RETURNING id"
  );
  console.log('Deleted column configs:', delCol.rowCount);

  const delMap = await pool.query(
    "DELETE FROM database_table_mappings WHERE table_name IN ('auth_log_tab', 'tran_log_tab', 'sv_fin_tab', 'cur_trans_log', 'usonas_fin_tab') OR db_id = 'db-1788629375982' RETURNING id"
  );
  console.log('Deleted table mappings:', delMap.rowCount);

  const remainingMaps = await pool.query("SELECT db_id, table_name FROM database_table_mappings");
  console.log('Remaining table mappings:', remainingMaps.rows);

  const remainingCols = await pool.query("SELECT db_id, table_name, column_name FROM database_column_configurations");
  console.log('Remaining column configs:', remainingCols.rows);

  await pool.end();
}

main().catch(console.error);

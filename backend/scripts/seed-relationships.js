import { connectPostgres, getPostgresPool } from '../dist/config/postgres.js';
import { INITIAL_TEAMS, INITIAL_TEAM_RELATIONSHIPS } from '../dist/store/dataStore.js';

async function main() {
  await connectPostgres();
  const pool = getPostgresPool();

  for (const team of INITIAL_TEAMS) {
    await pool.query(
      `INSERT INTO teams (id, name, description, team_type, manager_id, manager_name, member_ids, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         team_type = EXCLUDED.team_type,
         manager_id = EXCLUDED.manager_id,
         manager_name = EXCLUDED.manager_name,
         member_ids = EXCLUDED.member_ids;`,
      [
        team.id,
        team.name,
        team.description,
        team.teamType || 'permanent',
        team.managerId,
        team.managerName,
        JSON.stringify(team.memberIds || []),
        team.createdAt || new Date()
      ]
    );
  }

  for (const rel of INITIAL_TEAM_RELATIONSHIPS) {
    await pool.query(
      `INSERT INTO team_relationships (id, source_team_id, target_team_id, relationship_type, description, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (source_team_id, target_team_id, relationship_type) DO NOTHING;`,
      [
        rel.id,
        rel.sourceTeamId,
        rel.targetTeamId,
        rel.relationshipType,
        rel.description || null,
        rel.createdBy || 'system',
        rel.createdAt || new Date()
      ]
    );
  }

  const { rows: tRows } = await pool.query('SELECT COUNT(*)::int as count FROM teams;');
  const { rows: rRows } = await pool.query('SELECT COUNT(*)::int as count FROM team_relationships;');
  console.log('✅ Teams in DB:', tRows[0].count, '| Relationships in DB:', rRows[0].count);
  process.exit(0);
}

main().catch(err => {
  console.error('Seeding error:', err);
  process.exit(1);
});

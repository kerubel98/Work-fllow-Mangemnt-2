import { getPostgresPool, isPostgresConnected } from './postgres.js';
import {
  INITIAL_USERS,
  INITIAL_HASHTAGS,
  INITIAL_PLUGINS,
  INITIAL_DBS,
  INITIAL_SYSTEMS,
  INITIAL_TEAMS,
  INITIAL_TEAM_RELATIONSHIPS,
  INITIAL_ISSUES,
  INITIAL_ORGANIZATIONS,
  store
} from '../store/dataStore.js';

async function seedTeamsAndRelationshipsIfEmpty(pool: any) {
  try {
    const { rows: teamRows } = await pool.query('SELECT COUNT(*)::int as count FROM teams;');
    if (teamRows[0].count === 0) {
      console.log('🌱 Seeding default teams in PostgreSQL...');
      for (const team of INITIAL_TEAMS) {
        await pool.query(
          `INSERT INTO teams (id, name, description, team_type, manager_id, manager_name, member_ids, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (id) DO NOTHING;`,
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
    }

    const { rows: relRows } = await pool.query('SELECT COUNT(*)::int as count FROM team_relationships;');
    if (relRows[0].count === 0) {
      console.log('🌱 Seeding default team relationships in PostgreSQL...');
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
    }
  } catch (err: any) {
    console.warn('Could not seed teams/relationships in PostgreSQL:', err.message);
  }
}

export async function seedPostgres() {
  if (!isPostgresConnected) return;
  const pool = getPostgresPool();

  try {
    const { rows } = await pool.query('SELECT COUNT(*)::int as count FROM users;');
    if (rows[0].count > 0) {
      await seedTeamsAndRelationshipsIfEmpty(pool);
      return; // Already seeded other tables
    }

    console.log('🌱 Seeding initial PostgreSQL data...');

    // 1. Organizations
    for (const org of INITIAL_ORGANIZATIONS) {
      await pool.query(
        `INSERT INTO organizations (id, name, domain, created_at, settings)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO NOTHING;`,
        [org.id, org.name, (org as any).domain || null, org.createdAt || new Date(), JSON.stringify((org as any).settings || {})]
      );
    }

    // 2. Users
    for (const user of INITIAL_USERS) {
      await pool.query(
        `INSERT INTO users (id, username, email, role, is_approved, can_execute_select, can_execute_update, allowed_db_ids, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO NOTHING;`,
        [
          user.id,
          user.username,
          user.email,
          user.role,
          user.isApproved,
          user.canExecuteSelect ?? true,
          user.canExecuteUpdate ?? false,
          JSON.stringify(user.allowedDbIds || []),
          user.createdAt || new Date()
        ]
      );
    }

    // 3. Teams
    for (const team of INITIAL_TEAMS) {
      await pool.query(
        `INSERT INTO teams (id, name, description, team_type, manager_id, manager_name, member_ids, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO NOTHING;`,
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

    // 4. Database Connections
    for (const db of INITIAL_DBS) {
      await pool.query(
        `INSERT INTO database_connections (id, name, type, host, port, connection_string, database_name, username, password, status, api_endpoint, created_by_admin, requires_access_approval, description, allowed_roles)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         ON CONFLICT (id) DO NOTHING;`,
        [
          db.id,
          db.name,
          db.type,
          db.host,
          db.port || null,
          db.connectionString || null,
          db.databaseName || null,
          db.username || null,
          db.password || null,
          db.status || 'offline',
          db.apiEndpoint || '',
          db.createdByAdmin ?? false,
          db.requiresAccessApproval ?? false,
          db.description || '',
          JSON.stringify(db.allowedRoles || [])
        ]
      );
    }

    // 5. Environment Systems
    for (const sys of INITIAL_SYSTEMS) {
      await pool.query(
        `INSERT INTO environment_systems (id, name, description, testing, production, allowed_user_ids, allowed_roles, require_dml_approval)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO NOTHING;`,
        [
          sys.id,
          sys.name,
          sys.description,
          JSON.stringify(sys.testing || {}),
          JSON.stringify(sys.production || {}),
          JSON.stringify(sys.allowedUserIds || []),
          JSON.stringify(sys.allowedRoles || []),
          sys.requireDmlApproval ?? false
        ]
      );
    }

    // 6. Hashtag Presets
    for (const tag of INITIAL_HASHTAGS) {
      await pool.query(
        `INSERT INTO hashtag_presets (id, tag, description, criteria, expected_file_structure, solution_template, author, created_at, file_template_data, criteria_rules)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (id) DO NOTHING;`,
        [
          tag.tag,
          tag.tag,
          tag.description,
          tag.criteria,
          JSON.stringify(tag.expectedFileStructure || []),
          tag.solutionTemplate,
          tag.author,
          tag.createdAt || new Date(),
          JSON.stringify(tag.fileTemplateData || []),
          JSON.stringify(tag.criteriaRules || [])
        ]
      );
    }

    // 7. Plugins
    for (const plugin of INITIAL_PLUGINS) {
      await pool.query(
        `INSERT INTO plugins (id, name, description, enabled, category, config)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO NOTHING;`,
        [
          plugin.id,
          plugin.name,
          plugin.description,
          plugin.enabled,
          plugin.category,
          JSON.stringify(plugin.config || {})
        ]
      );
    }

    // 8. Issues
    for (const issue of INITIAL_ISSUES) {
      await pool.query(
        `INSERT INTO issues (
          id, title, description, status, priority, creator_id, creator_name, created_at, type,
          transaction_id, uploaded_file_name, uploaded_file_headers, file_mapping, transaction_count,
          dataset_status, first_level_notes, second_level_notes, solution_script, solution_test_result,
          solution_executed, solution_executed_at, linked_hashtag, chat, assigned_tech_user_id,
          assigned_tech_user_name, investigation_system_id, investigation_environment,
          investigation_table, validation_status, validation_errors, query_results, moved_to_testing,
          row_labels, added_label_column_name, custom_filters
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9,
          $10, $11, $12, $13, $14,
          $15, $16, $17, $18, $19,
          $20, $21, $22, $23, $24,
          $25, $26, $27,
          $28, $29, $30, $31, $32,
          $33, $34, $35
        ) ON CONFLICT (id) DO NOTHING;`,
        [
          issue.id,
          issue.title,
          issue.description,
          issue.status || 'Open',
          issue.priority || 'Medium',
          issue.creatorId,
          issue.creatorName,
          issue.createdAt || new Date(),
          issue.type || 'single',
          issue.transactionId || null,
          issue.uploadedFileName || null,
          JSON.stringify(issue.uploadedFileHeaders || []),
          JSON.stringify(issue.fileMapping || {}),
          issue.firstLevelMappedData ? issue.firstLevelMappedData.length : 0,
          issue.firstLevelMappedData ? 'INGESTED' : 'NONE',
          issue.firstLevelNotes || null,
          issue.secondLevelNotes || null,
          issue.solutionScript || null,
          issue.solutionTestResult || null,
          issue.solutionExecuted ?? false,
          issue.solutionExecutedAt ? new Date(issue.solutionExecutedAt) : null,
          issue.linkedHashtag || null,
          JSON.stringify(issue.chat || []),
          issue.assignedTechUserId || null,
          issue.assignedTechUserName || null,
          issue.investigationSystemId || null,
          issue.investigationEnvironment || null,
          issue.investigationTable || null,
          issue.validationStatus || 'untested',
          JSON.stringify(issue.validationErrors || []),
          JSON.stringify(issue.queryResults || []),
          issue.movedToTesting ?? false,
          JSON.stringify(issue.rowLabels || {}),
          issue.addedLabelColumnName || null,
          JSON.stringify(issue.customFilters || [])
        ]
      );

      // Extract any mapped data into task_dataset_transactions table
      if (issue.firstLevelMappedData && issue.firstLevelMappedData.length > 0) {
        for (let i = 0; i < issue.firstLevelMappedData.length; i++) {
          const row = issue.firstLevelMappedData[i];
          await pool.query(
            `INSERT INTO task_dataset_transactions (task_id, row_number, canonical_data, raw_data)
             VALUES ($1, $2, $3, $4);`,
            [issue.id, i + 1, JSON.stringify(row), JSON.stringify(row)]
          );
        }
      }
    }

    console.log('🎉 PostgreSQL database seeded with default collections successfully!');
  } catch (err: any) {
    console.error('❌ Error seeding PostgreSQL database:', err.message);
  }
}

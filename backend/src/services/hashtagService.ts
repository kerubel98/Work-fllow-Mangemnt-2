/**
 * Universal Hashtag Binding Service
 * Indexes and resolves all platform assets linked to a specific #hashtag:
 * (FTP templates, DB configs, Validation Workflows, Tasks/Issues, and Team Chat Messages).
 */

import { queryPg } from '../config/postgres.js';

export interface HashtagResolvedAssets {
  tag: string;
  workflows: any[];
  ftpConfigs: any[];
  databaseConnections: any[];
  issues: any[];
  chatMessages: any[];
}

export const hashtagService = {
  /**
   * Resolves all system assets bound to a specific hashtag.
   */
  async resolveHashtagAssets(tag: string): Promise<HashtagResolvedAssets> {
    const cleanTag = tag.trim().replace(/^#+/, '').toLowerCase();
    const tagPattern = `%#${cleanTag}%`;

    // 1. Fetch matching Validation Workflows
    const wfRes = await queryPg(
      `SELECT id, name, description, target_table, category, created_at 
       FROM database_validation_workflows 
       WHERE LOWER(name) LIKE $1 OR LOWER(description) LIKE $1 OR LOWER(category) LIKE $1;`,
      [tagPattern]
    );

    // 2. Fetch matching FTP / File Staging Configs
    const ftpRes = await queryPg(
      `SELECT id, name, file_name_pattern, file_format, staging_table_name, last_staged_at 
       FROM ftp_file_staging_configs 
       WHERE LOWER(name) LIKE $1 OR LOWER(file_name_pattern) LIKE $1;`,
      [tagPattern]
    );

    // 3. Fetch matching Database Connections
    const dbRes = await queryPg(
      `SELECT id, name, type, host, database_name, status 
       FROM database_connections 
       WHERE LOWER(name) LIKE $1 OR LOWER(database_name) LIKE $1;`,
      [tagPattern]
    );

    // 4. Fetch matching Issues & Tasks
    const issueRes = await queryPg(
      `SELECT id, title, description, status, priority, type, created_at 
       FROM issues 
       WHERE LOWER(title) LIKE $1 OR LOWER(description) LIKE $1;`,
      [tagPattern]
    );

    // 5. Fetch matching Team Discussion Chat Messages
    const chatRes = await queryPg(
      `SELECT id, team_id, sender_id, sender_name, content, timestamp 
       FROM team_discussion_messages 
       WHERE LOWER(content) LIKE $1;`,
      [tagPattern]
    );

    return {
      tag: `#${cleanTag}`,
      workflows: wfRes.rows || [],
      ftpConfigs: ftpRes.rows || [],
      databaseConnections: dbRes.rows || [],
      issues: issueRes.rows || [],
      chatMessages: chatRes.rows || []
    };
  }
};

import { Router } from 'express';
import { repo } from '../store/repository.js';
import { eventService } from '../services/events.js';
import { queryPg, isPostgresConnected } from '../config/postgres.js';
export const teamsRouter = Router();
// ================= TEAMS =================
teamsRouter.get('/', async (_req, res) => {
    try {
        const teams = await repo.getTeams();
        return res.json(teams);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
teamsRouter.post('/', async (req, res) => {
    try {
        const teamData = req.body;
        const newTeam = {
            id: teamData.id || `team-${Date.now()}`,
            name: teamData.name || 'New Squad',
            description: teamData.description || '',
            teamType: teamData.teamType || 'working',
            managerId: teamData.managerId || 'usr-4',
            managerName: teamData.managerName || 'manager_alex',
            memberIds: teamData.memberIds || ['usr-1', 'usr-2'],
            createdAt: new Date().toISOString()
        };
        const saved = await repo.createTeam(newTeam);
        eventService.broadcastEvent('team:created', saved);
        return res.status(201).json(saved);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
teamsRouter.put('/:id', async (req, res) => {
    try {
        const updated = await repo.updateTeam(req.params.id, req.body);
        if (!updated)
            return res.status(404).json({ error: 'Team not found' });
        eventService.broadcastEvent('team:updated', updated);
        return res.json(updated);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
teamsRouter.delete('/:id', async (req, res) => {
    try {
        const success = await repo.deleteTeam(req.params.id);
        eventService.broadcastEvent('team:deleted', { id: req.params.id });
        return res.json({ success });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// ================= RELATIONSHIPS & ORG HIERARCHY =================
teamsRouter.get('/relationships', async (req, res) => {
    try {
        const teamId = req.query.teamId;
        const relationships = await repo.getTeamRelationships(teamId);
        return res.json(relationships);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
teamsRouter.post('/relationships', async (req, res) => {
    try {
        const { sourceTeamId, targetTeamId, relationshipType, description, createdBy } = req.body;
        if (!sourceTeamId || !targetTeamId || !relationshipType) {
            return res.status(400).json({ error: 'sourceTeamId, targetTeamId, and relationshipType are required.' });
        }
        if (sourceTeamId === targetTeamId) {
            return res.status(400).json({ error: 'A team cannot have a relationship with itself.' });
        }
        const newRel = {
            id: req.body.id || `rel-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
            sourceTeamId,
            targetTeamId,
            relationshipType,
            description: description || '',
            createdBy: createdBy || 'usr-1',
            createdAt: new Date().toISOString()
        };
        const saved = await repo.createTeamRelationship(newRel);
        eventService.broadcastEvent('team:relationship:created', saved);
        return res.status(201).json(saved);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
teamsRouter.delete('/relationships/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const success = await repo.deleteTeamRelationship(id);
        if (!success) {
            return res.status(404).json({ error: 'Relationship not found or could not be deleted.' });
        }
        eventService.broadcastEvent('team:relationship:deleted', { id });
        return res.json({ success: true, id });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
teamsRouter.get('/hierarchy', async (_req, res) => {
    try {
        const teams = await repo.getTeams();
        const relationships = await repo.getTeamRelationships();
        const teamMap = new Map();
        teams.forEach(t => {
            teamMap.set(t.id, {
                ...t,
                parentUnits: [],
                subUnits: [],
                escalationTargets: [],
                peers: [],
                upstream: [],
                downstream: [],
                complianceReviewers: []
            });
        });
        const summarizeTeam = (t) => ({
            id: t.id,
            name: t.name,
            description: t.description,
            teamType: t.teamType,
            managerId: t.managerId,
            managerName: t.managerName,
            memberIds: t.memberIds
        });
        relationships.forEach(rel => {
            const source = teamMap.get(rel.sourceTeamId);
            const target = teamMap.get(rel.targetTeamId);
            if (source && target) {
                const sourceSummary = summarizeTeam(source);
                const targetSummary = summarizeTeam(target);
                if (rel.relationshipType === 'PARENT_UNIT') {
                    source.parentUnits.push({ id: rel.id, team: targetSummary, description: rel.description });
                    target.subUnits.push({ id: rel.id, team: sourceSummary, description: rel.description });
                }
                else if (rel.relationshipType === 'SUB_UNIT') {
                    source.subUnits.push({ id: rel.id, team: targetSummary, description: rel.description });
                    target.parentUnits.push({ id: rel.id, team: sourceSummary, description: rel.description });
                }
                else if (rel.relationshipType === 'ESCALATION_TARGET') {
                    source.escalationTargets.push({ id: rel.id, team: targetSummary, description: rel.description });
                }
                else if (rel.relationshipType === 'PEER_COLLABORATOR') {
                    source.peers.push({ id: rel.id, team: targetSummary, description: rel.description });
                    target.peers.push({ id: rel.id, team: sourceSummary, description: rel.description });
                }
                else if (rel.relationshipType === 'UPSTREAM_PROVIDER') {
                    source.upstream.push({ id: rel.id, team: targetSummary, description: rel.description });
                    target.downstream.push({ id: rel.id, team: sourceSummary, description: rel.description });
                }
                else if (rel.relationshipType === 'DOWNSTREAM_CONSUMER') {
                    source.downstream.push({ id: rel.id, team: targetSummary, description: rel.description });
                    target.upstream.push({ id: rel.id, team: sourceSummary, description: rel.description });
                }
                else if (rel.relationshipType === 'AUDIT_COMPLIANCE_REVIEWER') {
                    source.complianceReviewers.push({ id: rel.id, team: targetSummary, description: rel.description });
                }
            }
        });
        const allEnrichedTeams = Array.from(teamMap.values());
        const rootUnits = allEnrichedTeams.filter(t => t.teamType === 'permanent' && t.parentUnits.length === 0);
        const workingTeams = allEnrichedTeams.filter(t => t.teamType === 'working');
        return res.json({
            teams: allEnrichedTeams,
            rootUnits,
            workingTeams,
            totalRelationships: relationships.length
        });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// ================= TASKS =================
teamsRouter.get('/tasks/all', async (req, res) => {
    try {
        const teamId = req.query.teamId;
        const tasks = await repo.getTeamTasks(teamId);
        return res.json(tasks);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
teamsRouter.post('/tasks', async (req, res) => {
    try {
        const taskData = req.body;
        if (!taskData.title || !taskData.teamId) {
            return res.status(400).json({ error: 'Title and teamId are required' });
        }
        const statusVal = taskData.status === 'In Progress' || taskData.status === 'Done' ? taskData.status : 'To Do';
        const priorityVal = taskData.priority === 'High' || taskData.priority === 'Low' ? taskData.priority : 'Medium';
        const newTask = {
            id: taskData.id || `task-${Date.now()}`,
            teamId: taskData.teamId,
            title: taskData.title,
            description: taskData.description || '',
            status: statusVal,
            priority: priorityVal,
            assigneeId: taskData.assigneeId || 'usr-1',
            assigneeName: taskData.assigneeName || 'admin',
            creatorId: taskData.creatorId || 'usr-1',
            creatorName: taskData.creatorName || 'admin',
            dueDate: taskData.dueDate || new Date(Date.now() + 7 * 86400000).toISOString(),
            createdAt: new Date().toISOString()
        };
        const saved = await repo.createTeamTask(newTask);
        eventService.broadcastEvent('task:created', saved);
        return res.status(201).json(saved);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
teamsRouter.put('/tasks/:id', async (req, res) => {
    try {
        const updated = await repo.updateTeamTask(req.params.id, req.body);
        if (!updated)
            return res.status(404).json({ error: 'Task not found' });
        eventService.broadcastEvent('task:updated', updated);
        return res.json(updated);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
teamsRouter.delete('/tasks/:id', async (req, res) => {
    try {
        const success = await repo.deleteTeamTask(req.params.id);
        eventService.broadcastEvent('task:deleted', { id: req.params.id });
        return res.json({ success });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// ================= INSIGHTS =================
teamsRouter.get('/insights/all', async (req, res) => {
    try {
        const teamId = req.query.teamId;
        const insights = await repo.getTeamInsights(teamId);
        return res.json(insights);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
teamsRouter.post('/insights', async (req, res) => {
    try {
        const data = req.body;
        if (!data.teamId || !data.content) {
            return res.status(400).json({ error: 'teamId and content are required' });
        }
        const newInsight = {
            id: data.id || `ins-${Date.now()}`,
            teamId: data.teamId,
            title: data.title || 'Operational Insight',
            authorId: data.authorId || 'usr-1',
            authorName: data.authorName || 'admin',
            authorRole: data.authorRole || 'operational',
            content: data.content,
            tags: data.tags || ['ops'],
            createdAt: new Date().toISOString()
        };
        const saved = await repo.createTeamInsight(newInsight);
        eventService.broadcastEvent('insight:created', saved);
        return res.status(201).json(saved);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
teamsRouter.delete('/insights/:id', async (req, res) => {
    try {
        const success = await repo.deleteTeamInsight(req.params.id);
        eventService.broadcastEvent('insight:deleted', { id: req.params.id });
        return res.json({ success });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// ================= MESSAGES / DISCUSSION =================
teamsRouter.get('/messages/all', async (req, res) => {
    try {
        const teamId = req.query.teamId;
        const messages = await repo.getTeamMessages(teamId);
        return res.json(messages);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
teamsRouter.post('/messages', async (req, res) => {
    try {
        const data = req.body;
        if (!data.teamId || !data.content) {
            return res.status(400).json({ error: 'teamId and content are required' });
        }
        const newMsg = {
            id: data.id || `tmsg-${Date.now()}`,
            teamId: data.teamId,
            senderId: data.senderId || 'usr-1',
            senderName: data.senderName || 'admin',
            senderRole: data.senderRole || 'operational',
            content: data.content,
            timestamp: new Date().toISOString()
        };
        const saved = await repo.createTeamMessage(newMsg);
        eventService.broadcastEvent('team_message:new', saved);
        return res.status(201).json(saved);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// ================= CROSS-FUNCTIONAL PROJECT GROUPS =================
teamsRouter.get('/groups', async (_req, res) => {
    try {
        if (isPostgresConnected) {
            const dbRes = await queryPg(`SELECT * FROM cross_functional_project_groups ORDER BY created_at DESC;`);
            return res.json(dbRes.rows.map(r => ({
                id: r.id,
                name: r.name,
                description: r.description,
                strategicObjectiveId: r.strategic_objective_id,
                memberUserIds: r.member_user_ids || [],
                createdBy: r.created_by,
                createdAt: r.created_at
            })));
        }
        return res.json([]);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
teamsRouter.post('/groups', async (req, res) => {
    try {
        const { name, description, strategicObjectiveId, memberUserIds, createdBy } = req.body;
        if (!name)
            return res.status(400).json({ error: 'Group name is required' });
        const id = `grp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
        const membersJson = JSON.stringify(memberUserIds || []);
        if (isPostgresConnected) {
            const sql = `
        INSERT INTO cross_functional_project_groups (id, name, description, strategic_objective_id, member_user_ids, created_by)
        VALUES ($1, $2, $3, $4, $5::jsonb, $6)
        RETURNING *;
      `;
            const dbRes = await queryPg(sql, [id, name, description || '', strategicObjectiveId || null, membersJson, createdBy || 'admin']);
            const r = dbRes.rows[0];
            const newGroup = {
                id: r.id,
                name: r.name,
                description: r.description,
                strategicObjectiveId: r.strategic_objective_id,
                memberUserIds: r.member_user_ids,
                createdBy: r.created_by,
                createdAt: r.created_at
            };
            eventService.broadcastEvent('team_group:created', newGroup);
            return res.status(201).json(newGroup);
        }
        return res.status(201).json({ id, name, description, memberUserIds });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// ================= CROSS-TEAM DASHBOARD VISIBILITY GRANTS =================
teamsRouter.get('/grants', async (req, res) => {
    try {
        const teamId = req.query.teamId;
        if (isPostgresConnected) {
            let sql = `SELECT * FROM team_dashboard_visibility_grants`;
            const params = [];
            if (teamId) {
                sql += ` WHERE grantor_team_id = $1 OR grantee_team_id = $1`;
                params.push(teamId);
            }
            sql += ` ORDER BY created_at DESC;`;
            const dbRes = await queryPg(sql, params);
            return res.json(dbRes.rows.map(r => ({
                id: r.id,
                grantorTeamId: r.grantor_team_id,
                granteeTeamId: r.grantee_team_id,
                accessLevel: r.access_level,
                grantedBy: r.granted_by,
                createdAt: r.created_at
            })));
        }
        return res.json([]);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
teamsRouter.post('/grants', async (req, res) => {
    try {
        const { grantorTeamId, granteeTeamId, accessLevel, grantedBy } = req.body;
        if (!grantorTeamId || !granteeTeamId) {
            return res.status(400).json({ error: 'grantorTeamId and granteeTeamId are required' });
        }
        const id = `grant-${Date.now()}`;
        const level = accessLevel === 'FULL' ? 'FULL' : 'PARTIAL_KPI';
        if (isPostgresConnected) {
            const sql = `
        INSERT INTO team_dashboard_visibility_grants (id, grantor_team_id, grantee_team_id, access_level, granted_by)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *;
      `;
            const dbRes = await queryPg(sql, [id, grantorTeamId, granteeTeamId, level, grantedBy || 'admin']);
            const r = dbRes.rows[0];
            const grant = {
                id: r.id,
                grantorTeamId: r.grantor_team_id,
                granteeTeamId: r.grantee_team_id,
                accessLevel: r.access_level,
                grantedBy: r.granted_by,
                createdAt: r.created_at
            };
            eventService.broadcastEvent('team_grant:created', grant);
            return res.status(201).json(grant);
        }
        return res.status(201).json({ id, grantorTeamId, granteeTeamId, accessLevel: level });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// ================= TEAM MANAGER IN/OUT KPI DASHBOARD =================
teamsRouter.get('/kpis', async (req, res) => {
    try {
        const teamId = req.query.teamId || 'team-cards';
        if (isPostgresConnected) {
            const [pendingRes, approvedRes, rejectedRes] = await Promise.all([
                queryPg(`SELECT COUNT(*) FROM resolution_approval_requests WHERE team_id = $1 AND status = 'PENDING'`, [teamId]),
                queryPg(`SELECT COUNT(*) FROM resolution_approval_requests WHERE team_id = $1 AND status = 'APPROVED'`, [teamId]),
                queryPg(`SELECT COUNT(*) FROM resolution_approval_requests WHERE team_id = $1 AND status = 'REJECTED'`, [teamId])
            ]);
            const pendingCount = parseInt(pendingRes.rows[0]?.count || '0', 10);
            const approvedCount = parseInt(approvedRes.rows[0]?.count || '0', 10);
            const rejectedCount = parseInt(rejectedRes.rows[0]?.count || '0', 10);
            const totalResolved = approvedCount + rejectedCount;
            const clearanceRate = (totalResolved + pendingCount) > 0
                ? Math.round((approvedCount / Math.max(1, totalResolved + pendingCount)) * 100)
                : 100;
            return res.json({
                teamId,
                inflow: {
                    totalIngestedFiles: 42,
                    assignedTasksCount: 18,
                    openDiscrepanciesCount: 12,
                    pendingResolutionRequests: pendingCount
                },
                outflow: {
                    approvedResolutionsCount: approvedCount,
                    rejectedResolutionsCount: rejectedCount,
                    totalResolvedCount: totalResolved,
                    makerCheckerClearanceRate: clearanceRate,
                    slaComplianceRate: 94.5,
                    avgResolutionTimeHours: 2.4
                }
            });
        }
        return res.json({
            teamId,
            inflow: { totalIngestedFiles: 10, assignedTasksCount: 5, openDiscrepanciesCount: 3, pendingResolutionRequests: 1 },
            outflow: { approvedResolutionsCount: 8, rejectedResolutionsCount: 1, totalResolvedCount: 9, makerCheckerClearanceRate: 88, slaComplianceRate: 92, avgResolutionTimeHours: 3.1 }
        });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// ================= AI STRATEGIC OBJECTIVES =================
teamsRouter.get('/ai-objectives', async (_req, res) => {
    try {
        if (isPostgresConnected) {
            const dbRes = await queryPg(`SELECT * FROM ai_strategic_objectives ORDER BY created_at DESC;`);
            return res.json(dbRes.rows.map(r => ({
                id: r.id,
                title: r.title,
                description: r.description,
                targetMetric: r.target_metric,
                targetValue: parseFloat(r.target_value || 0),
                currentValue: parseFloat(r.current_value || 0),
                linkedHashtags: r.linked_hashtags || [],
                assignedTeamIds: r.assigned_team_ids || [],
                createdAt: r.created_at
            })));
        }
        return res.json([]);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
teamsRouter.post('/ai-objectives', async (req, res) => {
    try {
        const { title, description, targetMetric, targetValue, linkedHashtags, assignedTeamIds } = req.body;
        if (!title)
            return res.status(400).json({ error: 'Title is required' });
        const id = `strat-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
        const hashtagsJson = JSON.stringify(linkedHashtags || []);
        const teamsJson = JSON.stringify(assignedTeamIds || []);
        if (isPostgresConnected) {
            const sql = `
        INSERT INTO ai_strategic_objectives (id, title, description, target_metric, target_value, current_value, linked_hashtags, assigned_team_ids)
        VALUES ($1, $2, $3, $4, $5, 0.00, $6::jsonb, $7::jsonb)
        RETURNING *;
      `;
            const dbRes = await queryPg(sql, [
                id,
                title,
                description || '',
                targetMetric || 'Resolution Rate',
                targetValue || 95.0,
                hashtagsJson,
                teamsJson
            ]);
            const r = dbRes.rows[0];
            const obj = {
                id: r.id,
                title: r.title,
                description: r.description,
                targetMetric: r.target_metric,
                targetValue: parseFloat(r.target_value || 0),
                currentValue: parseFloat(r.current_value || 0),
                linkedHashtags: r.linked_hashtags,
                assignedTeamIds: r.assigned_team_ids,
                createdAt: r.created_at
            };
            eventService.broadcastEvent('ai_objective:created', obj);
            return res.status(201).json(obj);
        }
        return res.status(201).json({ id, title, targetMetric, targetValue });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

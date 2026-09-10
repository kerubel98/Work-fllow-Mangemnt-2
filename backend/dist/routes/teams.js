import { Router } from 'express';
import { repo } from '../store/repository.js';
import { eventService } from '../services/events.js';
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

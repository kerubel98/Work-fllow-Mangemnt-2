import { Router } from 'express';
import { repo } from '../store/repository.js';
export const miscRouter = Router();
// ================= HASHTAGS =================
miscRouter.get('/hashtags', async (_req, res) => {
    try {
        const tags = await repo.getHashtags();
        return res.json(tags);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
miscRouter.post('/hashtags', async (req, res) => {
    try {
        const newTag = req.body;
        if (!newTag.tag || !newTag.solutionTemplate) {
            return res.status(400).json({ error: 'Tag name and solution template are required' });
        }
        const saved = await repo.createHashtag(newTag);
        return res.status(201).json(saved);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// ================= PLUGINS =================
miscRouter.get('/plugins', async (_req, res) => {
    try {
        const plugins = await repo.getPlugins();
        return res.json(plugins);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
miscRouter.put('/plugins/:id/toggle', async (req, res) => {
    try {
        const { enabled } = req.body;
        const plugin = await repo.togglePlugin(req.params.id, enabled);
        if (!plugin)
            return res.status(404).json({ error: 'Plugin not found' });
        return res.json(plugin);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// ================= SYSTEMS =================
miscRouter.get('/systems', async (_req, res) => {
    try {
        const systems = await repo.getSystems();
        return res.json(systems);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
miscRouter.post('/systems', async (req, res) => {
    try {
        const sysData = req.body;
        const newSys = {
            id: sysData.id || `sys-${Date.now()}`,
            name: sysData.name || 'Core Engine',
            description: sysData.description || '',
            testing: sysData.testing || { dbName: 'test_db', allowedTables: ['transactions'], apiEndpoint: 'http://localhost:3000/api/db' },
            production: sysData.production || { dbName: 'prod_db', allowedTables: ['transactions'], apiEndpoint: 'http://localhost:3000/api/db' },
            allowedUserIds: sysData.allowedUserIds || ['usr-1'],
            allowedRoles: sysData.allowedRoles || ['admin', 'technical'],
            requireDmlApproval: sysData.requireDmlApproval ?? true
        };
        const saved = await repo.createSystem(newSys);
        return res.status(201).json(saved);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
miscRouter.put('/systems/:id', async (req, res) => {
    try {
        const updated = await repo.updateSystem(req.params.id, req.body);
        if (!updated)
            return res.status(404).json({ error: 'System not found' });
        return res.json(updated);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
miscRouter.delete('/systems/:id', async (req, res) => {
    try {
        const success = await repo.deleteSystem(req.params.id);
        return res.json({ success });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// ================= METRICS =================
miscRouter.get('/metrics', async (_req, res) => {
    try {
        const metrics = await repo.getMetrics();
        return res.json(metrics);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

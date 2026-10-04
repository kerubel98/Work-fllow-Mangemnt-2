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
miscRouter.get('/hashtags/resolve/:tag', async (req, res) => {
    try {
        const { hashtagService } = await import('../services/hashtagService.js');
        const resolved = await hashtagService.resolveHashtagAssets(req.params.tag);
        return res.json(resolved);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// PUT /api/hashtags/:tag/kpis - Attach or update manager KPIs for a hashtag
miscRouter.put('/hashtags/:tag/kpis', async (req, res) => {
    try {
        const { kpis } = req.body;
        if (!Array.isArray(kpis)) {
            return res.status(400).json({ error: 'kpis array is required' });
        }
        const updated = await repo.updateHashtagKpis(req.params.tag, kpis);
        if (!updated)
            return res.status(404).json({ error: 'Hashtag not found' });
        return res.json(updated);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// POST /api/hashtags/create-from-issue/:issueId - Define reusable hashtag out of a resolved issue
miscRouter.post('/hashtags/create-from-issue/:issueId', async (req, res) => {
    try {
        const issue = await repo.getIssueById(req.params.issueId);
        if (!issue)
            return res.status(404).json({ error: 'Issue not found' });
        const { tag, description, workflowId, workflowName, author } = req.body;
        const cleanTag = tag ? (tag.startsWith('#') ? tag : `#${tag}`) : (issue.linkedHashtag || `#CASE_${issue.id}`);
        const newPreset = {
            tag: cleanTag,
            description: description || `Standardized template derived from resolved issue ${issue.id}: ${issue.title}`,
            criteria: `Derived from ${issue.title}`,
            expectedFileStructure: issue.uploadedFileHeaders && issue.uploadedFileHeaders.length > 0 ? issue.uploadedFileHeaders : ['transaction_id', 'amount', 'status'],
            solutionTemplate: issue.solutionScript || 'SELECT * FROM transactions WHERE status = \'FAILED\';',
            author: author || issue.creatorName || 'Operator',
            createdAt: new Date().toISOString(),
            workflowId: workflowId || issue.workflowId,
            workflowName: workflowName,
            processType: issue.processType || 'INTERNAL_STAGED_FIX',
            kpis: []
        };
        const saved = await repo.createHashtag(newPreset);
        return res.status(201).json(saved);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// GET /api/hashtags/analytics - Managerial hashtag-specific analytics & pending solution script tracker
miscRouter.get('/hashtags/analytics', async (_req, res) => {
    try {
        const [tags, allIssues] = await Promise.all([
            repo.getHashtags(),
            repo.getIssues()
        ]);
        const analytics = tags.map(tag => {
            const matchingTasks = allIssues.filter(i => i.linkedHashtag === tag.tag);
            const openCount = matchingTasks.filter(i => i.status === 'Open' || i.status === 'Investigating').length;
            const resolvedCount = matchingTasks.filter(i => i.status === 'Resolved' || i.status === 'Closed').length;
            const awaitingScriptCount = matchingTasks.filter(i => (i.status === 'Open' || i.status === 'Investigating') && !i.solutionScript).length;
            const executedFixesCount = matchingTasks.filter(i => i.solutionExecuted).length;
            return {
                tag: tag.tag,
                description: tag.description,
                author: tag.author,
                workflowId: tag.workflowId,
                workflowName: tag.workflowName,
                processType: tag.processType || 'INTERNAL_STAGED_FIX',
                hashtagType: tag.hashtagType || 'FILE_INGESTION',
                totalTasks: matchingTasks.length,
                openCount,
                resolvedCount,
                awaitingScriptCount,
                executedFixesCount,
                kpis: tag.kpis || []
            };
        });
        const issuesAwaitingSolution = allIssues
            .filter(i => (i.status === 'Open' || i.status === 'Investigating') && !i.solutionScript)
            .map(i => ({
            id: i.id,
            title: i.title,
            priority: i.priority,
            status: i.status,
            creatorName: i.creatorName,
            assignedTechUserName: i.assignedTechUserName,
            linkedHashtag: i.linkedHashtag || 'Untagged',
            teamId: i.teamId,
            createdAt: i.createdAt
        }));
        return res.json({
            hashtagAnalytics: analytics,
            issuesAwaitingSolution,
            totalTrackedTags: tags.length
        });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// ── Universal Hashtag Engine Routes (Phase 4) ────────────────────────────────
// ── Universal Hashtag Engine Routes (Phase 4) ────────────────────────────────
function normalizeHashtagParam(rawTag) {
    const clean = (rawTag || '').trim().replace(/^#+/, '');
    return clean ? `#${clean.toUpperCase()}` : '';
}
// POST /api/hashtags/test-preflight
// Dry-run pre-flight test for any hashtag type
miscRouter.post('/hashtags/test-preflight', async (req, res) => {
    try {
        const { testPreFlight } = await import('../services/hashtagService.js');
        const { tag, sampleRows } = req.body;
        if (!tag)
            return res.status(400).json({ error: 'tag is required' });
        const normalized = normalizeHashtagParam(tag);
        const preset = await repo.getHashtagByTag(normalized);
        if (!preset)
            return res.status(404).json({ error: `Hashtag '${normalized}' not found` });
        const result = await testPreFlight(preset, sampleRows || []);
        return res.json(result);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// GET /api/hashtags/reports/team/:teamId - Team dashboard report
miscRouter.get('/hashtags/reports/team/:teamId', async (req, res) => {
    try {
        const report = await repo.getTeamHashtagReport(req.params.teamId);
        return res.json(report);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// GET /api/hashtags/reports/personal/:userId - Personal dashboard report
miscRouter.get('/hashtags/reports/personal/:userId', async (req, res) => {
    try {
        const report = await repo.getPersonalHashtagReport(req.params.userId);
        return res.json(report);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// GET /api/hashtags/lookup/bank/:bankCode - Quick bank code → bank name resolver
miscRouter.get('/hashtags/lookup/bank/:bankCode', async (req, res) => {
    try {
        const result = await repo.lookupBankCode(req.params.bankCode);
        if (!result.bankName) {
            return res.status(404).json({ error: `No bank found for code '${req.params.bankCode}'` });
        }
        return res.json(result);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// GET /api/hashtags/:tag/runs - Retrieve execution run history
miscRouter.get('/hashtags/:tag/runs', async (req, res) => {
    try {
        const normalized = normalizeHashtagParam(req.params.tag);
        const limit = parseInt(req.query.limit || '50', 10);
        const runs = await repo.getHashtagRuns(normalized, limit);
        return res.json(runs);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// POST /api/hashtags/:tag/execute-scan
// Triggers a Type B (Database-Direct Scanner) on demand
miscRouter.post('/hashtags/:tag/execute-scan', async (req, res) => {
    try {
        const { executeDatabaseDirectScan } = await import('../services/hashtagService.js');
        const { executedBy, taskId, teamId, isDryRun } = req.body;
        if (!executedBy)
            return res.status(400).json({ error: 'executedBy is required' });
        const normalized = normalizeHashtagParam(req.params.tag);
        const preset = await repo.getHashtagByTag(normalized);
        if (!preset)
            return res.status(404).json({ error: `Hashtag '${normalized}' not found` });
        if (preset.hashtagType !== 'DATABASE_DIRECT_SCANNER') {
            return res.status(400).json({
                error: `Hashtag ${normalized} is of type '${preset.hashtagType}', not DATABASE_DIRECT_SCANNER`
            });
        }
        const scanResult = await executeDatabaseDirectScan(preset, executedBy, isDryRun ?? true);
        // Record the run in PostgreSQL
        const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        await repo.recordHashtagRun({
            id: runId,
            hashtagTag: normalized,
            taskId: taskId || null,
            teamId: teamId || null,
            executedBy,
            executionMode: isDryRun ? 'DRY_RUN_PARTIAL' : 'LIVE_FULL',
            rowsScanned: scanResult.rowsScanned,
            anomaliesDetected: scanResult.anomaliesDetected,
            verdict: scanResult.verdict,
            resultSnapshot: {
                anomalyRows: scanResult.anomalyRows.slice(0, 100),
                errors: scanResult.errors,
                executionDurationMs: scanResult.executionDurationMs
            },
            isDiagnosticOnly: isDryRun ?? true,
            executedAt: new Date().toISOString()
        });
        return res.json({ runId, ...scanResult });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// POST /api/hashtags/:tag/provision-table
// Provisions a dedicated staging table for Type C (ETL/Staging) hashtags
miscRouter.post('/hashtags/:tag/provision-table', async (req, res) => {
    try {
        const { executeExtractionStaging } = await import('../services/hashtagService.js');
        const { executedBy } = req.body;
        if (!executedBy)
            return res.status(400).json({ error: 'executedBy is required' });
        const normalized = normalizeHashtagParam(req.params.tag);
        const preset = await repo.getHashtagByTag(normalized);
        if (!preset)
            return res.status(404).json({ error: `Hashtag '${normalized}' not found` });
        const result = await executeExtractionStaging(preset, executedBy);
        return res.json(result);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// GET /api/hashtags/:tag - Retrieve a single hashtag preset with all engine config
miscRouter.get('/hashtags/:tag', async (req, res) => {
    try {
        const normalized = normalizeHashtagParam(req.params.tag);
        const preset = await repo.getHashtagByTag(normalized);
        if (!preset)
            return res.status(404).json({ error: `Hashtag '${normalized}' not found` });
        return res.json(preset);
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

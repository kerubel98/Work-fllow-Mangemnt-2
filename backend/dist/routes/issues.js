import { Router } from 'express';
import { repo } from '../store/repository.js';
import { eventService } from '../services/events.js';
export const issuesRouter = Router();
issuesRouter.get('/', async (_req, res) => {
    try {
        const issues = await repo.getIssues();
        return res.json(issues);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
issuesRouter.post('/', async (req, res) => {
    try {
        const issueData = req.body;
        if (!issueData.title || !issueData.creatorId) {
            return res.status(400).json({ error: 'Title and creatorId are required' });
        }
        // Auto-mapping and Data Type Transformation Pipeline during Task Creation
        let sanitizedRows = undefined;
        let effectiveMapping = issueData.fileMapping;
        let effectiveHeaders = issueData.uploadedFileHeaders || [];
        const rawRows = issueData.firstLevelMappedData || issueData.records || issueData.rows;
        if (rawRows && Array.isArray(rawRows) && rawRows.length > 0) {
            const { dataSanitizerService } = await import('../services/dataSanitizerService.js');
            const sampleRow = rawRows[0];
            if (effectiveHeaders.length === 0 && sampleRow && typeof sampleRow === 'object') {
                effectiveHeaders = Object.keys(sampleRow);
            }
            // Pre-flight validation with automatic header mapping resolution
            const validation = await dataSanitizerService.validateMapping(effectiveMapping, sampleRow);
            if (!validation.valid) {
                return res.status(422).json({
                    error: 'Pre-flight mapping validation failed: Required standard fields are not mapped',
                    missingFields: validation.missingFields,
                    requiredFields: validation.requiredFields
                });
            }
            // Strict Data Type Transformation & Auto-Mapping Execution
            const sanitization = await dataSanitizerService.sanitizeRows(rawRows, validation.autoMapping || effectiveMapping);
            sanitizedRows = sanitization.sanitizedRows;
            effectiveMapping = sanitization.effectiveMapping;
            console.log(`[IssueCreation] Auto-mapped and sanitized ${sanitizedRows.length} rows for new task.`);
        }
        const newIssue = {
            id: issueData.id || `ISSUE-${Math.floor(1000 + Math.random() * 9000)}`,
            title: issueData.title,
            description: issueData.description || '',
            status: issueData.status || 'Open',
            priority: issueData.priority || 'Medium',
            creatorId: issueData.creatorId,
            creatorName: issueData.creatorName || 'Unknown User',
            createdAt: new Date().toISOString(),
            type: issueData.type || (sanitizedRows ? 'file' : 'single'),
            transactionId: issueData.transactionId,
            uploadedFileName: issueData.uploadedFileName,
            uploadedFileHeaders: effectiveHeaders.length > 0 ? effectiveHeaders : undefined,
            fileMapping: effectiveMapping && Object.keys(effectiveMapping).length > 0 ? effectiveMapping : undefined,
            firstLevelNotes: issueData.firstLevelNotes,
            firstLevelMappedData: sanitizedRows || issueData.firstLevelMappedData,
            linkedHashtag: issueData.linkedHashtag,
            assignedTechUserId: issueData.assignedTechUserId,
            assignedTechUserName: issueData.assignedTechUserName,
            chat: []
        };
        const saved = await repo.createIssue(newIssue);
        eventService.broadcastEvent('issue:created', saved);
        // Auto-ingest sanitized dataset rows into Central Repository & Task Dataset upon Task Creation
        if (sanitizedRows && sanitizedRows.length > 0) {
            try {
                const { datasetIngestionService } = await import('../services/datasetIngestionService.js');
                const ingestResult = await datasetIngestionService.ingestDatasetRows(saved.id, sanitizedRows, effectiveHeaders, effectiveMapping);
                eventService.broadcastEvent('issue:dataset_ingested', {
                    issueId: saved.id,
                    transactionCount: ingestResult.insertedCount,
                    duplicateCount: ingestResult.duplicateCount
                });
                console.log(`[IssueCreation] Automatically ingested ${ingestResult.insertedCount} records into task dataset & central repository for ${saved.id}.`);
            }
            catch (ingestErr) {
                console.warn(`[IssueCreation] Warning auto-ingesting task dataset for ${saved.id}:`, ingestErr.message);
            }
        }
        return res.status(201).json(saved);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
issuesRouter.get('/:id', async (req, res) => {
    try {
        const issue = await repo.getIssueById(req.params.id);
        if (!issue)
            return res.status(404).json({ error: 'Issue not found' });
        return res.json(issue);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// GET /api/issues/:id/transactions - Thin client paginated dataset with batch filter
issuesRouter.get('/:id/transactions', async (req, res) => {
    try {
        const page = parseInt(req.query.page || '1', 10);
        const limit = parseInt(req.query.limit || '50', 10);
        const batchId = req.query.batchId;
        const result = await repo.getTaskDatasetTransactions(req.params.id, page, limit, batchId);
        return res.json({
            taskId: req.params.id,
            page,
            limit,
            batchId,
            totalCount: result.totalCount,
            totalPages: Math.ceil(result.totalCount / limit),
            rows: result.rows
        });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// GET /api/issues/:id/batches - Distinct batches for an issue
issuesRouter.get('/:id/batches', async (req, res) => {
    try {
        const batches = await repo.getTaskDatasetBatches(req.params.id);
        return res.json({ taskId: req.params.id, batches });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// POST /api/issues/:id/dataset and /:id/ingest-dataset - High-throughput ingestion into standalone table
issuesRouter.post(['/:id/dataset', '/:id/ingest-dataset'], async (req, res) => {
    try {
        const rows = req.body.rows || req.body.records;
        const { headers, fileMapping } = req.body;
        if (!rows || !Array.isArray(rows)) {
            return res.status(400).json({ error: 'rows or records array is required' });
        }
        const { dataSanitizerService } = await import('../services/dataSanitizerService.js');
        const sampleRow = rows[0];
        const validation = await dataSanitizerService.validateMapping(fileMapping, sampleRow);
        if (!validation.valid) {
            return res.status(422).json({
                error: 'Pre-flight mapping validation failed: Required standard fields are not mapped',
                missingFields: validation.missingFields,
                requiredFields: validation.requiredFields
            });
        }
        const { datasetIngestionService } = await import('../services/datasetIngestionService.js');
        const result = await datasetIngestionService.ingestDatasetRows(req.params.id, rows, headers, fileMapping);
        eventService.broadcastEvent('issue:dataset_ingested', {
            issueId: req.params.id,
            transactionCount: result.insertedCount
        });
        return res.status(201).json(result);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
issuesRouter.put('/:id', async (req, res) => {
    try {
        const updated = await repo.updateIssue(req.params.id, req.body);
        if (!updated)
            return res.status(404).json({ error: 'Issue not found' });
        eventService.broadcastEvent('issue:updated', updated);
        return res.json(updated);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
issuesRouter.delete('/:id', async (req, res) => {
    try {
        const success = await repo.deleteIssue(req.params.id);
        eventService.broadcastEvent('issue:deleted', { id: req.params.id });
        return res.json({ success });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
issuesRouter.post('/:id/chat', async (req, res) => {
    try {
        const { senderId, senderName, senderRole, text } = req.body;
        if (!senderId || !text) {
            return res.status(400).json({ error: 'senderId and text are required' });
        }
        const newMessage = {
            id: `msg-${Date.now()}`,
            senderId,
            senderName: senderName || 'User',
            senderRole: senderRole || 'operational',
            text,
            timestamp: new Date().toISOString()
        };
        const updated = await repo.addIssueChat(req.params.id, newMessage);
        if (!updated)
            return res.status(404).json({ error: 'Issue not found' });
        // Live broadcast chat message to all connected browsers viewing this case
        eventService.broadcastEvent('issue_chat:new', { issueId: req.params.id, message: newMessage });
        return res.json(updated);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
issuesRouter.post('/:id/execute-script', async (req, res) => {
    try {
        const issue = await repo.getIssueById(req.params.id);
        if (!issue)
            return res.status(404).json({ error: 'Issue not found' });
        const updated = await repo.updateIssue(req.params.id, {
            status: 'Resolved',
            solutionExecuted: true,
            solutionExecutedAt: new Date().toISOString()
        });
        eventService.broadcastEvent('issue:updated', updated);
        return res.json({
            success: true,
            message: `Resolution script successfully executed for issue ${req.params.id}.`,
            issue: updated
        });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

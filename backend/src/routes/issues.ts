import { Router, Request, Response } from 'express';
import { repo } from '../store/repository.js';
import { Issue, ChatMessage } from '../types.js';
import { eventService } from '../services/events.js';

export const issuesRouter = Router();

issuesRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const issues = await repo.getIssues();
    return res.json(issues);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

issuesRouter.post('/', async (req: Request, res: Response) => {
  try {
    const issueData: Partial<Issue> = req.body;
    if (!issueData.title || !issueData.creatorId) {
      return res.status(400).json({ error: 'Title and creatorId are required' });
    }

    const newIssue: Issue = {
      id: issueData.id || `ISSUE-${Math.floor(1000 + Math.random() * 9000)}`,
      title: issueData.title,
      description: issueData.description || '',
      status: issueData.status || 'Open',
      priority: issueData.priority || 'Medium',
      creatorId: issueData.creatorId,
      creatorName: issueData.creatorName || 'Unknown User',
      createdAt: new Date().toISOString(),
      type: issueData.type || 'single',
      transactionId: issueData.transactionId,
      uploadedFileName: issueData.uploadedFileName,
      uploadedFileHeaders: issueData.uploadedFileHeaders,
      fileMapping: issueData.fileMapping,
      firstLevelNotes: issueData.firstLevelNotes,
      firstLevelMappedData: issueData.firstLevelMappedData,
      linkedHashtag: issueData.linkedHashtag,
      assignedTechUserId: issueData.assignedTechUserId,
      assignedTechUserName: issueData.assignedTechUserName,
      chat: []
    };

    const saved = await repo.createIssue(newIssue);
    eventService.broadcastEvent('issue:created', saved);
    return res.status(201).json(saved);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

issuesRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const issue = await repo.getIssueById(req.params.id);
    if (!issue) return res.status(404).json({ error: 'Issue not found' });
    return res.json(issue);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/issues/:id/transactions - Thin client paginated dataset with batch filter
issuesRouter.get('/:id/transactions', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string || '1', 10);
    const limit = parseInt(req.query.limit as string || '50', 10);
    const batchId = req.query.batchId as string | undefined;
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
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/issues/:id/batches - Distinct batches for an issue
issuesRouter.get('/:id/batches', async (req: Request, res: Response) => {
  try {
    const batches = await repo.getTaskDatasetBatches(req.params.id);
    return res.json({ taskId: req.params.id, batches });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/issues/:id/dataset and /:id/ingest-dataset - High-throughput ingestion into standalone table
issuesRouter.post(['/:id/dataset', '/:id/ingest-dataset'], async (req: Request, res: Response) => {
  try {
    const rows = req.body.rows || req.body.records;
    const { headers, fileMapping } = req.body;
    if (!rows || !Array.isArray(rows)) {
      return res.status(400).json({ error: 'rows or records array is required' });
    }
    const { datasetIngestionService } = await import('../services/datasetIngestionService.js');
    const result = await datasetIngestionService.ingestDatasetRows(req.params.id, rows, headers, fileMapping);
    eventService.broadcastEvent('issue:dataset_ingested', {
      issueId: req.params.id,
      transactionCount: result.insertedCount
    });
    return res.status(201).json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

issuesRouter.put('/:id', async (req: Request, res: Response) => {
  try {
    const updated = await repo.updateIssue(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Issue not found' });
    eventService.broadcastEvent('issue:updated', updated);
    return res.json(updated);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

issuesRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const success = await repo.deleteIssue(req.params.id);
    eventService.broadcastEvent('issue:deleted', { id: req.params.id });
    return res.json({ success });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

issuesRouter.post('/:id/chat', async (req: Request, res: Response) => {
  try {
    const { senderId, senderName, senderRole, text } = req.body;
    if (!senderId || !text) {
      return res.status(400).json({ error: 'senderId and text are required' });
    }
    const newMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      senderId,
      senderName: senderName || 'User',
      senderRole: senderRole || 'operational',
      text,
      timestamp: new Date().toISOString()
    };

    const updated = await repo.addIssueChat(req.params.id, newMessage);
    if (!updated) return res.status(404).json({ error: 'Issue not found' });

    // Live broadcast chat message to all connected browsers viewing this case
    eventService.broadcastEvent('issue_chat:new', { issueId: req.params.id, message: newMessage });

    return res.json(updated);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

issuesRouter.post('/:id/execute-script', async (req: Request, res: Response) => {
  try {
    const issue = await repo.getIssueById(req.params.id);
    if (!issue) return res.status(404).json({ error: 'Issue not found' });

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
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

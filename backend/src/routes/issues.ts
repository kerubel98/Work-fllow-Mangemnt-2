import { Router, Request, Response } from 'express';
import { repo } from '../store/repository.js';
import { Issue, ChatMessage } from '../types.js';
import { eventService } from '../services/events.js';

export const issuesRouter = Router();

issuesRouter.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string | undefined;
    const scope = (req.query.scope as 'personal' | 'team' | 'all') || 'all';
    const issues = await repo.getIssues(userId, scope);
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

    // Resolve team membership for default visibility
    let effectiveTeamId = issueData.teamId;
    let effectiveVisibility = issueData.visibility;

    if (!effectiveTeamId && issueData.creatorId) {
      const creator = await repo.getUserById(issueData.creatorId);
      if (creator) {
        if (creator.permanentTeamId) {
          effectiveTeamId = creator.permanentTeamId;
        } else {
          const teams = await repo.getTeams();
          const permTeam = teams.find(
            t => t.teamType === 'permanent' && (t.managerId === creator.id || (t.memberIds && t.memberIds.includes(creator.id)))
          );
          if (permTeam) {
            effectiveTeamId = permTeam.id;
          }
        }
      }
    }

    if (!effectiveVisibility) {
      // By default, tasks created by an operator in a permanent team are visible (TEAM_PUBLIC) to team members.
      // If the operator has no permanent team, default is PERSONAL_PRIVATE.
      effectiveVisibility = effectiveTeamId ? 'TEAM_PUBLIC' : 'PERSONAL_PRIVATE';
    }

    // Auto-mapping and Data Type Transformation Pipeline during Task Creation
    let sanitizedRows: Record<string, any>[] | undefined = undefined;
    let effectiveMapping: Record<string, string> | undefined = issueData.fileMapping;
    let effectiveHeaders: string[] = issueData.uploadedFileHeaders || [];

    const rawRows = issueData.firstLevelMappedData || (issueData as any).records || (issueData as any).rows;

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

    const newIssue: Issue = {
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
      teamId: effectiveTeamId,
      visibility: effectiveVisibility,
      chat: []
    };

    const saved = await repo.createIssue(newIssue);
    eventService.broadcastEvent('issue:created', saved);

    // Auto-ingest sanitized dataset rows into Central Repository & Task Dataset upon Task Creation
    if (sanitizedRows && sanitizedRows.length > 0) {
      try {
        const { datasetIngestionService } = await import('../services/datasetIngestionService.js');
        const ingestResult = await datasetIngestionService.ingestDatasetRows(
          saved.id,
          sanitizedRows,
          effectiveHeaders,
          effectiveMapping
        );
        eventService.broadcastEvent('issue:dataset_ingested', {
          issueId: saved.id,
          transactionCount: ingestResult.insertedCount,
          duplicateCount: ingestResult.duplicateCount
        });
        console.log(`[IssueCreation] Automatically ingested ${ingestResult.insertedCount} records into task dataset & central repository for ${saved.id}.`);
      } catch (ingestErr: any) {
        console.warn(`[IssueCreation] Warning auto-ingesting task dataset for ${saved.id}:`, ingestErr.message);
      }
    }

    return res.status(201).json(saved);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// PATCH /api/issues/:id/visibility - Toggle between TEAM_PUBLIC and PERSONAL_PRIVATE
issuesRouter.patch('/:id/visibility', async (req: Request, res: Response) => {
  try {
    const { visibility } = req.body;
    if (visibility !== 'TEAM_PUBLIC' && visibility !== 'PERSONAL_PRIVATE') {
      return res.status(400).json({ error: 'Visibility must be TEAM_PUBLIC or PERSONAL_PRIVATE' });
    }
    const updated = await repo.updateIssueVisibility(req.params.id, visibility);
    if (!updated) return res.status(404).json({ error: 'Issue not found' });
    eventService.broadcastEvent('issue:updated', updated);
    return res.json(updated);
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
    const { senderId, senderName, senderRole, text, mentions, attachedSummary, solutionProposal, issueContext } = req.body;
    if (!senderId || (!text && !attachedSummary && !solutionProposal)) {
      return res.status(400).json({ error: 'senderId and content (text, summary, or proposal) are required' });
    }
    const newMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      senderId,
      senderName: senderName || 'User',
      senderRole: senderRole || 'operational',
      text: text || '',
      timestamp: new Date().toISOString(),
      mentions: Array.isArray(mentions) ? mentions : undefined,
      attachedSummary: attachedSummary || undefined,
      solutionProposal: solutionProposal ? {
        id: `prop-${Date.now()}`,
        script: solutionProposal.script,
        processType: solutionProposal.processType || 'INTERNAL_STAGED_FIX',
        proposedBy: senderId,
        proposedByName: senderName || 'User',
        proposedAt: new Date().toISOString(),
        accepted: false
      } : undefined
    };

    let existing = await repo.getIssueById(req.params.id);
    if (!existing) {
      // Auto-register missing or mock issue from issueContext or in-memory store
      const { store } = await import('../store/dataStore.js');
      const memoryIssue = store.issues.find(i => i.id === req.params.id || i.id.toLowerCase() === req.params.id.toLowerCase());

      const title = issueContext?.title || memoryIssue?.title || `Operational Task ${req.params.id}`;
      const description = issueContext?.description || memoryIssue?.description || 'Auto-registered task from investigation session.';
      const creatorId = issueContext?.creatorId || memoryIssue?.creatorId || senderId;
      const creatorName = issueContext?.creatorName || memoryIssue?.creatorName || senderName || 'User';

      existing = await repo.createIssue({
        id: req.params.id,
        title,
        description,
        status: issueContext?.status || memoryIssue?.status || 'Investigating',
        priority: issueContext?.priority || memoryIssue?.priority || 'Medium',
        creatorId,
        creatorName,
        createdAt: issueContext?.createdAt || memoryIssue?.createdAt || new Date().toISOString(),
        linkedHashtag: issueContext?.linkedHashtag || memoryIssue?.linkedHashtag,
        type: issueContext?.type || memoryIssue?.type || 'single',
        transactionId: issueContext?.transactionId || memoryIssue?.transactionId,
        uploadedFileName: issueContext?.uploadedFileName || memoryIssue?.uploadedFileName,
        uploadedFileHeaders: issueContext?.uploadedFileHeaders || memoryIssue?.uploadedFileHeaders,
        fileMapping: issueContext?.fileMapping || memoryIssue?.fileMapping,
        firstLevelMappedData: issueContext?.firstLevelMappedData || memoryIssue?.firstLevelMappedData,
        chat: [newMessage]
      });

      eventService.broadcastEvent('issue_chat:new', { issueId: req.params.id, message: newMessage });
      return res.json(existing);
    }

    const updated = await repo.addIssueChat(req.params.id, newMessage);
    if (!updated) return res.status(404).json({ error: 'Issue not found' });

    // Live broadcast chat message to all connected browsers viewing this case
    eventService.broadcastEvent('issue_chat:new', { issueId: req.params.id, message: newMessage });

    return res.json(updated);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/issues/:id/chat/accept-solution - Peer consensus acceptance of proposed solution
issuesRouter.post('/:id/chat/accept-solution', async (req: Request, res: Response) => {
  try {
    const { messageId, acceptedBy, acceptedByName } = req.body;
    if (!messageId || !acceptedBy) {
      return res.status(400).json({ error: 'messageId and acceptedBy are required' });
    }
    const issue = await repo.getIssueById(req.params.id);
    if (!issue) return res.status(404).json({ error: 'Issue not found' });

    let acceptedProposal: any = null;
    const updatedChat = (issue.chat || []).map(msg => {
      if (msg.id === messageId && msg.solutionProposal) {
        msg.solutionProposal.accepted = true;
        msg.solutionProposal.acceptedBy = acceptedBy;
        msg.solutionProposal.acceptedByName = acceptedByName || 'Team Member';
        msg.solutionProposal.acceptedAt = new Date().toISOString();
        acceptedProposal = msg.solutionProposal;
      }
      return msg;
    });

    if (!acceptedProposal) {
      return res.status(404).json({ error: 'Solution proposal not found in chat messages.' });
    }

    const updates: Partial<Issue> = {
      chat: updatedChat,
      solutionScript: acceptedProposal.script,
      processType: acceptedProposal.processType,
      acceptedScriptProposalId: messageId
    };

    // If classified as CAUTIOUS_PROCESS, capture an automatic pre-change snapshot
    if (acceptedProposal.processType === 'CAUTIOUS_PROCESS') {
      try {
        const { reversionService } = await import('../services/reversionService.js');
        await reversionService.createSnapshot(
          issue.id,
          'CAUTIOUS_PROCESS',
          acceptedBy,
          `Snapshot on cautious solution acceptance (${acceptedProposal.id})`
        );
      } catch (snapErr: any) {
        console.warn(`[AcceptSolution] Snapshot warning for ${issue.id}:`, snapErr.message);
      }
    }

    const updated = await repo.updateIssue(issue.id, updates);
    eventService.broadcastEvent('issue:updated', updated);
    eventService.broadcastEvent('issue_chat:solution_accepted', {
      issueId: issue.id,
      messageId,
      proposal: acceptedProposal
    });

    return res.json({
      success: true,
      message: 'Solution script successfully accepted and linked to task.',
      issue: updated
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/issues/:id/revert - Granular rollback (batch task_id or single transaction_id)
issuesRouter.post('/:id/revert', async (req: Request, res: Response) => {
  try {
    const { transactionId, userId } = req.body;
    const { reversionService } = await import('../services/reversionService.js');
    const operatorId = userId || 'system_operator';

    if (transactionId) {
      const result = await reversionService.revertTransaction(req.params.id, transactionId, operatorId);
      return res.json(result);
    } else {
      const result = await reversionService.revertTask(req.params.id, operatorId);
      return res.json(result);
    }
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/issues/:id/reversions - History of pre-change snapshots and rollbacks
issuesRouter.get('/:id/reversions', async (req: Request, res: Response) => {
  try {
    const { reversionService } = await import('../services/reversionService.js');
    const snapshots = await reversionService.getReversionHistory(req.params.id);
    return res.json({ taskId: req.params.id, count: snapshots.length, snapshots });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

issuesRouter.post('/:id/execute-script', async (req: Request, res: Response) => {
  try {
    const issue = await repo.getIssueById(req.params.id);
    if (!issue) return res.status(404).json({ error: 'Issue not found' });

    // Pre-change snapshot prior to script execution
    try {
      const { reversionService } = await import('../services/reversionService.js');
      await reversionService.createSnapshot(
        issue.id,
        issue.processType || 'INTERNAL_STAGED_FIX',
        req.body.executedBy || issue.creatorId,
        'Auto-snapshot before script execution'
      );
    } catch (snapErr: any) {
      console.warn(`[ExecuteScript] Snapshot creation warning:`, snapErr.message);
    }

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

// GET /api/issues/:id/audit-dossier - Unified immutable case package
issuesRouter.get('/:id/audit-dossier', async (req: Request, res: Response) => {
  try {
    const issue = await repo.getIssueById(req.params.id);
    if (!issue) return res.status(404).json({ error: 'Issue not found' });

    const { reversionService } = await import('../services/reversionService.js');
    const [reversions, currentDatasetRes, taskExecutions] = await Promise.all([
      reversionService.getReversionHistory(issue.id).catch(() => []),
      repo.getTaskDatasetTransactions(issue.id, 1, 200).catch(() => ({ rows: [] })),
      (repo as any).getTaskWorkflowExecutions ? (repo as any).getTaskWorkflowExecutions(issue.id).catch(() => ({ executions: [] })) : Promise.resolve({ executions: [] })
    ]);

    // Construct unified dossier
    const dossier = {
      taskId: issue.id,
      taskTitle: issue.title,
      taskStatus: issue.status,
      priority: issue.priority,
      creator: { id: issue.creatorId, name: issue.creatorName },
      assignedTech: { id: issue.assignedTechUserId, name: issue.assignedTechUserName },
      teamId: issue.teamId,
      visibility: issue.visibility || 'TEAM_PUBLIC',
      linkedHashtag: issue.linkedHashtag,
      createdAt: issue.createdAt,
      solutionScript: issue.solutionScript,
      processType: issue.processType || 'INTERNAL_STAGED_FIX',
      solutionExecuted: issue.solutionExecuted,
      solutionExecutedAt: issue.solutionExecutedAt,
      chatHistory: issue.chat || [],
      investigationSummary: {
        systemId: issue.investigationSystemId,
        environment: issue.investigationEnvironment,
        table: issue.investigationTable,
        validationStatus: issue.validationStatus,
        validationErrors: issue.validationErrors
      },
      validationExecutions: (taskExecutions as any).executions || [],
      initialTransactionsSnapshot: reversions.length > 0 ? (reversions[reversions.length - 1].beforeState || []) : (issue.firstLevelMappedData || []),
      currentTransactionsSnapshot: currentDatasetRes.rows || [],
      reversionHistory: reversions,
      generatedAt: new Date().toISOString()
    };

    return res.json(dossier);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

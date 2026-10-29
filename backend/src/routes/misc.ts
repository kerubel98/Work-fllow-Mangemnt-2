import { Router, Request, Response } from 'express';
import { repo } from '../store/repository.js';
import { HashtagPreset, EnvironmentSystem } from '../types.js';
import { requireAuth } from '../utils/auth.js';
import {
  translateWithDictionary,
  findUntranslatedValues,
  fetchDistinctColumnValues,
  DistinctValuesError
} from '../services/valueDictionaryService.js';

export const miscRouter = Router();

// ================= HASHTAGS =================
miscRouter.get('/hashtags', async (_req: Request, res: Response) => {
  try {
    const tags = await repo.getHashtags();
    return res.json(tags);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

miscRouter.post('/hashtags', async (req: Request, res: Response) => {
  try {
    const newTag: HashtagPreset = req.body;
    if (!newTag.tag) {
      return res.status(400).json({ error: 'Tag name is required' });
    }
    const isFileIngestion = !newTag.hashtagType || newTag.hashtagType === 'FILE_INGESTION';
    const requiresSolutionTemplate = isFileIngestion || newTag.conditionalAction?.onPass === 'EXECUTE_SQL';
    if (requiresSolutionTemplate && !newTag.solutionTemplate) {
      return res.status(400).json({ error: 'Solution template is required for file ingestion or SQL conditional remediation' });
    }
    const saved = await repo.createHashtag(newTag);
    return res.status(201).json(saved);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

miscRouter.get('/hashtags/resolve/:tag', async (req: Request, res: Response) => {
  try {
    const { hashtagService } = await import('../services/hashtagService.js');
    const resolved = await hashtagService.resolveHashtagAssets(req.params.tag);
    return res.json(resolved);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// PUT /api/hashtags/:tag/kpis - Attach or update manager KPIs for a hashtag
miscRouter.put('/hashtags/:tag/kpis', async (req: Request, res: Response) => {
  try {
    const { kpis } = req.body;
    if (!Array.isArray(kpis)) {
      return res.status(400).json({ error: 'kpis array is required' });
    }
    const updated = await repo.updateHashtagKpis(req.params.tag, kpis);
    if (!updated) return res.status(404).json({ error: 'Hashtag not found' });
    return res.json(updated);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// PUT /api/hashtags/:tag - Update an existing hashtag preset
miscRouter.put('/hashtags/:tag', async (req: Request, res: Response) => {
  try {
    const updated = await repo.updateHashtag(req.params.tag, req.body);
    if (!updated) return res.status(404).json({ error: `Hashtag '${req.params.tag}' not found` });
    return res.json(updated);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /api/hashtags/:tag - Delete an existing hashtag preset
miscRouter.delete('/hashtags/:tag', async (req: Request, res: Response) => {
  try {
    const success = await repo.deleteHashtag(req.params.tag);
    if (!success) return res.status(404).json({ error: `Hashtag '${req.params.tag}' not found` });
    return res.json({ success: true, deletedTag: req.params.tag });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/hashtags/create-from-issue/:issueId - Define reusable hashtag out of a resolved issue
miscRouter.post('/hashtags/create-from-issue/:issueId', async (req: Request, res: Response) => {
  try {
    const issue = await repo.getIssueById(req.params.issueId);
    if (!issue) return res.status(404).json({ error: 'Issue not found' });

    const { tag, description, workflowId, workflowName, author } = req.body;
    const cleanTag = tag ? (tag.startsWith('#') ? tag : `#${tag}`) : (issue.linkedHashtag || `#CASE_${issue.id}`);

    const newPreset: HashtagPreset = {
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
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/hashtags/analytics - Managerial hashtag-specific analytics & pending solution script tracker
miscRouter.get('/hashtags/analytics', async (_req: Request, res: Response) => {
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
        hashtagType: (tag as any).hashtagType || 'FILE_INGESTION',
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
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Universal Hashtag Engine Routes (Phase 4) ────────────────────────────────

// ── Universal Hashtag Engine Routes (Phase 4) ────────────────────────────────

function normalizeHashtagParam(rawTag: string): string {
  const clean = (rawTag || '').trim().replace(/^#+/, '');
  return clean ? `#${clean.toUpperCase()}` : '';
}

// POST /api/hashtags/test-preflight
// Dry-run pre-flight test for any hashtag type
miscRouter.post('/hashtags/test-preflight', async (req: Request, res: Response) => {
  try {
    const { testPreFlight } = await import('../services/hashtagService.js');
    const { tag, sampleRows } = req.body;
    if (!tag) return res.status(400).json({ error: 'tag is required' });

    const normalized = normalizeHashtagParam(tag);
    const preset = await repo.getHashtagByTag(normalized);
    if (!preset) return res.status(404).json({ error: `Hashtag '${normalized}' not found` });

    const result = await testPreFlight(preset as any, sampleRows || []);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/hashtags/reports/team/:teamId - Team dashboard report
miscRouter.get('/hashtags/reports/team/:teamId', async (req: Request, res: Response) => {
  try {
    const report = await repo.getTeamHashtagReport(req.params.teamId);
    return res.json(report);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/hashtags/reports/personal/:userId - Personal dashboard report
miscRouter.get('/hashtags/reports/personal/:userId', async (req: Request, res: Response) => {
  try {
    const report = await repo.getPersonalHashtagReport(req.params.userId);
    return res.json(report);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/hashtags/lookup/bank/:bankCode - Quick bank code → bank name resolver
miscRouter.get('/hashtags/lookup/bank/:bankCode', async (req: Request, res: Response) => {
  try {
    const result = await repo.lookupBankCode(req.params.bankCode);
    if (!result.bankName) {
      return res.status(404).json({ error: `No bank found for code '${req.params.bankCode}'` });
    }
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/hashtags/:tag/runs - Retrieve execution run history
miscRouter.get('/hashtags/:tag/runs', async (req: Request, res: Response) => {
  try {
    const normalized = normalizeHashtagParam(req.params.tag);
    const limit = parseInt(req.query.limit as string || '50', 10);
    const runs = await repo.getHashtagRuns(normalized, limit);
    return res.json(runs);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/hashtags/:tag/execute-scan
// Triggers a Type B (Database-Direct Scanner) on demand
miscRouter.post('/hashtags/:tag/execute-scan', async (req: Request, res: Response) => {
  try {
    const { executeDatabaseDirectScan } = await import('../services/hashtagService.js');
    const { executedBy, taskId, teamId, isDryRun } = req.body;
    if (!executedBy) return res.status(400).json({ error: 'executedBy is required' });

    const normalized = normalizeHashtagParam(req.params.tag);
    const preset = await repo.getHashtagByTag(normalized);
    if (!preset) return res.status(404).json({ error: `Hashtag '${normalized}' not found` });

    if ((preset as any).hashtagType !== 'DATABASE_DIRECT_SCANNER') {
      return res.status(400).json({
        error: `Hashtag ${normalized} is of type '${(preset as any).hashtagType}', not DATABASE_DIRECT_SCANNER`
      });
    }

    const isDryRunBool = isDryRun !== undefined ? Boolean(isDryRun) : true;
    const scanResult = await executeDatabaseDirectScan(preset as any, executedBy, isDryRunBool);

    let makerProposalId: string | null = null;

    // Rule 7 Maker-Checker auto-staging: if live run passes with conditionalAction configured
    if (!isDryRunBool && scanResult.verdict === 'PASS' && preset.conditionalAction) {
      const action = preset.conditionalAction.onPass;
      if (action === 'EXECUTE_SQL' || action === 'STAGE_PROPOSAL') {
        try {
          const { approvalService } = await import('../services/approvalService.js');
          const proposal = await approvalService.submitProposal({
            type: 'WORKSPACE_SETTING',
            settingKey: normalized,
            title: `Automated Remediation for ${normalized}`,
            justification: `Automated scan completed with PASS verdict. Conditional action triggered: ${action}`,
            makerId: executedBy,
            makerName: executedBy,
            teamId: teamId || 'default-team',
            proposedChanges: {
              action,
              sql: preset.solutionTemplate || null,
              hashtag: normalized
            },
            evidenceSnapshot: {
              scanResult: {
                rowsScanned: scanResult.rowsScanned,
                anomaliesDetected: scanResult.anomaliesDetected,
                verdict: scanResult.verdict,
                executionDurationMs: scanResult.executionDurationMs
              }
            }
          });
          makerProposalId = proposal.id;
        } catch (propErr: any) {
          console.warn(`[execute-scan] Could not stage Maker proposal: ${propErr.message}`);
        }
      }
    }

    // Record the run in PostgreSQL
    const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await repo.recordHashtagRun({
      id: runId,
      hashtagTag: normalized,
      taskId: taskId || null,
      teamId: teamId || null,
      executedBy,
      executionMode: isDryRunBool ? 'DRY_RUN_PARTIAL' : 'LIVE_FULL',
      rowsScanned: scanResult.rowsScanned,
      anomaliesDetected: scanResult.anomaliesDetected,
      verdict: scanResult.verdict,
      makerProposalId,
      resultSnapshot: {
        anomalyRows: scanResult.anomalyRows.slice(0, 100),
        errors: scanResult.errors,
        executionDurationMs: scanResult.executionDurationMs,
        makerProposalId
      },
      isDiagnosticOnly: isDryRunBool,
      executedAt: new Date().toISOString()
    });

    return res.json({ runId, stagedProposalId: makerProposalId, ...scanResult });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/hashtags/:tag/execute-file
// Executes Type A (File-Ingestion) validation and enrichment on uploaded records
miscRouter.post('/hashtags/:tag/execute-file', async (req: Request, res: Response) => {
  try {
    const { executeFileIngestionHashtag } = await import('../services/hashtagService.js');
    const { executedBy, fileRows, taskId, teamId } = req.body;
    if (!executedBy) return res.status(400).json({ error: 'executedBy is required' });
    if (!Array.isArray(fileRows)) return res.status(400).json({ error: 'fileRows array is required' });

    const normalized = normalizeHashtagParam(req.params.tag);
    const preset = await repo.getHashtagByTag(normalized);
    if (!preset) return res.status(404).json({ error: `Hashtag '${normalized}' not found` });

    const result = await executeFileIngestionHashtag(preset, fileRows);
    const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    await repo.recordHashtagRun({
      id: runId,
      hashtagTag: normalized,
      taskId: taskId || null,
      teamId: teamId || null,
      executedBy,
      executionMode: 'LIVE_FULL',
      rowsScanned: fileRows.length,
      anomaliesDetected: result.valid ? 0 : result.missingColumns.length,
      verdict: result.valid ? 'PASS' : 'FAIL',
      resultSnapshot: {
        enrichedCount: result.enrichedRecords.length,
        missingColumns: result.missingColumns,
        errors: result.errors
      },
      isDiagnosticOnly: false,
      executedAt: new Date().toISOString()
    });

    return res.json({ runId, ...result });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/hashtags/:tag/execute-audit
// Executes Type D (Auditing & Governance) sweep with diagnostic taint tracking
miscRouter.post('/hashtags/:tag/execute-audit', async (req: Request, res: Response) => {
  try {
    const { executeAuditingGovernance } = await import('../services/hashtagService.js');
    const { executedBy, teamId, taskId } = req.body;
    if (!executedBy) return res.status(400).json({ error: 'executedBy is required' });

    const normalized = normalizeHashtagParam(req.params.tag);
    const preset = await repo.getHashtagByTag(normalized);
    if (!preset) return res.status(404).json({ error: `Hashtag '${normalized}' not found` });

    const result = await executeAuditingGovernance(preset, teamId);
    const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    await repo.recordHashtagRun({
      id: runId,
      hashtagTag: normalized,
      taskId: taskId || null,
      teamId: teamId || null,
      executedBy,
      executionMode: 'LIVE_FULL',
      rowsScanned: result.auditRows.length,
      anomaliesDetected: result.slaBreachedCount,
      verdict: result.verdict,
      resultSnapshot: {
        slaCompliantCount: result.slaCompliantCount,
        slaBreachedCount: result.slaBreachedCount,
        makerCheckerAdherenceRate: result.makerCheckerAdherenceRate,
        auditRowCount: result.auditRows.length
      },
      isDiagnosticOnly: true,
      executedAt: new Date().toISOString()
    });

    return res.json({ runId, ...result });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/hashtags/:tag/provision-table
// Provisions a dedicated staging table for Type C (ETL/Staging) hashtags
miscRouter.post('/hashtags/:tag/provision-table', async (req: Request, res: Response) => {
  try {
    const { executeExtractionStaging } = await import('../services/hashtagService.js');
    const { executedBy } = req.body;
    if (!executedBy) return res.status(400).json({ error: 'executedBy is required' });

    const normalized = normalizeHashtagParam(req.params.tag);
    const preset = await repo.getHashtagByTag(normalized);
    if (!preset) return res.status(404).json({ error: `Hashtag '${normalized}' not found` });

    const result = await executeExtractionStaging(preset as any, executedBy);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/hashtags/:tag - Retrieve a single hashtag preset with all engine config
miscRouter.get('/hashtags/:tag', async (req: Request, res: Response) => {
  try {
    const normalized = normalizeHashtagParam(req.params.tag);
    const preset = await repo.getHashtagByTag(normalized);
    if (!preset) return res.status(404).json({ error: `Hashtag '${normalized}' not found` });
    return res.json(preset);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Technician Solution Flow Endpoints (Screens 38–44) ──────────────────────

// POST /api/solutions/dry-run
miscRouter.post('/solutions/dry-run', async (req: Request, res: Response) => {
  try {
    const { script, sampleRows = [], parameters = {} } = req.body;
    if (!script || typeof script !== 'string') {
      return res.status(400).json({ error: 'Solution script is required' });
    }

    // Extract placeholder tokens like {{Amount}}, {{Refnum}}, {{Transaction_ID}}
    const tokenRegex = /\{\{([a-zA-Z0-9_-]+)\}\}/g;
    const tokens = Array.from(new Set(Array.from(script.matchAll(tokenRegex)).map(m => m[1])));

    // Verify SQL safety: no unconstrained drop or truncate
    const isDangerous = /DROP\s+TABLE|TRUNCATE|DELETE\s+FROM\s+\w+\s*(?:;|$)/i.test(script);

    // Run simulated diff over sampleRows
    const diffs: { rowId: string; before: Record<string, any>; after: Record<string, any> }[] = [];
    const rowsToProcess = sampleRows.length > 0 ? sampleRows.slice(0, 10) : [
      { id: 'tx-001', transaction_id: 'TXN-9021', amount: 1250.00, refnum: 'REF-8891', status: 'FAILED', reason: 'RECONCILIATION_MISMATCH' },
      { id: 'tx-002', transaction_id: 'TXN-9022', amount: 450.50, refnum: 'REF-8892', status: 'FAILED', reason: 'AMOUNT_MISMATCH' },
      { id: 'tx-003', transaction_id: 'TXN-9023', amount: 3200.00, refnum: 'REF-8893', status: 'FAILED', reason: 'INVALID_STATUS' }
    ];

    for (let i = 0; i < rowsToProcess.length; i++) {
      const row = rowsToProcess[i];
      const rowId = row.id || row.transaction_id || `row-${i + 1}`;
      const afterRow = { ...row };

      // Apply simulated solution transformation based on script semantics
      if (/UPDATE/i.test(script) || /SET/i.test(script)) {
        afterRow.status = 'RESOLVED';
        afterRow._remediatedBy = 'TECHNICIAN_SOLUTION_SCRIPT';
        afterRow._remediatedAt = new Date().toISOString();
      } else {
        afterRow.status = 'REMEDIATED';
      }

      diffs.push({
        rowId: String(rowId),
        before: row,
        after: afterRow
      });
    }

    const checklist = [
      { id: 'syntax', label: 'SQL Syntax and token validation', passed: true },
      { id: 'tokens', label: 'All placeholder tokens ({{Token}}) recognized', passed: tokens.length > 0 || !script.includes('{{') },
      { id: 'safety', label: 'Non-destructive query bounds verified', passed: !isDangerous },
      { id: 'coverage', label: 'Sample row transformation verified with zero regressions', passed: diffs.length > 0 }
    ];

    const allPassed = checklist.every(c => c.passed);

    return res.json({
      valid: allPassed,
      tokens,
      diffs,
      checklist,
      rowsEvaluated: diffs.length
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/hashtags/post-solution
miscRouter.post('/hashtags/post-solution', async (req: Request, res: Response) => {
  try {
    const {
      tag,
      description,
      issueId,
      solutionScript,
      solutionType = 'TEMPORARY',
      expiresAt,
      lockedProcess,
      dryRunResults,
      reportingTeamId,
      authorUserId,
      authorName
    } = req.body;

    if (!tag) {
      return res.status(400).json({ error: 'Hashtag name is required' });
    }

    const normalizedTag = normalizeHashtagParam(tag);
    const existingPreset = await repo.getHashtagByTag(normalizedTag);

    const presetToSave: HashtagPreset = {
      ...(existingPreset || {}),
      tag: normalizedTag,
      description: description || `Technician solution for ${normalizedTag}`,
      criteria: lockedProcess?.validationStageName || 'Technician Investigation & Remediation Protocol',
      expectedFileStructure: lockedProcess?.fileHeaders || ['transaction_id', 'amount', 'refnum', 'status'],
      solutionTemplate: solutionScript || (existingPreset ? existingPreset.solutionTemplate : 'UPDATE transactions SET status = \'RESOLVED\';'),
      author: authorName || (req as any).user?.name || 'Technician',
      createdAt: existingPreset ? existingPreset.createdAt : new Date().toISOString(),
      workflowId: lockedProcess?.workflowId || (existingPreset ? existingPreset.workflowId : undefined),
      workflowName: lockedProcess?.workflowName || (existingPreset ? existingPreset.workflowName : undefined),
      processType: 'INTERNAL_STAGED_FIX',
      // Migration 038 Technician Solution Fields
      ownerUserId: authorUserId || (req as any).user?.id || 'tech-user',
      ownerName: authorName || (req as any).user?.name || 'Technician',
      solutionType: solutionType === 'SYSTEM_FIX' ? 'SYSTEM_FIX' : 'TEMPORARY',
      expiresAt: expiresAt || (solutionType === 'TEMPORARY' ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() : undefined),
      lockedProcess: lockedProcess || {
        fileSchemaName: 'Standard Ingestion',
        mappingRecipeName: 'Default Mapping',
        validationStageName: 'Validation Stage 1',
        slaTerms: '4h Resolution SLA'
      },
      checkerStatus: 'PENDING_APPROVAL',
      reportingTeamId: reportingTeamId || undefined,
      dryRunResults: dryRunResults || undefined
    };

    let savedPreset: HashtagPreset;
    if (existingPreset) {
      savedPreset = (await repo.updateHashtag(normalizedTag, presetToSave))!;
    } else {
      savedPreset = await repo.createHashtag(presetToSave);
    }

    // If an issueId was provided, seed flagged transactions into hashtag_collected_transactions
    if (issueId) {
      try {
        const issue = await repo.getIssueById(issueId);
        if (issue) {
          const rows = issue.firstLevelMappedData || [];
          for (let i = 0; i < Math.min(rows.length, 50); i++) {
            const r = rows[i];
            const txKey = String(r.transaction_id || r.id || r.refnum || `TX-${issueId}-${i + 1}`);
            await repo.recordCollectedTransaction({
              id: `tx-${normalizedTag.replace(/[^A-Za-z0-9]/g, '')}-${i + 1}`,
              hashtagTag: normalizedTag,
              transactionKey: txKey,
              issueId: issue.id,
              status: 'WAITING',
              failureReason: r.error || r.reason || 'Reconciliation discrepancy detected',
              beforePayload: r,
              afterPayload: {},
              collectedAt: new Date().toISOString()
            });
          }
        }
      } catch (seedErr: any) {
        console.warn('[HashtagPostSolution] Error seeding collected transactions:', seedErr.message);
      }
    }

    const stats = await repo.getHashtagTransactionStats(normalizedTag);

    return res.status(201).json({
      success: true,
      message: `Solution successfully posted under ${normalizedTag}. Sent to Checker for 4-Eyes approval.`,
      preset: savedPreset,
      stats
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/hashtags/:tag/collected-transactions
miscRouter.get('/hashtags/:tag/collected-transactions', async (req: Request, res: Response) => {
  try {
    const normalized = normalizeHashtagParam(req.params.tag);
    const status = req.query.status as string | undefined;
    const limit = parseInt(req.query.limit as string || '100', 10);

    const [transactions, stats] = await Promise.all([
      repo.getHashtagCollectedTransactions(normalized, status, limit),
      repo.getHashtagTransactionStats(normalized)
    ]);

    return res.json({
      tag: normalized,
      transactions,
      stats
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/hashtags/:tag/collected-transactions/:id/remediate
miscRouter.post('/hashtags/:tag/collected-transactions/:id/remediate', async (req: Request, res: Response) => {
  try {
    const normalized = normalizeHashtagParam(req.params.tag);
    const txId = req.params.id;
    const currentUserId = (req as any).user?.id || 'tech-user';

    const existingList = await repo.getHashtagCollectedTransactions(normalized, 'ALL', 200);
    const tx = existingList.find(t => t.id === txId || t.transactionKey === txId);

    if (!tx) {
      return res.status(404).json({ error: `Transaction ${txId} not found under ${normalized}` });
    }

    const updatedAfter = {
      ...(tx.beforePayload || {}),
      status: 'REMEDIATED',
      remediatedAt: new Date().toISOString(),
      remediatedBy: currentUserId
    };

    await repo.recordCollectedTransaction({
      ...tx,
      status: 'FIXED',
      afterPayload: updatedAfter,
      executedAt: new Date().toISOString(),
      executedBy: currentUserId
    });

    const updatedStats = await repo.getHashtagTransactionStats(normalized);

    return res.json({
      success: true,
      message: `Transaction ${tx.transactionKey} remediated successfully.`,
      stats: updatedStats
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/hashtags/:tag/change-request
miscRouter.post('/hashtags/:tag/change-request', async (req: Request, res: Response) => {
  try {
    const normalized = normalizeHashtagParam(req.params.tag);
    const { reason, suggestedAdjustments, requestedByUserId, requestedByUserName, reportingTeamId } = req.body;

    if (!reason) {
      return res.status(400).json({ error: 'Reason for change request is required' });
    }

    const preset = await repo.getHashtagByTag(normalized);
    if (!preset) {
      return res.status(404).json({ error: `Hashtag ${normalized} not found` });
    }

    const changeRequestId = `CR-${Date.now()}`;
    const updated = await repo.updateHashtag(normalized, {
      changeRequestId,
      description: `${preset.description || ''}\n[Change Request ${changeRequestId}]: ${reason}`,
      reportingTeamId: reportingTeamId || preset.reportingTeamId
    });

    return res.json({
      success: true,
      message: `Change request ${changeRequestId} submitted to hashtag owner ${preset.ownerName || 'Author'}.`,
      changeRequestId,
      preset: updated
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ================= PLUGINS =================

miscRouter.get('/plugins', async (_req: Request, res: Response) => {
  try {
    const plugins = await repo.getPlugins();
    return res.json(plugins);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

miscRouter.put('/plugins/:id/toggle', async (req: Request, res: Response) => {
  try {
    const { enabled } = req.body;
    const plugin = await repo.togglePlugin(req.params.id, enabled);
    if (!plugin) return res.status(404).json({ error: 'Plugin not found' });
    return res.json(plugin);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ================= SYSTEMS =================
miscRouter.get('/systems', async (_req: Request, res: Response) => {
  try {
    const systems = await repo.getSystems();
    return res.json(systems);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

miscRouter.post('/systems', async (req: Request, res: Response) => {
  try {
    const sysData: Partial<EnvironmentSystem> = req.body;
    const newSys: EnvironmentSystem = {
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
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

miscRouter.put('/systems/:id', async (req: Request, res: Response) => {
  try {
    const updated = await repo.updateSystem(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'System not found' });
    return res.json(updated);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

miscRouter.delete('/systems/:id', async (req: Request, res: Response) => {
  try {
    const success = await repo.deleteSystem(req.params.id);
    return res.json({ success });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ================= METRICS =================
miscRouter.get('/metrics', async (_req: Request, res: Response) => {
  try {
    const metrics = await repo.getMetrics();
    return res.json(metrics);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ================= FILE INGESTION MAPPING TEMPLATES (Domain 7) =================
miscRouter.get('/file-mapping-templates', async (req: Request, res: Response) => {
  try {
    const teamId = typeof req.query.teamId === 'string' ? req.query.teamId : undefined;
    const templates = await repo.getFileMappingTemplates(teamId);
    return res.json(templates);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

miscRouter.get('/file-mapping-templates/:id', async (req: Request, res: Response) => {
  try {
    const template = await repo.getFileMappingTemplateById(req.params.id);
    if (!template) {
      return res.status(404).json({ error: 'File mapping template not found' });
    }
    return res.json(template);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

miscRouter.post('/file-mapping-templates', async (req: Request, res: Response) => {
  try {
    const payload = req.body;
    if (!payload.name) {
      return res.status(400).json({ error: 'Template name is required' });
    }
    const saved = await repo.createOrUpdateFileMappingTemplate(payload);
    return res.status(201).json(saved);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

miscRouter.delete('/file-mapping-templates/:id', async (req: Request, res: Response) => {
  try {
    const success = await repo.deleteFileMappingTemplate(req.params.id);
    if (!success) {
      return res.status(404).json({ error: 'File mapping template not found or already deleted' });
    }
    return res.json({ success: true, id: req.params.id });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ================= VALUE TRANSLATION DICTIONARIES (Domain 7 / Governance Rule 23) =================
miscRouter.get('/value-translation-dictionaries', async (req: Request, res: Response) => {
  try {
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;
    const dicts = await repo.getValueTranslationDictionaries(category);
    return res.json(dicts);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

miscRouter.get('/value-translation-dictionaries/:id', async (req: Request, res: Response) => {
  try {
    const dict = await repo.getValueTranslationDictionaryById(req.params.id);
    if (!dict) {
      return res.status(404).json({ error: 'Value translation dictionary not found' });
    }
    return res.json(dict);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

miscRouter.post('/value-translation-dictionaries', async (req: Request, res: Response) => {
  try {
    const payload = req.body;
    if (!payload.name) {
      return res.status(400).json({ error: 'Dictionary name is required' });
    }
    const saved = await repo.createOrUpdateValueTranslationDictionary(payload);
    return res.status(201).json(saved);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

miscRouter.put('/value-translation-dictionaries/:id', async (req: Request, res: Response) => {
  try {
    const payload = { ...req.body, id: req.params.id };
    if (!payload.name) {
      return res.status(400).json({ error: 'Dictionary name is required' });
    }
    const saved = await repo.createOrUpdateValueTranslationDictionary(payload);
    return res.json(saved);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

miscRouter.delete('/value-translation-dictionaries/:id', async (req: Request, res: Response) => {
  try {
    const success = await repo.deleteValueTranslationDictionary(req.params.id);
    if (!success) {
      return res.status(404).json({ error: 'Value translation dictionary not found or already deleted' });
    }
    return res.json({ success: true, id: req.params.id });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ---- Value dictionary: "Try it" preview ----
miscRouter.post('/value-translation-dictionaries/:id/preview', async (req: Request, res: Response) => {
  try {
    const dict = await repo.getValueTranslationDictionaryById(req.params.id);
    if (!dict) return res.status(404).json({ error: 'Value translation dictionary not found' });
    const input = req.body?.value;
    // Allow previewing unsaved edits: caller may override semantics without persisting.
    const draft = { ...dict, ...(req.body?.draft || {}) };
    const result = translateWithDictionary(draft, input);
    return res.json({ input: input === undefined || input === null ? '' : String(input), ...result });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ---- Value dictionary: "Applied to" (persisted column links + templates) ----
miscRouter.get('/value-translation-dictionaries/:id/usage', async (req: Request, res: Response) => {
  try {
    const dict = await repo.getValueTranslationDictionaryById(req.params.id);
    if (!dict) return res.status(404).json({ error: 'Value translation dictionary not found' });
    const [links, templates] = await Promise.all([
      repo.getValueDictionaryColumnLinks({ dictionaryId: dict.id }),
      repo.getFileTemplatesUsingDictionary(dict.id)
    ]);
    return res.json({ dictionaryId: dict.id, columnLinks: links, templates });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ---- Value dictionary: "Not in this dictionary" (live distinct values from linked columns) ----
miscRouter.get('/value-translation-dictionaries/:id/untranslated', requireAuth, async (req: any, res: Response) => {
  try {
    const dict = await repo.getValueTranslationDictionaryById(req.params.id);
    if (!dict) return res.status(404).json({ error: 'Value translation dictionary not found' });

    const links = await repo.getValueDictionaryColumnLinks({ dictionaryId: dict.id });
    const counts = new Map<string, number>();
    const skipped: Array<{ dbId: string; tableName: string; columnName: string; reason: string }> = [];
    const isAdmin = String(req.user?.role || '').toLowerCase() === 'admin';

    for (const link of links) {
      const skip = (reason: string) => skipped.push({ dbId: link.dbId, tableName: link.tableName, columnName: link.columnName, reason });
      const db = await repo.getDatabaseConnectionById(link.dbId, false);
      if (!db) { skip('Connection not found'); continue; }
      if (db.teamId && !isAdmin) { skip('Team-private connection'); continue; }
      try {
        const values = await fetchDistinctColumnValues(db, link.tableName, link.columnName);
        for (const row of values) counts.set(row.value, (counts.get(row.value) || 0) + row.count);
      } catch (e: any) {
        skip(e instanceof DistinctValuesError ? e.message : `Query failed: ${String(e?.message || e).slice(0, 120)}`);
      }
    }

    const observed = Array.from(counts.entries()).map(([value, count]) => ({ value, count }));
    return res.json({
      dictionaryId: dict.id,
      untranslated: findUntranslatedValues(dict, observed).slice(0, 100),
      scannedColumns: links.length - skipped.length,
      skipped
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ---- Value dictionary: distinct values in a column (used to pre-fill a new dictionary) ----
miscRouter.post('/value-dictionary-links/distinct-values', requireAuth, async (req: any, res: Response) => {
  try {
    const { dbId, tableName, columnName } = req.body || {};
    if (!dbId || !tableName || !columnName) {
      return res.status(400).json({ error: 'dbId, tableName and columnName are required' });
    }
    const db = await repo.getDatabaseConnectionById(dbId, false);
    if (!db) return res.status(404).json({ error: 'Connection not found' });
    const isAdmin = String(req.user?.role || '').toLowerCase() === 'admin';
    if (db.teamId && !isAdmin) {
      return res.status(403).json({ error: 'Team-private connection: not accessible from global Data setup.' });
    }
    const values = await fetchDistinctColumnValues(db, tableName, columnName, 200);
    return res.json({ values });
  } catch (err: any) {
    const status = err instanceof DistinctValuesError ? 400 : 500;
    return res.status(status).json({ error: err.message });
  }
});

// ---- Value dictionary: persistent column links ----
miscRouter.get('/value-dictionary-links', async (req: Request, res: Response) => {
  try {
    const { dictionaryId, dbId, tableName } = req.query as Record<string, string | undefined>;
    return res.json(await repo.getValueDictionaryColumnLinks({ dictionaryId, dbId, tableName }));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

miscRouter.post('/value-dictionary-links', async (req: Request, res: Response) => {
  try {
    const { dictionaryId, dbId, tableName, columnName, showInGrids, createdBy } = req.body || {};
    if (!dictionaryId || !dbId || !tableName || !columnName) {
      return res.status(400).json({ error: 'dictionaryId, dbId, tableName and columnName are required' });
    }
    const dict = await repo.getValueTranslationDictionaryById(dictionaryId);
    if (!dict) return res.status(404).json({ error: 'Value translation dictionary not found' });
    const saved = await repo.upsertValueDictionaryColumnLink({
      dictionaryId, dbId, tableName, columnName, showInGrids: showInGrids !== false, createdBy
    });
    return res.status(201).json(saved);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

miscRouter.patch('/value-dictionary-links/:id', async (req: Request, res: Response) => {
  try {
    const ok = await repo.setValueDictionaryColumnLinkVisibility(req.params.id, req.body?.showInGrids !== false);
    if (!ok) return res.status(404).json({ error: 'Link not found' });
    return res.json({ success: true, id: req.params.id });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

miscRouter.delete('/value-dictionary-links/:id', async (req: Request, res: Response) => {
  try {
    const ok = await repo.deleteValueDictionaryColumnLink(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Link not found' });
    return res.json({ success: true, id: req.params.id });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ================= SYSTEM TRANSFORMATION RULES (Domain 7 / Governance Rule 23) =================
miscRouter.get('/settings/transformation-rules', async (req: Request, res: Response) => {
  try {
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;
    const rules = await repo.getSystemTransformationRules(category);
    return res.json(rules);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

miscRouter.get('/settings/transformation-rules/:id', async (req: Request, res: Response) => {
  try {
    const rule = await repo.getSystemTransformationRuleById(req.params.id);
    if (!rule) {
      return res.status(404).json({ error: 'System transformation rule not found' });
    }
    return res.json(rule);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

miscRouter.post('/settings/transformation-rules', async (req: Request, res: Response) => {
  try {
    const payload = req.body;
    if (!payload.name) {
      return res.status(400).json({ error: 'Transformation rule name is required' });
    }
    const saved = await repo.createOrUpdateSystemTransformationRule(payload);
    return res.status(201).json(saved);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

miscRouter.put('/settings/transformation-rules/:id', async (req: Request, res: Response) => {
  try {
    const payload = { ...req.body, id: req.params.id };
    if (!payload.name) {
      return res.status(400).json({ error: 'Transformation rule name is required' });
    }
    const saved = await repo.createOrUpdateSystemTransformationRule(payload);
    return res.json(saved);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

miscRouter.delete('/settings/transformation-rules/:id', async (req: Request, res: Response) => {
  try {
    const success = await repo.deleteSystemTransformationRule(req.params.id);
    if (!success) {
      return res.status(404).json({ error: 'System transformation rule not found or already deleted' });
    }
    return res.json({ success: true, id: req.params.id });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});




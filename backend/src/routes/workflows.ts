import { Router, Request, Response } from 'express';
import { repo } from '../store/repository.js';
import { DatabaseValidationWorkflow, ProcessingStage, ValidationCheckStep } from '../types.js';
import { executeLiveQueryOnDb } from '../services/dbConnectionManager.js';

export const workflowsRouter = Router();

// Helper to batch-hydrate attached column configurations onto workflow steps
async function hydrateWorkflowColumnConfigurations(wf: DatabaseValidationWorkflow): Promise<DatabaseValidationWorkflow> {
  if (!wf) return wf;

  const allConfigIds: string[] = [];
  const steps = Array.isArray(wf.steps) ? wf.steps : [];
  for (const s of steps) {
    if (Array.isArray(s.columnConfigurationIds)) {
      for (const cid of s.columnConfigurationIds) {
        if (cid && !allConfigIds.includes(cid)) allConfigIds.push(cid);
      }
    }
  }

  let configMap = new Map<string, any>();
  if (allConfigIds.length > 0) {
    const fetched = await repo.getColumnConfigurationsByIds(allConfigIds);
    configMap = new Map(fetched.map(c => [c.id, c]));
  }

  const hydratedSteps: ValidationCheckStep[] = await Promise.all(steps.map(async s => {
    let cfgs = (s.columnConfigurationIds || [])
      .map(id => configMap.get(id))
      .filter(Boolean);

    if (cfgs.length === 0 && (s.targetDbId || wf.targetDbId) && (s.targetTable || wf.targetTable)) {
      try {
        cfgs = await repo.getColumnConfigurations(s.targetDbId || wf.targetDbId!, s.targetTable || wf.targetTable!);
      } catch {}
    }

    return {
      ...s,
      columnConfigurations: cfgs
    };
  }));

  return {
    ...wf,
    steps: hydratedSteps
  };
}

// GET /api/workflows - List all workflows
workflowsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const teamId = req.query.teamId as string | undefined;
    const workflows = await repo.getWorkflows(teamId);
    const hydrated = await Promise.all(workflows.map(wf => hydrateWorkflowColumnConfigurations(wf)));
    return res.json(hydrated);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/workflows/:id - Get workflow by ID
workflowsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const wf = await repo.getWorkflowById(req.params.id);
    if (!wf) return res.status(404).json({ error: 'Workflow not found' });
    const hydrated = await hydrateWorkflowColumnConfigurations(wf);
    return res.json(hydrated);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/workflows - Create a new stage-aware workflow
workflowsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const data: Partial<DatabaseValidationWorkflow> = req.body;
    if (!data.name) {
      return res.status(400).json({ error: 'Workflow name is required' });
    }

    const workflowId = data.id || `wf-${Date.now()}`;
    const rawStages = Array.isArray(data.stages) ? data.stages.filter(Boolean) : [];
    const stages: ProcessingStage[] = rawStages.length > 0
      ? rawStages.map((st, idx) => ({
          id: st?.id || `stage-${Date.now()}-${idx + 1}`,
          name: st?.name || `Stage ${idx + 1}`,
          description: st?.description || '',
          order: st?.order !== undefined ? st.order : idx + 1,
          enabled: st?.enabled !== undefined ? st.enabled : true,
          targetDbId: st?.targetDbId || data.targetDbId || '',
          targetDataSource: st?.targetDataSource || data.targetTable || '',
          businessMeaning: st?.businessMeaning,
          createdAt: new Date().toISOString()
        }))
      : [
          {
            id: `stage-${workflowId}-1`,
            name: 'Primary Processing Stage',
            description: 'Default business stage',
            order: 1,
            enabled: true,
            targetDbId: data.targetDbId || '',
            targetDataSource: data.targetTable || '',
            businessMeaning: 'Primary Ingress'
          }
        ];

    const defaultStageId = stages[0]?.id || `stage-${workflowId}-1`;
    const defaultTargetDb = stages[0]?.targetDbId || data.targetDbId || '';
    const defaultDataSource = stages[0]?.targetDataSource || data.targetTable || '';

    const rawSteps = Array.isArray(data.steps) ? data.steps.filter(Boolean) : [];
    const steps: ValidationCheckStep[] = rawSteps.length > 0
      ? rawSteps.map((s, idx) => ({
          id: s?.id || `step-${Date.now()}-${idx + 1}`,
          stepNumber: s?.stepNumber || idx + 1,
          name: s?.name || `Step ${idx + 1}`,
          description: s?.description || '',
          stageId: s?.stageId || defaultStageId,
          checkType: s?.checkType || 'EXISTENCE_CHECK',
          targetDbId: s?.targetDbId || defaultTargetDb,
          targetTable: s?.targetTable || defaultDataSource,
          sqlCondition: s?.sqlCondition,
          sourceField: s?.sourceField || 'transaction_id',
          comparator: s?.comparator || '=',
          targetField: s?.targetField,
          compareValue: s?.compareValue ?? (s as any)?.expectedValue,
          expectedValue: (s as any)?.expectedValue ?? s?.compareValue,
          toleranceMargin: s?.toleranceMargin ?? (s as any)?.tolerance,
          dualSourceCondition: s?.dualSourceCondition,
          regexPattern: s?.regexPattern,
          requiredParams: (s?.requiredParams && s.requiredParams.length > 0)
            ? s.requiredParams
            : (s?.sourceField && s.sourceField !== 'transaction_id' ? [s.sourceField] : []),
          optionalParams: s?.optionalParams || [],
          dependencyCondition: s?.dependencyCondition || (idx === 0 ? 'ALWAYS' : 'IF_PREV_SUCCESS'),
          onPassAction: s?.onPassAction || 'CONTINUE',
          onFailAction: s?.onFailAction || 'STOP',
          onErrorAction: s?.onErrorAction || 'STOP',
          reportColumnName: s?.reportColumnName,
          reportField: s?.reportField,
          successMessage: s?.successMessage || 'Check passed successfully.',
          failureMessage: s?.failureMessage || 'Check failed criteria.',
          severityOnFailure: s?.severityOnFailure || 'WARNING'
        }))
      : [];

    const newWorkflow: DatabaseValidationWorkflow = {
      id: workflowId,
      name: data.name,
      description: data.description || '',
      targetDbId: data.targetDbId || defaultTargetDb,
      targetTable: data.targetTable || defaultDataSource,
      category: data.category || 'Reconciliation',
      stages,
      steps,
      nodes: Array.isArray(data.nodes) ? data.nodes.filter(Boolean) : [],
      connections: Array.isArray(data.connections) ? data.connections.filter(Boolean) : [],
      globalSuccessMessage: data.globalSuccessMessage || 'All stages reconciled successfully.',
      globalFailureMessage: data.globalFailureMessage || 'Investigation identified stage discrepancy.',
      createdBy: data.createdBy || 'operator',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isSystemDefault: false,
      version: data.version || '2.0.0',
      teamId: data.teamId || undefined,
      isPublic: data.isPublic !== undefined ? data.isPublic : true,
      visibility: data.visibility || 'team'
    };

    const saved = await repo.createWorkflow(newWorkflow);
    const hydrated = await hydrateWorkflowColumnConfigurations(saved);
    return res.status(201).json(hydrated);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// PUT /api/workflows/:id - Update workflow
workflowsRouter.put('/:id', async (req: Request, res: Response) => {
  try {
    const updates = req.body || {};
    if (updates.stages && Array.isArray(updates.stages)) {
      updates.stages = updates.stages.filter(Boolean);
    }
    if (updates.steps && Array.isArray(updates.steps)) {
      updates.steps = updates.steps.filter(Boolean);
    }
    if (updates.messageAggregations && Array.isArray(updates.messageAggregations)) {
      updates.messageAggregations = updates.messageAggregations.filter(Boolean);
    }
    const updated = await repo.updateWorkflow(req.params.id, updates);
    if (!updated) return res.status(404).json({ error: 'Workflow not found' });
    const hydrated = await hydrateWorkflowColumnConfigurations(updated);
    return res.json(hydrated);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /api/workflows/:id - Delete workflow
workflowsRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const success = await repo.deleteWorkflow(req.params.id);
    if (!success) return res.status(404).json({ error: 'Workflow not found' });
    return res.json({ success: true, message: 'Workflow deleted successfully' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ================= QUERY EXTRACTIONS =================

// GET /api/workflows/:id/query-extractions
workflowsRouter.get('/:id/query-extractions', async (req: Request, res: Response) => {
  try {
    const extractions = await repo.getQueryExtractionsByWorkflowId(req.params.id);
    return res.json(extractions);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/workflows/:id/query-extractions
workflowsRouter.post('/:id/query-extractions', async (req: Request, res: Response) => {
  try {
    const extractionData = req.body;
    const extraction = {
      id: extractionData.id || `qe-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      workflowId: req.params.id,
      stageId: extractionData.stageId || '',
      targetDbId: extractionData.targetDbId || '',
      targetDataSource: extractionData.targetDataSource || '',
      selectedColumns: extractionData.selectedColumns || [],
      keyMappings: extractionData.keyMappings || [{ inputField: 'transaction_id', sourceField: 'transaction_id', required: true }],
      filters: extractionData.filters || [],
      batchPolicy: extractionData.batchPolicy,
      enabled: extractionData.enabled !== undefined ? extractionData.enabled : true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const saved = await repo.createQueryExtraction(extraction);
    return res.status(201).json(saved);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// PUT /api/workflows/query-extractions/:id
workflowsRouter.put('/query-extractions/:id', async (req: Request, res: Response) => {
  try {
    const updated = await repo.updateQueryExtraction(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'QueryExtraction not found' });
    return res.json(updated);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /api/workflows/query-extractions/:id
workflowsRouter.delete('/query-extractions/:id', async (req: Request, res: Response) => {
  try {
    const success = await repo.deleteQueryExtraction(req.params.id);
    if (!success) return res.status(404).json({ error: 'QueryExtraction not found' });
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/workflows/query-sandbox/preview
workflowsRouter.post('/query-sandbox/preview', async (req: Request, res: Response) => {
  try {
    const { extraction, sampleKeys } = req.body;
    if (!extraction) {
      return res.status(400).json({ error: 'extraction configuration required' });
    }
    const chunk = {
      chunkId: 'sample-preview',
      sequence: 1,
      transactionIds: sampleKeys && sampleKeys.length > 0 ? sampleKeys.slice(0, 5) : ['TX-001', 'TX-002']
    };
    const primaryKey = extraction.keyMappings && extraction.keyMappings.length > 0
      ? extraction.keyMappings[0].sourceField
      : 'transaction_id';
    const columns = extraction.selectedColumns && extraction.selectedColumns.length > 0
      ? extraction.selectedColumns.map((c: any) => c.alias ? `${c.sourceColumn} AS ${c.alias}` : c.sourceColumn).join(', ')
      : '*';
    const placeholders = chunk.transactionIds.map(() => '?').join(', ');
    const sql = `SELECT ${columns} FROM ${extraction.targetDataSource || 'transactions'} WHERE ${primaryKey} IN (${placeholders});`;

    let rows: any[] = [];
    if (extraction.targetDbId && extraction.targetDataSource) {
      try {
        const dbs = await repo.getDatabases();
        const db = dbs.find(d => d.id === extraction.targetDbId) || dbs.find(d => d.name === extraction.targetDbId);
        if (db) {
          const previewQuery = `SELECT ${columns} FROM ${extraction.targetDataSource} LIMIT 10;`;
          const queryRes = await executeLiveQueryOnDb(db, previewQuery);
          if (queryRes && queryRes.rows) {
            rows = queryRes.rows;
          }
        }
      } catch (qErr: any) {
        console.warn('[QuerySandbox] Could not fetch sample rows:', qErr.message);
      }
    }

    return res.json({
      sql,
      parameters: chunk.transactionIds,
      chunk,
      rows
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

import { Router, Request, Response } from 'express';
import { repo } from '../store/repository.js';
import { mirrorTableManager } from '../services/mirrorTableManager.js';
import { executeLiveQueryOnDb } from '../services/dbConnectionManager.js';
import { ValidationBox, ValidationBoxType } from '../types.js';

export const validationBoxesRouter = Router();

// GET /api/validation-boxes - List all validation boxes with optional type filter
validationBoxesRouter.get('/', async (req: Request, res: Response) => {
  try {
    const boxType = req.query.boxType as ValidationBoxType | undefined;
    let boxes = await repo.getValidationBoxes();
    if (boxType) {
      boxes = boxes.filter(b => b.boxType === boxType);
    }
    return res.json(boxes);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/validation-boxes/:id - Get a validation box by ID
validationBoxesRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const box = await repo.getValidationBoxById(req.params.id);
    if (!box) return res.status(404).json({ error: 'Validation box not found' });
    return res.json(box);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/validation-boxes - Create a new validation box
validationBoxesRouter.post('/', async (req: Request, res: Response) => {
  try {
    const {
      id,
      name,
      description,
      boxType,
      category,
      targetDbId,
      targetTable,
      searchParameters,
      checkStep,
      matchKeyInput,
      matchKeyExternal,
      multiRowPolicy,
      groupConfig,
      dualSourceCondition,
      outputColumns,
      statusBinding,
      messageTemplate
    } = req.body;

    if (!name || !boxType) {
      return res.status(400).json({ error: 'Name and boxType (INGESTION_SEARCH, CONDITION_CHECK, RECONCILIATION, or REPORT) are required.' });
    }

    let mirrorTableName: string | undefined = undefined;

    // For Ingestion/Search or Reconciliation blocks with database and table specified, provision mirror table
    if ((boxType === 'INGESTION_SEARCH' || boxType === 'RECONCILIATION') && targetDbId && targetTable) {
      const db = await repo.getDatabaseById(targetDbId);
      if (db) {
        mirrorTableName = await mirrorTableManager.ensureMirrorTableExists(db, targetTable);
      }
    }

    const newBox: ValidationBox = {
      id: id || `vbox-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      name,
      description: description || '',
      boxType,
      category: category || 'General',
      targetDbId: targetDbId || undefined,
      targetTable: targetTable || undefined,
      mirrorTableName,
      searchParameters: searchParameters || [],
      checkStep: checkStep || undefined,
      matchKeyInput: matchKeyInput || undefined,
      matchKeyExternal: matchKeyExternal || undefined,
      multiRowPolicy: multiRowPolicy || undefined,
      groupConfig: groupConfig || undefined,
      dualSourceCondition: dualSourceCondition || undefined,
      outputColumns: outputColumns || undefined,
      statusBinding: statusBinding || undefined,
      messageTemplate: messageTemplate || undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const saved = await repo.createValidationBox(newBox);
    return res.status(201).json(saved);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// PUT /api/validation-boxes/:id - Update an existing validation box
validationBoxesRouter.put('/:id', async (req: Request, res: Response) => {
  try {
    const {
      name,
      description,
      boxType,
      category,
      targetDbId,
      targetTable,
      searchParameters,
      checkStep,
      matchKeyInput,
      matchKeyExternal,
      multiRowPolicy,
      groupConfig,
      dualSourceCondition,
      outputColumns,
      statusBinding,
      messageTemplate
    } = req.body;

    let mirrorTableName: string | undefined = undefined;
    if ((boxType === 'INGESTION_SEARCH' || boxType === 'RECONCILIATION') && targetDbId && targetTable) {
      const db = await repo.getDatabaseById(targetDbId);
      if (db) {
        mirrorTableName = await mirrorTableManager.ensureMirrorTableExists(db, targetTable);
      }
    }

    const updates: Partial<ValidationBox> = {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(boxType !== undefined && { boxType }),
      ...(category !== undefined && { category }),
      ...(targetDbId !== undefined && { targetDbId }),
      ...(targetTable !== undefined && { targetTable }),
      ...(mirrorTableName !== undefined && { mirrorTableName }),
      ...(searchParameters !== undefined && { searchParameters }),
      ...(checkStep !== undefined && { checkStep }),
      ...(matchKeyInput !== undefined && { matchKeyInput }),
      ...(matchKeyExternal !== undefined && { matchKeyExternal }),
      ...(multiRowPolicy !== undefined && { multiRowPolicy }),
      ...(groupConfig !== undefined && { groupConfig }),
      ...(dualSourceCondition !== undefined && { dualSourceCondition }),
      ...(outputColumns !== undefined && { outputColumns }),
      ...(statusBinding !== undefined && { statusBinding }),
      ...(messageTemplate !== undefined && { messageTemplate })
    };

    const updated = await repo.updateValidationBox(req.params.id, updates);
    if (!updated) return res.status(404).json({ error: 'Validation box not found' });
    return res.json(updated);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /api/validation-boxes/:id - Delete a validation box
validationBoxesRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const success = await repo.deleteValidationBox(req.params.id);
    if (!success) return res.status(404).json({ error: 'Validation box not found' });
    return res.json({ success: true, message: 'Validation box deleted successfully' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/validation-boxes/test - Test a standalone validation box against mock or live inputs
validationBoxesRouter.post('/test', async (req: Request, res: Response) => {
  try {
    const { box, sampleRecord } = req.body;
    if (!box) {
      return res.status(400).json({ error: 'box configuration is required' });
    }

    const testRecord = sampleRecord || {
      transactionId: 'TXN-9021',
      amount: 149.99,
      date: new Date().toISOString(),
      status: 'COMPLETED'
    };

    if (box.boxType === 'INGESTION_SEARCH') {
      // Ingestion / Search Block execution test
      if (!box.targetDbId || !box.targetTable) {
        return res.json({
          status: 'WARNING',
          message: 'Ingestion Search Box has no target database or table configured.',
          parametersChecked: box.searchParameters || [],
          simulatedRecord: testRecord
        });
      }

      const db = await repo.getDatabaseById(box.targetDbId);
      if (!db) {
        return res.status(404).json({ error: `Configured target database [${box.targetDbId}] not found.` });
      }

      const mirrorName = await mirrorTableManager.ensureMirrorTableExists(db, box.targetTable);

      // Build parameterized query preview
      const searchParams = box.searchParameters || [];
      const whereClauses: string[] = [];
      for (const param of searchParams) {
        const val = testRecord[param.inputField] ?? testRecord[param.targetColumn];
        if (val !== undefined) {
          whereClauses.push(`${param.targetColumn} = '${val}'`);
        }
      }

      const queryPreview = `SELECT * FROM ${box.targetTable} WHERE ${whereClauses.length ? whereClauses.join(' AND ') : '1=1'} LIMIT 1;`;

      let queryResult: any = null;
      try {
        queryResult = await executeLiveQueryOnDb(db, queryPreview);
      } catch (err: any) {
        // Query error or unreachable external db
        queryResult = { error: err.message };
      }

      return res.json({
        boxType: 'INGESTION_SEARCH',
        targetDb: db.name,
        targetTable: box.targetTable,
        mirrorTable: mirrorName,
        queryPreview,
        queryExecution: queryResult,
        status: queryResult?.rows?.length ? 'MATCH_FOUND' : 'NO_MATCH_OR_EXTERNAL_UNAVAILABLE',
        sampleRecord: testRecord
      });
    } else if (box.boxType === 'RECONCILIATION') {
      const inputKey = box.matchKeyInput || 'transaction_id';
      const extKey = box.matchKeyExternal || 'transaction_id';
      const keyVal = testRecord[inputKey] ?? testRecord.transactionId;
      return res.json({
        boxType: 'RECONCILIATION',
        targetDb: box.targetDbId,
        targetTable: box.targetTable,
        mirrorTable: box.mirrorTableName,
        matchKeyInput: inputKey,
        matchKeyExternal: extKey,
        multiRowPolicy: box.multiRowPolicy || 'COMPOSITE_BUNDLE',
        hasGroupConfig: !!box.groupConfig,
        testRecordKey: keyVal,
        status: 'READY',
        sampleRecord: testRecord
      });
    } else if (box.boxType === 'REPORT') {
      return res.json({
        boxType: 'REPORT',
        name: box.name,
        outputColumns: box.outputColumns || [],
        statusBinding: box.statusBinding || null,
        messageTemplate: box.messageTemplate || '',
        sampleRecord: testRecord
      });
    } else {
      // Condition Check Block execution test (unified via evaluateRuleCondition)
      const { evaluateRuleCondition, resolveRecordField } = await import('../services/investigationEngine.js');
      const step = box.checkStep || {};
      const op = step.operator || step.comparator || (box.dualSourceCondition ? box.dualSourceCondition.comparator : 'EQUALS');
      const comparator = (op === 'EQUALS' ? '=' : (op === 'NOT_EQUALS' ? '!=' : (op === 'NUMERIC_TOLERANCE' ? '=' : op))) as any;
      const sourceField = box.dualSourceCondition?.sourceA?.field || step.sourceField || step.canonicalField || 'institution1';
      const isDual = Boolean(box.dualSourceCondition || step.dualSourceCondition);

      const ruleStep: any = {
        id: box.id || `test-${Date.now()}`,
        stepNumber: 1,
        name: box.name || 'Condition Check',
        checkType: isDual ? 'DUAL_SOURCE_COMPARISON' : (step.checkType || 'FIELD_COMPARATOR'),
        targetDbId: box.targetDbId || '',
        targetTable: box.targetTable || '',
        sourceField,
        targetField: box.dualSourceCondition?.sourceB?.field || step.targetField,
        canonicalField: step.canonicalField || sourceField,
        operator: op,
        comparator,
        compareValue: step.compareValue ?? step.expectedValue,
        expectedValue: step.expectedValue ?? step.compareValue,
        toleranceMargin: step.toleranceMargin ?? step.tolerance ?? box.dualSourceCondition?.toleranceMargin ?? 0.00,
        tolerance: step.tolerance ?? step.toleranceMargin ?? box.dualSourceCondition?.toleranceMargin ?? 0.00,
        dualSourceCondition: box.dualSourceCondition || step.dualSourceCondition,
        onPassAction: step.actionOnSuccess || step.onPassAction || 'CONTINUE',
        onFailAction: step.actionOnFailure || step.onFailAction || 'FLAG',
        onErrorAction: 'STOP',
        dependencyCondition: 'ALWAYS',
        requiredParams: step.requiredParams && step.requiredParams.length > 0 ? step.requiredParams : [sourceField]
      };

      const evalRes = evaluateRuleCondition(testRecord, ruleStep);
      const actualVal = evalRes.dbValue ?? resolveRecordField(testRecord, sourceField);

      return res.json({
        boxType: 'CONDITION_CHECK',
        ruleName: box.name,
        isDualSource: isDual,
        dualSourceCondition: ruleStep.dualSourceCondition,
        evaluatedField: sourceField,
        actualValue: actualVal,
        operator: op,
        passed: evalRes.status === 'PASS',
        reason: evalRes.message,
        badgeText: evalRes.badgeText,
        detail: evalRes.detail,
        actionOnSuccess: ruleStep.onPassAction,
        actionOnFailure: ruleStep.onFailAction,
        sampleRecord: testRecord
      });
    }
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

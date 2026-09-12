import { Router, Request, Response } from 'express';
import { repo } from '../store/repository.js';
import { postgresRepo } from '../store/postgresRepo.js';
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
    const {
      box,
      sampleRecord,
      record,
      transaction,
      parameters,
      inputValues,
      params
    } = req.body;

    if (!box) {
      return res.status(400).json({ error: 'box configuration is required' });
    }

    const { evaluateRuleCondition, resolveRecordField } = await import('../services/investigationEngine.js');

    // Prioritize actual parameter payload given by caller under any standard key
    const rawProvided = sampleRecord ?? record ?? transaction ?? parameters ?? inputValues ?? params;
    const hasExplicitPayload = rawProvided !== undefined && rawProvided !== null && typeof rawProvided === 'object';

    // Dynamically build realistic parameters from the box's own definition when none provided
    const buildParametersFromBox = (b: any): Record<string, any> => {
      const rec: Record<string, any> = {};
      if (b.boxType === 'INGESTION_SEARCH' && Array.isArray(b.searchParameters)) {
        for (const sp of b.searchParameters) {
          const fieldKey = sp.inputField || sp.targetColumn;
          if (fieldKey) {
            rec[fieldKey] = sp.defaultValue || (
              fieldKey.toLowerCase().includes('amount') ? 149.99 :
              fieldKey.toLowerCase().includes('id') || fieldKey.toLowerCase().includes('ref') ? 'TXN-1001' :
              fieldKey.toLowerCase().includes('card') || fieldKey.toLowerCase().includes('pan') ? '4111********9982' :
              fieldKey.toLowerCase().includes('status') ? 'COMPLETED' :
              'PARAM_VAL'
            );
          }
        }
      } else if (b.boxType === 'CONDITION_CHECK') {
        if (b.dualSourceCondition) {
          const fA = b.dualSourceCondition.sourceA?.field || 'source_a';
          const fB = b.dualSourceCondition.sourceB?.field || 'source_b';
          rec[fA] = b.dualSourceCondition.toleranceMargin ? 100.00 : 'MATCH_VALUE';
          rec[fB] = b.dualSourceCondition.toleranceMargin ? 100.00 : 'MATCH_VALUE';
        } else if (b.checkStep) {
          const f = b.checkStep.canonicalField || b.checkStep.sourceField || 'evaluated_field';
          rec[f] = b.checkStep.expectedValue ?? b.checkStep.compareValue ?? 'TEST_VAL';
        }
      } else if (b.boxType === 'RECONCILIATION') {
        rec[b.matchKeyInput || 'transaction_id'] = 'TXN-1001';
        if (b.groupConfig?.groupIdField) rec[b.groupConfig.groupIdField] = 'GRP-001';
        if (b.groupConfig?.eventPhaseField) rec[b.groupConfig.eventPhaseField] = 'FINANCIAL_REQ';
      } else if (b.boxType === 'REPORT' && Array.isArray(b.outputColumns)) {
        for (const col of b.outputColumns) {
          if (col.field) rec[col.field] = 'SAMPLE_DATA';
        }
      }
      if (Object.keys(rec).length === 0) {
        rec.transaction_id = 'TXN-1001';
        rec.amount = 149.99;
      }
      return rec;
    };

    const testRecord = hasExplicitPayload ? rawProvided : buildParametersFromBox(box);

    if (box.boxType === 'INGESTION_SEARCH') {
      // Ingestion / Search Block execution test
      if (!box.targetDbId || !box.targetTable) {
        return res.json({
          boxType: 'INGESTION_SEARCH',
          status: 'WARNING',
          passed: false,
          badgeText: 'Config Missing',
          message: 'Ingestion Search Box has no target database or table configured.',
          parametersChecked: box.searchParameters || [],
          simulatedRecord: testRecord
        });
      }

      // 1. Enforce parameter dependency: Check all required parameters configured for this box
      const searchParams: any[] = box.searchParameters || [];
      const requiredParams = searchParams.filter((p: any) => p.required !== false);
      const missingRequired: string[] = [];

      for (const param of requiredParams) {
        const val = resolveRecordField(testRecord, param.inputField) ??
                    resolveRecordField(testRecord, param.targetColumn) ??
                    testRecord[param.inputField] ??
                    testRecord[param.targetColumn];
        if (val === undefined || val === null || String(val).trim() === '') {
          missingRequired.push(param.inputField || param.targetColumn);
        }
      }

      if (missingRequired.length > 0) {
        return res.json({
          boxType: 'INGESTION_SEARCH',
          targetDb: box.targetDbId,
          targetTable: box.targetTable,
          status: 'FAIL',
          passed: false,
          badgeText: 'Param Missing',
          message: `Required parameter(s) missing: [${missingRequired.join(', ')}]. Parameter not found in input record.`,
          missingParameters: missingRequired,
          sampleRecord: testRecord
        });
      }

      const db = await repo.getDatabaseById(box.targetDbId);
      if (!db) {
        return res.status(404).json({ error: `Configured target database [${box.targetDbId}] not found.` });
      }

      const mirrorName = await mirrorTableManager.ensureMirrorTableExists(db, box.targetTable);

      // 2. Build WHERE clauses from configured searchParameters
      const whereClauses: string[] = [];
      const handledCols = new Set<string>();

      for (const param of searchParams) {
        const val = resolveRecordField(testRecord, param.inputField) ??
                    resolveRecordField(testRecord, param.targetColumn) ??
                    testRecord[param.inputField] ??
                    testRecord[param.targetColumn];
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          const safeVal = String(val).replace(/'/g, "''");
          whereClauses.push(`${param.targetColumn} = '${safeVal}'`);
          handledCols.add(String(param.targetColumn).toLowerCase());
          if (param.inputField) handledCols.add(String(param.inputField).toLowerCase());
        }
      }

      // 3. Also dynamically include any extra parameters provided in testRecord
      let tableColNames: string[] = [];
      try {
        const allMappings = await postgresRepo.getTableMappings();
        const mapping = allMappings[`${box.targetDbId}::${box.targetTable}`] || allMappings[`${box.targetDbId}:${box.targetTable}`];
        if (mapping?.columns && Array.isArray(mapping.columns)) {
          tableColNames = mapping.columns.map((c: any) => typeof c === 'string' ? c : (c.columnName || c.name || c.key)).filter(Boolean);
        }
      } catch {
        // ignore mapping fetch error
      }

      for (const [key, rawVal] of Object.entries(testRecord)) {
        if (rawVal === undefined || rawVal === null || String(rawVal).trim() === '') continue;
        if (handledCols.has(key.toLowerCase())) continue;

        // If key matches a column in the target table (case-insensitive)
        const matchingCol = tableColNames.find(c => c.toLowerCase() === key.toLowerCase());
        if (matchingCol) {
          const safeVal = String(rawVal).replace(/'/g, "''");
          whereClauses.push(`${matchingCol} = '${safeVal}'`);
          handledCols.add(matchingCol.toLowerCase());
          handledCols.add(key.toLowerCase());
        }
      }

      if (whereClauses.length === 0) {
        return res.json({
          boxType: 'INGESTION_SEARCH',
          targetDb: db.name,
          targetTable: box.targetTable,
          mirrorTable: mirrorName,
          status: 'FAIL',
          passed: false,
          badgeText: 'No Parameters',
          message: 'No valid search parameters provided for target table query. Validation box requires parameters.',
          sampleRecord: testRecord
        });
      }

      const queryPreview = `SELECT * FROM ${box.targetTable} WHERE ${whereClauses.join(' AND ')} LIMIT 1;`;

      let queryResult: any = null;
      try {
        queryResult = await executeLiveQueryOnDb(db, queryPreview);
      } catch (err: any) {
        queryResult = { error: err.message };
      }

      const isMatch = Boolean(queryResult?.rows && queryResult.rows.length > 0);

      return res.json({
        boxType: 'INGESTION_SEARCH',
        targetDb: db.name,
        targetTable: box.targetTable,
        mirrorTable: mirrorName,
        queryPreview,
        queryExecution: queryResult,
        passed: isMatch,
        status: isMatch ? 'MATCH_FOUND' : 'NO_MATCH_OR_EXTERNAL_UNAVAILABLE',
        badgeText: isMatch ? 'Match Found (200)' : 'No Match (404)',
        message: isMatch
          ? `Query matched ${queryResult.rows.length} record(s) in ${box.targetTable}`
          : `No matching record found in ${box.targetTable} with the given parameters.`,
        sampleRecord: testRecord
      });
    } else if (box.boxType === 'RECONCILIATION') {
      const inputKey = box.matchKeyInput || 'transaction_id';
      const extKey = box.matchKeyExternal || 'transaction_id';
      const keyVal = resolveRecordField(testRecord, inputKey) ??
                     resolveRecordField(testRecord, extKey) ??
                     resolveRecordField(testRecord, 'transaction_id') ??
                     testRecord[inputKey];

      if (keyVal === undefined || keyVal === null || String(keyVal).trim() === '') {
        return res.json({
          boxType: 'RECONCILIATION',
          targetDb: box.targetDbId,
          targetTable: box.targetTable,
          status: 'FAIL',
          passed: false,
          badgeText: 'Param Missing',
          message: `Required match key [${inputKey}] not found in input record.`,
          missingParameters: [inputKey],
          sampleRecord: testRecord
        });
      }

      let liveCheck: any = null;
      let isMatch = false;
      if (box.targetDbId && box.targetTable) {
        try {
          const db = await repo.getDatabaseById(box.targetDbId);
          if (db) {
            const safeVal = String(keyVal).replace(/'/g, "''");
            const q = `SELECT * FROM ${box.targetTable} WHERE ${extKey} = '${safeVal}' LIMIT 1;`;
            liveCheck = await executeLiveQueryOnDb(db, q);
            isMatch = Boolean(liveCheck?.rows && liveCheck.rows.length > 0);
          }
        } catch (e: any) {
          liveCheck = { error: e.message };
        }
      }

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
        passed: liveCheck ? isMatch : true,
        status: isMatch ? 'MATCH_FOUND' : (liveCheck ? 'NO_MATCH_OR_EXTERNAL_UNAVAILABLE' : 'READY'),
        badgeText: isMatch ? 'Match Found (200)' : (liveCheck ? 'No Match (404)' : 'Ready'),
        message: isMatch
          ? `Matched record in ${box.targetTable} for key ${extKey}='${keyVal}'`
          : (liveCheck ? `No matching record found in ${box.targetTable} for key ${extKey}='${keyVal}'` : 'Reconciliation box configured and ready'),
        liveExecution: liveCheck,
        sampleRecord: testRecord
      });
    } else if (box.boxType === 'REPORT') {
      return res.json({
        boxType: 'REPORT',
        name: box.name,
        outputColumns: box.outputColumns || [],
        statusBinding: box.statusBinding || null,
        messageTemplate: box.messageTemplate || '',
        passed: true,
        status: 'READY',
        badgeText: 'Report Ready',
        sampleRecord: testRecord
      });
    } else {
      // Condition Check Block execution test (unified via evaluateRuleCondition)
      const step = box.checkStep || {};
      const op = step.operator || step.comparator || (box.dualSourceCondition ? box.dualSourceCondition.comparator : 'EQUALS');
      const comparator = (op === 'EQUALS' ? '=' : (op === 'NOT_EQUALS' ? '!=' : (op === 'NUMERIC_TOLERANCE' ? '=' : op))) as any;
      const dsc = box.dualSourceCondition || step.dualSourceCondition;
      const isDual = Boolean(dsc);

      const sourceField = dsc?.sourceA?.field ||
                          step.sourceField ||
                          step.canonicalField ||
                          (box.searchParameters?.[0]?.inputField) ||
                          Object.keys(testRecord)[0] ||
                          'transaction_id';
      const targetField = dsc?.sourceB?.field || step.targetField;

      // Identify all required parameters configured for this condition check
      const requiredParams: string[] = [];
      if (isDual) {
        if (dsc?.sourceA?.field) requiredParams.push(dsc.sourceA.field);
        if (dsc?.sourceB?.field) requiredParams.push(dsc.sourceB.field);
      } else {
        if (sourceField) requiredParams.push(sourceField);
      }
      if (Array.isArray(step.requiredParams)) {
        for (const p of step.requiredParams) {
          if (p && !requiredParams.includes(p)) requiredParams.push(p);
        }
      }
      if (Array.isArray(box.searchParameters)) {
        for (const sp of box.searchParameters) {
          if (sp.required !== false) {
            const k = sp.inputField || sp.targetColumn;
            if (k && !requiredParams.includes(k)) requiredParams.push(k);
          }
        }
      }

      // Check if any required parameter is missing from testRecord
      const missingParams: string[] = [];
      for (const p of requiredParams) {
        const v = resolveRecordField(testRecord, p);
        if (v === undefined || v === null || String(v).trim() === '') {
          missingParams.push(p);
        }
      }

      if (missingParams.length > 0) {
        return res.json({
          boxType: 'CONDITION_CHECK',
          ruleName: box.name,
          isDualSource: isDual,
          evaluatedField: sourceField,
          status: 'FAIL',
          passed: false,
          badgeText: 'Param Missing',
          message: `Required parameter(s) missing: [${missingParams.join(', ')}]. Parameter not found in input record.`,
          missingParameters: missingParams,
          reason: `Required parameter(s) missing: [${missingParams.join(', ')}]`,
          sampleRecord: testRecord
        });
      }

      const ruleStep: any = {
        id: box.id || `test-${Date.now()}`,
        stepNumber: 1,
        name: box.name || 'Condition Check',
        checkType: isDual ? 'DUAL_SOURCE_COMPARISON' : (step.checkType || 'FIELD_COMPARATOR'),
        targetDbId: box.targetDbId || '',
        targetTable: box.targetTable || '',
        sourceField,
        targetField,
        canonicalField: step.canonicalField || sourceField,
        operator: op,
        comparator,
        compareValue: step.compareValue ?? step.expectedValue,
        expectedValue: step.expectedValue ?? step.compareValue,
        toleranceMargin: step.toleranceMargin ?? step.tolerance ?? dsc?.toleranceMargin ?? 0.00,
        tolerance: step.tolerance ?? step.toleranceMargin ?? dsc?.toleranceMargin ?? 0.00,
        dualSourceCondition: dsc,
        onPassAction: step.actionOnSuccess || step.onPassAction || 'CONTINUE',
        onFailAction: step.actionOnFailure || step.onFailAction || 'FLAG',
        onErrorAction: 'STOP',
        dependencyCondition: 'ALWAYS',
        requiredParams
      };

      const evalRes = evaluateRuleCondition(testRecord, ruleStep);
      const actualVal = evalRes.dbValue ?? resolveRecordField(testRecord, sourceField);
      const isPass = evalRes.status === 'PASS';

      return res.json({
        boxType: 'CONDITION_CHECK',
        ruleName: box.name,
        isDualSource: isDual,
        dualSourceCondition: ruleStep.dualSourceCondition,
        evaluatedField: sourceField,
        actualValue: actualVal,
        operator: op,
        status: evalRes.status,
        passed: isPass,
        reason: evalRes.message,
        badgeText: evalRes.badgeText || (isPass ? 'Pass' : 'Fail'),
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

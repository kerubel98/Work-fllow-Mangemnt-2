import { Router } from 'express';
import { repo } from '../store/repository.js';
import { mirrorTableManager } from '../services/mirrorTableManager.js';
import { executeLiveQueryOnDb } from '../services/dbConnectionManager.js';
export const validationBoxesRouter = Router();
// GET /api/validation-boxes - List all validation boxes with optional type filter
validationBoxesRouter.get('/', async (req, res) => {
    try {
        const boxType = req.query.boxType;
        let boxes = await repo.getValidationBoxes();
        if (boxType) {
            boxes = boxes.filter(b => b.boxType === boxType);
        }
        return res.json(boxes);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// GET /api/validation-boxes/:id - Get a validation box by ID
validationBoxesRouter.get('/:id', async (req, res) => {
    try {
        const box = await repo.getValidationBoxById(req.params.id);
        if (!box)
            return res.status(404).json({ error: 'Validation box not found' });
        return res.json(box);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// POST /api/validation-boxes - Create a new validation box
validationBoxesRouter.post('/', async (req, res) => {
    try {
        const { id, name, description, boxType, category, targetDbId, targetTable, searchParameters, checkStep, matchKeyInput, matchKeyExternal, multiRowPolicy, groupConfig, dualSourceCondition, outputColumns, statusBinding, messageTemplate } = req.body;
        if (!name || !boxType) {
            return res.status(400).json({ error: 'Name and boxType (INGESTION_SEARCH, CONDITION_CHECK, RECONCILIATION, or REPORT) are required.' });
        }
        let mirrorTableName = undefined;
        // For Ingestion/Search or Reconciliation blocks with database and table specified, provision mirror table
        if ((boxType === 'INGESTION_SEARCH' || boxType === 'RECONCILIATION') && targetDbId && targetTable) {
            const db = await repo.getDatabaseById(targetDbId);
            if (db) {
                mirrorTableName = await mirrorTableManager.ensureMirrorTableExists(db, targetTable);
            }
        }
        const newBox = {
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
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// PUT /api/validation-boxes/:id - Update an existing validation box
validationBoxesRouter.put('/:id', async (req, res) => {
    try {
        const { name, description, boxType, category, targetDbId, targetTable, searchParameters, checkStep, matchKeyInput, matchKeyExternal, multiRowPolicy, groupConfig, dualSourceCondition, outputColumns, statusBinding, messageTemplate } = req.body;
        let mirrorTableName = undefined;
        if ((boxType === 'INGESTION_SEARCH' || boxType === 'RECONCILIATION') && targetDbId && targetTable) {
            const db = await repo.getDatabaseById(targetDbId);
            if (db) {
                mirrorTableName = await mirrorTableManager.ensureMirrorTableExists(db, targetTable);
            }
        }
        const updates = {
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
        if (!updated)
            return res.status(404).json({ error: 'Validation box not found' });
        return res.json(updated);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// DELETE /api/validation-boxes/:id - Delete a validation box
validationBoxesRouter.delete('/:id', async (req, res) => {
    try {
        const success = await repo.deleteValidationBox(req.params.id);
        if (!success)
            return res.status(404).json({ error: 'Validation box not found' });
        return res.json({ success: true, message: 'Validation box deleted successfully' });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// POST /api/validation-boxes/test - Test a standalone validation box against mock or live inputs
validationBoxesRouter.post('/test', async (req, res) => {
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
            const whereClauses = [];
            for (const param of searchParams) {
                const val = testRecord[param.inputField] ?? testRecord[param.targetColumn];
                if (val !== undefined) {
                    whereClauses.push(`${param.targetColumn} = '${val}'`);
                }
            }
            const queryPreview = `SELECT * FROM ${box.targetTable} WHERE ${whereClauses.length ? whereClauses.join(' AND ') : '1=1'} LIMIT 1;`;
            let queryResult = null;
            try {
                queryResult = await executeLiveQueryOnDb(db, queryPreview);
            }
            catch (err) {
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
        }
        else if (box.boxType === 'RECONCILIATION') {
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
        }
        else if (box.boxType === 'REPORT') {
            return res.json({
                boxType: 'REPORT',
                name: box.name,
                outputColumns: box.outputColumns || [],
                statusBinding: box.statusBinding || null,
                messageTemplate: box.messageTemplate || '',
                sampleRecord: testRecord
            });
        }
        else {
            // Condition Check Block execution test (handles single condition or Dual-Source)
            if (box.dualSourceCondition || box.checkStep?.dualSourceCondition) {
                const { evaluateRuleCondition } = await import('../services/investigationEngine.js');
                const ruleStep = box.checkStep || {
                    id: box.id,
                    stepNumber: 1,
                    name: box.name,
                    checkType: 'DUAL_SOURCE_COMPARISON',
                    targetDbId: box.targetDbId || '',
                    targetTable: box.targetTable || '',
                    dependencyCondition: 'ALWAYS',
                    onPassAction: 'CONTINUE',
                    onFailAction: 'STOP',
                    onErrorAction: 'STOP',
                    dualSourceCondition: box.dualSourceCondition
                };
                const evalRes = evaluateRuleCondition(testRecord, ruleStep);
                return res.json({
                    boxType: 'CONDITION_CHECK',
                    ruleName: box.name,
                    isDualSource: true,
                    dualSourceCondition: box.dualSourceCondition || box.checkStep?.dualSourceCondition,
                    passed: evalRes.status === 'PASS',
                    reason: evalRes.message,
                    badgeText: evalRes.badgeText,
                    detail: evalRes.detail,
                    actionOnSuccess: ruleStep.onPassAction || 'CONTINUE',
                    actionOnFailure: ruleStep.onFailAction || 'STOP'
                });
            }
            const step = box.checkStep || {};
            const col = step.canonicalField || 'amount';
            const actualVal = testRecord[col];
            const targetVal = step.expectedValue;
            const op = step.operator || 'EQUALS';
            let passed = true;
            let reason = '';
            switch (op) {
                case 'EQUALS':
                    passed = String(actualVal) === String(targetVal);
                    reason = passed ? `${col} (${actualVal}) equals ${targetVal}` : `${col} (${actualVal}) != ${targetVal}`;
                    break;
                case 'NUMERIC_TOLERANCE':
                    const diff = Math.abs(Number(actualVal) - Number(targetVal));
                    const tol = Number(step.tolerance) || 0.01;
                    passed = diff <= tol;
                    reason = passed ? `Difference ${diff.toFixed(2)} <= tolerance ${tol}` : `Difference ${diff.toFixed(2)} exceeds tolerance ${tol}`;
                    break;
                case 'NOT_NULL':
                    passed = actualVal !== null && actualVal !== undefined && actualVal !== '';
                    reason = passed ? `${col} is present` : `${col} is missing or null`;
                    break;
                default:
                    passed = String(actualVal) === String(targetVal);
                    reason = passed ? `Condition satisfied for ${col}` : `Condition failed for ${col}`;
            }
            return res.json({
                boxType: 'CONDITION_CHECK',
                ruleName: box.name,
                evaluatedField: col,
                actualValue: actualVal,
                operator: op,
                passed,
                reason,
                actionOnSuccess: step.actionOnSuccess || 'CONTINUE',
                actionOnFailure: step.actionOnFailure || 'FLAG'
            });
        }
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

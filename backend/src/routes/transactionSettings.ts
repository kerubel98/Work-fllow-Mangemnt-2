import { Router, Request, Response } from 'express';
import { isPostgresConnected } from '../config/postgres.js';
import { postgresRepo } from '../store/postgresRepo.js';
import { store, INITIAL_GLOBAL_STANDARD_DIRECTORY_RECORDS } from '../store/dataStore.js';
import { TransactionTemplate, ColumnMappingRule, GlobalStandardDirectoryRecord } from '../types.js';
import { GlobalSchemaDiscoveryService, classifyColumn, formatColumnLabel } from '../services/globalSchemaDiscoveryService.js';


export const transactionSettingsRouter = Router();

// GET /api/transactions/settings - Retrieve global transaction schema config and mapping templates
transactionSettingsRouter.get('/settings', async (_req: Request, res: Response) => {
  if (isPostgresConnected) {
    try {
      const schema = await postgresRepo.getGlobalSchemaConfig();
      const templates = await postgresRepo.getTransactionTemplates();
      return res.json({
        schema: schema || store.globalSchema,
        templates: templates && templates.length > 0 ? templates : store.transactionTemplates
      });
    } catch (e: any) {
      console.warn('Error fetching settings from PostgreSQL, using store:', e.message);
    }
  }

  return res.json({
    schema: store.globalSchema,
    templates: store.transactionTemplates
  });
});

// POST /api/transactions/settings/schema - Update global transaction schema custom fields
transactionSettingsRouter.post('/settings/schema', async (req: Request, res: Response) => {
  const { customFields, defaultTemplateId, updatedBy } = req.body;
  if (customFields && Array.isArray(customFields)) {
    store.globalSchema.customFields = customFields;
  }
  if (defaultTemplateId !== undefined) {
    store.globalSchema.defaultTemplateId = defaultTemplateId;
  }
  store.globalSchema.updatedAt = new Date().toISOString();
  store.globalSchema.updatedBy = updatedBy || 'system';

  if (isPostgresConnected) {
    try {
      await postgresRepo.saveGlobalSchemaConfig(store.globalSchema);
    } catch (e: any) {
      console.warn('Could not update schema in PostgreSQL:', e.message);
    }
  }

  return res.json({
    message: 'Global transaction schema updated successfully',
    schema: store.globalSchema
  });
});

// =========================================================
// VERSIONED GLOBAL MAPPING SCHEMA CONFIG ENDPOINTS
// =========================================================

// GET /api/transactions/schema/config - Retrieve full versioned Global Mapping configuration
transactionSettingsRouter.get('/schema/config', async (_req: Request, res: Response) => {
  if (isPostgresConnected) {
    try {
      let pgDoc = await postgresRepo.getGlobalSchemaConfig();
      let dirFields = await postgresRepo.getGlobalStandardDirectory();

      if (!pgDoc) {
        pgDoc = await postgresRepo.saveGlobalSchemaConfig({
          version: '2.3.0',
          standardFields: dirFields,
          tableMappings: await postgresRepo.getTableMappings()
        });
      } else {
        pgDoc.standardFields = dirFields;
      }

      store.globalSchema = {
        ...store.globalSchema,
        ...pgDoc
      };
      store.globalStandardDirectory = dirFields;
      return res.json(pgDoc);
    } catch (err: any) {
      console.warn('[SchemaConfig] Error fetching from PostgreSQL:', err.message);
    }
  }

  return res.json(store.globalSchema);
});

// POST /api/transactions/schema/config - Persist version-controlled Global Mapping configuration
transactionSettingsRouter.post('/schema/config', async (req: Request, res: Response) => {
  const { standardFields, version, versionHistory, updatedBy, description, strictMappingEnforced } = req.body;

  if (!standardFields || !Array.isArray(standardFields)) {
    return res.status(400).json({ error: 'standardFields array is required' });
  }

  const now = new Date().toISOString();
  const author = updatedBy || 'system';
  const newVersion = version || store.globalSchema.version || '2.3.0';

  const history: any[] = Array.isArray(versionHistory) ? [...versionHistory] : (store.globalSchema.versionHistory || []);
  if (description) {
    history.unshift({
      version: newVersion,
      timestamp: now,
      author,
      description: description.trim(),
      fieldCount: standardFields.length
    });
  }

  store.globalSchema = {
    ...store.globalSchema,
    version: newVersion,
    updatedAt: now,
    updatedBy: author,
    standardFields,
    versionHistory: history.slice(0, 50),
    strictMappingEnforced: strictMappingEnforced !== undefined ? !!strictMappingEnforced : true
  };

  // Sync memory directory table
  store.globalStandardDirectory = standardFields.map((f: any) => ({
    id: f.id || `gsd-${f.key}`,
    key: f.key,
    label: f.label || f.key,
    description: f.description || '',
    dataType: f.dataType || 'string',
    required: !!f.required,
    isStandard: f.isStandard !== undefined ? !!f.isStandard : true,
    exampleValue: f.exampleValue || '',
    category: f.category || 'General',
    notes: f.notes || '',
    user_id: f.user_id || 'system',
    created_at: f.created_at || now,
    updated_at: now
  }));

  // Primary: Persist to PostgreSQL
  if (isPostgresConnected) {
    try {
      await postgresRepo.saveGlobalSchemaConfig({
        version: store.globalSchema.version,
        standardFields: store.globalSchema.standardFields,
        tableMappings: store.globalSchema.tableMappings,
        versionHistory: store.globalSchema.versionHistory,
        strictMappingEnforced: store.globalSchema.strictMappingEnforced,
        updatedBy: author
      });
      // Also persist every directory record to global_standard_directory
      for (const f of store.globalStandardDirectory) {
        await postgresRepo.saveGlobalStandardDirectoryField(f).catch(() => {});
      }
    } catch (err: any) {
      console.warn('[SchemaConfig] Error saving config to PostgreSQL:', err.message);
    }
  }



  return res.json({
    message: `Global Schema updated to version ${newVersion}`,
    version: newVersion,
    config: store.globalSchema
  });
});

// GET /api/transactions/table-mappings - List all database-to-global table mappings
transactionSettingsRouter.get('/table-mappings', async (_req: Request, res: Response) => {
  if (isPostgresConnected) {
    try {
      const mappings = await postgresRepo.getTableMappings();
      if (mappings && Object.keys(mappings).length > 0) {
        return res.json(mappings);
      }
    } catch (err: any) {
      console.warn('[TableMappings] Error fetching from PostgreSQL:', err.message);
    }
  }



  return res.json(store.globalSchema.tableMappings || {});
});

// POST /api/transactions/table-mappings - Save or update table mapping for a database table
transactionSettingsRouter.post('/table-mappings', async (req: Request, res: Response) => {
  const { dbId, dbName, tableName, columns, isCustom } = req.body;

  if (!dbId || !tableName) {
    return res.status(400).json({ error: 'dbId and tableName are required' });
  }

  const mappingKey = `${dbId}:${tableName}`;
  const now = new Date().toISOString();

  const mappingObj: any = {
    dbId,
    dbName: dbName || dbId,
    tableName,
    columns: Array.isArray(columns) ? columns : [],
    updatedAt: now,
    isCustom: !!isCustom
  };

  if (!store.globalSchema.tableMappings) {
    store.globalSchema.tableMappings = {};
  }
  store.globalSchema.tableMappings[mappingKey] = mappingObj;

  // Primary: Persist to PostgreSQL
  if (isPostgresConnected) {
    try {
      await postgresRepo.saveTableMapping(dbId, tableName, mappingObj);
    } catch (err: any) {
      console.warn('[TableMappings] Error saving table mapping to PostgreSQL:', err.message);
    }
  }



  const standardFields = store.globalSchema.standardFields || store.globalStandardDirectory || [];
  const requiredKeys = standardFields.filter((f: any) => f.required).map((f: any) => f.key);
  const mappedKeys = new Set(
    (mappingObj.columns || [])
      .filter((c: any) => c.globalKey && c.physicalColumn && c.physicalColumn.trim() !== '' && c.globalKey !== 'unmapped')
      .map((c: any) => c.globalKey)
  );
  const missingRequired = requiredKeys.filter((k: string) => !mappedKeys.has(k));
  const isComplete = missingRequired.length === 0;

  const validation = {
    status: mappedKeys.size === 0 ? 'UNMAPPED' : isComplete ? 'COMPLETE' : 'INCOMPLETE',
    isMapped: isComplete,
    missingRequiredColumns: missingRequired,
    missingRequiredKeys: missingRequired,
    mappedColumnsCount: mappedKeys.size,
    requiredColumnsCount: requiredKeys.length
  };

  return res.json({
    message: `Table mapping saved for ${dbName || dbId}.${tableName}`,
    mapping: mappingObj,
    validation
  });
});

// GET /api/transactions/table-mappings/validate/:dbId/:tableName - Validate table mapping completion
transactionSettingsRouter.get('/table-mappings/validate/:dbId/:tableName', async (req: Request, res: Response) => {
  const { dbId, tableName } = req.params;
  const mappings = store.globalSchema.tableMappings || {};
  const mappingKey = `${dbId}:${tableName}`;
  const mapping = mappings[mappingKey];

  const standardFields = store.globalSchema.standardFields || store.globalStandardDirectory || [];
  const requiredKeys = standardFields.filter((f: any) => f.required).map((f: any) => f.key);

  if (!mapping || !Array.isArray(mapping.columns) || mapping.columns.length === 0) {
    return res.json({
      dbId,
      tableName,
      isMapped: false,
      missingRequiredColumns: requiredKeys,
      missingRequiredKeys: requiredKeys,
      mappedColumnsCount: 0,
      requiredColumnsCount: requiredKeys.length,
      status: 'UNMAPPED'
    });
  }

  const mappedKeys = new Set(
    mapping.columns
      .filter((c: any) => c.globalKey && c.physicalColumn && c.physicalColumn.trim() !== '' && c.globalKey !== 'unmapped')
      .map((c: any) => c.globalKey)
  );

  const missingRequired = requiredKeys.filter((k: string) => !mappedKeys.has(k));
  const isComplete = missingRequired.length === 0;

  return res.json({
    dbId,
    tableName,
    isMapped: isComplete,
    missingRequiredColumns: missingRequired,
    missingRequiredKeys: missingRequired,
    mappedColumnsCount: mappedKeys.size,
    requiredColumnsCount: requiredKeys.length,
    status: isComplete ? 'COMPLETE' : 'INCOMPLETE'
  });
});


// POST /api/transactions/settings/templates - Create or Update a Transaction Mapping Template
transactionSettingsRouter.post('/settings/templates', async (req: Request, res: Response) => {
  const { id, name, description, sourceType, isDefault, sampleHeaders, mappings, authorName, globalKeyFieldSchemaId } = req.body;

  if (!name || !mappings || !Array.isArray(mappings)) {
    return res.status(400).json({ error: 'Template name and mappings array are required' });
  }

  // Handle setting default flag
  if (isDefault) {
    store.transactionTemplates.forEach(t => t.isDefault = false);

  }

  let template: TransactionTemplate;
  const existingIndex = id ? store.transactionTemplates.findIndex(t => t.id === id) : -1;

  if (existingIndex >= 0) {
    template = {
      ...store.transactionTemplates[existingIndex],
      name,
      description: description || '',
      sourceType: sourceType || 'csv',
      isDefault: !!isDefault,
      sampleHeaders: sampleHeaders || [],
      mappings: mappings as ColumnMappingRule[],
      globalKeyFieldSchemaId: globalKeyFieldSchemaId || store.transactionTemplates[existingIndex].globalKeyFieldSchemaId || 'gkf-1',
      updatedAt: new Date().toISOString()
    };
    store.transactionTemplates[existingIndex] = template;
  } else {
    template = {
      id: id || `tpl-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name,
      description: description || '',
      sourceType: sourceType || 'csv',
      isDefault: !!isDefault,
      sampleHeaders: sampleHeaders || [],
      mappings: mappings as ColumnMappingRule[],
      globalKeyFieldSchemaId: globalKeyFieldSchemaId || 'gkf-1',
      authorName: authorName || 'admin',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    store.transactionTemplates.push(template);
  }

  if (template.isDefault) {
    store.globalSchema.defaultTemplateId = template.id;
  }



  return res.status(201).json({
    message: 'Mapping template saved successfully',
    template
  });
});

// DELETE /api/transactions/settings/templates/:id - Delete a Transaction Mapping Template
transactionSettingsRouter.delete('/settings/templates/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const index = store.transactionTemplates.findIndex(t => t.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Mapping template not found' });
  }

  const [deleted] = store.transactionTemplates.splice(index, 1);



  return res.json({ message: 'Mapping template deleted', id: deleted.id });
});

// POST /api/transactions/upload - Process & save batch uploaded transaction file to Working Database
transactionSettingsRouter.post('/upload', async (req: Request, res: Response) => {
  const { filename, uploadedBy, templateId, templateName, records, fileSizeBytes } = req.body;

  if (!records || !Array.isArray(records) || records.length === 0) {
    return res.status(400).json({ error: 'At least one transaction record is required for upload' });
  }

  const batchId = `BATCH-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  const nowIso = new Date().toISOString();
  const savedRecords: any[] = [];

  records.forEach((rec: any, idx: number) => {
    const raw = rec.rawRecord || rec;
    const mapped = rec.mappedData || {
      transaction_id: raw.transaction_id || raw.Txn_ID || raw.charge_id || raw.Ref_Number || `TXN-${Date.now()}-${idx + 1}`,
      card_number: raw.card_number || raw.Card_Number || raw.card_fingerprint || raw.PAN_Masked || '4111********9999',
      amount_usd: parseFloat(String(raw.amount_usd || raw.Amount_USD || raw.charge_amount || raw.Txn_Val_USD || '0').replace(/[^0-9.]/g, '')) || 0,
      currency: raw.currency || 'USD',
      customer_email: raw.customer_email || raw.Customer_Email || raw.buyer_email || raw.Cardholder_Mail || 'customer@paymentops.com',
      merchant_id: raw.merchant_id || raw.Merchant_ID || raw.merchant_account || raw.Term_ID || 'MERCH-MAIN',
      auth_time: raw.auth_time || raw.Auth_Time || raw.created_date || raw.Iso_Timestamp || nowIso,
      status: (raw.status || raw.Status || raw.dispute_status || raw.Txn_State || 'AUTHORIZED').toUpperCase(),
      response_code: raw.response_code || raw.Response_Code || raw.Iso_Resp || '00',
      category: raw.category || raw.Category || raw.reason_code || 'GENERAL_IMPORT'
    };

    const newWdbRecord = {
      id: `WDB-TXN-${Date.now()}-${idx + 1}`,
      batchId,
      sourceFilename: filename || 'uploaded_batch.csv',
      uploadedBy: uploadedBy || 'anonymous_user',
      uploadedAt: nowIso,
      templateId,
      templateName: templateName || 'Custom Column Mapping',
      mappedData: mapped,
      rawRecord: raw,
      isReconciled: false
    };

    store.uploadedTransactions.unshift(newWdbRecord);
    savedRecords.push(newWdbRecord);
  });

  // Create Audit Log Entry
  const auditLog = {
    id: `AUD-LOG-${Date.now()}`,
    batchId,
    sourceFilename: filename || 'uploaded_batch.csv',
    totalRecords: records.length,
    successCount: records.length,
    errorCount: 0,
    uploadedBy: uploadedBy || 'anonymous_user',
    uploadedAt: nowIso,
    templateId,
    templateName: templateName || 'Custom Column Mapping',
    fileSizeBytes: fileSizeBytes || records.length * 120
  };

  store.uploadAuditLogs.unshift(auditLog);



  return res.status(201).json({
    message: `Successfully uploaded ${records.length} transactions into working database`,
    batchId,
    auditLog,
    savedCount: savedRecords.length,
    savedRecords
  });
});

// GET /api/transactions/working-db - List all uploaded transactions stored in Working Database
transactionSettingsRouter.get('/working-db', async (req: Request, res: Response) => {
  const { batchId, search, status, limit } = req.query;



  let results = [...store.uploadedTransactions];

  if (batchId) {
    results = results.filter(r => r.batchId === String(batchId));
  }

  if (status) {
    results = results.filter(r => r.mappedData.status.toUpperCase() === String(status).toUpperCase());
  }

  if (search) {
    const q = String(search).toLowerCase();
    results = results.filter(r =>
      r.mappedData.transaction_id.toLowerCase().includes(q) ||
      r.mappedData.card_number.toLowerCase().includes(q) ||
      r.mappedData.customer_email.toLowerCase().includes(q) ||
      r.sourceFilename.toLowerCase().includes(q) ||
      r.batchId.toLowerCase().includes(q)
    );
  }

  const pageLimit = limit ? parseInt(String(limit), 10) : 200;
  const sliced = results.slice(0, pageLimit);

  return res.json({
    totalCount: results.length,
    returnedCount: sliced.length,
    transactions: sliced
  });
});

// GET /api/transactions/audit-logs - List upload audit track records
transactionSettingsRouter.get('/audit-logs', async (_req: Request, res: Response) => {

  return res.json(store.uploadAuditLogs);
});

// DELETE /api/transactions/working-db/clear - Clear working database transactions
transactionSettingsRouter.delete('/working-db/clear', async (req: Request, res: Response) => {
  const { batchId } = req.query;
  if (batchId) {
    const bId = String(batchId);
    store.uploadedTransactions = store.uploadedTransactions.filter(r => r.batchId !== bId);
    store.uploadAuditLogs = store.uploadAuditLogs.filter(a => a.batchId !== bId);



    return res.json({ message: `Batch ${bId} cleared from working database` });
  }

  const previousCount = store.uploadedTransactions.length;
  store.uploadedTransactions = [];
  store.uploadAuditLogs = [];



  return res.json({ message: `Cleared all ${previousCount} transactions from working database` });
});

// GET /api/transactions/workspace-table - List workspace table records
transactionSettingsRouter.get('/workspace-table', async (_req: Request, res: Response) => {

  return res.json(store.workspaceTableRecords);
});

// POST /api/transactions/workspace-table - Save new workspace table records (centralized collection of uploaded data)
transactionSettingsRouter.post('/workspace-table', async (req: Request, res: Response) => {
  const { records } = req.body;
  if (!records || !Array.isArray(records)) {
    return res.status(400).json({ error: 'records array is required' });
  }

  const newRecords: any[] = [];
  records.forEach((rec: any, idx: number) => {
    const transformed = rec.transformed_data || rec.transformedData || rec.mappedData || {};
    const raw = rec.raw_data || rec.rawData || rec.rawRecord || {};
    const rowValues = Array.isArray(rec.list_of_values_from_one_row) 
      ? rec.list_of_values_from_one_row 
      : (Array.isArray(rec.rowValues) ? rec.rowValues : Object.values(transformed).map(v => String(v !== undefined && v !== null ? v : '')));

    const item = {
      id: rec.id || `wtr-${Date.now()}-${idx + 1}-${Math.random().toString(36).substring(2, 6)}`,
      file_name: rec.file_name || rec.fileName || 'uploaded_file.csv',
      user: rec.user || rec.userName || rec.uploadedBy || rec.user_id || 'anonymous_user',
      user_id: rec.user_id || rec.userId || 'usr-1',
      tag: rec.tag || rec.linked_tag || rec.linkedHashtag || 'Untagged',
      task_id: rec.task_id || rec.taskId || rec.issueId || 'TASK-GEN',
      mapping_id: rec.mapping_id || rec.mappingId || 'global-standard',
      mapping_name: rec.mapping_name || rec.mappingName || 'Global Standard Mapping',
      list_of_values_from_one_row: rowValues,
      transformed_data: transformed,
      raw_data: raw,
      createdAt: rec.createdAt || new Date().toISOString()
    };
    store.workspaceTableRecords.unshift(item);
    newRecords.push(item);
  });



  return res.status(201).json({
    message: `Saved ${newRecords.length} workspace table records`,
    records: newRecords
  });
});

// DELETE /api/transactions/workspace-table/clear - Clear all workspace table records
transactionSettingsRouter.delete('/workspace-table/clear', async (_req: Request, res: Response) => {
  const count = store.workspaceTableRecords.length;
  store.workspaceTableRecords = [];



  return res.json({ message: `Cleared all ${count} records from workspace table` });
});

// DELETE /api/transactions/workspace-table/:id - Delete a workspace table record
transactionSettingsRouter.delete('/workspace-table/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  store.workspaceTableRecords = store.workspaceTableRecords.filter(r => r.id !== id);



  return res.json({ message: `Record ${id} deleted` });
});

// =========================================================
// GLOBAL STANDARD DIRECTORY DATABASE TABLE & MODEL ENDPOINTS
// =========================================================

// POST /api/transactions/directory/discover-from-databases - Discover columns from connected databases
transactionSettingsRouter.post('/directory/discover-from-databases', async (req: Request, res: Response) => {
  try {
    const result = await GlobalSchemaDiscoveryService.discoverFromAllDatabases(req.body?.userId || 'system');
    return res.json({
      message: `Successfully discovered and registered ${result.discoveredCount} database columns into Global Schema`,
      ...result
    });
  } catch (err: any) {
    console.error('[Directory] Error discovering fields from databases:', err);
    return res.status(500).json({ error: `Failed to discover database fields: ${err.message}` });
  }
});

// POST /api/transactions/directory/import-from-table - Import columns from specific table
transactionSettingsRouter.post('/directory/import-from-table', async (req: Request, res: Response) => {
  const { dbId, tableName, userId } = req.body;
  if (!dbId || !tableName) {
    return res.status(400).json({ error: 'dbId and tableName are required' });
  }
  try {
    const result = await GlobalSchemaDiscoveryService.importFromTable(dbId, tableName, userId || 'system');
    return res.json({
      message: `Successfully imported ${result.importedCount} columns from table '${tableName}' into Global Schema`,
      ...result
    });
  } catch (err: any) {
    console.error('[Directory] Error importing fields from table:', err);
    return res.status(500).json({ error: `Failed to import table columns: ${err.message}` });
  }
});

// POST /api/transactions/directory/batch-import - Batch import array of directory fields (e.g. from JSON)
transactionSettingsRouter.post('/directory/batch-import', async (req: Request, res: Response) => {
  const { fields, autoClassify } = req.body;
  if (!fields || !Array.isArray(fields) || fields.length === 0) {
    return res.status(400).json({ error: 'fields array is required and must not be empty' });
  }

  try {
    const result = await GlobalSchemaDiscoveryService.batchImportFields(fields, autoClassify !== false, req.body.userId || 'system');
    return res.status(201).json({
      success: true,
      message: `Successfully imported and saved ${result.importedCount} fields to database Global Schema`,
      ...result
    });
  } catch (err: any) {
    console.error('[Directory] Error batch importing fields:', err);
    return res.status(500).json({ error: `Failed to batch import fields: ${err.message}` });
  }
});

// POST /api/transactions/directory/auto-classify - Automatically classify all existing directory fields
transactionSettingsRouter.post('/directory/auto-classify', async (_req: Request, res: Response) => {
  try {
    const result = await GlobalSchemaDiscoveryService.autoClassifyAllFields();
    return res.json({
      success: true,
      message: `Successfully classified ${result.classifiedCount} directory fields`,
      ...result
    });
  } catch (err: any) {
    console.error('[Directory] Error auto-classifying fields:', err);
    return res.status(500).json({ error: `Failed to auto-classify fields: ${err.message}` });
  }
});

// GET /api/transactions/directory/audit-logs - Schema migration version control and rollback audit log
transactionSettingsRouter.get('/directory/audit-logs', async (_req: Request, res: Response) => {
  try {
    const { schemaMigrationService } = await import('../services/schemaMigrationService.js');
    const logs = await schemaMigrationService.getAuditLogs();
    return res.json(logs);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/transactions/directory - Fetch all Global Standard Directory records
transactionSettingsRouter.get('/directory', async (_req: Request, res: Response) => {
  if (isPostgresConnected) {
    try {
      const records = await postgresRepo.getGlobalStandardDirectory();
      store.globalStandardDirectory = records;
      return res.json(records);
    } catch (e: any) {
      console.warn('[Directory] Error querying PostgreSQL directory:', e.message);
    }
  }



  return res.json(store.globalStandardDirectory || []);
});

// POST /api/transactions/directory - Create a new Global Standard Directory column/record
transactionSettingsRouter.post('/directory', async (req: Request, res: Response) => {
  const { 
    key, 
    label, 
    description, 
    dataType, 
    required, 
    isStandard, 
    exampleValue, 
    category, 
    notes, 
    user_id 
  } = req.body;

  if (!key || !label) {
    return res.status(400).json({ error: 'Field key and label are required' });
  }

  const now = new Date().toISOString();
  const cleanKey = key.trim().toLowerCase().replace(/[\s-]+/g, '_');
  const cleanLabel = label.trim();
  const dType = dataType || 'string';
  const newId = req.body.id || `gsd-${cleanKey}`;

  // Robust required handling: accept required, is_required, or isRequired
  const isReq = required !== undefined 
    ? !!required 
    : (req.body.is_required !== undefined 
        ? !!req.body.is_required 
        : (req.body.isRequired !== undefined ? !!req.body.isRequired : false));

  // Automatic classification if category is missing or 'General'
  const resolvedCategory = (category && category.trim() && category !== 'General') 
    ? category.trim() 
    : classifyColumn(cleanKey, cleanLabel, dType);
  
  const record: GlobalStandardDirectoryRecord = {
    id: newId,
    key: cleanKey,
    label: cleanLabel,
    description: description || '',
    dataType: dType,
    required: isReq,
    isStandard: isStandard !== undefined ? !!isStandard : false,
    exampleValue: exampleValue !== undefined ? exampleValue : '',
    category: resolvedCategory,
    notes: notes || '',
    user_id: user_id || 'usr-1',
    created_at: now,
    updated_at: now
  };

  store.globalStandardDirectory = [record, ...store.globalStandardDirectory.filter(r => r.id !== record.id && r.key !== record.key)];

  let savedRecord = record;
  if (isPostgresConnected) {
    try {
      const { schemaMigrationService } = await import('../services/schemaMigrationService.js');
      savedRecord = await schemaMigrationService.addDirectoryField(record);
    } catch (e: any) {
      console.warn('[Directory] Transactional schema migration failed:', e.message);
      return res.status(400).json({ 
        error: `Schema migration failed and was rolled back: ${e.message}`,
        details: e.message
      });
    }
  }



  return res.status(201).json({
    message: 'Global Standard Directory record created successfully',
    record: savedRecord
  });
});

// PUT /api/transactions/directory/:id - Update an existing Global Standard Directory column/record
transactionSettingsRouter.put('/directory/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { 
    key, 
    label, 
    description, 
    dataType, 
    required, 
    isStandard, 
    exampleValue, 
    category, 
    notes, 
    user_id 
  } = req.body;

  const targetKey = (key || id || '').trim().toLowerCase().replace(/[\s-]+/g, '_');

  let existing: GlobalStandardDirectoryRecord | null = null;
  if (isPostgresConnected) {
    try {
      existing = await postgresRepo.getGlobalStandardDirectoryField(id);
      if (!existing && targetKey) {
        existing = await postgresRepo.getGlobalStandardDirectoryField(targetKey);
      }
    } catch (e: any) {
      console.warn('[Directory] Could not find field in PostgreSQL:', e.message);
    }
  }
  if (!existing) {
    existing = store.globalStandardDirectory.find(r => r.id === id || r.key === id || (targetKey && r.key === targetKey)) || null;
  }

  const now = new Date().toISOString();
  const cleanKey = key 
    ? key.trim().toLowerCase().replace(/[\s-]+/g, '_') 
    : (existing ? existing.key : targetKey.replace(/^gsd-/, ''));
  const cleanLabel = label ? label.trim() : (existing ? existing.label : formatColumnLabel(cleanKey));
  const dType = dataType || existing?.dataType || 'string';

  // Robust required handling
  const isReq = required !== undefined 
    ? !!required 
    : (req.body.is_required !== undefined 
        ? !!req.body.is_required 
        : (req.body.isRequired !== undefined ? !!req.body.isRequired : (existing ? existing.required : false)));

  const resolvedCategory = (category && category.trim() && category !== 'General') 
    ? category.trim() 
    : (existing?.category && existing.category !== 'General' ? existing.category : classifyColumn(cleanKey, cleanLabel, dType));

  const updatedRecord: GlobalStandardDirectoryRecord = {
    id: existing ? existing.id : (id.startsWith('gsd-') ? id : `gsd-${cleanKey}`),
    key: cleanKey,
    label: cleanLabel,
    description: description !== undefined ? description : (existing ? existing.description : ''),
    dataType: dType as any,
    required: isReq,
    isStandard: isStandard !== undefined ? !!isStandard : (existing ? existing.isStandard : false),
    exampleValue: exampleValue !== undefined ? String(exampleValue) : (existing ? existing.exampleValue : ''),
    category: resolvedCategory,
    notes: notes !== undefined ? notes : (existing ? existing.notes : 'Imported via Schema'),
    user_id: user_id || existing?.user_id || 'system',
    created_at: existing?.created_at || now,
    updated_at: now
  };

  const memIdx = store.globalStandardDirectory.findIndex(r => r.id === id || r.key === id || r.key === cleanKey);
  if (memIdx !== -1) {
    store.globalStandardDirectory[memIdx] = updatedRecord;
  } else {
    store.globalStandardDirectory.push(updatedRecord);
  }

  let savedRecord = updatedRecord;
  if (isPostgresConnected) {
    try {
      const { schemaMigrationService } = await import('../services/schemaMigrationService.js');
      savedRecord = await schemaMigrationService.updateDirectoryField(id, updatedRecord);
    } catch (e: any) {
      console.warn('[Directory] Transactional update schema migration failed:', e.message);
      return res.status(400).json({ 
        error: `Schema update failed and was rolled back: ${e.message}`,
        details: e.message
      });
    }
  }



  return res.json({
    message: 'Global Standard Directory record updated successfully',
    record: savedRecord
  });
});

// DELETE /api/transactions/directory/:id - Delete a Global Standard Directory column/record
transactionSettingsRouter.delete('/directory/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  store.globalStandardDirectory = store.globalStandardDirectory.filter(r => r.id !== id && r.key !== id);
  if (store.globalSchema && Array.isArray(store.globalSchema.standardFields)) {
    store.globalSchema.standardFields = store.globalSchema.standardFields.filter((r: any) => r.id !== id && r.key !== id);
  }

  if (isPostgresConnected) {
    try {
      const { schemaMigrationService } = await import('../services/schemaMigrationService.js');
      await schemaMigrationService.deleteDirectoryField(id);
    } catch (e: any) {
      console.warn('[Directory] Could not delete from PostgreSQL directory:', e.message);
      return res.status(500).json({ error: `Failed to delete field from database: ${e.message}` });
    }
  }



  return res.json({
    message: `Directory record '${id}' deleted successfully`,
    deletedId: id
  });
});

// DELETE /api/transactions/directory - Delete ALL Global Standard Directory records / Clear Entire Schema
transactionSettingsRouter.delete('/directory', async (_req: Request, res: Response) => {
  store.globalStandardDirectory = [];
  if (store.globalSchema) {
    store.globalSchema.standardFields = [];
  }

  if (isPostgresConnected) {
    try {
      await postgresRepo.clearAllGlobalStandardDirectoryFields();
    } catch (e: any) {
      console.warn('[Directory] Could not clear PostgreSQL directory:', e.message);
      return res.status(500).json({ error: `Failed to clear directory from database: ${e.message}` });
    }
  }



  return res.json({
    message: 'All Global Standard Directory records have been deleted successfully',
    clearedCount: 0
  });
});



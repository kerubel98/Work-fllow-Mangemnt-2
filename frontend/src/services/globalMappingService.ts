/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { 
  GlobalTransactionSchemaField, 
  DbTableMappingConfig, 
  GlobalMappingConfig,
  DatabaseConnection,
  EnvironmentSystem,
  GlobalMappingSchemaModel,
  SchemaModelFieldDef,
  CentralUploadedTransactionRepositoryTable,
  CentralRepositoryDdlLog
} from '../types';
import { api } from '../api/client';

export interface DateFormatAnalysis {
  detectedFormat: string;
  sampleOriginal: string;
  sampleNormalized: string;
  isValidDate: boolean;
  confidence: number;
  formatGuide: string;
}

export interface DataTypeAnalysisResult {
  colKey: string;
  expectedType: string;
  detectedType: 'string' | 'number' | 'date' | 'boolean';
  isValid: boolean;
  sampleCount: number;
  invalidCount: number;
  warning?: string;
  dateAnalysis?: DateFormatAnalysis;
}

export interface RequiredColumnValidationResult {
  isValid: boolean;
  missingRequiredKeys: string[];
  missingRequiredLabels: string[];
  mappedRequiredCount: number;
  totalRequiredCount: number;
}

export const DEFAULT_GLOBAL_STANDARD_FIELDS: GlobalTransactionSchemaField[] = [];

export const DEFAULT_DATABASE_TABLE_MAPPINGS: Record<string, DbTableMappingConfig> = {};

const STORAGE_KEY = 'global_mapping_schema_config_v2';
const CENTRAL_TABLE_STORAGE_KEY = 'central_uploaded_transactions_repo_v2';

export class GlobalMappingService {
  private static instance: GlobalMappingService;
  private config: GlobalMappingConfig;
  private centralTable: CentralUploadedTransactionRepositoryTable | null = null;

  private constructor() {
    this.config = this.loadConfig();
    this.centralTable = this.loadCentralTable();
  }

  public static getInstance(): GlobalMappingService {
    if (!GlobalMappingService.instance) {
      GlobalMappingService.instance = new GlobalMappingService();
    }
    return GlobalMappingService.instance;
  }

  private loadConfig(): GlobalMappingConfig {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.standardFields && parsed.tableMappings) {
          // Clean up legacy mock mappings that referenced fake db IDs (db-1..db-5, sys-1..sys-3)
          const cleanedMappings: Record<string, DbTableMappingConfig> = {};
          const mockDbIds = ['db-1', 'db-2', 'db-3', 'db-4', 'db-5', 'sys-1', 'sys-2', 'sys-3'];
          let hadLegacy = false;

          Object.keys(parsed.tableMappings).forEach(key => {
            const dbId = parsed.tableMappings[key].dbId;
            if (!mockDbIds.includes(dbId)) {
              cleanedMappings[key] = parsed.tableMappings[key];
            } else {
              hadLegacy = true;
            }
          });

          if (hadLegacy) {
            parsed.tableMappings = cleanedMappings;
            try {
              localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
            } catch (err) {
              // ignore
            }
          }

          return parsed;
        }
      }
    } catch (e) {
      console.warn('Failed to load global mapping config from localStorage, using defaults:', e);
    }

    return {
      version: '2.2.0',
      updatedAt: new Date().toISOString(),
      updatedBy: 'system_default',
      standardFields: [],
      tableMappings: { ...DEFAULT_DATABASE_TABLE_MAPPINGS }
    };
  }

  public getConfig(): GlobalMappingConfig {
    return { ...this.config };
  }

  public saveConfig(newConfig: GlobalMappingConfig): void {
    this.config = {
      ...newConfig,
      updatedAt: new Date().toISOString()
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.config));
    } catch (e) {
      console.error('Failed to save global mapping config:', e);
    }
  }

  public resetToDefaults(username: string = 'admin'): GlobalMappingConfig {
    const freshConfig: GlobalMappingConfig = {
      version: '2.2.0',
      updatedAt: new Date().toISOString(),
      updatedBy: username,
      standardFields: [],
      tableMappings: { ...DEFAULT_DATABASE_TABLE_MAPPINGS }
    };
    this.saveConfig(freshConfig);
    // Also rebuild central table based on standard fields
    this.buildCentralRepositoryTable({ tableName: 'central_uploaded_transactions', username, populateExisting: true });
    return freshConfig;
  }

  public getStandardFields(): GlobalTransactionSchemaField[] {
    return this.config.standardFields || [];
  }

  /**
   * Helper: Map field to SQL data type string
   */
  public getSqlDataType(field: GlobalTransactionSchemaField, dialect: 'PostgreSQL' | 'Oracle' | 'MySQL' | 'Generic' = 'PostgreSQL'): string {
    const key = field.key.toLowerCase();
    const dType = field.dataType;

    if (dType === 'number') {
      if (key.includes('amt') || key.includes('amount') || key.includes('usd') || key.includes('price') || key.includes('charge')) {
        return dialect === 'Oracle' ? 'NUMBER(14,2)' : 'DECIMAL(14,2)';
      }
      return dialect === 'Oracle' ? 'NUMBER' : 'NUMERIC(14,2)';
    }

    if (dType === 'date') {
      if (dialect === 'Oracle') return 'TIMESTAMP WITH TIME ZONE';
      if (dialect === 'MySQL') return 'DATETIME(3)';
      return 'TIMESTAMPTZ';
    }

    if (dType === 'boolean') {
      if (dialect === 'Oracle') return 'NUMBER(1)';
      return 'BOOLEAN';
    }

    // String variants
    if (key === 'transaction_id') return 'VARCHAR(64)';
    if (key === 'card_number') return 'VARCHAR(32)';
    if (key.includes('email') || key.includes('mail')) return 'VARCHAR(128)';
    if (key.includes('code') || key.includes('curr') || key.includes('currency')) return 'VARCHAR(16)';
    if (key.includes('description') || key.includes('notes') || key.includes('reason')) return 'VARCHAR(512)';
    return 'VARCHAR(255)';
  }

  /**
   * Generates the Formal Model Representation of the Global Mapping Schema
   */
  public getSchemaModel(tableName: string = 'central_uploaded_transactions'): GlobalMappingSchemaModel {
    const fields = this.getStandardFields();
    const modelFields: SchemaModelFieldDef[] = fields.map(f => {
      const isPk = f.key === 'transaction_id';
      const sqlDataType = this.getSqlDataType(f);
      let dVal: string | undefined = undefined;
      if (f.dataType === 'number') dVal = '0.00';
      if (f.dataType === 'boolean') dVal = 'FALSE';
      if (f.dataType === 'date') dVal = 'CURRENT_TIMESTAMP';

      return {
        key: f.key,
        label: f.label,
        description: f.description || '',
        dataType: f.dataType,
        sqlDataType,
        isPrimaryKey: isPk,
        isNullable: !isPk && !f.required,
        isIndexed: isPk || f.key === 'created_at' || f.key === 'status_state' || f.key === 'user_email' || f.key === 'merchant_id',
        defaultValue: dVal,
        required: f.required,
        isStandard: f.isStandard,
        exampleValue: f.exampleValue ? String(f.exampleValue) : undefined,
        category: f.category || 'General',
        notes: f.notes,
        user_id: f.user_id,
        created_at: f.created_at,
        updated_at: f.updated_at
      };
    });

    const ddl = this.generateSqlDdl(tableName, 'PostgreSQL');
    const tsCode = this.generateTypeScriptModel();
    const jsonSchema = this.generateJsonSchema(tableName);
    const ormCode = this.generateOrmModel(tableName);

    return {
      modelId: `model-global-mapping-schema-v${this.config.version}`,
      modelName: 'CentralUploadedTransactionRepositoryModel',
      targetRepositoryTableName: tableName,
      version: this.config.version,
      description: 'Canonical enterprise schema model and data contract used to construct the central uploaded transaction repository table and map heterogeneous database feeds.',
      fields: modelFields,
      primaryKey: 'transaction_id',
      indexes: [
        { name: `idx_${tableName}_created_at`, columns: ['created_at'] },
        { name: `idx_${tableName}_status_state`, columns: ['status_state'] },
        { name: `idx_${tableName}_user_email`, columns: ['user_email'] },
        { name: `idx_${tableName}_merchant_id`, columns: ['merchant_id'] }
      ],
      sqlDdlDefinition: ddl,
      typeScriptDefinition: tsCode,
      jsonSchemaDefinition: jsonSchema,
      ormModelDefinition: ormCode,
      lastCompiledAt: this.config.updatedAt,
      compiledBy: this.config.updatedBy
    };
  }

  /**
   * Generates production-ready SQL DDL statements for creating the Central Repository Table
   */
  public generateSqlDdl(
    tableName: string = 'central_uploaded_transactions', 
    dialect: 'PostgreSQL' | 'Oracle' | 'MySQL' | 'Generic' = 'PostgreSQL'
  ): string {
    const fields = this.getStandardFields();
    const lines: string[] = [];

    fields.forEach((f) => {
      const sqlColName = f.key;
      const sqlType = this.getSqlDataType(f, dialect);
      const isPk = f.key === 'transaction_id';
      let line = `  ${sqlColName.padEnd(20)} ${sqlType}`;

      if (isPk) {
        line += ' PRIMARY KEY NOT NULL';
      } else if (f.required) {
        line += ' NOT NULL';
      }

      if (f.dataType === 'number') {
        line += ' DEFAULT 0.00';
      } else if (f.dataType === 'boolean') {
        line += ' DEFAULT FALSE';
      } else if (f.dataType === 'date' && dialect === 'PostgreSQL') {
        line += ' DEFAULT CURRENT_TIMESTAMP';
      }

      lines.push(line);
    });

    const createTableStmt = `-- ==========================================================================\n-- CENTRAL UPLOADED TRANSACTION REPOSITORY TABLE\n-- Generated from Global Mapping Schema Model v${this.config.version}\n-- ==========================================================================\n\nCREATE TABLE IF NOT EXISTS ${tableName} (\n${lines.join(',\n')}\n);`;

    const indexStmts = [
      `CREATE INDEX IF NOT EXISTS idx_${tableName}_created ON ${tableName} (created_at);`,
      `CREATE INDEX IF NOT EXISTS idx_${tableName}_status ON ${tableName} (status_state);`,
      `CREATE INDEX IF NOT EXISTS idx_${tableName}_email ON ${tableName} (user_email);`,
      `CREATE INDEX IF NOT EXISTS idx_${tableName}_merchant ON ${tableName} (merchant_id);`
    ].join('\n');

    const commentStmt = `-- Add Schema Model metadata comment\nCOMMENT ON TABLE ${tableName} IS 'Central Uploaded Transaction Repository constructed automatically from Global Mapping Schema Model v${this.config.version}';`;

    return `${createTableStmt}\n\n${indexStmts}\n\n${commentStmt}`;
  }

  /**
   * Generates TypeScript Model Interface definition
   */
  public generateTypeScriptModel(interfaceName: string = 'CentralUploadedTransactionEntity'): string {
    const fields = this.getStandardFields();
    const lines: string[] = [];

    fields.forEach(f => {
      let tsType = 'string';
      if (f.dataType === 'number') tsType = 'number';
      if (f.dataType === 'boolean') tsType = 'boolean';
      if (f.dataType === 'date') tsType = 'string /* ISO 8601 Date String */';

      const optional = f.required ? '' : '?';
      const comment = f.description ? `  /** ${f.description} (${f.category || 'General'}) */\n` : '';
      lines.push(`${comment}  ${f.key}${optional}: ${tsType};`);
    });

    return `/**\n * Global Mapping Schema Entity Model (v${this.config.version})\n * Canonical data contract for Central Uploaded Transaction Repository\n */\nexport interface ${interfaceName} {\n${lines.join('\n')}\n  [key: string]: any;\n}`;
  }

  /**
   * Generates JSON Schema Draft-07 representation
   */
  public generateJsonSchema(tableName: string = 'central_uploaded_transactions'): Record<string, any> {
    const fields = this.getStandardFields();
    const properties: Record<string, any> = {};
    const requiredKeys: string[] = [];

    fields.forEach(f => {
      let jsonType: string = 'string';
      if (f.dataType === 'number') jsonType = 'number';
      if (f.dataType === 'boolean') jsonType = 'boolean';
      if (f.dataType === 'date') jsonType = 'string';

      properties[f.key] = {
        type: jsonType,
        title: f.label,
        description: f.description,
        ...(f.dataType === 'date' ? { format: 'date-time' } : {}),
        ...(f.exampleValue ? { examples: [f.exampleValue] } : {})
      };

      if (f.required || f.key === 'transaction_id') {
        requiredKeys.push(f.key);
      }
    });

    return {
      $schema: 'http://json-schema.org/draft-07/schema#',
      $id: `https://schemarepo.local/schemas/${tableName}.json`,
      title: 'CentralUploadedTransactionRepositorySchema',
      description: `Schema contract for ${tableName} derived from Global Mapping Schema v${this.config.version}`,
      type: 'object',
      properties,
      required: requiredKeys,
      additionalProperties: true
    };
  }

  /**
   * Generates Drizzle / ORM Model code representation
   */
  public generateOrmModel(tableName: string = 'central_uploaded_transactions'): string {
    const fields = this.getStandardFields();
    const colLines: string[] = [];

    fields.forEach(f => {
      if (f.key === 'transaction_id') {
        colLines.push(`  transactionId: varchar('transaction_id', { length: 64 }).primaryKey().notNull(),`);
      } else if (f.dataType === 'number') {
        colLines.push(`  ${this.toCamelCase(f.key)}: decimal('${f.key}', { precision: 14, scale: 2 }).default('0.00'),`);
      } else if (f.dataType === 'date') {
        colLines.push(`  ${this.toCamelCase(f.key)}: timestamp('${f.key}', { withTimezone: true }).defaultNow(),`);
      } else if (f.dataType === 'boolean') {
        colLines.push(`  ${this.toCamelCase(f.key)}: boolean('${f.key}').default(false),`);
      } else {
        colLines.push(`  ${this.toCamelCase(f.key)}: varchar('${f.key}', { length: 255 }),`);
      }
    });

    return `import { pgTable, varchar, decimal, timestamp, boolean, index } from 'drizzle-orm/pg-core';\n\nexport const centralUploadedTransactions = pgTable('${tableName}', {\n${colLines.join('\n')}\n}, (table) => ({\n  createdIdx: index('idx_${tableName}_created').on(table.createdAt),\n  statusIdx: index('idx_${tableName}_status').on(table.statusState),\n}));`;
  }

  private toCamelCase(str: string): string {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  /**
   * Loads or initializes the Central Uploaded Transaction Repository Table
   */
  private loadCentralTable(): CentralUploadedTransactionRepositoryTable {
    try {
      const saved = localStorage.getItem(CENTRAL_TABLE_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.tableName && parsed.columns) {
          // Sanitize any stale synthetic mock records from legacy cache
          if (Array.isArray(parsed.records)) {
            const hasMock = parsed.records.some((r: any) => 
              String(r.user_email).includes('cyberdyne') || 
              String(r.transaction_id).startsWith('TXN-902')
            );
            if (hasMock) {
              parsed.records = [];
              parsed.recordCount = 0;
              try {
                localStorage.setItem(CENTRAL_TABLE_STORAGE_KEY, JSON.stringify(parsed));
              } catch (e) {
                // ignore
              }
            }
          }
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Failed to load central repository table from storage:', e);
    }

    // Generate initial table using current schema model
    const model = this.getSchemaModel('central_uploaded_transactions');
    const initialRecords = this.harvestInitialUploadedRecords();

    const initialTable: CentralUploadedTransactionRepositoryTable = {
      tableName: 'central_uploaded_transactions',
      dbId: 'mongoatlas',
      dbName: 'Application Working Database (MongoDB Atlas / Operational DB)',
      schemaVersion: this.config.version,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      columns: model.fields,
      recordCount: initialRecords.length,
      records: initialRecords,
      status: 'active',
      lastDdlExecuted: model.sqlDdlDefinition,
      ddlHistory: [
        {
          id: `ddl-${Date.now()}-init`,
          action: 'CREATE_TABLE',
          ddlStatement: `CREATE TABLE central_uploaded_transactions (${model.fields.map(f => `${f.key} ${f.sqlDataType}`).join(', ')});`,
          timestamp: new Date().toISOString(),
          executedBy: 'system_auto_provision',
          status: 'SUCCESS',
          message: `Central Uploaded Transaction Repository Table initialized with ${model.fields.length} Global Standard columns.`
        }
      ]
    };

    try {
      localStorage.setItem(CENTRAL_TABLE_STORAGE_KEY, JSON.stringify(initialTable));
    } catch (e) {
      console.warn('Could not cache central table to localStorage:', e);
    }

    return initialTable;
  }

  /**
   * Collects any uploaded records from workspace or seed archives to populate the central table
   */
  private harvestInitialUploadedRecords(): Record<string, any>[] {
    try {
      const ws = localStorage.getItem('workspace_table_records');
      if (ws) {
        const parsedWs = JSON.parse(ws);
        if (Array.isArray(parsedWs) && parsedWs.length > 0) {
          return parsedWs.map((r: any) => {
            const raw = r.transformed_data || r.raw_data || {};
            return this.transformRowToGlobalSchema(raw);
          });
        }
      }
    } catch (e) {
      // Ignore
    }

    // Default: Return empty list if no workspace transactions uploaded yet
    return [];
  }

  public getCentralRepositoryTable(): CentralUploadedTransactionRepositoryTable {
    if (!this.centralTable) {
      this.centralTable = this.loadCentralTable();
    }
    return { ...this.centralTable };
  }

  public saveCentralRepositoryTable(table: CentralUploadedTransactionRepositoryTable): void {
    this.centralTable = {
      ...table,
      recordCount: table.records.length,
      updatedAt: new Date().toISOString()
    };
    try {
      localStorage.setItem(CENTRAL_TABLE_STORAGE_KEY, JSON.stringify(this.centralTable));
    } catch (e) {
      console.error('Failed to save central repository table to localStorage:', e);
    }
  }

  /**
   * TRIGGER 1: "Create Table" button clicked in Global Mapping Schema
   * Builds / Provisions or Rebuilds the Central Uploaded Transaction Repository Table
   */
  public buildCentralRepositoryTable(options?: { 
    tableName?: string; 
    dbId?: string; 
    username?: string; 
    populateExisting?: boolean;
    columnsOverride?: SchemaModelFieldDef[];
  }): CentralUploadedTransactionRepositoryTable {
    const tableName = options?.tableName || 'central_uploaded_transactions';
    const dbId = options?.dbId || 'app-internal-mongodb';
    const username = options?.username || 'admin';
    const model = this.getSchemaModel(tableName);
    const columns = options?.columnsOverride || model.fields;

    const existing = this.getCentralRepositoryTable();
    const existingRecords = options?.populateExisting !== false ? (existing.records || this.harvestInitialUploadedRecords()) : [];

    // Ensure all existing records have columns matching the new schema
    const standardizedRecords = existingRecords.map(rec => {
      const updatedRec: Record<string, any> = { ...rec };
      columns.forEach(col => {
        if (updatedRec[col.key] === undefined) {
          updatedRec[col.key] = col.defaultValue || '';
        }
      });
      return updatedRec;
    });

    const ddlExecuted = this.generateSqlDdl(tableName, 'PostgreSQL');
    const ddlLog: CentralRepositoryDdlLog = {
      id: `ddl-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      action: 'CREATE_TABLE',
      ddlStatement: ddlExecuted,
      timestamp: new Date().toISOString(),
      executedBy: username,
      status: 'SUCCESS',
      message: `Built Central Uploaded Transaction Repository table "${tableName}" in Application Working Database with ${columns.length} schema columns.`
    };

    const newTable: CentralUploadedTransactionRepositoryTable = {
      tableName,
      dbId,
      dbName: dbId === 'app-internal-mongodb' ? 'Application Working Database (MongoDB / Desktop Local Storage)' : (this.config.tableMappings[`${dbId}::${tableName}`]?.dbName || 'Database'),
      schemaVersion: this.config.version,
      createdAt: existing.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      columns,
      recordCount: standardizedRecords.length,
      records: standardizedRecords,
      status: 'active',
      lastDdlExecuted: ddlExecuted,
      ddlHistory: [ddlLog, ...(existing.ddlHistory || []).slice(0, 49)]
    };

    this.saveCentralRepositoryTable(newTable);

    // Register this central table mapping across all databases in tableMappings
    const tableMappingCols = columns.map(c => ({
      globalKey: c.key,
      physicalColumn: c.key,
      notes: `${c.sqlDataType} (Central Repository)`
    }));

    if (dbId) {
      this.saveTableMapping(dbId, tableName, newTable.dbName, tableMappingCols, username);
    }

    return newTable;
  }

  /**
   * TRIGGER 2: Every time a new Standard field is added (or altered),
   * dynamically update the Central Uploaded Transaction Repository Table using ALTER TABLE DDL
   */
  public alterCentralRepositoryTableOnNewField(field: GlobalTransactionSchemaField, username: string = 'admin'): void {
    const currentTable = this.getCentralRepositoryTable();
    const sqlDataType = this.getSqlDataType(field);
    const alterDdl = `ALTER TABLE ${currentTable.tableName} ADD COLUMN IF NOT EXISTS ${field.key} ${sqlDataType}${field.required ? ' NOT NULL DEFAULT \'0\'' : ''};`;

    const isExistingCol = currentTable.columns.some(c => c.key === field.key);
    let updatedColumns: SchemaModelFieldDef[];

    const newColDef: SchemaModelFieldDef = {
      key: field.key,
      label: field.label,
      description: field.description || '',
      dataType: field.dataType,
      sqlDataType,
      isPrimaryKey: field.key === 'transaction_id',
      isNullable: !field.required && field.key !== 'transaction_id',
      isIndexed: false,
      defaultValue: field.dataType === 'number' ? '0.00' : (field.dataType === 'boolean' ? 'FALSE' : ''),
      required: field.required,
      isStandard: field.isStandard,
      exampleValue: field.exampleValue ? String(field.exampleValue) : undefined,
      category: field.category || 'General',
      notes: field.notes,
      user_id: field.user_id,
      created_at: field.created_at,
      updated_at: new Date().toISOString()
    };

    if (isExistingCol) {
      updatedColumns = currentTable.columns.map(c => c.key === field.key ? newColDef : c);
    } else {
      updatedColumns = [...currentTable.columns, newColDef];
    }

    // Update existing records with the new column
    const updatedRecords = (currentTable.records || []).map(r => ({
      ...r,
      [field.key]: r[field.key] !== undefined ? r[field.key] : (newColDef.defaultValue || '')
    }));

    const ddlLog: CentralRepositoryDdlLog = {
      id: `ddl-alter-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      action: 'ALTER_TABLE_ADD_COLUMN',
      columnKey: field.key,
      ddlStatement: alterDdl,
      timestamp: new Date().toISOString(),
      executedBy: username,
      status: 'SUCCESS',
      message: `Executed schema migration: Added column "${field.key}" (${sqlDataType}) to Central Uploaded Transaction Repository Table.`
    };

    const updatedTable: CentralUploadedTransactionRepositoryTable = {
      ...currentTable,
      schemaVersion: this.config.version,
      updatedAt: new Date().toISOString(),
      columns: updatedColumns,
      records: updatedRecords,
      recordCount: updatedRecords.length,
      status: 'schema_updated',
      lastDdlExecuted: alterDdl,
      ddlHistory: [ddlLog, ...(currentTable.ddlHistory || []).slice(0, 49)]
    };

    this.saveCentralRepositoryTable(updatedTable);

    // Sync to all tableMappings so all connected DBs immediately recognize the new column
    Object.keys(this.config.tableMappings).forEach(mapKey => {
      const mapping = this.config.tableMappings[mapKey];
      if (mapping && !mapping.columns.some(c => c.globalKey === field.key)) {
        const updatedCols = [...mapping.columns, { globalKey: field.key, physicalColumn: field.key, notes: `${sqlDataType} (auto-synced)` }];
        this.saveTableMapping(mapping.dbId, mapping.tableName, mapping.dbName, updatedCols, username);
      }
    });
  }

  /**
   * Adds transactions to the Central Uploaded Repository Table
   */
  public addTransactionToCentralRepository(records: Record<string, any> | Record<string, any>[]): number {
    const recordsArray = Array.isArray(records) ? records : [records];
    if (recordsArray.length === 0) return 0;

    const currentTable = this.getCentralRepositoryTable();
    const standardizedNewRows = recordsArray.map(r => this.transformRowToGlobalSchema(r));

    const updatedRecords = [...standardizedNewRows, ...(currentTable.records || [])];
    const updatedTable: CentralUploadedTransactionRepositoryTable = {
      ...currentTable,
      records: updatedRecords,
      recordCount: updatedRecords.length,
      updatedAt: new Date().toISOString()
    };

    this.saveCentralRepositoryTable(updatedTable);
    return updatedRecords.length;
  }

  /**
   * Inserts a single test record directly into the Central Uploaded Transaction Repository Table
   */
  public insertCentralRepositoryRecord(record: Record<string, any>, username: string = 'admin'): Record<string, any> {
    const currentTable = this.getCentralRepositoryTable();
    const standardized = this.transformRowToGlobalSchema(record);
    
    // Ensure all table columns have a value or fallback
    currentTable.columns.forEach(col => {
      if (standardized[col.key] === undefined) {
        standardized[col.key] = col.defaultValue || '';
      }
    });

    const updatedRecords = [standardized, ...(currentTable.records || [])];
    const updatedTable: CentralUploadedTransactionRepositoryTable = {
      ...currentTable,
      records: updatedRecords,
      recordCount: updatedRecords.length,
      updatedAt: new Date().toISOString()
    };

    this.saveCentralRepositoryTable(updatedTable);
    return standardized;
  }

  public addStandardField(field: GlobalTransactionSchemaField, username: string = 'usr-1'): void {
    const existingIdx = this.config.standardFields.findIndex(f => f.key === field.key);
    const now = new Date().toISOString();
    const enrichedField: GlobalTransactionSchemaField = {
      ...field,
      id: field.id || `gsd-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      user_id: field.user_id || username,
      category: field.category || 'General',
      notes: field.notes || '',
      created_at: field.created_at || now,
      updated_at: now
    };

    let updatedFields: GlobalTransactionSchemaField[];
    if (existingIdx >= 0) {
      updatedFields = [...this.config.standardFields];
      updatedFields[existingIdx] = {
        ...this.config.standardFields[existingIdx],
        ...enrichedField,
        created_at: this.config.standardFields[existingIdx].created_at || enrichedField.created_at,
        updated_at: now
      };
    } else {
      updatedFields = [...this.config.standardFields, enrichedField];
    }

    this.saveConfig({
      ...this.config,
      updatedBy: username,
      standardFields: updatedFields
    });

    // TRIGGER 2: Update Central Uploaded Transaction Repository Table and execute ALTER TABLE
    this.alterCentralRepositoryTableOnNewField(enrichedField, username);
  }

  public updateStandardField(oldKey: string, field: GlobalTransactionSchemaField, username: string = 'admin'): void {
    const existingIdx = this.config.standardFields.findIndex(f => f.key === oldKey);
    const now = new Date().toISOString();
    const enrichedField: GlobalTransactionSchemaField = {
      ...field,
      id: field.id || `gsd-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      user_id: field.user_id || username,
      category: field.category || 'General',
      notes: field.notes || '',
      created_at: field.created_at || now,
      updated_at: now
    };

    let updatedFields: GlobalTransactionSchemaField[];
    if (existingIdx >= 0) {
      updatedFields = [...this.config.standardFields];
      updatedFields[existingIdx] = enrichedField;
    } else {
      updatedFields = [...this.config.standardFields, enrichedField];
    }

    this.saveConfig({
      ...this.config,
      updatedBy: username,
      standardFields: updatedFields
    });

    this.alterCentralRepositoryTableOnNewField(enrichedField, username);
  }

  public deleteStandardField(key: string, username: string = 'user'): boolean {
    const target = this.config.standardFields.find(f => f.key === key);
    if (!target) {
      return false;
    }
    const updated = this.config.standardFields.filter(f => f.key !== key);
    this.saveConfig({
      ...this.config,
      updatedBy: username,
      standardFields: updated
    });

    // Log DDL alteration and update central repository table
    const currentTable = this.getCentralRepositoryTable();
    const alterDdl = `ALTER TABLE ${currentTable.tableName} DROP COLUMN IF EXISTS ${key};`;
    const updatedColumns = currentTable.columns.filter(c => c.key !== key);
    const ddlLog: CentralRepositoryDdlLog = {
      id: `ddl-drop-${Date.now()}`,
      action: 'ALTER_TABLE_DROP_COLUMN',
      columnKey: key,
      ddlStatement: alterDdl,
      timestamp: new Date().toISOString(),
      executedBy: username,
      status: 'SUCCESS',
      message: `Dropped column "${key}" from Central Uploaded Transaction Repository Table.`
    };

    this.saveCentralRepositoryTable({
      ...currentTable,
      columns: updatedColumns,
      lastDdlExecuted: alterDdl,
      ddlHistory: [ddlLog, ...(currentTable.ddlHistory || []).slice(0, 49)]
    });

    return true;
  }

  public clearAllStandardFields(username: string = 'user'): boolean {
    this.saveConfig({
      ...this.config,
      updatedBy: username,
      standardFields: []
    });

    const currentTable = this.getCentralRepositoryTable();
    const ddlLog: CentralRepositoryDdlLog = {
      id: `ddl-clear-${Date.now()}`,
      action: 'ALTER_TABLE_DROP_COLUMN',
      columnKey: '*',
      ddlStatement: `TRUNCATE TABLE ${currentTable.tableName};`,
      timestamp: new Date().toISOString(),
      executedBy: username,
      status: 'SUCCESS',
      message: `Cleared all columns from Central Uploaded Transaction Repository Table.`
    };

    this.saveCentralRepositoryTable({
      ...currentTable,
      columns: [],
      records: [],
      recordCount: 0,
      lastDdlExecuted: `TRUNCATE TABLE ${currentTable.tableName};`,
      ddlHistory: [ddlLog, ...(currentTable.ddlHistory || []).slice(0, 49)]
    });

    return true;
  }

  public getTableMapping(
    dbId: string, 
    tableName: string, 
    dbNameHint?: string
  ): DbTableMappingConfig {
    const mapKey = `${dbId}::${tableName}`;
    if (this.config.tableMappings[mapKey]) {
      return this.config.tableMappings[mapKey];
    }

    // Generate fallback mapping from standard fields
    const defaultCols = this.getStandardFields().map(f => ({
      globalKey: f.key,
      physicalColumn: f.key
    }));

    return {
      dbId,
      dbName: dbNameHint || dbId,
      tableName,
      columns: defaultCols,
      isCustom: true
    };
  }

  public saveTableMapping(
    dbId: string, 
    tableName: string, 
    dbName: string, 
    columns: { globalKey: string; physicalColumn: string; notes?: string }[],
    username: string = 'user'
  ): void {
    const mapKey = `${dbId}::${tableName}`;
    const updatedMappings = {
      ...this.config.tableMappings,
      [mapKey]: {
        dbId,
        dbName,
        tableName,
        columns,
        updatedAt: new Date().toISOString(),
        isCustom: true
      }
    };
    this.saveConfig({
      ...this.config,
      updatedBy: username,
      tableMappings: updatedMappings
    });
  }

  /**
   * Implicitly converts a Global Standard Key into the physical column name for a target DB + table
   */
  public getPhysicalColumn(dbId: string, tableName: string, globalKey: string): string {
    const tableMap = this.getTableMapping(dbId, tableName);
    const col = tableMap.columns.find(c => c.globalKey === globalKey);
    return col ? col.physicalColumn : globalKey;
  }

  /**
   * Implicitly converts a physical database column name into the Global Standard Key
   */
  public getGlobalKey(dbId: string, tableName: string, physicalColumn: string): string {
    const tableMap = this.getTableMapping(dbId, tableName);
    const col = tableMap.columns.find(c => c.physicalColumn.toLowerCase() === physicalColumn.toLowerCase());
    return col ? col.globalKey : physicalColumn;
  }

  /**
   * Translates a dictionary of global criteria or a query string into the physical database format
   */
  public translateGlobalQueryToPhysical(
    queryString: string,
    dbId: string,
    tableName: string,
    columnOverrides?: Record<string, string>
  ): { translatedQuery: string; mappingReplacements: { from: string; to: string }[] } {
    const tableMap = this.getTableMapping(dbId, tableName);
    let translated = queryString;
    const replacements: { from: string; to: string }[] = [];

    // Compile effective columns with overrides having precedence
    const effectiveCols: { globalKey: string; physicalColumn: string }[] = [];
    tableMap.columns.forEach(col => {
      const overrideVal = columnOverrides ? columnOverrides[col.globalKey] : undefined;
      effectiveCols.push({
        globalKey: col.globalKey,
        physicalColumn: overrideVal !== undefined ? overrideVal : col.physicalColumn
      });
    });

    if (columnOverrides) {
      Object.entries(columnOverrides).forEach(([gKey, pCol]) => {
        if (!effectiveCols.some(c => c.globalKey === gKey)) {
          effectiveCols.push({ globalKey: gKey, physicalColumn: pCol });
        }
      });
    }

    effectiveCols.forEach(col => {
      if (col.physicalColumn && col.globalKey !== col.physicalColumn) {
        // Regex word boundary replace
        const regex = new RegExp(`\\b${col.globalKey}\\b`, 'gi');
        if (regex.test(translated)) {
          translated = translated.replace(regex, col.physicalColumn);
          replacements.push({ from: col.globalKey, to: col.physicalColumn });
        }
      }
    });

    return {
      translatedQuery: translated,
      mappingReplacements: replacements
    };
  }

  /**
   * Translates a raw fetched database row (with physical column names) into canonical Global Standard keys
   */
  public translateDbRecordToGlobal(
    rawRecord: Record<string, any>,
    dbId: string,
    tableName: string
  ): Record<string, any> {
    const tableMap = this.getTableMapping(dbId, tableName);
    const globalRecord: Record<string, any> = {};

    // Build physical -> global lookup map
    const physToGlobalMap: Record<string, string> = {};
    tableMap.columns.forEach(c => {
      physToGlobalMap[c.physicalColumn.toLowerCase()] = c.globalKey;
    });

    Object.entries(rawRecord).forEach(([physKey, value]) => {
      const globalKey = physToGlobalMap[physKey.toLowerCase()] || physKey;
      globalRecord[globalKey] = value;
    });

    return globalRecord;
  }

  /**
   * Translates a raw uploaded file row using a chosen column mapping into canonical Global Standard Schema fields.
   * Only includes fields that have actual mapped values to optimize memory and display.
   */
  public transformRowToGlobalSchema(
    rawRecord: Record<string, any>,
    fileMapping: Record<string, string> = {}
  ): Record<string, any> {
    const globalRecord: Record<string, any> = {};

    // Apply explicit mappings (raw header -> global key)
    Object.entries(fileMapping).forEach(([rawHeader, targetGlobalKey]) => {
      if (targetGlobalKey && targetGlobalKey !== 'unmapped' && targetGlobalKey.trim()) {
        const val = rawRecord[rawHeader];
        if (val !== undefined && val !== null && val !== '') {
          globalRecord[targetGlobalKey] = val;
        }
      }
    });

    // If explicit mapping did not supply any mapped values, check direct key matching
    if (Object.keys(globalRecord).length === 0) {
      const standardFields = this.getStandardFields();
      standardFields.forEach(f => {
        const directKey = Object.keys(rawRecord).find(
          k => k.toLowerCase().replace(/[-_\s]/g, '') === f.key.toLowerCase().replace(/[-_\s]/g, '')
        );
        if (directKey && rawRecord[directKey] !== undefined && rawRecord[directKey] !== null && rawRecord[directKey] !== '') {
          globalRecord[f.key] = rawRecord[directKey];
        }
      });
    }

    return globalRecord;
  }

  /**
   * Intelligently auto-maps incoming file headers against available canonical Global Standard Directory fields.
   */
  public autoGenerateColumnMapping(
    headers: string[],
    candidateFields?: { key: string; label?: string; category?: string }[]
  ): Record<string, string> {
    const map: Record<string, string> = {};
    const fields = candidateFields && candidateFields.length > 0
      ? candidateFields
      : this.getStandardFields();

    if (!Array.isArray(headers) || headers.length === 0) return map;

    headers.forEach(h => {
      const rawH = String(h || '').trim();
      if (!rawH) {
        map[rawH] = '';
        return;
      }
      const slugH = rawH.toLowerCase().replace(/[-_.\s]/g, '');

      // 1. Exact match by key or label
      const exactMatch = fields.find(f => {
        const slugKey = f.key.toLowerCase().replace(/[-_.\s]/g, '');
        const slugLabel = (f.label || '').toLowerCase().replace(/[-_.\s]/g, '');
        return slugKey === slugH || slugLabel === slugH;
      });
      if (exactMatch) {
        map[rawH] = exactMatch.key;
        return;
      }

      // 2. High-priority Financial & Settlement synonym rules
      // Transaction / UTRNNO
      if (/^(fe_)?utrnno$/i.test(slugH) || /^(txn|trans)(id|no|num|ref)?$/i.test(slugH)) {
        const target = fields.find(f => /utrnno|transaction_id|trans_id|ref/i.test(f.key));
        if (target) { map[rawH] = target.key; return; }
      }

      // Amount
      if (/^(amnt\d?|amount|amt|val|trans?amt)$/i.test(slugH) || slugH.includes('amount') || slugH.includes('amnt')) {
        const target = fields.find(f => /amnt1|amount|amt/i.test(f.key));
        if (target) { map[rawH] = target.key; return; }
      }

      // Card / PAN
      if (/^(hpan|pan|card|cardno|cardnum|account|acct\d?)$/i.test(slugH) || slugH.includes('card') || slugH.includes('pan')) {
        const target = fields.find(f => /hpan|card|pan|acct_num1/i.test(f.key));
        if (target) { map[rawH] = target.key; return; }
      }

      // Status
      if (/^(status|state|stat|statusstate)$/i.test(slugH) || slugH.includes('status')) {
        const target = fields.find(f => /status|status_state/i.test(f.key));
        if (target) { map[rawH] = target.key; return; }
      }

      // Date / Timestamp
      if (/^(trdate|valuedate|date|time|timestamp|createdat|authtime)$/i.test(slugH) || slugH.includes('date')) {
        const target = fields.find(f => /tr_date|value_date|created_at|timestamp/i.test(f.key));
        if (target) { map[rawH] = target.key; return; }
      }

      // Terminal / Merchant
      if (/^(terminal|term|terminalid|merchant|mid|pos)$/i.test(slugH) || slugH.includes('terminal')) {
        const target = fields.find(f => /terminal|merchant/i.test(f.key));
        if (target) { map[rawH] = target.key; return; }
      }

      // Response / Reason code
      if (/^(resp|response|reason|responcecode|responsecode|isoresp)$/i.test(slugH) || slugH.includes('resp')) {
        const target = fields.find(f => /responce_code|response_code|reason/i.test(f.key));
        if (target) { map[rawH] = target.key; return; }
      }

      // Currency
      if (/^(curr|currency|currcode|currency1)$/i.test(slugH) || slugH.includes('curr')) {
        const target = fields.find(f => /currency|curr/i.test(f.key));
        if (target) { map[rawH] = target.key; return; }
      }

      // Institution / Bank
      if (/^(inst|institution|institution1|bank|bankref)$/i.test(slugH) || slugH.includes('inst')) {
        const target = fields.find(f => /institution|bank/i.test(f.key));
        if (target) { map[rawH] = target.key; return; }
      }

      // 3. Substring containment match
      const subMatch = fields.find(f => {
        const slugKey = f.key.toLowerCase().replace(/[-_.\s]/g, '');
        if (slugKey.length < 3) return false;
        return slugH.includes(slugKey) || slugKey.includes(slugH);
      });
      if (subMatch) {
        map[rawH] = subMatch.key;
        return;
      }

      map[rawH] = '';
    });

    return map;
  }

  /**
   * =========================================================================
   * STRICT MAPPING ENFORCEMENT, DATE DETECTION & DATA TYPE ANALYSIS
   * =========================================================================
   */

  /**
   * Fetches latest versioned Global Mapping configuration from backend API
   */
  public async fetchConfigFromBackend(): Promise<GlobalMappingConfig> {
    try {
      const [remoteConfig, remoteMappings] = await Promise.all([
        api.getGlobalSchemaConfig().catch(() => null),
        api.getTableMappings().catch(() => ({}))
      ]);

      const mergedMappings: Record<string, DbTableMappingConfig> = {
        ...this.config.tableMappings,
        ...(remoteConfig?.tableMappings || {}),
        ...(remoteMappings || {})
      };

      this.config = {
        ...this.config,
        ...(remoteConfig || {}),
        version: remoteConfig?.version || this.config.version,
        standardFields: (remoteConfig?.standardFields && remoteConfig.standardFields.length > 0)
          ? remoteConfig.standardFields
          : this.config.standardFields,
        tableMappings: mergedMappings
      };

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.config));
      } catch (e) {
        // ignore
      }
    } catch (err: any) {
      console.warn('[GlobalMappingService] Backend fetch fallback to local cache:', err.message);
    }
    return this.getConfig();
  }

  /**
   * Persists version-controlled Global Mapping configuration to backend API
   */
  public async saveConfigToBackend(description?: string, username: string = 'admin'): Promise<GlobalMappingConfig> {
    const configToSave = {
      ...this.config,
      updatedAt: new Date().toISOString(),
      updatedBy: username,
      description
    };
    try {
      const res = await api.saveGlobalSchemaConfig(configToSave);
      if (res && res.config) {
        this.config = res.config;
      }
    } catch (err: any) {
      console.warn('[GlobalMappingService] Backend save error, persisted locally:', err.message);
    }
    this.saveConfig(this.config);
    return this.getConfig();
  }

  /**
   * Persists a database table mapping to backend API
   */
  public async saveTableMappingToBackend(
    dbId: string, 
    tableName: string, 
    dbName: string, 
    columns: { globalKey: string; physicalColumn: string; notes?: string }[],
    username: string = 'admin'
  ): Promise<any> {
    this.saveTableMapping(dbId, tableName, dbName, columns, username);
    try {
      const res = await api.saveTableMapping({
        dbId,
        dbName,
        tableName,
        columns,
        isCustom: true
      });
      return res;
    } catch (err: any) {
      console.warn('[GlobalMappingService] Failed to persist table mapping to backend:', err.message);
      throw err;
    }
  }

  /**
   * Strictly verifies if a connected database table has completed its mapping to the Global Column schema
   */
  public isTableMappingComplete(dbId: string, tableName: string): {
    status: 'COMPLETE' | 'INCOMPLETE' | 'UNMAPPED';
    isComplete: boolean;
    missingRequiredKeys: string[];
    missingRequiredLabels: string[];
    missingRequiredColumns: string[];
    mappedColumnsCount: number;
    requiredColumnsCount: number;
  } {
    const mapKey = `${dbId}::${tableName}`;
    const altMapKey = `${dbId}:${tableName}`;
    const rawMapping = this.config.tableMappings?.[mapKey] || this.config.tableMappings?.[altMapKey];

    const standardFields = this.getStandardFields();
    const requiredFields = standardFields.filter(f => f.required);

    if (!rawMapping) {
      return {
        status: 'UNMAPPED',
        isComplete: false,
        missingRequiredKeys: requiredFields.map(f => f.key),
        missingRequiredLabels: requiredFields.map(f => f.label || f.key),
        missingRequiredColumns: requiredFields.map(f => f.label || f.key),
        mappedColumnsCount: 0,
        requiredColumnsCount: requiredFields.length
      };
    }

    const tableMap = rawMapping;
    const mappedKeys = new Set(
      (tableMap.columns || [])
        .filter((c: any) => c.globalKey && c.physicalColumn && c.physicalColumn.trim() !== '' && c.globalKey !== 'unmapped')
        .map((c: any) => c.globalKey)
    );

    const missingFields = requiredFields.filter(f => !mappedKeys.has(f.key));
    const isComplete = missingFields.length === 0;

    return {
      status: isComplete ? 'COMPLETE' : 'INCOMPLETE',
      isComplete,
      missingRequiredKeys: missingFields.map(f => f.key),
      missingRequiredLabels: missingFields.map(f => f.label || f.key),
      missingRequiredColumns: missingFields.map(f => f.label || f.key),
      mappedColumnsCount: mappedKeys.size,
      requiredColumnsCount: requiredFields.length
    };
  }

  /**
   * Inspects sample string values to detect arbitrary date patterns
   */
  public detectDateFormat(sampleValues: any[]): DateFormatAnalysis {
    const nonEmpties = sampleValues
      .map(v => String(v !== undefined && v !== null ? v : '').trim())
      .filter(v => v.length > 0 && v !== '-' && v.toLowerCase() !== 'null');

    if (nonEmpties.length === 0) {
      return {
        detectedFormat: 'Unknown / Empty',
        sampleOriginal: '',
        sampleNormalized: '',
        isValidDate: false,
        confidence: 0,
        formatGuide: 'No date values present in sample rows.'
      };
    }

    const sample = nonEmpties[0];

    // Check Epoch timestamp (10 digits seconds or 13 digits ms)
    if (/^\d{10,13}$/.test(sample)) {
      const ms = sample.length === 10 ? parseInt(sample, 10) * 1000 : parseInt(sample, 10);
      const d = new Date(ms);
      if (!isNaN(d.getTime())) {
        return {
          detectedFormat: 'Epoch Timestamp',
          sampleOriginal: sample,
          sampleNormalized: d.toISOString(),
          isValidDate: true,
          confidence: 0.95,
          formatGuide: `Unix epoch time (${sample.length === 10 ? 'seconds' : 'ms'}) ➔ converts to ISO-8601 UTC.`
        };
      }
    }

    // Check ISO 8601 with 'T' (e.g. 2026-08-15T14:30:00Z)
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(sample)) {
      const d = new Date(sample);
      return {
        detectedFormat: 'ISO-8601 (UTC)',
        sampleOriginal: sample,
        sampleNormalized: !isNaN(d.getTime()) ? d.toISOString() : sample,
        isValidDate: !isNaN(d.getTime()),
        confidence: 1.0,
        formatGuide: 'Standard ISO-8601 UTC timestamp format.'
      };
    }

    // Check YYYY-MM-DD
    if (/^\d{4}[-\/]\d{1,2}[-\/]\d{1,2}/.test(sample)) {
      const parts = sample.split(/[-\/\s]/);
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      const day = parseInt(parts[2], 10);
      const d = new Date(Date.UTC(year, month - 1, day));
      return {
        detectedFormat: 'YYYY-MM-DD',
        sampleOriginal: sample,
        sampleNormalized: !isNaN(d.getTime()) ? d.toISOString().split('T')[0] : sample,
        isValidDate: !isNaN(d.getTime()),
        confidence: 0.95,
        formatGuide: 'Standard Year-Month-Day format.'
      };
    }

    // Check DD/MM/YYYY vs MM/DD/YYYY
    const slashMatch = sample.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(.*)/);
    if (slashMatch) {
      const p1 = parseInt(slashMatch[1], 10);
      const p2 = parseInt(slashMatch[2], 10);
      const yr = parseInt(slashMatch[3], 10);

      // If p1 > 12, it must be DD/MM/YYYY (e.g. 25/08/2026)
      if (p1 > 12) {
        const d = new Date(Date.UTC(yr, p2 - 1, p1));
        return {
          detectedFormat: 'DD/MM/YYYY',
          sampleOriginal: sample,
          sampleNormalized: !isNaN(d.getTime()) ? d.toISOString().split('T')[0] : sample,
          isValidDate: !isNaN(d.getTime()),
          confidence: 0.98,
          formatGuide: 'Day-Month-Year (European/Global) format ➔ will normalize to YYYY-MM-DD.'
        };
      }

      // If p2 > 12, it must be MM/DD/YYYY (e.g. 08/25/2026)
      if (p2 > 12) {
        const d = new Date(Date.UTC(yr, p1 - 1, p2));
        return {
          detectedFormat: 'MM/DD/YYYY',
          sampleOriginal: sample,
          sampleNormalized: !isNaN(d.getTime()) ? d.toISOString().split('T')[0] : sample,
          isValidDate: !isNaN(d.getTime()),
          confidence: 0.98,
          formatGuide: 'Month-Day-Year (US) format ➔ will normalize to YYYY-MM-DD.'
        };
      }

      // Ambiguous (both <= 12, e.g. 05/06/2026). Default to DD/MM/YYYY with note
      const d = new Date(Date.UTC(yr, p2 - 1, p1));
      return {
        detectedFormat: 'DD/MM/YYYY (Standard)',
        sampleOriginal: sample,
        sampleNormalized: !isNaN(d.getTime()) ? d.toISOString().split('T')[0] : sample,
        isValidDate: !isNaN(d.getTime()),
        confidence: 0.85,
        formatGuide: 'Interpreted as DD/MM/YYYY (Day 1st). Normalizes to YYYY-MM-DD.'
      };
    }

    // Generic Date parse attempt
    const d = new Date(sample);
    if (!isNaN(d.getTime())) {
      return {
        detectedFormat: 'Text Date Format',
        sampleOriginal: sample,
        sampleNormalized: d.toISOString(),
        isValidDate: true,
        confidence: 0.75,
        formatGuide: 'Parsed via standard date deserializer.'
      };
    }

    return {
      detectedFormat: 'Unrecognized Date',
      sampleOriginal: sample,
      sampleNormalized: '',
      isValidDate: false,
      confidence: 0,
      formatGuide: 'Value could not be parsed into a valid calendar date.'
    };
  }

  /**
   * Normalizes an arbitrary date string into clean ISO string based on detected format
   */
  public normalizeDateValue(val: any, detectedFormat?: string): string {
    if (!val) return '';
    const str = String(val).trim();
    if (!str) return '';

    // If Epoch
    if (/^\d{10,13}$/.test(str)) {
      const ms = str.length === 10 ? parseInt(str, 10) * 1000 : parseInt(str, 10);
      const d = new Date(ms);
      return !isNaN(d.getTime()) ? d.toISOString() : str;
    }

    // If DD/MM/YYYY
    const dmyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(.*)/);
    if (dmyMatch && (detectedFormat?.includes('DD/MM') || parseInt(dmyMatch[1], 10) > 12)) {
      const day = parseInt(dmyMatch[1], 10);
      const month = parseInt(dmyMatch[2], 10);
      const year = parseInt(dmyMatch[3], 10);
      const d = new Date(Date.UTC(year, month - 1, day));
      return !isNaN(d.getTime()) ? d.toISOString().split('T')[0] : str;
    }

    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      return str.includes(':') ? d.toISOString() : d.toISOString().split('T')[0];
    }

    return str;
  }

  /**
   * Analyzes sample values of a column against the expected Global Schema data type
   */
  public analyzeColumnDataType(
    colKey: string, 
    expectedType: 'string' | 'number' | 'date' | 'boolean', 
    sampleValues: any[]
  ): DataTypeAnalysisResult {
    const nonEmpties = sampleValues
      .map(v => String(v !== undefined && v !== null ? v : '').trim())
      .filter(v => v.length > 0 && v !== '-' && v.toLowerCase() !== 'null');

    if (nonEmpties.length === 0) {
      return {
        colKey,
        expectedType,
        detectedType: expectedType,
        isValid: true,
        sampleCount: 0,
        invalidCount: 0
      };
    }

    if (expectedType === 'date') {
      const dateAnalysis = this.detectDateFormat(nonEmpties);
      return {
        colKey,
        expectedType,
        detectedType: 'date',
        isValid: dateAnalysis.isValidDate,
        sampleCount: nonEmpties.length,
        invalidCount: dateAnalysis.isValidDate ? 0 : nonEmpties.length,
        warning: dateAnalysis.isValidDate ? undefined : 'Values cannot be parsed as valid dates',
        dateAnalysis
      };
    }

    if (expectedType === 'number') {
      let invalidCount = 0;
      nonEmpties.forEach(val => {
        const cleaned = val.replace(/[\$,\s€£]/g, '').trim();
        if (isNaN(Number(cleaned)) || cleaned === '') {
          invalidCount++;
        }
      });
      const isValid = invalidCount === 0;
      return {
        colKey,
        expectedType,
        detectedType: 'number',
        isValid,
        sampleCount: nonEmpties.length,
        invalidCount,
        warning: !isValid ? `${invalidCount} of ${nonEmpties.length} sample values contain non-numeric characters` : undefined
      };
    }

    if (expectedType === 'boolean') {
      let invalidCount = 0;
      const validBooleans = new Set(['true', 'false', '0', '1', 'yes', 'no', 'y', 'n']);
      nonEmpties.forEach(val => {
        if (!validBooleans.has(val.toLowerCase())) {
          invalidCount++;
        }
      });
      const isValid = invalidCount === 0;
      return {
        colKey,
        expectedType,
        detectedType: 'boolean',
        isValid,
        sampleCount: nonEmpties.length,
        invalidCount,
        warning: !isValid ? 'Values must be boolean (true/false, 1/0, yes/no)' : undefined
      };
    }

    // Default string
    return {
      colKey,
      expectedType,
      detectedType: 'string',
      isValid: true,
      sampleCount: nonEmpties.length,
      invalidCount: 0
    };
  }

  /**
   * Pre-flight Gate: Validates that all required columns from the Global Schema are mapped
   */
  public validateRequiredColumns(fileMapping: Record<string, string>): RequiredColumnValidationResult {
    const standardFields = this.getStandardFields();
    const requiredFields = standardFields.filter(f => f.required);

    const mappedTargetKeys = new Set(
      Object.values(fileMapping).filter(k => k && k !== 'unmapped' && k.trim() !== '')
    );

    const missingFields = requiredFields.filter(f => !mappedTargetKeys.has(f.key));
    const isValid = missingFields.length === 0;

    return {
      isValid,
      missingRequiredKeys: missingFields.map(f => f.key),
      missingRequiredLabels: missingFields.map(f => f.label || f.key),
      mappedRequiredCount: requiredFields.length - missingFields.length,
      totalRequiredCount: requiredFields.length
    };
  }

}

export const globalMappingService = GlobalMappingService.getInstance();


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
  CentralRepositoryDdlLog,
  FileIngestionMappingTemplate
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

export const DEFAULT_GLOBAL_STANDARD_FIELDS: GlobalTransactionSchemaField[] = [
  { id: 'gsd-task-id', key: 'task_id', label: 'Task Id (_task_id)', description: 'Ingestion task identifier', dataType: 'string', required: false, isStandard: true, category: 'System & internal', notes: 'Ingestion task identifier' },
  { id: 'gsd-row-number', key: 'row_number', label: 'Row Number (_row_number)', description: 'Ingestion row sequence number', dataType: 'number', required: false, isStandard: true, category: 'System & internal', notes: 'Ingestion row sequence number' },
  { id: 'gsd-validation-action', key: 'validation_action', label: 'Validation Action', description: 'Pipeline progression action', dataType: 'string', required: false, isStandard: true, category: 'Audit & timestamps', notes: 'Pipeline progression action' },
  { id: 'gsd-validation-details', key: 'validation_details', label: 'Validation Details', description: 'Detailed validation diagnosis payload', dataType: 'string', required: false, isStandard: true, category: 'Audit & timestamps', notes: 'Detailed validation diagnosis payload' },
  { id: 'gsd-mirrored-at', key: 'mirrored_at', label: 'Mirrored At (_mirrored_at)', description: 'Timestamp of record capture into mirror table', dataType: 'date', required: false, isStandard: true, category: 'Audit & timestamps', notes: 'Timestamp of record capture into mirror table' },
  { id: 'gsd-acq-sdatetime', key: 'acq_sdatetime', label: 'ACQ SDATETIME', description: 'Acquirer system settlement and clearing date-time', dataType: 'date', required: false, isStandard: true, category: 'Audit & timestamps', notes: 'Sett · auth_log_tab · discovered' },
  { id: 'gsd-captdate', key: 'captdate', label: 'CAPTDATE', description: 'Batch capture timestamp from terminal', dataType: 'string', required: false, isStandard: true, category: 'Audit & timestamps', notes: 'Sett · auth_log_tab · discovered' },
  { id: 'gsd-sw-convertrate', key: 'sw_convertrate', label: 'SW CONVERTRATE', description: 'Switch foreign exchange conversion rate multiplier', dataType: 'number', required: false, isStandard: true, category: 'Financial & amounts', notes: 'Sett · auth_log_tab · discovered' },
  { id: 'gsd-trace', key: 'trace', label: 'TRACE', description: 'System trace audit number (STAN)', dataType: 'string', required: false, isStandard: true, category: 'Identity & reference', notes: 'Sett · auth_log_tab · discovered' },
  { id: 'gsd-finst-cc', key: 'finst_cc', label: 'FINST CC', description: 'Financial institution currency code', dataType: 'string', required: false, isStandard: false, category: 'Unclassified', notes: 'Sett · auth_log_tab · discovered' },
  { id: 'gsd-merchant', key: 'merchant', label: 'MERCHANT', description: 'Merchant unique identifier or terminal merchant code', dataType: 'string', required: false, isStandard: true, category: 'Merchant & POS', notes: 'Sett · auth_log_tab · discovered' },
  { id: 'gsd-acqinstcc', key: 'acqinstcc', label: 'ACQINSTCC', description: 'Acquiring institution country / currency code', dataType: 'string', required: false, isStandard: false, category: 'Unclassified', notes: 'Sett · auth_log_tab · discovered' },
  { id: 'gsd-client-billingfee', key: 'client_billingfee', label: 'CLIENT BILLINGFEE', description: 'Client billing processing surcharge fee', dataType: 'number', required: false, isStandard: true, category: 'Financial & amounts', notes: 'Sett · auth_log_tab · discovered' },
  { id: 'gsd-transaction-id', key: 'transaction_id', label: 'Transaction ID', description: 'Primary transaction key across all schemas', dataType: 'string', required: true, isStandard: true, category: 'Identity & reference', notes: 'Primary transaction key across all schemas' },
  { id: 'gsd-amount', key: 'amount', label: 'Amount', description: 'Standard settlement numerical amount', dataType: 'number', required: true, isStandard: true, category: 'Financial & amounts', notes: 'Standard settlement numerical amount' },
  { id: 'gsd-currency', key: 'currency', label: 'Currency', description: 'ISO currency code: ETB, USD, EUR', dataType: 'string', required: false, isStandard: true, category: 'Financial & amounts', notes: 'ISO currency code: ETB, USD, EUR' },
  { id: 'gsd-card-number', key: 'card_number', label: 'Card Number', description: 'PCI-DSS compliant masked PAN (e.g. 4242••••••4242)', dataType: 'string', required: false, isStandard: true, category: 'Card & customer', notes: 'PCI-DSS compliant masked PAN (e.g. 4242••••••4242)' },
  { id: 'gsd-status', key: 'status', label: 'Status', description: 'Normalized status: Authorized, Settled, Declined, Reversed', dataType: 'string', required: false, isStandard: true, category: 'General', notes: 'Normalized status: Authorized, Settled, Declined, Reversed' },
  { id: 'gsd-response-code', key: 'response_code', label: 'Response Code', description: 'Standard response codes: 00 (Approved), 05 (Do not honor), 51 (Insufficient funds)', dataType: 'string', required: false, isStandard: true, category: 'General', notes: 'Standard response codes: 00 (Approved), 05 (Do not honor), 51 (Insufficient funds)' }
];

export const DEFAULT_DATABASE_TABLE_MAPPINGS: Record<string, DbTableMappingConfig> = {};

// NON-AUTHORITATIVE OFFLINE CACHE KEYS (PostgreSQL global_standard_directory and database_table_mappings are the sole authority)
const STORAGE_KEY = 'global_mapping_schema_config_v2';
const CENTRAL_TABLE_STORAGE_KEY = 'central_transaction_repo_v2';

export class GlobalMappingService {
  private static instance: GlobalMappingService;
  private config: GlobalMappingConfig;
  private centralTable: CentralUploadedTransactionRepositoryTable | null = null;
  public isHydrated: boolean = false;

  private constructor() {
    // Initialize synchronously with offline draft cache to avoid rendering blank screens
    this.config = this.loadConfig();
    this.centralTable = this.loadCentralTable();

    // Trigger authoritative background hydration from PostgreSQL database
    if (typeof window !== 'undefined') {
      this.hydrateFromBackend().catch(err => {
        console.warn('[GlobalMappingService] Background PostgreSQL hydration warning:', err.message);
      });
    }
  }

  public static getInstance(): GlobalMappingService {
    if (!GlobalMappingService.instance) {
      GlobalMappingService.instance = new GlobalMappingService();
    }
    return GlobalMappingService.instance;
  }

  /**
   * Loads initial in-memory baseline configuration.
   * True source of truth resides in PostgreSQL database.
   */
  private loadConfig(): GlobalMappingConfig {
    return {
      version: '2.2.0',
      updatedAt: new Date().toISOString(),
      updatedBy: 'system_default',
      standardFields: [...DEFAULT_GLOBAL_STANDARD_FIELDS],
      tableMappings: { ...DEFAULT_DATABASE_TABLE_MAPPINGS }
    };
  }

  /**
   * Hydrates Global Mapping Schema & Table Mappings directly from PostgreSQL database (Authoritative Source of Truth)
   */
  public async hydrateFromBackend(): Promise<GlobalMappingConfig> {
    try {
      const [schemaRes, tableMappingsRes, dirRes] = await Promise.allSettled([
        api.getGlobalSchemaConfig(),
        api.getTableMappings(),
        api.getGlobalStandardDirectory()
      ]);

      let fields: GlobalTransactionSchemaField[] = this.config.standardFields;
      if (dirRes.status === 'fulfilled' && Array.isArray(dirRes.value) && dirRes.value.length > 0) {
        fields = dirRes.value;
      } else if (schemaRes.status === 'fulfilled' && schemaRes.value?.standardFields) {
        fields = schemaRes.value.standardFields;
      }

      let mappings = this.config.tableMappings;
      if (tableMappingsRes.status === 'fulfilled' && tableMappingsRes.value && typeof tableMappingsRes.value === 'object') {
        mappings = { ...this.config.tableMappings, ...tableMappingsRes.value };
      } else if (schemaRes.status === 'fulfilled' && schemaRes.value?.tableMappings) {
        mappings = { ...this.config.tableMappings, ...schemaRes.value.tableMappings };
      }

      this.config = {
        ...this.config,
        version: (schemaRes.status === 'fulfilled' && schemaRes.value?.version) ? schemaRes.value.version : this.config.version,
        standardFields: fields,
        tableMappings: mappings,
        updatedAt: new Date().toISOString()
      };

      this.isHydrated = true;
      this.notifyListeners();
      return this.config;
    } catch (err: any) {
      console.warn('[GlobalMappingService] Error hydrating from PostgreSQL authoritative backend, using offline cache:', err.message);
      return this.config;
    }
  }

  private listeners = new Set<() => void>();

  /**
   * Subscribes a listener to configuration state changes (MAP-16 fix)
   */
  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    this.listeners.forEach(fn => {
      try { fn(); } catch (e) { console.error('[GlobalMappingService] Listener error:', e); }
    });
  }

  /**
   * Returns a deep clone of the current configuration (MAP-23 fix)
   */
  public getConfig(): GlobalMappingConfig {
    return JSON.parse(JSON.stringify(this.config));
  }

  public saveConfig(newConfig: GlobalMappingConfig): void {
    this.config = {
      ...newConfig,
      updatedAt: new Date().toISOString()
    };

    // Authoritative asynchronous persist to PostgreSQL
    api.saveGlobalSchemaConfig(this.config).catch(err => {
      console.warn('[GlobalMappingService] Could not persist schema config to PostgreSQL:', err.message);
    });

    this.notifyListeners();
  }

  /**
   * Resets schema dictionary to seeded baseline without wiping columns (MAP-07 fix)
   */
  public resetToDefaults(username: string = 'admin'): GlobalMappingConfig {
    const freshConfig: GlobalMappingConfig = {
      version: '2.3.0',
      updatedAt: new Date().toISOString(),
      updatedBy: username,
      standardFields: [...DEFAULT_GLOBAL_STANDARD_FIELDS],
      tableMappings: {}
    };
    this.saveConfig(freshConfig);
    // Also compile preview schema model based on standard fields
    this.buildCentralRepositoryTable({ tableName: 'central_transaction_repository', username, populateExisting: false });
    return freshConfig;
  }

  public updateStandardFields(fields: GlobalTransactionSchemaField[]): void {
    if (Array.isArray(fields) && fields.length > 0) {
      this.config.standardFields = fields;
      api.saveGlobalSchemaConfig(this.config).catch(err => {
        console.warn('[GlobalMappingService] Could not persist updated fields to PostgreSQL:', err.message);
      });
      this.notifyListeners();
    }
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
  public getSchemaModel(tableName: string = 'central_transaction_repository'): GlobalMappingSchemaModel {
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
        isIndexed: isPk || f.key.endsWith('_id') || f.key === 'status' || f.key === 'amount',
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

    const indexableCandidates = ['status', 'amount', 'currency', 'card_number', 'mirrored_at', 'acq_sdatetime'];
    const activeIndexFields = fields.filter(f =>
      f.key !== 'transaction_id' && (indexableCandidates.includes(f.key) || f.key.endsWith('_id') || f.key.endsWith('_date') || f.key.endsWith('_at'))
    );

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
      indexes: activeIndexFields.map(f => ({
        name: `idx_${tableName}_${f.key}`,
        columns: [f.key]
      })),
      sqlDdlDefinition: ddl,
      typeScriptDefinition: tsCode,
      jsonSchemaDefinition: jsonSchema,
      ormModelDefinition: ormCode,
      lastCompiledAt: this.config.updatedAt,
      compiledBy: this.config.updatedBy
    };
  }

  /**
   * Generates production-ready SQL DDL statements for creating the Central Repository Table (MAP-01 / MAP-08 fix)
   */
  public generateSqlDdl(
    tableName: string = 'central_transaction_repository', 
    dialect: 'PostgreSQL' | 'Oracle' | 'MySQL' | 'Generic' = 'PostgreSQL'
  ): string {
    const fields = this.getStandardFields();
    if (fields.length === 0) {
      return `-- No fields defined in schema model`;
    }
    const safeTable = tableName.replace(/[^a-zA-Z0-9_]/g, '');
    const isPg = dialect === 'PostgreSQL' || dialect === 'Generic';
    const qOpen = isPg ? '"' : '`';
    const qClose = isPg ? '"' : '`';
    const lines: string[] = [];

    fields.forEach((f) => {
      const safeKey = f.key.replace(/[^a-zA-Z0-9_]/g, '');
      const sqlColName = `${qOpen}${safeKey}${qClose}`;
      const sqlType = this.getSqlDataType(f, dialect);
      const isPk = f.key === 'transaction_id';
      let line = `  ${sqlColName.padEnd(24)} ${sqlType}`;

      if (isPk) {
        line += ' PRIMARY KEY NOT NULL';
      } else if (f.required) {
        line += ' NOT NULL';
      }

      if (f.dataType === 'number') {
        line += ' DEFAULT 0.00';
      } else if (f.dataType === 'boolean') {
        line += ' DEFAULT FALSE';
      } else if (f.dataType === 'date' && isPg) {
        line += ' DEFAULT CURRENT_TIMESTAMP';
      }

      lines.push(line);
    });

    const createTableStmt = `-- ==========================================================================\n-- CENTRAL UPLOADED TRANSACTION REPOSITORY TABLE (SCHEMA PREVIEW DDL)\n-- Generated from Global Mapping Schema Model v${this.config.version}\n-- ==========================================================================\n\nCREATE TABLE IF NOT EXISTS ${qOpen}${safeTable}${qClose} (\n${lines.join(',\n')}\n);`;

    const indexableCandidates = ['status', 'amount', 'currency', 'card_number', 'mirrored_at', 'acq_sdatetime'];
    const activeIndexFields = fields.filter(f =>
      f.key !== 'transaction_id' && (indexableCandidates.includes(f.key) || f.key.endsWith('_id') || f.key.endsWith('_date') || f.key.endsWith('_at'))
    );

    const indexStmts = activeIndexFields.map(f => {
      const safeKey = f.key.replace(/[^a-zA-Z0-9_]/g, '');
      return `CREATE INDEX IF NOT EXISTS ${qOpen}idx_${safeTable}_${safeKey}${qClose} ON ${qOpen}${safeTable}${qClose} (${qOpen}${safeKey}${qClose});`;
    }).join('\n');

    const commentStmt = isPg
      ? `-- Add Schema Model metadata comment\nCOMMENT ON TABLE ${qOpen}${safeTable}${qClose} IS 'Central Uploaded Transaction Repository preview compiled from Global Mapping Schema Model v${this.config.version}';`
      : '';

    return `${createTableStmt}\n\n${indexStmts}${commentStmt ? `\n\n${commentStmt}` : ''}`;
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
  public generateJsonSchema(tableName: string = 'central_transaction_repository'): Record<string, any> {
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
   * Generates Drizzle / ORM Model code representation (MAP-08 fix)
   */
  public generateOrmModel(tableName: string = 'central_transaction_repository'): string {
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

    const indexableCandidates = ['status', 'amount', 'currency', 'card_number', 'mirrored_at'];
    const activeIndexFields = fields.filter(f =>
      f.key !== 'transaction_id' && (indexableCandidates.includes(f.key) || f.key.endsWith('_id'))
    );
    const indexExpressions = activeIndexFields.slice(0, 3).map(f => {
      const camel = this.toCamelCase(f.key);
      return `  ${camel}Idx: index('idx_${tableName}_${f.key}').on(table.${camel}),`;
    }).join('\n');

    return `import { pgTable, varchar, decimal, timestamp, boolean, index } from 'drizzle-orm/pg-core';\n\nexport const centralUploadedTransactions = pgTable('${tableName}', {\n${colLines.join('\n')}\n}, (table) => ({\n${indexExpressions}\n}));`;
  }

  private toCamelCase(str: string): string {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  /**
   * Loads or initializes the Central Uploaded Transaction Repository Table Schema Model in memory.
   * Per Rule 23, table data and definitions must not be stored in client-side localStorage.
   */
  private loadCentralTable(): CentralUploadedTransactionRepositoryTable {
    // Proactively purge any stale legacy localStorage persistence
    try {
      localStorage.removeItem(CENTRAL_TABLE_STORAGE_KEY);
    } catch (e) {
      // ignore
    }

    // Generate initial table using current schema model
    const model = this.getSchemaModel('central_transaction_repository');
    const initialRecords = this.harvestInitialUploadedRecords();

    const initialTable: CentralUploadedTransactionRepositoryTable = {
      tableName: 'central_transaction_repository',
      dbId: 'app-internal-postgres',
      dbName: 'Operational Workflow Database (PostgreSQL)',
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
          ddlStatement: model.sqlDdlDefinition,
          timestamp: new Date().toISOString(),
          executedBy: 'system_auto_provision',
          status: 'GENERATED',
          message: `Schema Model preview initialized with ${model.fields.length} Global Standard columns.`
        }
      ]
    };

    return initialTable;
  }

  /**
   * Collects any uploaded records from workspace or seed archives to populate the central table
   */
  private harvestInitialUploadedRecords(): Record<string, any>[] {
    // Zero localStorage business state per AGENTS.md Rule 23
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
    // Ensure no business state is persisted to localStorage per Rule 23
    try {
      localStorage.removeItem(CENTRAL_TABLE_STORAGE_KEY);
    } catch (e) {
      // ignore
    }
  }

  /**
   * TRIGGER 1: "Create Table" button clicked in Global Mapping Schema
   * Compiles / Generates the Central Uploaded Transaction Repository Table Schema Model
   */
  public buildCentralRepositoryTable(options?: { 
    tableName?: string; 
    dbId?: string; 
    username?: string; 
    populateExisting?: boolean;
    columnsOverride?: SchemaModelFieldDef[];
  }): CentralUploadedTransactionRepositoryTable {
    const tableName = options?.tableName || 'central_transaction_repository';
    const dbId = options?.dbId || 'app-internal-postgres';
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
      status: 'GENERATED',
      message: `Compiled schema model and DDL migration preview for "${tableName}" with ${columns.length} schema columns.`
    };

    const newTable: CentralUploadedTransactionRepositoryTable = {
      tableName,
      dbId,
      dbName: dbId === 'app-internal-postgres' ? 'Operational Workflow Database (PostgreSQL)' : (this.config.tableMappings[`${dbId}::${tableName}`]?.dbName || 'Database'),
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
      status: 'GENERATED',
      message: `Compiled schema migration preview: Added column "${field.key}" (${sqlDataType}) to Schema Model.`
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

    // Physically delete from PostgreSQL global_standard_directory (MAP-05 fix)
    const deleteId = target.id || `gsd-${key}`;
    api.deleteGlobalStandardDirectoryField(deleteId).catch(err => {
      console.warn('[GlobalMappingService] Error deleting field from PostgreSQL directory:', err.message);
    });

    // Log DDL alteration preview and update central repository table model (MAP-01 fix)
    const currentTable = this.getCentralRepositoryTable();
    const alterDdl = `ALTER TABLE "${currentTable.tableName}" DROP COLUMN IF EXISTS "${key}";`;
    const updatedColumns = currentTable.columns.filter(c => c.key !== key);
    const ddlLog: CentralRepositoryDdlLog = {
      id: `ddl-drop-${Date.now()}`,
      action: 'ALTER_TABLE_DROP_COLUMN',
      columnKey: key,
      ddlStatement: alterDdl,
      timestamp: new Date().toISOString(),
      executedBy: username,
      status: 'GENERATED',
      message: `Compiled DROP COLUMN migration preview for "${key}".`
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

    // Physically clear PostgreSQL directory (MAP-05 fix)
    api.clearGlobalStandardDirectory().catch(err => {
      console.warn('[GlobalMappingService] Error clearing PostgreSQL directory:', err.message);
    });

    const currentTable = this.getCentralRepositoryTable();
    const ddlLog: CentralRepositoryDdlLog = {
      id: `ddl-clear-${Date.now()}`,
      action: 'ALTER_TABLE_DROP_COLUMN',
      columnKey: '*',
      ddlStatement: `TRUNCATE TABLE "${currentTable.tableName}";`,
      timestamp: new Date().toISOString(),
      executedBy: username,
      status: 'GENERATED',
      message: `Compiled TRUNCATE TABLE migration preview for Schema Model.`
    };

    this.saveCentralRepositoryTable({
      ...currentTable,
      columns: [],
      records: [],
      recordCount: 0,
      lastDdlExecuted: `TRUNCATE TABLE "${currentTable.tableName}";`,
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

    // Authoritative persist to PostgreSQL backend
    api.saveTableMapping({ dbId, tableName, dbName, columns, isCustom: true }).catch(err => {
      console.warn('[GlobalMappingService] Error persisting table mapping to PostgreSQL:', err.message);
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

    // Build physical -> global lookup map (guarded against undefined - MAP-18 fix)
    const physToGlobalMap: Record<string, string> = {};
    tableMap.columns.forEach(c => {
      const colName = c.physicalColumn || (c as any).columnName || (c as any).name;
      if (colName) {
        physToGlobalMap[String(colName).toLowerCase()] = c.globalKey || (c as any).key;
      }
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
  public cleanFieldValue(val: any, targetKey: string, dataType: string = 'string'): any {
    if (val === null || val === undefined || val === '') return null;
    const sKey = targetKey.toLowerCase();

    // PAN / Card number normalization
    if (sKey === 'hpan' || sKey === 'pan' || sKey.includes('card')) {
      const cleanP = String(val).replace(/[\s\-\.]/g, '').trim();
      return cleanP.length >= 10 ? cleanP : String(val).trim();
    }

    // Amount / Numeric transformation (Disambiguates European decimal commas - MAP-13 fix)
    if (dataType === 'number' || dataType === 'integer' || sKey.includes('amt') || sKey.includes('amount') || sKey === 'reqamt' || sKey === 'conamt') {
      if (typeof val === 'number') return isNaN(val) || !isFinite(val) ? null : val;
      let s = String(val).trim();
      if (!s || s.toLowerCase() === 'null' || s.toLowerCase() === 'undefined') return null;
      const isParenNeg = /^\s*\(\s*([0-9.,]+)\s*\)\s*$/.test(s);
      const isTrailNeg = /^\s*([0-9.,]+)\s*-\s*$/.test(s);
      s = s.replace(/[\$\€\£\¥\₹\s]/g, '');
      if (isParenNeg) s = '-' + s.replace(/[\(\)]/g, '');
      else if (isTrailNeg) s = '-' + s.replace(/-$/, '');

      // Disambiguate European decimal comma (1.234,56) vs US/UK thousands comma (1,234.56)
      if (s.includes('.') && s.includes(',')) {
        if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
          // German / European: 1.234,56 -> 1234.56
          s = s.replace(/\./g, '').replace(/,/g, '.');
        } else {
          // US / UK: 1,234.56 -> 1234.56
          s = s.replace(/,/g, '');
        }
      } else if (s.includes(',') && !s.includes('.')) {
        if (/,\d{1,2}$/.test(s)) {
          s = s.replace(/,/g, '.');
        } else {
          s = s.replace(/,/g, '');
        }
      }

      const parsed = parseFloat(s);
      if (!isNaN(parsed) && isFinite(parsed)) {
        return (dataType === 'integer' || sKey === 'prcode') ? Math.round(parsed) : parsed;
      }
      return null;
    }

    // Date / Timestamp transformation (Strict date parsing without leaking broken strings - MAP-13 fix)
    if (dataType === 'date' || dataType === 'timestamp' || sKey.includes('date') || sKey.includes('time') || sKey === 'ttime') {
      if (val instanceof Date && !isNaN(val.getTime())) return val.toISOString();
      if (typeof val === 'number') {
        const ts = val < 10000000000 ? val * 1000 : val;
        const d = new Date(ts);
        return !isNaN(d.getTime()) ? d.toISOString() : null;
      }
      const str = String(val).trim();
      if (!str || str.toLowerCase() === 'null' || str.toLowerCase() === 'undefined') return null;
      if (/^\d{8}$/.test(str)) {
        return `${str.substring(0, 4)}-${str.substring(4, 6)}-${str.substring(6, 8)}`;
      }
      if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(str)) return str;

      // Handle slash dates: DD/MM/YYYY or MM/DD/YYYY
      const slashMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}:\d{2}(?::\d{2})?))?$/);
      if (slashMatch) {
        const [, p1, p2, year, time] = slashMatch;
        const n1 = parseInt(p1, 10);
        const n2 = parseInt(p2, 10);
        let month = n1;
        let day = n2;
        if (n1 > 12) {
          day = n1;
          month = n2;
        }
        const isoDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        return time ? `${isoDate}T${time}` : isoDate;
      }

      const d = new Date(str);
      if (!isNaN(d.getTime())) {
        return !str.includes(':') ? d.toISOString().split('T')[0] : d.toISOString();
      }
      return null;
    }

    // Boolean transformation
    if (dataType === 'boolean' || dataType === 'bool') {
      if (typeof val === 'boolean') return val;
      const s = String(val).trim().toLowerCase();
      if (['true', '1', 't', 'y', 'yes', 'on'].includes(s)) return true;
      if (['false', '0', 'f', 'n', 'no', 'off'].includes(s)) return false;
      return null;
    }

    return typeof val === 'string' ? val.trim() : val;
  }

  public transformRowToGlobalSchema(
    rawRecord: Record<string, any>,
    fileMapping: Record<string, string> = {},
    candidateFields?: { key: string; dataType?: string }[]
  ): Record<string, any> {
    const globalRecord: Record<string, any> = {};
    const standardFields = candidateFields && candidateFields.length > 0
      ? candidateFields
      : this.getStandardFields();
    const typeMap = new Map<string, string>();
    standardFields.forEach(f => typeMap.set(f.key.toLowerCase(), (f.dataType || 'string').toLowerCase()));

    // Apply explicit mappings (raw header -> global key) with Data Type Transformation
    Object.entries(fileMapping).forEach(([rawHeader, targetGlobalKey]) => {
      if (targetGlobalKey && targetGlobalKey !== 'unmapped' && targetGlobalKey.trim()) {
        const val = rawRecord[rawHeader];
        if (val !== undefined && val !== null && val !== '') {
          const dataType = typeMap.get(targetGlobalKey.toLowerCase()) || 'string';
          const transformed = this.cleanFieldValue(val, targetGlobalKey, dataType);
          if (transformed !== null && transformed !== undefined) {
            globalRecord[targetGlobalKey] = transformed;
          }
        }
      }
    });

    // If explicit mapping did not supply any mapped values, check direct key matching
    if (Object.keys(globalRecord).length === 0) {
      standardFields.forEach(f => {
        const directKey = Object.keys(rawRecord).find(
          k => k.toLowerCase().replace(/[-_\s]/g, '') === f.key.toLowerCase().replace(/[-_\s]/g, '')
        );
        if (directKey && rawRecord[directKey] !== undefined && rawRecord[directKey] !== null && rawRecord[directKey] !== '') {
          const transformed = this.cleanFieldValue(rawRecord[directKey], f.key, f.dataType);
          if (transformed !== null && transformed !== undefined) {
            globalRecord[f.key] = transformed;
          }
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

      // 2. Domain-aware synonym matching
      // Debtor Institution / Bank
      if (/debtor/i.test(slugH) && /inst|bank/i.test(slugH)) {
        const target = fields.find(f => f.key.toLowerCase() === 'debtor_inst')
          || fields.find(f => f.key.toLowerCase() === 'debtor_institution')
          || fields.find(f => f.key.toLowerCase() === 'acq_inst')
          || fields.find(f => f.key.toLowerCase() === 'acqinstid')
          || fields.find(f => f.key.toLowerCase() === 'inst_id2')
          || fields.find(f => f.key.toLowerCase() === 'institution1')
          || fields.find(f => /debtor/i.test(f.key));
        if (target) { map[rawH] = target.key; return; }
      }

      // Creditor Institution / Bank
      if (/creditor/i.test(slugH) && /inst|bank/i.test(slugH)) {
        const target = fields.find(f => f.key.toLowerCase() === 'creditor_inst')
          || fields.find(f => f.key.toLowerCase() === 'creditor_institution')
          || fields.find(f => f.key.toLowerCase() === 'issuer_id')
          || fields.find(f => f.key.toLowerCase() === 'isser_bank')
          || fields.find(f => f.key.toLowerCase() === 'issinstcc')
          || fields.find(f => f.key.toLowerCase() === 'institution2')
          || fields.find(f => /creditor/i.test(f.key));
        if (target) { map[rawH] = target.key; return; }
      }

      // End to End ID / UTRN / Transfer ID
      if (/endtoend|end_to_end|e2e|utrn/i.test(slugH)) {
        const target = fields.find(f => f.key.toLowerCase() === 'end_to_end_id')
          || fields.find(f => f.key.toLowerCase() === 'utrnno')
          || fields.find(f => f.key.toLowerCase() === 'fe_utrnno')
          || fields.find(f => f.key.toLowerCase() === 'refnum')
          || fields.find(f => f.key.toLowerCase() === 'transaction_id');
        if (target) { map[rawH] = target.key; return; }
      }

      // STAN / Trace (ISO 8583 F11)
      if (/^(stan|trace|stan_f11|stanf11|sys_trace|audit_num|f11)$/i.test(slugH) || slugH.includes('stan') || slugH.includes('trace')) {
        const target = fields.find(f => f.key.toLowerCase() === 'trace')
          || fields.find(f => f.key.toLowerCase() === 'stan')
          || fields.find(f => /trace|stan/i.test(f.key));
        if (target) { map[rawH] = target.key; return; }
      }

      // Response code / ATM Resp
      if (/^(atm_resp|atmresp|response_code|resp_code|respcode|response|action_code)$/i.test(slugH) || slugH.includes('resp')) {
        const target = fields.find(f => f.key.toLowerCase() === 'atm_resp')
          || fields.find(f => f.key.toLowerCase() === 'response_code')
          || fields.find(f => f.key.toLowerCase() === 'resp')
          || fields.find(f => /atm_resp|resp/i.test(f.key));
        if (target) { map[rawH] = target.key; return; }
      }

      // Acquirer Bank / Institution
      if (/^(acquirer|acq|acq_inst|acq_instname|aquirer|aquirer_bank|acquirer_bank|acq_bank)$/i.test(slugH) || slugH.includes('acq') || slugH.includes('aquir')) {
        const target = fields.find(f => f.key.toLowerCase() === 'acq_inst')
          || fields.find(f => f.key.toLowerCase() === 'aquirer_bank')
          || fields.find(f => f.key.toLowerCase() === 'acqinstid')
          || fields.find(f => f.key.toLowerCase() === 'acq_instname')
          || fields.find(f => /acq|aquir/i.test(f.key));
        if (target) { map[rawH] = target.key; return; }
      }

      // Issuer Bank / Institution
      if (/^(issuer|iss|iss_inst|issuer_bank|iss_bank|issuer_id|isser_bank)$/i.test(slugH) || slugH.includes('issu') || slugH.includes('isser')) {
        const target = fields.find(f => f.key.toLowerCase() === 'issuer_id')
          || fields.find(f => f.key.toLowerCase() === 'isser_bank')
          || fields.find(f => f.key.toLowerCase() === 'issinstcc')
          || fields.find(f => f.key.toLowerCase() === 'iss_inst')
          || fields.find(f => /issuer|isser|iss_inst/i.test(f.key));
        if (target) { map[rawH] = target.key; return; }
      }

      // Reference Number / Retrieval Ref Num / Transaction ID (prioritize refnum)
      if (/^(refnum|reference_no|reference_num|referenceno|referencenum|ref_no|refno|ref_num|ref|rrn|retrieval_ref_num|retrieval_ref_no|utrnno|fe_utrnno|trans_id|tran_id|transaction_id|txnid|tx_id)$/i.test(slugH)
        || slugH.includes('refnum') || slugH.includes('reference') || slugH.includes('retrieval') || slugH.includes('utrnno')) {
        const target = fields.find(f => f.key.toLowerCase() === 'refnum')
          || fields.find(f => f.key.toLowerCase() === 'retrieval_ref_num')
          || fields.find(f => f.key.toLowerCase() === 'fe_utrnno')
          || fields.find(f => f.key.toLowerCase() === 'transaction_id')
          || fields.find(f => /refnum|transaction_id|trans_id|utrnno|retrieval_ref_num/i.test(f.key));
        if (target) { map[rawH] = target.key; return; }
      }

      // Amount / Currency Amount (prioritize reqamt)
      if (/^(reqamt|request_amt|requested_amount|req_amount|tran_amt|trans_amt|transaction_amount|txn_amount|amount|amt|val|value|interchangeamt|conamt|reqamnt|req_amnt|amnt)$/i.test(slugH)
        || slugH.includes('amount') || slugH.includes('reqamt') || slugH.includes('reqamnt') || slugH.includes('amt') || slugH.includes('amnt')) {
        const target = fields.find(f => f.key.toLowerCase() === 'reqamt')
          || fields.find(f => f.key.toLowerCase() === 'amount')
          || fields.find(f => /reqamt|amount|amt/i.test(f.key))
          || fields.find(f => /interchangeamt|conamt/i.test(f.key));
        if (target) { map[rawH] = target.key; return; }
      }

      // Card / PAN / Account (prioritize pan or hpan)
      if (/^(hpan|pan|card|card_no|card_num|card_number|cardnumber|account|acct|acct_no|acct_num|account_number|primary_account_number)$/i.test(slugH)
        || slugH.includes('card') || slugH.includes('pan')) {
        const target = fields.find(f => f.key.toLowerCase() === 'pan')
          || fields.find(f => f.key.toLowerCase() === 'hpan')
          || fields.find(f => f.key.toLowerCase() === 'card_number')
          || fields.find(f => /pan|card|acct_num/i.test(f.key));
        if (target) { map[rawH] = target.key; return; }
      }

      // Date / Timestamp / Time (prioritize trans_date or ttime or sttl_date)
      if (/^(sttl_date|settlement_date|settledate|ttime|tran_date|trandate|tran_time|trans_time|txn_time|datetime|timestamp|tr_date|trans_date|txn_date|valuedate|value_date|date|created_at|authtime)$/i.test(slugH)
        || slugH.includes('date') || slugH.includes('time')) {
        const target = fields.find(f => f.key.toLowerCase() === 'sttl_date')
          || fields.find(f => f.key.toLowerCase() === 'trans_date')
          || fields.find(f => f.key.toLowerCase() === 'ttime')
          || fields.find(f => f.key.toLowerCase() === 'transaction_date')
          || fields.find(f => f.key.toLowerCase() === 'tr_date')
          || fields.find(f => /sttl_date|trans_date|ttime|value_date|timestamp|created_at/i.test(f.key));
        if (target) { map[rawH] = target.key; return; }
      }

      // Terminal / Merchant / Device (prioritize terminal_id)
      if (/^(terminal_id|term_id|tid|terminal|merchant_id|mid|merchant|pos_id|term)$/i.test(slugH)
        || slugH.includes('terminal') || slugH.includes('term')) {
        const target = fields.find(f => f.key.toLowerCase() === 'terminal_id')
          || fields.find(f => f.key.toLowerCase() === 'terminal')
          || fields.find(f => /terminal_id|terminal|merchant_id|merchant/i.test(f.key));
        if (target) { map[rawH] = target.key; return; }
      }

      // Processing Code (prioritize prcode)
      if (/^(prcode|proc_code|processing_code|proccode|trans_type|txn_type)$/i.test(slugH)
        || slugH.includes('prcode') || slugH.includes('proccode') || slugH.includes('proc')) {
        const target = fields.find(f => f.key.toLowerCase() === 'prcode')
          || fields.find(f => /prcode|proc_code|trans_type/i.test(f.key));
        if (target) { map[rawH] = target.key; return; }
      }

      // Authorization / Approval Code (ISO 8583 F38 / Auth Log - MAP-11 / MAP-12 fix)
      if (/^(auth_code|authcode|approval_code|auth_num|auth_id|auth_log|approval|auth)$/i.test(slugH) || slugH.includes('auth') || slugH.includes('approval')) {
        const target = fields.find(f => f.key.toLowerCase() === 'auth_code')
          || fields.find(f => f.key.toLowerCase() === 'approval_code')
          || fields.find(f => f.key.toLowerCase() === 'authcode')
          || fields.find(f => /auth_code|auth_id|approval_code|auth_log|auth/i.test(f.key));
        if (target) { map[rawH] = target.key; return; }
      }

      // Status
      if (/^(status|state|stat|statusstate)$/i.test(slugH) || slugH.includes('status')) {
        const target = fields.find(f => /status|status_state/i.test(f.key));
        if (target) { map[rawH] = target.key; return; }
      }

      // Currency
      if (/^(curr|currency|currcode|currency1)$/i.test(slugH) || slugH.includes('curr')) {
        const target = fields.find(f => /currency|curr/i.test(f.key));
        if (target) { map[rawH] = target.key; return; }
      }

      // Institution / Bank
      if (/^(inst|institution|institution1|bank|bankref)$/i.test(slugH) || slugH.includes('inst')) {
        const target = fields.find(f => f.key.toLowerCase() === 'inst_id2')
          || fields.find(f => f.key.toLowerCase() === 'institution1')
          || fields.find(f => /institution|inst_id/i.test(f.key));
        if (target) { map[rawH] = target.key; return; }
      }

      // 3. Substring containment match (minimum 4 characters, avoiding collisions)
      const subMatch = fields.find(f => {
        const slugKey = f.key.toLowerCase().replace(/[-_.\s]/g, '');
        if (slugKey.length < 4) return false;
        // Don't match date fields against non-date headers
        if ((slugKey.includes('date') || slugKey.includes('time')) && !slugH.includes('date') && !slugH.includes('time')) return false;
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
   * Applies a FileIngestionMappingTemplate's columnMappings against a target file's headers
   * using a robust 7-tier matching resolution algorithm:
   * 1. Exact match (case-sensitive)
   * 2. Case-insensitive trimmed match
   * 3. Alphanumeric slug match (ignoring whitespace, underscores, dashes, punctuation)
   * 4. Positional matching (col_0, col_1, Column 1, etc.)
   * 5. Direct target key match (header directly equals the canonical target field key or its slug)
   * 6. Token / Word overlap (substring match with length >= 4)
   * 7. Fallback: autoGenerateColumnMapping against standard fields
   */
  public applyTemplateToHeaders(
    headers: string[],
    template: FileIngestionMappingTemplate,
    candidateFields?: GlobalTransactionSchemaField[]
  ): Record<string, string> {
    const result: Record<string, string> = {};
    if (!headers || !headers.length) return result;

    const tplMappings = template?.columnMappings || {};
    const standardFieldsToUse = candidateFields && candidateFields.length > 0 
      ? candidateFields 
      : (this.config.standardFields || DEFAULT_GLOBAL_STANDARD_FIELDS);

    // Build normalized lookup tables for template mappings
    const slugToTarget = new Map<string, string>();
    const lowerToTarget = new Map<string, string>();
    const targetKeysSet = new Set<string>();

    for (const [srcKey, targetKey] of Object.entries(tplMappings)) {
      if (!srcKey || !targetKey || targetKey === 'Unmapped' || targetKey === '') continue;
      const trimmedTarget = targetKey.trim();
      lowerToTarget.set(srcKey.trim().toLowerCase(), trimmedTarget);
      slugToTarget.set(srcKey.toLowerCase().replace(/[^a-z0-9]/g, ''), trimmedTarget);
      targetKeysSet.add(trimmedTarget.toLowerCase());
      slugToTarget.set(trimmedTarget.toLowerCase().replace(/[^a-z0-9]/g, ''), trimmedTarget);
    }

    // Precompute standard fields slugs
    const fieldSlugMap = new Map<string, string>();
    for (const field of standardFieldsToUse) {
      fieldSlugMap.set(field.key.toLowerCase().replace(/[^a-z0-9]/g, ''), field.key);
      if (field.label) {
        fieldSlugMap.set(field.label.toLowerCase().replace(/[^a-z0-9]/g, ''), field.key);
      }
    }

    headers.forEach((header, index) => {
      const raw = String(header || '').trim();
      if (!raw) {
        result[raw] = '';
        return;
      }

      // Tier 1: Exact match in template
      if (tplMappings[raw] && tplMappings[raw] !== 'Unmapped') {
        result[raw] = tplMappings[raw].trim();
        return;
      }

      // Tier 2: Lowercase trimmed match in template
      const lowerH = raw.toLowerCase();
      if (lowerToTarget.has(lowerH)) {
        result[raw] = lowerToTarget.get(lowerH)!;
        return;
      }

      // Tier 3: Alphanumeric slug match in template
      const slugH = lowerH.replace(/[^a-z0-9]/g, '');
      if (slugH && slugToTarget.has(slugH)) {
        result[raw] = slugToTarget.get(slugH)!;
        return;
      }

      // Tier 4: Positional matching (col_0, col_1, Column 1, etc.)
      const positionalKeys = [
        `col_${index}`,
        `col_${index + 1}`,
        `column_${index}`,
        `column_${index + 1}`,
        `Column ${index + 1}`
      ];
      for (const posKey of positionalKeys) {
        if (tplMappings[posKey] && tplMappings[posKey] !== 'Unmapped') {
          result[raw] = tplMappings[posKey].trim();
          return;
        }
      }

      // Tier 5: Direct target key match
      if (targetKeysSet.has(lowerH)) {
        result[raw] = lowerH;
        return;
      }
      for (const tKey of targetKeysSet) {
        const tSlug = tKey.replace(/[^a-z0-9]/g, '');
        if (tSlug && (tSlug === slugH || (slugH.length >= 4 && (slugH.includes(tSlug) || tSlug.includes(slugH))))) {
          result[raw] = tKey;
          return;
        }
      }

      // Tier 6: Substring containment with template keys (>= 4 chars)
      if (slugH.length >= 4) {
        for (const [tSlug, target] of slugToTarget.entries()) {
          if (tSlug.length >= 4 && (slugH.includes(tSlug) || tSlug.includes(slugH))) {
            result[raw] = target;
            return;
          }
        }
      }

      // Tier 7: Standard directory fallback auto-map
      const autoSingle = this.autoGenerateColumnMapping([raw], standardFieldsToUse);
      if (autoSingle[raw]) {
        result[raw] = autoSingle[raw];
        return;
      }

      result[raw] = '';
    });

    return result;
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
    } catch (err: any) {
      console.warn('[GlobalMappingService] Backend fetch fallback to memory state:', err.message);
    }
    return this.getConfig();
  }

  /**
   * Persists version-controlled Global Mapping configuration to backend API (MAP-09 fix)
   */
  public async saveConfigToBackend(
    optionsOrDesc?: string | { description?: string; username?: string },
    legacyUsername?: string
  ): Promise<GlobalMappingConfig> {
    let description: string | undefined;
    let username: string = 'admin';

    if (typeof optionsOrDesc === 'object' && optionsOrDesc !== null) {
      description = optionsOrDesc.description;
      username = optionsOrDesc.username || 'admin';
    } else if (typeof optionsOrDesc === 'string') {
      // Disambiguate if caller swapped: saveConfigToBackend(currentUser.username, description)
      if (legacyUsername && (legacyUsername.includes(' ') || legacyUsername.length > 20)) {
        username = optionsOrDesc;
        description = legacyUsername;
      } else {
        description = optionsOrDesc;
        username = legacyUsername || 'admin';
      }
    }

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
   * Pre-flight Gate: Validates required columns based on caller/template requirements.
   * If candidateFields are explicitly provided (e.g. from a FileIngestionMappingTemplate or caller),
   * only those fields are enforced.
   * If candidateFields is omitted or empty, no global required columns are enforced,
   * eliminating rigid global column collision across heterogeneous feeds.
   */
  public validateRequiredColumns(
    fileMapping: Record<string, string>,
    candidateFields?: { key: string; label?: string; required?: boolean }[]
  ): RequiredColumnValidationResult {
    const requiredFields = candidateFields ? candidateFields.filter(f => f.required) : [];

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

  /**
   * Template-level pre-flight gate: Validates that all required columns mandated by a saved
   * FileIngestionMappingTemplate or Hashtag directive are present in either the file's raw headers
   * or mapped target keys.
   */
  public validateTemplateRequiredColumns(
    rawHeaders: string[],
    fileMapping: Record<string, string>,
    templateRequiredColumns: string[]
  ): RequiredColumnValidationResult {
    if (!templateRequiredColumns || templateRequiredColumns.length === 0) {
      return {
        isValid: true,
        missingRequiredKeys: [],
        missingRequiredLabels: [],
        mappedRequiredCount: 0,
        totalRequiredCount: 0
      };
    }

    const normalizedRaw = new Set(rawHeaders.map(h => h.trim().toLowerCase()));
    const mappedTargetKeys = new Set(
      Object.values(fileMapping)
        .filter(k => k && k !== 'unmapped' && k.trim() !== '')
        .map(k => k.trim().toLowerCase())
    );

    const missing = templateRequiredColumns.filter(req => {
      const lower = req.trim().toLowerCase();
      return !normalizedRaw.has(lower) && !mappedTargetKeys.has(lower);
    });

    return {
      isValid: missing.length === 0,
      missingRequiredKeys: missing,
      missingRequiredLabels: missing,
      mappedRequiredCount: templateRequiredColumns.length - missing.length,
      totalRequiredCount: templateRequiredColumns.length
    };
  }

}

export const globalMappingService = GlobalMappingService.getInstance();


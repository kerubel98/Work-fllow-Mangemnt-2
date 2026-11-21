/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getPostgresPool, isPostgresConnected } from '../config/postgres.js';
import { postgresRepo } from '../store/postgresRepo.js';
import { GlobalStandardDirectoryRecord, DatabaseConnection } from '../types.js';
import { discoverTablesForDb, getTableColumnsForDb, ColumnMetadata } from './dbConnectionManager.js';

export function mapSqlTypeToCanonical(sqlType: string): 'string' | 'number' | 'date' | 'boolean' {
  const t = (sqlType || '').toUpperCase();
  if (t.includes('INT') || t.includes('NUMERIC') || t.includes('DECIMAL') || t.includes('FLOAT') || t.includes('DOUBLE') || t.includes('REAL')) {
    return 'number';
  }
  if (t.includes('TIME') || t.includes('DATE')) {
    return 'date';
  }
  if (t.includes('BOOL') || t === 'BIT' || t === 'TINYINT(1)') {
    return 'boolean';
  }
  return 'string';
}

export function formatColumnLabel(name: string): string {
  return name
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, l => l.toUpperCase());
}

export function classifyColumn(key: string, label: string = '', dataType: string = 'string'): string {
  const k = (key || '').toLowerCase().trim();
  const l = (label || '').toLowerCase().trim();
  const combo = `${k} ${l}`;

  // 1. Audit & Timestamps
  if (
    /(^|_)(date|time|timestamp|datetime|created|updated|settlement_?date|val_?date|posting_?date|auth_?time|post_?date|sys_?date|hour|year|month|day|c012|c015|c030|c031)($|_)/i.test(k) ||
    dataType === 'date' ||
    combo.includes('date') ||
    combo.includes('timestamp') ||
    combo.includes('created at') ||
    combo.includes('time')
  ) {
    return 'Audit & Timestamps';
  }

  // 2. Financial & Amounts
  if (
    /(^|_)(amt|amount|reqamt|conamt|fee|fee_?amt|charge|rate|convertrate|bal|balance|acctbal|netbal|tax|surcharge|interchange|price|curr|currency|val|cost|addlamt|repamts|unpaid_amnt|bills|moneytp|loy_multiplier|institacctcurr|c004|c005|c006|c049|c050|c051|c054)($|_)/i.test(k) ||
    k.startsWith('amnt') ||
    k.startsWith('acctbal') ||
    k.startsWith('netbal') ||
    k.startsWith('bills') ||
    k.includes('cur_exp') ||
    k.includes('pres_cur') ||
    k.includes('tran_cur') ||
    k.includes('pay_cur') ||
    combo.includes('amount') ||
    combo.includes('fee') ||
    combo.includes('balance') ||
    combo.includes('rate') ||
    combo.includes('currency') ||
    (dataType === 'number' && (k.includes('amt') || k.includes('usd') || k.includes('val') || k.includes('bal')))
  ) {
    return 'Financial & Amounts';
  }

  // 3. Card & Account
  if (
    /(^|_)(pan|hpan|card|pan_?masked|card_?number|card_?num|acc_?num|account|acct|iban|bban|bin|cvv|cvc|exp_?date|expiry|wallet|token|track1|track2|panext|pinblk|pin_captcode|bertlv|chip_pin|visa_data|emv|cardtp|cardaccidc|cardissid|cardseqno|c002|c022|c023|c037|c048|c055|c071)($|_)/i.test(k) ||
    k.startsWith('acct1') ||
    k.startsWith('acct2') ||
    k.startsWith('dest_acct') ||
    k.startsWith('emv_') ||
    k.startsWith('cup_emv') ||
    k.startsWith('p0148') ||
    k.startsWith('p0159') ||
    combo.includes('card number') ||
    combo.includes('card pan') ||
    combo.includes('account number') ||
    combo.includes('cardholder') ||
    combo.includes('track') ||
    combo.includes('emv')
  ) {
    return 'Card & Account';
  }

  // 4. Network & Clearing
  if (
    /(^|_)(acquirer|acq|issuer|iss|bank|switch|channel|network|source_?feed|gateway|institution|bic|routing|acqinstcc|acqinstid|finst_cc|forinstid|inst_id|institution|issinstcc|netcode|netdata|ntwkseqno|nwindicator|othinstid|settlement_type|sttl|sttt|iin|ain|c032|c033|c093|c094|c095|c100|c102|c103)($|_)/i.test(k) ||
    k.startsWith('inst_') ||
    k.startsWith('institution') ||
    combo.includes('acquirer') ||
    combo.includes('issuer') ||
    combo.includes('switch') ||
    combo.includes('network') ||
    combo.includes('clearing') ||
    combo.includes('channel')
  ) {
    return 'Network & Clearing';
  }

  // 5. Merchant & POS
  if (
    /(^|_)(merchant|mid|mcc|term|terminal|tid|pos|store|shop|retailer|outlet|agent|poscondc|posentrycc|posgeog|tran_place|c014|c024|c025|c026|c043)($|_)/i.test(k) ||
    k.startsWith('agent') ||
    k.startsWith('c043_') ||
    combo.includes('merchant') ||
    combo.includes('terminal') ||
    combo.includes('store') ||
    combo.includes('point of sale') ||
    combo.includes('pos')
  ) {
    return 'Merchant & POS';
  }

  // 6. Customer & Account Holder
  if (
    /(^|_)(customer|user|client|buyer|holder|email|phone|mobile|name|fname|lname|address|city|country|postal_code|cdhldr|lang_code)($|_)/i.test(k) ||
    combo.includes('customer') ||
    combo.includes('user') ||
    combo.includes('email') ||
    combo.includes('client') ||
    combo.includes('address')
  ) {
    return 'Customer & Account Holder';
  }

  // 7. Lifecycle & Status
  if (
    /(^|_)(status|state|status_?state|response|responce|resp|resp_?code|response_?code|action|result|verdict|dispute|chargeback|phase|stage|flag|atm_resp|auth_end|auth_flags|auth_scheme|auth_start|canceled|cb_reason|check_type|completecode|declined|deleted|down|eci|fe_type|final_stat|fintran|fn|format_code|fraud_type|host_ind|host_rcvd|host_tape|impact|incoming|incremental|invalid|matc_reason|msgtype|mtid|multinat|origmsgtp|prcode|program_ind|reason|reject|rejected|respone_code|respreq|reversal|rjctrtn|rpt|service_code|stood_in_for|trans_stat|trans_type|validation_code|c039)($|_)/i.test(k) ||
    k.startsWith('resp') ||
    k.startsWith('reversal') ||
    k.includes('reason') ||
    combo.includes('status') ||
    combo.includes('response') ||
    combo.includes('code') ||
    combo.includes('dispute') ||
    combo.includes('lifecycle') ||
    combo.includes('declined')
  ) {
    return 'Lifecycle & Status';
  }

  // 8. Identity & Reference
  if (
    /(^|_)(id|txnid|txn_id|utrnno|utrn|fe_utrnno|rrn|retrieval|stan|trace|auth_?id|auth_?code|authidresp|ref_?num|match_?num|recno|posting_?recno|record_?no|batch_?id|batch_?seq|seq_?num|seqno|uuid|guid|atmid|cancel_rn|destid|fin_rn|invoice_number|netrefnum|order_number|orgdata|orgdev|orgid|other_ref|proc_number|receiveid|rej_ref|shipment_no|smsgno|tr_log_ref|row_number|task_id|c011|c038|c041|c042)($|_)/i.test(k) ||
    k.startsWith('p100') ||
    k.startsWith('p200') ||
    k.startsWith('p201') ||
    k.startsWith('_raw_') ||
    k.startsWith('_row_') ||
    combo.includes('transaction id') ||
    combo.includes('reference') ||
    combo.includes('retrieval ref') ||
    combo.includes('trace number') ||
    combo.includes('auth id') ||
    combo.includes('sequence') ||
    combo.includes('authorization id')
  ) {
    return 'Identity & Reference';
  }

  // 9. Reconciliation & Operational
  if (
    /(^|_)(recon|match|discrepancy|variance|tolerance|rule|job|batch|staged)($|_)/i.test(k) ||
    combo.includes('recon') ||
    combo.includes('reconciliation') ||
    combo.includes('match')
  ) {
    return 'Reconciliation & Operations';
  }

  return 'General';
}

export class GlobalSchemaDiscoveryService {
  /**
   * Discover and harvest columns from all connected databases and PostgreSQL mirror tables into Global Standard Directory.
   */
  public static async discoverFromAllDatabases(userId: string = 'system'): Promise<{
    discoveredCount: number;
    fields: GlobalStandardDirectoryRecord[];
    scannedTables: { dbName: string; tableName: string; columnCount: number }[];
  }> {
    const scannedTables: { dbName: string; tableName: string; columnCount: number }[] = [];
    const fieldsMap = new Map<string, GlobalStandardDirectoryRecord>();

    // 1. Get existing directory records so we preserve any custom metadata/labels
    let existingFields: GlobalStandardDirectoryRecord[] = [];
    if (isPostgresConnected) {
      try {
        existingFields = await postgresRepo.getGlobalStandardDirectory();
      } catch (err: any) {
        console.warn('[Discovery] Failed to read existing directory from PG:', err.message);
      }
    }
    for (const f of existingFields) {
      fieldsMap.set(f.key.toLowerCase(), { ...f });
    }

    // 2. Fetch all registered databases
    let databases: DatabaseConnection[] = [];
    if (isPostgresConnected) {
      try {
        databases = await postgresRepo.getDatabaseConnections();
      } catch (err: any) {
        console.warn('[Discovery] Failed to read databases from PG:', err.message);
      }
    }

    // 3. Scan each registered database connection
    for (const db of databases) {
      let tables: string[] = [];
      try {
        tables = await discoverTablesForDb(db);
      } catch (err: any) {
        console.warn(`[Discovery] Could not discover tables for db '${db.name}':`, err.message);
        if (db.allowedTables && db.allowedTables.length > 0) {
          tables = db.allowedTables;
        }
      }

      for (const tableName of tables) {
        let columns: ColumnMetadata[] = [];
        try {
          columns = await getTableColumnsForDb(db, tableName);
        } catch (err: any) {
          console.warn(`[Discovery] Could not fetch columns for '${db.name}.${tableName}':`, err.message);
          // Fallback: check if a mirror table exists in PostgreSQL
          columns = await this.getMirrorTableColumnsFallback(db.id, tableName);
        }

        if (columns.length > 0) {
          scannedTables.push({
            dbName: db.name || db.id,
            tableName,
            columnCount: columns.length
          });

          this.mergeColumnsIntoFieldsMap(fieldsMap, columns, db.name || db.id, tableName, userId);
        }
      }
    }

    // 4. Also scan any PostgreSQL mirror tables directly in PostgreSQL public schema
    if (isPostgresConnected) {
      try {
        const pool = getPostgresPool();
        const { rows } = await pool.query<{ tablename: string }>(
          `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'mirror_%' ORDER BY tablename;`
        );
        for (const r of rows) {
          const mirrorCols = await this.getPostgresTableColumns(r.tablename);
          if (mirrorCols.length > 0) {
            scannedTables.push({
              dbName: 'PostgreSQL Mirror',
              tableName: r.tablename,
              columnCount: mirrorCols.length
            });
            this.mergeColumnsIntoFieldsMap(fieldsMap, mirrorCols, 'PostgreSQL Mirror', r.tablename, userId);
          }
        }
      } catch (err: any) {
        console.warn('[Discovery] Failed to scan PostgreSQL mirror tables:', err.message);
      }
    }

    // 5. Persist all discovered fields into PostgreSQL and memory store
    const finalFields = Array.from(fieldsMap.values());
    if (isPostgresConnected) {
      for (const field of finalFields) {
        try {
          await postgresRepo.saveGlobalStandardDirectoryField(field);
        } catch (err: any) {
          console.warn(`[Discovery] Failed to save field '${field.key}':`, err.message);
        }
      }
      await postgresRepo.syncDirectoryToGlobalSchemaConfig();
    }

    return {
      discoveredCount: finalFields.length,
      fields: finalFields,
      scannedTables
    };
  }

  /**
   * Import columns from a single specified database table.
   */
  public static async importFromTable(
    dbId: string,
    tableName: string,
    userId: string = 'system'
  ): Promise<{
    importedCount: number;
    fields: GlobalStandardDirectoryRecord[];
    tableName: string;
  }> {
    let db: DatabaseConnection | null = null;
    if (isPostgresConnected) {
      db = await postgresRepo.getDatabaseConnectionById(dbId);
    }

    let columns: ColumnMetadata[] = [];
    let dbName = db ? (db.name || db.id) : dbId;

    if (db) {
      try {
        columns = await getTableColumnsForDb(db, tableName);
      } catch (err: any) {
        console.warn(`[ImportTable] Live query failed, falling back to mirror:`, err.message);
        columns = await this.getMirrorTableColumnsFallback(db.id, tableName);
      }
    } else {
      // Direct PostgreSQL table inspection
      columns = await this.getPostgresTableColumns(tableName);
      dbName = 'PostgreSQL';
    }

    if (columns.length === 0) {
      throw new Error(`No columns found for table '${tableName}' in database '${dbName}'`);
    }

    const fieldsMap = new Map<string, GlobalStandardDirectoryRecord>();
    let existingFields: GlobalStandardDirectoryRecord[] = [];
    if (isPostgresConnected) {
      existingFields = await postgresRepo.getGlobalStandardDirectory();
    }
    for (const f of existingFields) {
      fieldsMap.set(f.key.toLowerCase(), { ...f });
    }

    this.mergeColumnsIntoFieldsMap(fieldsMap, columns, dbName, tableName, userId);

    const newlyImported: GlobalStandardDirectoryRecord[] = [];
    for (const col of columns) {
      const cleanKey = col.name.trim().toLowerCase().replace(/[\s-]+/g, '_');
      const rec = fieldsMap.get(cleanKey);
      if (rec) {
        if (isPostgresConnected) {
          await postgresRepo.saveGlobalStandardDirectoryField(rec);
        }
        newlyImported.push(rec);
      }
    }

    if (isPostgresConnected) {
      await postgresRepo.syncDirectoryToGlobalSchemaConfig();
    }

    return {
      importedCount: newlyImported.length,
      fields: newlyImported,
      tableName
    };
  }

  /**
   * Helper to merge column metadata into the fields map.
   */
  private static mergeColumnsIntoFieldsMap(
    fieldsMap: Map<string, GlobalStandardDirectoryRecord>,
    columns: ColumnMetadata[],
    dbName: string,
    tableName: string,
    userId: string
  ): void {
    const now = new Date().toISOString();

    for (const col of columns) {
      const rawName = col.name.trim();
      const cleanKey = rawName.toLowerCase().replace(/[\s-]+/g, '_');

      // Skip internal framework audit columns if any
      if (cleanKey === '_synced_at' || cleanKey === '_source_file' || cleanKey === '_source_folder') {
        continue;
      }

      const sourceNote = `Discovered from database '${dbName}', table '${tableName}'`;

      if (fieldsMap.has(cleanKey)) {
        const existing = fieldsMap.get(cleanKey)!;
        const currentNotes = existing.notes || '';
        if (!currentNotes.includes(tableName)) {
          existing.notes = currentNotes ? `${currentNotes} | ${sourceNote}` : sourceNote;
        }
        existing.updated_at = now;
      } else {
        const canonicalType = mapSqlTypeToCanonical(col.type);
        const label = formatColumnLabel(rawName);

        const autoCategory = classifyColumn(cleanKey, label, canonicalType);

        const newRecord: GlobalStandardDirectoryRecord = {
          id: `gsd-${cleanKey}`,
          key: cleanKey,
          label,
          description: `Physical database column from ${tableName} (${col.type})`,
          dataType: canonicalType,
          required: col.nullable === false,
          isStandard: true,
          exampleValue: '',
          category: autoCategory,
          notes: sourceNote,
          user_id: userId,
          created_at: now,
          updated_at: now
        };

        fieldsMap.set(cleanKey, newRecord);
      }
    }
  }

  /**
   * Batch import fields from an external array (e.g. JSON schema import).
   */
  public static async batchImportFields(
    rawFields: any[],
    autoClassify: boolean = true,
    userId: string = 'system'
  ): Promise<{
    importedCount: number;
    fields: GlobalStandardDirectoryRecord[];
  }> {
    const now = new Date().toISOString();
    const importedRecords: GlobalStandardDirectoryRecord[] = [];

    // Read existing fields so we can merge
    let existingFields: GlobalStandardDirectoryRecord[] = [];
    if (isPostgresConnected) {
      try {
        existingFields = await postgresRepo.getGlobalStandardDirectory();
      } catch (err: any) {
        console.warn('[BatchImport] Error reading existing directory:', err.message);
      }
    }

    const fieldsMap = new Map<string, GlobalStandardDirectoryRecord>();
    for (const f of existingFields) {
      fieldsMap.set(f.key.toLowerCase(), { ...f });
    }

    for (const raw of rawFields) {
      if (!raw || typeof raw !== 'object') continue;
      const rawKey = raw.key || raw.field_name || raw.name;
      if (!rawKey) continue;

      const cleanKey = String(rawKey).trim().toLowerCase().replace(/[\s-]+/g, '_');
      const label = raw.label || raw.display_name || formatColumnLabel(cleanKey);
      const canonicalType = raw.dataType ? raw.dataType : mapSqlTypeToCanonical(raw.type || raw.data_type || 'string');
      const isRequired = !!(raw.required ?? raw.is_required ?? raw.isRequired ?? false);

      let category = raw.category;
      if (!category || category === 'General' || autoClassify) {
        const autoCat = classifyColumn(cleanKey, label, canonicalType);
        if (autoCat !== 'General' || !category) {
          category = autoCat;
        }
      }

      const rec: GlobalStandardDirectoryRecord = {
        id: raw.id || fieldsMap.get(cleanKey)?.id || `gsd-${cleanKey}`,
        key: cleanKey,
        label: String(label).trim(),
        description: raw.description !== undefined ? String(raw.description) : (fieldsMap.get(cleanKey)?.description || ''),
        dataType: canonicalType,
        required: isRequired,
        isStandard: raw.isStandard !== undefined ? !!raw.isStandard : (fieldsMap.get(cleanKey)?.isStandard ?? true),
        exampleValue: raw.exampleValue !== undefined ? String(raw.exampleValue) : (fieldsMap.get(cleanKey)?.exampleValue || ''),
        category: category || 'General',
        notes: raw.notes || fieldsMap.get(cleanKey)?.notes || 'Imported via JSON Schema',
        user_id: raw.user_id || userId,
        created_at: raw.created_at || fieldsMap.get(cleanKey)?.created_at || now,
        updated_at: now
      };

      fieldsMap.set(cleanKey, rec);
      importedRecords.push(rec);

      if (isPostgresConnected) {
        try {
          await postgresRepo.saveGlobalStandardDirectoryField(rec);
        } catch (err: any) {
          console.warn(`[BatchImport] Failed to save field '${rec.key}':`, err.message);
        }
      }
    }

    if (isPostgresConnected) {
      await postgresRepo.syncDirectoryToGlobalSchemaConfig();
    }

    const allFields = Array.from(fieldsMap.values());

    return {
      importedCount: importedRecords.length,
      fields: allFields
    };
  }

  /**
   * Auto-classify all existing directory fields based on column semantics and nomenclature.
   */
  public static async autoClassifyAllFields(): Promise<{
    classifiedCount: number;
    fields: GlobalStandardDirectoryRecord[];
  }> {
    let fields: GlobalStandardDirectoryRecord[] = [];
    if (isPostgresConnected) {
      fields = await postgresRepo.getGlobalStandardDirectory();
    }

    let changedCount = 0;
    const updatedFields: GlobalStandardDirectoryRecord[] = [];

    for (const f of fields) {
      const autoCat = classifyColumn(f.key, f.label, f.dataType);
      if (autoCat && autoCat !== 'General' && autoCat !== f.category) {
        f.category = autoCat;
        f.updated_at = new Date().toISOString();
        changedCount++;
      }
      updatedFields.push(f);
      if (isPostgresConnected) {
        await postgresRepo.saveGlobalStandardDirectoryField(f);
      }
    }

    if (isPostgresConnected) {
      await postgresRepo.syncDirectoryToGlobalSchemaConfig();
    }

    return {
      classifiedCount: changedCount,
      fields: updatedFields
    };
  }

  /**
   * Read columns from a PostgreSQL mirror table if the external DB is temporarily unreachable.
   */
  private static async getMirrorTableColumnsFallback(dbId: string, tableName: string): Promise<ColumnMetadata[]> {
    if (!isPostgresConnected) return [];
    try {
      const cleanDb = dbId.toLowerCase().replace(/[^a-z0-9]/g, '_');
      const cleanTable = tableName.toLowerCase().replace(/[^a-z0-9]/g, '_');
      const mirrorName = `mirror_${cleanDb}_${cleanTable}`;
      return await this.getPostgresTableColumns(mirrorName);
    } catch {
      return [];
    }
  }

  /**
   * Direct inspection of a table in PostgreSQL's public schema.
   */
  private static async getPostgresTableColumns(tableName: string): Promise<ColumnMetadata[]> {
    if (!isPostgresConnected) return [];
    try {
      const pool = getPostgresPool();
      const { rows } = await pool.query<{ name: string; type: string; nullable: string; is_primary: boolean }>(
        `SELECT c.column_name AS name, c.data_type AS type, c.is_nullable AS nullable,
                CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END AS is_primary
         FROM information_schema.columns c
         LEFT JOIN (
           SELECT ku.column_name
           FROM information_schema.table_constraints tc
           JOIN information_schema.key_column_usage ku
             ON tc.constraint_name = ku.constraint_name
            AND tc.table_schema = ku.table_schema
           WHERE tc.constraint_type = 'PRIMARY KEY'
             AND tc.table_schema = 'public'
             AND tc.table_name = $1
         ) pk ON c.column_name = pk.column_name
         WHERE c.table_schema = 'public' AND c.table_name = $1
         ORDER BY c.ordinal_position;`,
        [tableName]
      );

      return rows.map(r => ({
        name: r.name,
        type: String(r.type).toUpperCase(),
        nullable: r.nullable === 'YES',
        isPrimary: r.is_primary
      }));
    } catch (err: any) {
      console.warn(`[getPostgresTableColumns] Error reading '${tableName}':`, err.message);
      return [];
    }
  }
}

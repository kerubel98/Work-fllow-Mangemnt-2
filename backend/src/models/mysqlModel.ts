import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { ensureDocumentTable, getMySqlPool } from '../config/mysql.js';

type AnyRecord = Record<string, any>;
type SortSpec = Record<string, 1 | -1>;

function getPath(value: AnyRecord, path: string): any {
  return path.split('.').reduce((current, key) => current == null ? undefined : current[key], value);
}

function matches(document: AnyRecord, filter: AnyRecord = {}): boolean {
  return Object.entries(filter).every(([key, expected]) => {
    if (key === '$or') return expected.some((branch: AnyRecord) => matches(document, branch));
    const actual = getPath(document, key);
    if (expected instanceof RegExp) return expected.test(String(actual ?? ''));
    if (expected && typeof expected === 'object' && '$regex' in expected) {
      return new RegExp(String(expected.$regex), expected.$options || '').test(String(actual ?? ''));
    }
    return actual === expected;
  });
}

class MysqlQuery<T extends AnyRecord> implements PromiseLike<T[]> {
  private sortSpec: SortSpec | null = null;
  private maxRows: number | null = null;

  constructor(private readonly collection: string, private readonly filter: AnyRecord = {}, private readonly single = false) {}

  sort(spec: SortSpec): this { this.sortSpec = spec; return this; }
  limit(rows: number): this { this.maxRows = rows; return this; }
  lean(): this { return this; }

  async exec(): Promise<any> {
    await ensureDocumentTable();
    const [rows] = await getMySqlPool().execute<RowDataPacket[]>(`SELECT document FROM \`${this.collection}\``);
    let documents = rows.map((row: any) => typeof row.document === 'string' ? JSON.parse(row.document) : row.document).filter((doc: AnyRecord) => matches(doc, this.filter));
    if (this.sortSpec) {
      documents.sort((left: any, right: any) => {
        for (const [key, direction] of Object.entries(this.sortSpec!)) {
          const a = getPath(left, key); const b = getPath(right, key);
          if (a === b) continue;
          return (a > b ? 1 : -1) * direction;
        }
        return 0;
      });
    }
    if (this.maxRows !== null) documents = documents.slice(0, this.maxRows);
    return this.single ? (documents[0] || null) : documents;
  }

  then<TResult1 = any, TResult2 = never>(onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null): PromiseLike<TResult1 | TResult2> {
    return this.exec().then(onfulfilled, onrejected);
  }
}

export function mysqlModel<T extends AnyRecord>(collection: string): any {
  return {
    find: (filter: AnyRecord = {}) => new MysqlQuery<T>(collection, filter),
    findOne: (filter: AnyRecord = {}) => new MysqlQuery<T>(collection, filter, true),
    countDocuments: async (filter: AnyRecord = {}) => (await new MysqlQuery<T>(collection, filter).exec()).length,
    create: async (document: T) => { await saveDocument(collection, document); return document; },
    insertMany: async (documents: T[]) => { for (const document of documents) await saveDocument(collection, document); return documents; },
    findOneAndUpdate: async (filter: AnyRecord, update: AnyRecord, options: { new?: boolean } = {}) => {
      const current = await new MysqlQuery<T>(collection, filter, true).exec();
      if (!current) return null;
      const updated = applyUpdate(current, update);
      await saveDocument(collection, updated);
      return options.new === false ? current : updated;
    },
    findOneAndDelete: async (filter: AnyRecord) => {
      const current = await new MysqlQuery<T>(collection, filter, true).exec();
      if (current) await deleteDocument(collection, current.id);
      return current;
    },
    deleteOne: async (filter: AnyRecord) => {
      const current = await new MysqlQuery<T>(collection, filter, true).exec();
      if (current) await deleteDocument(collection, current.id);
      return { deletedCount: current ? 1 : 0 };
    },
    deleteMany: async (filter: AnyRecord = {}) => {
      const current = await new MysqlQuery<T>(collection, filter).exec();
      for (const document of current) await deleteDocument(collection, document.id);
      return { deletedCount: current.length };
    },
    updateMany: async (filter: AnyRecord, update: AnyRecord) => {
      const current = await new MysqlQuery<T>(collection, filter).exec();
      for (const document of current) await saveDocument(collection, applyUpdate(document, update));
      return { modifiedCount: current.length };
    },
    createCollection: async () => ensureDocumentTable(),
    collection: { createIndex: async () => undefined }
  };
}

function applyUpdate(document: AnyRecord, update: AnyRecord): AnyRecord {
  const updated = { ...document };
  if (update.$push) {
    for (const [key, value] of Object.entries(update.$push)) {
      updated[key] = [...(Array.isArray(updated[key]) ? updated[key] : []), value];
    }
  }
  if (update.$set) Object.assign(updated, update.$set);
  for (const [key, value] of Object.entries(update)) {
    if (!key.startsWith('$')) updated[key] = value;
  }
  return updated;
}

async function saveDocument(collection: string, document: AnyRecord): Promise<void> {
  await ensureDocumentTable();
  const id = String(document.id || document._id || `${Date.now()}-${Math.random()}`);
  await getMySqlPool().execute<ResultSetHeader>(
    `INSERT INTO \`${collection}\` (document_id, document)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE document = VALUES(document), updated_at = CURRENT_TIMESTAMP(3)`,
    [id, JSON.stringify({ ...document, id })]
  );
}

async function deleteDocument(collection: string, id: string): Promise<void> {
  await ensureDocumentTable();
  await getMySqlPool().execute(`DELETE FROM \`${collection}\` WHERE document_id = ?`, [id]);
}

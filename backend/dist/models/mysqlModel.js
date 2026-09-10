import { ensureDocumentTable, getMySqlPool } from '../config/mysql.js';
function getPath(value, path) {
    return path.split('.').reduce((current, key) => current == null ? undefined : current[key], value);
}
function matches(document, filter = {}) {
    return Object.entries(filter).every(([key, expected]) => {
        if (key === '$or')
            return expected.some((branch) => matches(document, branch));
        const actual = getPath(document, key);
        if (expected instanceof RegExp)
            return expected.test(String(actual ?? ''));
        if (expected && typeof expected === 'object' && '$regex' in expected) {
            return new RegExp(String(expected.$regex), expected.$options || '').test(String(actual ?? ''));
        }
        return actual === expected;
    });
}
class MysqlQuery {
    collection;
    filter;
    single;
    sortSpec = null;
    maxRows = null;
    constructor(collection, filter = {}, single = false) {
        this.collection = collection;
        this.filter = filter;
        this.single = single;
    }
    sort(spec) { this.sortSpec = spec; return this; }
    limit(rows) { this.maxRows = rows; return this; }
    lean() { return this; }
    async exec() {
        await ensureDocumentTable();
        const [rows] = await getMySqlPool().execute(`SELECT document FROM \`${this.collection}\``);
        let documents = rows.map((row) => typeof row.document === 'string' ? JSON.parse(row.document) : row.document).filter((doc) => matches(doc, this.filter));
        if (this.sortSpec) {
            documents.sort((left, right) => {
                for (const [key, direction] of Object.entries(this.sortSpec)) {
                    const a = getPath(left, key);
                    const b = getPath(right, key);
                    if (a === b)
                        continue;
                    return (a > b ? 1 : -1) * direction;
                }
                return 0;
            });
        }
        if (this.maxRows !== null)
            documents = documents.slice(0, this.maxRows);
        return this.single ? (documents[0] || null) : documents;
    }
    then(onfulfilled, onrejected) {
        return this.exec().then(onfulfilled, onrejected);
    }
}
export function mysqlModel(collection) {
    return {
        find: (filter = {}) => new MysqlQuery(collection, filter),
        findOne: (filter = {}) => new MysqlQuery(collection, filter, true),
        countDocuments: async (filter = {}) => (await new MysqlQuery(collection, filter).exec()).length,
        create: async (document) => { await saveDocument(collection, document); return document; },
        insertMany: async (documents) => { for (const document of documents)
            await saveDocument(collection, document); return documents; },
        findOneAndUpdate: async (filter, update, options = {}) => {
            const current = await new MysqlQuery(collection, filter, true).exec();
            if (!current)
                return null;
            const updated = applyUpdate(current, update);
            await saveDocument(collection, updated);
            return options.new === false ? current : updated;
        },
        findOneAndDelete: async (filter) => {
            const current = await new MysqlQuery(collection, filter, true).exec();
            if (current)
                await deleteDocument(collection, current.id);
            return current;
        },
        deleteOne: async (filter) => {
            const current = await new MysqlQuery(collection, filter, true).exec();
            if (current)
                await deleteDocument(collection, current.id);
            return { deletedCount: current ? 1 : 0 };
        },
        deleteMany: async (filter = {}) => {
            const current = await new MysqlQuery(collection, filter).exec();
            for (const document of current)
                await deleteDocument(collection, document.id);
            return { deletedCount: current.length };
        },
        updateMany: async (filter, update) => {
            const current = await new MysqlQuery(collection, filter).exec();
            for (const document of current)
                await saveDocument(collection, applyUpdate(document, update));
            return { modifiedCount: current.length };
        },
        createCollection: async () => ensureDocumentTable(),
        collection: { createIndex: async () => undefined }
    };
}
function applyUpdate(document, update) {
    const updated = { ...document };
    if (update.$push) {
        for (const [key, value] of Object.entries(update.$push)) {
            updated[key] = [...(Array.isArray(updated[key]) ? updated[key] : []), value];
        }
    }
    if (update.$set)
        Object.assign(updated, update.$set);
    for (const [key, value] of Object.entries(update)) {
        if (!key.startsWith('$'))
            updated[key] = value;
    }
    return updated;
}
async function saveDocument(collection, document) {
    await ensureDocumentTable();
    const id = String(document.id || document._id || `${Date.now()}-${Math.random()}`);
    await getMySqlPool().execute(`INSERT INTO \`${collection}\` (document_id, document)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE document = VALUES(document), updated_at = CURRENT_TIMESTAMP(3)`, [id, JSON.stringify({ ...document, id })]);
}
async function deleteDocument(collection, id) {
    await ensureDocumentTable();
    await getMySqlPool().execute(`DELETE FROM \`${collection}\` WHERE document_id = ?`, [id]);
}

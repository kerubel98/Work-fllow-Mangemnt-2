import mongoose, { Schema } from 'mongoose';
const QueryColumnSchema = new Schema({
    sourceColumn: { type: String, required: true },
    alias: { type: String },
    dataType: { type: String },
    required: { type: Boolean, default: true },
    usedByRuleIds: [{ type: String }]
}, { _id: false });
const QueryKeyMappingSchema = new Schema({
    inputField: { type: String, required: true },
    sourceField: { type: String, required: true },
    required: { type: Boolean, default: true }
}, { _id: false });
const QueryFilterSchema = new Schema({
    field: { type: String, required: true },
    operator: { type: String, required: true },
    value: { type: Schema.Types.Mixed }
}, { _id: false });
const BatchPolicySchema = new Schema({
    maxRowsPerBatch: { type: Number, default: 5000 },
    maxQueryKeys: { type: Number, default: 1000 },
    maxPayloadSizeMb: { type: Number, default: 10 },
    maxExecutionTimeMs: { type: Number, default: 30000 }
}, { _id: false });
const QueryExtractionSchema = new Schema({
    id: { type: String, required: true, unique: true },
    workflowId: { type: String, required: true },
    stageId: { type: String, required: true },
    targetDbId: { type: String, default: 'db-1' },
    targetDataSource: { type: String, required: true },
    selectedColumns: [QueryColumnSchema],
    keyMappings: [QueryKeyMappingSchema],
    filters: [QueryFilterSchema],
    batchPolicy: BatchPolicySchema,
    enabled: { type: Boolean, default: true }
}, { timestamps: true });
export const QueryExtractionModel = mongoose.models.QueryExtraction ||
    mongoose.model('QueryExtraction', QueryExtractionSchema);

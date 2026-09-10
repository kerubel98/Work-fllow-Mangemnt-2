import mongoose, { Schema } from 'mongoose';
const TransactionKeyFieldSchema = new Schema({
    key: { type: String, required: true },
    label: { type: String, required: true },
    description: { type: String, default: '' },
    dataType: { type: String, required: true },
    required: { type: Boolean, default: false },
    exampleValue: { type: Schema.Types.Mixed },
    isSystemStandard: { type: Boolean, default: false }
}, { _id: false });
const GlobalTransactionSchemaConfigSchema = new Schema({
    id: { type: String, required: true, unique: true },
    version: { type: String, default: '2.3.0' },
    defaultTemplateId: { type: String, default: 'tpl-1' },
    systemStandardFields: [TransactionKeyFieldSchema],
    customFields: [TransactionKeyFieldSchema],
    standardFields: { type: [Schema.Types.Mixed], default: [] },
    tableMappings: { type: Schema.Types.Mixed, default: {} },
    versionHistory: { type: [Schema.Types.Mixed], default: [] },
    strictMappingEnforced: { type: Boolean, default: true },
    updatedAt: { type: String, default: () => new Date().toISOString() },
    updatedBy: { type: String, default: 'system' }
}, { timestamps: true, strict: false });
export const GlobalTransactionSchemaConfigModel = mongoose.model('GlobalTransactionSchemaConfig', GlobalTransactionSchemaConfigSchema);

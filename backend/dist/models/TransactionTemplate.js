import mongoose, { Schema } from 'mongoose';
const ColumnMappingRuleSchema = new Schema({
    sourceHeader: { type: String, required: true },
    targetFieldKey: { type: String, required: true },
    targetFieldLabel: { type: String, required: true },
    dataType: { type: String, required: true },
    required: { type: Boolean, default: false },
    transformationRule: { type: String, default: 'none' },
    defaultValue: { type: Schema.Types.Mixed },
    sampleSourceValue: { type: String, default: '' },
    sampleMappedValue: { type: String, default: '' },
    isValid: { type: Boolean, default: true },
    validationMessage: { type: String, default: '' }
}, { _id: false });
const TransactionTemplateSchema = new Schema({
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    sourceType: { type: String, required: true, enum: ['csv', 'xlsx', 'json', 'iso8583'], default: 'csv' },
    isDefault: { type: Boolean, default: false },
    sampleHeaders: [{ type: String }],
    mappings: [ColumnMappingRuleSchema],
    globalKeyFieldSchemaId: { type: String, default: 'gkf-1' },
    authorName: { type: String, default: 'admin' },
    createdAt: { type: String, default: () => new Date().toISOString() },
    updatedAt: { type: String, default: () => new Date().toISOString() }
}, { timestamps: true });
export const TransactionTemplateModel = mongoose.model('TransactionTemplate', TransactionTemplateSchema);

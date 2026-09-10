import mongoose, { Schema } from 'mongoose';
const UploadedTransactionRecordSchema = new Schema({
    id: { type: String, required: true, unique: true },
    batchId: { type: String, required: true, index: true },
    sourceFilename: { type: String, required: true },
    uploadedBy: { type: String, default: 'anonymous_user' },
    uploadedAt: { type: String, default: () => new Date().toISOString() },
    templateId: { type: String },
    templateName: { type: String },
    mappedData: { type: Schema.Types.Mixed, default: {} },
    rawRecord: { type: Schema.Types.Mixed, default: {} },
    isReconciled: { type: Boolean, default: false },
    reconciledAt: { type: String },
    reconciledBy: { type: String },
    matchedDbRecordId: { type: String }
}, { timestamps: true });
export const UploadedTransactionRecordModel = mongoose.model('UploadedTransactionRecord', UploadedTransactionRecordSchema);

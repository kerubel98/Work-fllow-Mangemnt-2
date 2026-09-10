import mongoose, { Schema } from 'mongoose';
const InvestigationBatchSchema = new Schema({
    id: { type: String, required: true, unique: true },
    taskId: { type: String, required: true },
    sequence: { type: Number, required: true },
    transactionCount: { type: Number, required: true },
    processedCount: { type: Number, default: 0 },
    status: {
        type: String,
        enum: ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'RETRYING'],
        default: 'PENDING'
    },
    startedAt: { type: String },
    completedAt: { type: String },
    errorDetail: { type: String },
    retryCount: { type: Number, default: 0 }
}, { timestamps: true });
export const InvestigationBatchModel = mongoose.models.InvestigationBatch ||
    mongoose.model('InvestigationBatch', InvestigationBatchSchema);

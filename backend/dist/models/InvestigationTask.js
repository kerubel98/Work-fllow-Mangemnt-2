import mongoose, { Schema } from 'mongoose';
const InvestigationTaskSchema = new Schema({
    id: { type: String, required: true, unique: true },
    workflowId: { type: String, required: true },
    workflowName: { type: String },
    issueId: { type: String },
    teamTaskId: { type: String },
    totalTransactions: { type: Number, default: 0 },
    processedTransactions: { type: Number, default: 0 },
    reconciledTransactions: { type: Number, default: 0 },
    flaggedTransactions: { type: Number, default: 0 },
    closedTransactions: { type: Number, default: 0 },
    failedTransactions: { type: Number, default: 0 },
    status: {
        type: String,
        enum: ['PENDING', 'RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED'],
        default: 'PENDING'
    },
    executionPlan: { type: Schema.Types.Mixed },
    startedAt: { type: String },
    completedAt: { type: String },
    errorDetail: { type: String }
}, { timestamps: true });
export const InvestigationTaskModel = mongoose.models.InvestigationTask ||
    mongoose.model('InvestigationTask', InvestigationTaskSchema);

import mongoose, { Schema } from 'mongoose';
const InvestigationTransactionSchema = new Schema({
    id: { type: String, required: true, unique: true },
    taskId: { type: String, required: true },
    batchId: { type: String, required: true },
    transactionId: { type: String, required: true },
    investigationStatus: {
        type: String,
        enum: ['PENDING', 'INVESTIGATING', 'RECONCILED', 'FLAGGED', 'CLOSED'],
        default: 'PENDING'
    },
    statusFlagText: { type: String },
    statusFlagColor: { type: String },
    currentStageId: { type: String },
    currentRuleId: { type: String },
    finalResult: { type: String },
    finalAction: { type: String },
    auditTrail: [{ type: Schema.Types.Mixed }]
}, { timestamps: true });
export const InvestigationTransactionModel = mongoose.models.InvestigationTransaction ||
    mongoose.model('InvestigationTransaction', InvestigationTransactionSchema);

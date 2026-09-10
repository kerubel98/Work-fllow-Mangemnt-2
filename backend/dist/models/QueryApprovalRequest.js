import mongoose, { Schema } from 'mongoose';
const QueryApprovalRequestSchema = new Schema({
    id: { type: String, required: true, unique: true },
    systemId: { type: String, required: true },
    systemName: { type: String, required: true },
    environment: { type: String, enum: ['testing', 'production'], required: true },
    tableName: { type: String, required: true },
    query: { type: String, required: true },
    requesterId: { type: String, required: true },
    requesterName: { type: String, required: true },
    requesterRole: { type: String, required: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    requestDate: { type: String, default: () => new Date().toISOString() },
    issueId: { type: String },
    issueTitle: { type: String }
}, { timestamps: true });
export const QueryApprovalRequestModel = mongoose.model('QueryApprovalRequest', QueryApprovalRequestSchema);

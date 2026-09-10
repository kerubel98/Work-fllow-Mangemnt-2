import mongoose, { Schema, Document } from 'mongoose';
import { UserRole } from '../types.js';

export interface IQueryApprovalRequest extends Document {
  id: string;
  systemId: string;
  systemName: string;
  environment: 'testing' | 'production';
  tableName: string;
  query: string;
  requesterId: string;
  requesterName: string;
  requesterRole: UserRole;
  status: 'pending' | 'approved' | 'rejected';
  requestDate: string;
  issueId?: string;
  issueTitle?: string;
}

const QueryApprovalRequestSchema: Schema = new Schema(
  {
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
  },
  { timestamps: true }
);

export const QueryApprovalRequestModel = mongoose.model<IQueryApprovalRequest>('QueryApprovalRequest', QueryApprovalRequestSchema);

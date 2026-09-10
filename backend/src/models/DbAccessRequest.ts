import mongoose, { Schema, Document } from 'mongoose';
import { UserRole } from '../types.js';

export interface IDbAccessRequest extends Document {
  id: string;
  userId: string;
  username: string;
  userRole: UserRole;
  dbId: string;
  dbName: string;
  requestedPrivilege: 'SELECT' | 'UPDATE' | 'FULL';
  reason?: string;
  status: 'pending' | 'approved' | 'rejected';
  requestDate: string;
}

const DbAccessRequestSchema: Schema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    userId: { type: String, required: true },
    username: { type: String, required: true },
    userRole: { type: String, required: true },
    dbId: { type: String, required: true },
    dbName: { type: String, required: true },
    requestedPrivilege: { type: String, enum: ['SELECT', 'UPDATE', 'FULL'], required: true },
    reason: { type: String, default: '' },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    requestDate: { type: String, default: () => new Date().toISOString() }
  },
  { timestamps: true }
);

export const DbAccessRequestModel = mongoose.model<IDbAccessRequest>('DbAccessRequest', DbAccessRequestSchema);

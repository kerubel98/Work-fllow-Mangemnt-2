import mongoose, { Schema, Document } from 'mongoose';
import { UserRole } from '../types.js';

export interface IConnectionUsageLog extends Document {
  id: string;
  userId: string;
  username: string;
  userRole: UserRole;
  dbId: string;
  dbName: string;
  queryType: 'SELECT' | 'UPDATE' | 'INSERT' | 'DELETE';
  queryStatement: string;
  timestamp: string;
  executionTimeMs: number;
}

const ConnectionUsageLogSchema: Schema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    userId: { type: String, required: true },
    username: { type: String, required: true },
    userRole: { type: String, required: true },
    dbId: { type: String, required: true },
    dbName: { type: String, required: true },
    queryType: { type: String, enum: ['SELECT', 'UPDATE', 'INSERT', 'DELETE'], required: true },
    queryStatement: { type: String, required: true },
    timestamp: { type: String, default: () => new Date().toISOString() },
    executionTimeMs: { type: Number, required: true }
  },
  { timestamps: true }
);

export const ConnectionUsageLogModel = mongoose.model<IConnectionUsageLog>('ConnectionUsageLog', ConnectionUsageLogSchema);

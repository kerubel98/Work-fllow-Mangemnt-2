import mongoose, { Schema, Document } from 'mongoose';
import { UserRole } from '../types.js';

export interface IUser extends Document {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  isApproved: boolean;
  createdAt: string;
  canExecuteSelect?: boolean;
  canExecuteUpdate?: boolean;
  allowedDbIds?: string[];
}

const UserSchema: Schema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    role: { type: String, required: true, enum: ['admin', 'operational', 'technical', 'managerial'] },
    isApproved: { type: Boolean, default: false },
    createdAt: { type: String, default: () => new Date().toISOString() },
    canExecuteSelect: { type: Boolean, default: true },
    canExecuteUpdate: { type: Boolean, default: false },
    allowedDbIds: [{ type: String }]
  },
  { timestamps: true }
);

export const UserModel = mongoose.model<IUser>('User', UserSchema);

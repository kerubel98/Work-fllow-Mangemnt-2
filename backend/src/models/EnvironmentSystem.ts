import mongoose, { Schema, Document } from 'mongoose';
import { UserRole } from '../types.js';

export interface IEnvironmentSystem extends Document {
  id: string;
  name: string;
  description: string;
  testing: {
    dbName: string;
    allowedTables: string[];
    apiEndpoint: string;
  };
  production: {
    dbName: string;
    allowedTables: string[];
    apiEndpoint: string;
  };
  allowedUserIds: string[];
  allowedRoles: UserRole[];
  requireDmlApproval?: boolean;
}

const EnvironmentConfigSchema = new Schema({
  dbName: { type: String, required: true },
  allowedTables: [{ type: String }],
  apiEndpoint: { type: String, required: true }
});

const EnvironmentSystemSchema: Schema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    testing: { type: EnvironmentConfigSchema, required: true },
    production: { type: EnvironmentConfigSchema, required: true },
    allowedUserIds: [{ type: String }],
    allowedRoles: [{ type: String }],
    requireDmlApproval: { type: Boolean, default: true }
  },
  { timestamps: true }
);

export const EnvironmentSystemModel = mongoose.model<IEnvironmentSystem>('EnvironmentSystem', EnvironmentSystemSchema);

import mongoose, { Schema, Document } from 'mongoose';
import { GlobalStandardDirectoryRecord } from '../types.js';

export interface IGlobalStandardDirectory extends Document, Omit<GlobalStandardDirectoryRecord, 'id'> {
  id: string;
}

const GlobalStandardDirectorySchema: Schema = new Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    key: { type: String, required: true, index: true },
    label: { type: String, required: true },
    description: { type: String, default: '' },
    dataType: { 
      type: String, 
      required: true, 
      enum: ['string', 'number', 'date', 'boolean'], 
      default: 'string' 
    },
    required: { type: Boolean, default: false },
    isStandard: { type: Boolean, default: true },
    exampleValue: { type: Schema.Types.Mixed },
    category: { type: String, default: 'General' },
    notes: { type: String, default: '' },
    user_id: { type: String, required: true, index: true, default: 'usr-1' },
    created_at: { type: String, default: () => new Date().toISOString() },
    updated_at: { type: String, default: () => new Date().toISOString() }
  },
  { 
    timestamps: true,
    collection: 'global_standard_directory'
  }
);

export const GlobalStandardDirectoryModel = mongoose.model<IGlobalStandardDirectory>(
  'GlobalStandardDirectory',
  GlobalStandardDirectorySchema
);

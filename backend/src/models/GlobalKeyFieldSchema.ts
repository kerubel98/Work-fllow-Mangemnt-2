import mongoose, { Schema, Document } from 'mongoose';
import { mysqlModel } from './mysqlModel.js';

export interface IGlobalTransactionSchemaField {
  key: string;
  label: string;
  description: string;
  dataType: 'string' | 'number' | 'date' | 'boolean';
  required: boolean;
  isStandard?: boolean;
}

export interface IGlobalKeyFieldSchema extends Document {
  id: string;
  name: string;
  description?: string;
  keyFields: IGlobalTransactionSchemaField[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

const GlobalTransactionSchemaFieldSchema: Schema = new Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    description: { type: String, default: '' },
    dataType: { type: String, required: true, enum: ['string', 'number', 'date', 'boolean'] },
    required: { type: Boolean, required: true },
    isStandard: { type: Boolean, default: false }
  },
  { _id: false }
);

const GlobalKeyFieldSchemaSchema: Schema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    keyFields: { type: [GlobalTransactionSchemaFieldSchema], default: [] },
    createdBy: { type: String, required: true },
    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: true }
  },
  { timestamps: false }
);

export const GlobalKeyFieldSchemaModel = mysqlModel<IGlobalKeyFieldSchema>('global_key_field_schemas');

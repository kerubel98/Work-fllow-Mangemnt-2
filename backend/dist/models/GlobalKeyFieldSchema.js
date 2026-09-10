import { Schema } from 'mongoose';
import { mysqlModel } from './mysqlModel.js';
const GlobalTransactionSchemaFieldSchema = new Schema({
    key: { type: String, required: true },
    label: { type: String, required: true },
    description: { type: String, default: '' },
    dataType: { type: String, required: true, enum: ['string', 'number', 'date', 'boolean'] },
    required: { type: Boolean, required: true },
    isStandard: { type: Boolean, default: false }
}, { _id: false });
const GlobalKeyFieldSchemaSchema = new Schema({
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    keyFields: { type: [GlobalTransactionSchemaFieldSchema], default: [] },
    createdBy: { type: String, required: true },
    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: true }
}, { timestamps: false });
export const GlobalKeyFieldSchemaModel = mysqlModel('global_key_field_schemas');

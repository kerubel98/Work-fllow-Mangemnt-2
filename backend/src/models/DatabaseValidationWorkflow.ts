import mongoose, { Schema, Document } from 'mongoose';
import { DatabaseValidationWorkflow } from '../types.js';

export interface IDatabaseValidationWorkflow extends Document, Omit<DatabaseValidationWorkflow, 'id'> {
  id: string;
}

const ProcessingStageSchema = new Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    order: { type: Number, required: true },
    enabled: { type: Boolean, default: true },
    targetDbId: { type: String, default: 'db-1' },
    targetDataSource: { type: String, default: 'transactions' },
    mappingConfigId: { type: String },
    businessMeaning: { type: String }
  },
  { _id: false, timestamps: true }
);

const ValidationCheckStepSchema = new Schema(
  {
    id: { type: String, required: true },
    stepNumber: { type: Number, required: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    stageId: { type: String },
    checkType: { type: String, required: true },
    targetDbId: { type: String, default: 'db-1' },
    targetTable: { type: String, default: 'transactions' },
    sqlCondition: { type: String },
    sourceField: { type: String },
    comparator: { type: String },
    targetField: { type: String },
    compareValue: { type: String },
    regexPattern: { type: String },
    requiredParams: [{ type: String }],
    optionalParams: [{ type: String }],
    dependencyCondition: { type: String, default: 'ALWAYS' },
    holdStateVariable: { type: String },
    onPassAction: { type: String, default: 'CONTINUE' },
    onFailAction: { type: String, default: 'STOP' },
    onErrorAction: { type: String, default: 'STOP' },
    applyFilterOnPrevResult: { type: Boolean },
    filterField: { type: String },
    filterOperator: { type: String },
    filterValue: { type: String },
    reportColumnName: { type: String },
    reportField: { type: String },
    successMessage: { type: String },
    failureMessage: { type: String },
    severityOnFailure: { type: String, default: 'WARNING' }
  },
  { _id: false }
);

const DatabaseValidationWorkflowSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    targetDbId: { type: String, default: 'db-1' },
    targetTable: { type: String, default: 'transactions' },
    category: { type: String, default: 'Reconciliation' },
    stages: [ProcessingStageSchema],
    steps: [ValidationCheckStepSchema],
    nodes: [{ type: Schema.Types.Mixed }],
    connections: [{ type: Schema.Types.Mixed }],
    globalSuccessMessage: { type: String, default: 'Validation workflow completed successfully.' },
    globalFailureMessage: { type: String, default: 'Validation workflow failed criteria.' },
    createdBy: { type: String, default: 'system' },
    isSystemDefault: { type: Boolean, default: false },
    version: { type: String, default: '2.0.0' }
  },
  { timestamps: true, strict: false }
);

export const DatabaseValidationWorkflowModel = mongoose.model<IDatabaseValidationWorkflow>(
  'DatabaseValidationWorkflow',
  DatabaseValidationWorkflowSchema
);

import mongoose, { Schema, Document } from 'mongoose';
import { IssueStatus, IssuePriority, ChatMessage } from '../types.js';

export interface IIssue extends Document {
  id: string;
  title: string;
  description: string;
  status: IssueStatus;
  priority: IssuePriority;
  creatorId: string;
  creatorName: string;
  createdAt: string;
  type: 'file' | 'single';
  transactionId?: string;
  uploadedFileName?: string;
  uploadedFileHeaders?: string[];
  fileMapping?: Record<string, string>;
  firstLevelNotes?: string;
  firstLevelMappedData?: Record<string, any>[];
  secondLevelNotes?: string;
  solutionScript?: string;
  solutionTestResult?: string;
  solutionExecuted?: boolean;
  solutionExecutedAt?: string;
  linkedHashtag?: string;
  chat?: ChatMessage[];
  assignedTechUserId?: string;
  assignedTechUserName?: string;
  investigationSystemId?: string;
  investigationEnvironment?: 'testing' | 'production';
  investigationTable?: string;
  validationStatus?: 'untested' | 'passed' | 'failed';
  validationErrors?: string[];
  queryResults?: any[];
  movedToTesting?: boolean;
  rowLabels?: Record<string, string>;
  addedLabelColumnName?: string;
  customFilters?: { column: string; value: string }[];
}

const ChatMessageSchema = new Schema({
  id: { type: String, required: true },
  senderId: { type: String, required: true },
  senderName: { type: String, required: true },
  senderRole: { type: String, required: true },
  text: { type: String, required: true },
  timestamp: { type: String, required: true }
});

const IssueSchema: Schema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    status: { type: String, required: true, enum: ['Open', 'Investigating', 'Resolved', 'Closed'], default: 'Open' },
    priority: { type: String, required: true, enum: ['Low', 'Medium', 'High', 'Critical'], default: 'Medium' },
    creatorId: { type: String, required: true },
    creatorName: { type: String, required: true },
    createdAt: { type: String, default: () => new Date().toISOString() },
    type: { type: String, enum: ['file', 'single'], default: 'single' },
    transactionId: { type: String },
    uploadedFileName: { type: String },
    uploadedFileHeaders: [{ type: String }],
    fileMapping: { type: Map, of: String },
    firstLevelNotes: { type: String },
    firstLevelMappedData: { type: Array },
    secondLevelNotes: { type: String },
    solutionScript: { type: String },
    solutionTestResult: { type: String },
    solutionExecuted: { type: Boolean, default: false },
    solutionExecutedAt: { type: String },
    linkedHashtag: { type: String },
    chat: [ChatMessageSchema],
    assignedTechUserId: { type: String },
    assignedTechUserName: { type: String },
    investigationSystemId: { type: String },
    investigationEnvironment: { type: String, enum: ['testing', 'production'] },
    investigationTable: { type: String },
    validationStatus: { type: String, enum: ['untested', 'passed', 'failed'], default: 'untested' },
    validationErrors: [{ type: String }],
    queryResults: { type: Array },
    movedToTesting: { type: Boolean, default: false },
    rowLabels: { type: Map, of: String },
    addedLabelColumnName: { type: String },
    customFilters: [{ column: String, value: String }]
  },
  { timestamps: true }
);

export const IssueModel = mongoose.model<IIssue>('Issue', IssueSchema);

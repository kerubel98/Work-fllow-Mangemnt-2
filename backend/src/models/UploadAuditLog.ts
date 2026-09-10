import mongoose, { Schema, Document } from 'mongoose';

export interface IUploadAuditLog extends Document {
  id: string;
  batchId: string;
  sourceFilename: string;
  totalRecords: number;
  successCount: number;
  errorCount: number;
  uploadedBy: string;
  uploadedAt: string;
  templateId?: string;
  templateName?: string;
  fileSizeBytes: number;
}

const UploadAuditLogSchema: Schema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    batchId: { type: String, required: true, unique: true },
    sourceFilename: { type: String, required: true },
    totalRecords: { type: Number, default: 0 },
    successCount: { type: Number, default: 0 },
    errorCount: { type: Number, default: 0 },
    uploadedBy: { type: String, default: 'anonymous_user' },
    uploadedAt: { type: String, default: () => new Date().toISOString() },
    templateId: { type: String },
    templateName: { type: String },
    fileSizeBytes: { type: Number, default: 0 }
  },
  { timestamps: true }
);

export const UploadAuditLogModel = mongoose.model<IUploadAuditLog>('UploadAuditLog', UploadAuditLogSchema);

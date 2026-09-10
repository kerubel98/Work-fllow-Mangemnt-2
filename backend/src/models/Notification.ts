import mongoose, { Schema, Document } from 'mongoose';
import { NotificationType } from '../types.js';

export interface INotification extends Document {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: string;
  isRead: boolean;
  linkTab?: string;
  targetTeamId?: string;
  targetTaskId?: string;
  targetIssueId?: string;
  targetDirectUserId?: string;
  targetSubTab?: string;
  actorName?: string;
}

const NotificationSchema: Schema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    userId: { type: String, required: true },
    type: { type: String, required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    timestamp: { type: String, default: () => new Date().toISOString() },
    isRead: { type: Boolean, default: false },
    linkTab: { type: String },
    targetTeamId: { type: String },
    targetTaskId: { type: String },
    targetIssueId: { type: String },
    targetDirectUserId: { type: String },
    targetSubTab: { type: String },
    actorName: { type: String }
  },
  { timestamps: true }
);

export const NotificationModel = mongoose.model<INotification>('Notification', NotificationSchema);

import mongoose, { Schema, Document } from 'mongoose';
import { UserRole } from '../types.js';

export interface IDirectMessage extends Document {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: UserRole;
  receiverId: string;
  receiverName: string;
  content: string;
  timestamp: string;
  isRead: boolean;
}

const DirectMessageSchema: Schema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    senderId: { type: String, required: true },
    senderName: { type: String, required: true },
    senderRole: { type: String, required: true },
    receiverId: { type: String, required: true },
    receiverName: { type: String, required: true },
    content: { type: String, required: true },
    timestamp: { type: String, default: () => new Date().toISOString() },
    isRead: { type: Boolean, default: false }
  },
  { timestamps: true }
);

export const DirectMessageModel = mongoose.model<IDirectMessage>('DirectMessage', DirectMessageSchema);

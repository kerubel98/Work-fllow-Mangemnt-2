import mongoose, { Schema, Document } from 'mongoose';
import { UserRole } from '../types.js';

export interface ITeamDiscussionMessage extends Document {
  id: string;
  teamId: string;
  senderId: string;
  senderName: string;
  senderRole: UserRole;
  content: string;
  timestamp: string;
}

const TeamDiscussionMessageSchema: Schema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    teamId: { type: String, required: true },
    senderId: { type: String, required: true },
    senderName: { type: String, required: true },
    senderRole: { type: String, required: true },
    content: { type: String, required: true },
    timestamp: { type: String, default: () => new Date().toISOString() }
  },
  { timestamps: true }
);

export const TeamDiscussionMessageModel = mongoose.model<ITeamDiscussionMessage>('TeamDiscussionMessage', TeamDiscussionMessageSchema);

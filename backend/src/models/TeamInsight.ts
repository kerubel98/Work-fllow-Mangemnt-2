import mongoose, { Schema, Document } from 'mongoose';
import { UserRole } from '../types.js';

export interface ITeamInsight extends Document {
  id: string;
  teamId: string;
  title: string;
  content: string;
  authorId: string;
  authorName: string;
  authorRole: UserRole;
  tags: string[];
  createdAt: string;
}

const TeamInsightSchema: Schema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    teamId: { type: String, required: true },
    title: { type: String, required: true },
    content: { type: String, required: true },
    authorId: { type: String, required: true },
    authorName: { type: String, required: true },
    authorRole: { type: String, required: true },
    tags: [{ type: String }],
    createdAt: { type: String, default: () => new Date().toISOString() }
  },
  { timestamps: true }
);

export const TeamInsightModel = mongoose.model<ITeamInsight>('TeamInsight', TeamInsightSchema);

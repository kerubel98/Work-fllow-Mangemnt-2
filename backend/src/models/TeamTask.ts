import mongoose, { Schema, Document } from 'mongoose';

export interface ITeamTask extends Document {
  id: string;
  teamId: string;
  title: string;
  description: string;
  assigneeId: string;
  assigneeName: string;
  creatorId: string;
  creatorName: string;
  status: 'To Do' | 'In Progress' | 'Done';
  priority: 'Low' | 'Medium' | 'High';
  createdAt: string;
  dueDate?: string;
  startDate?: string;
  milestone?: string;
}

const TeamTaskSchema: Schema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    teamId: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    assigneeId: { type: String, required: true },
    assigneeName: { type: String, required: true },
    creatorId: { type: String, required: true },
    creatorName: { type: String, required: true },
    status: { type: String, enum: ['To Do', 'In Progress', 'Done'], default: 'To Do' },
    priority: { type: String, enum: ['Low', 'Medium', 'High'], default: 'Medium' },
    createdAt: { type: String, default: () => new Date().toISOString() },
    dueDate: { type: String },
    startDate: { type: String },
    milestone: { type: String }
  },
  { timestamps: true }
);

export const TeamTaskModel = mongoose.model<ITeamTask>('TeamTask', TeamTaskSchema);

import mongoose, { Schema, Document } from 'mongoose';

export interface ITeam extends Document {
  id: string;
  name: string;
  description?: string;
  teamType?: 'permanent' | 'working';
  managerId: string;
  managerName: string;
  memberIds: string[];
  createdAt: string;
}

const TeamSchema: Schema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    teamType: { type: String, enum: ['permanent', 'working'], default: 'working' },
    managerId: { type: String, required: true },
    managerName: { type: String, required: true },
    memberIds: [{ type: String }],
    createdAt: { type: String, default: () => new Date().toISOString() }
  },
  { timestamps: true }
);

export const TeamModel = mongoose.model<ITeam>('Team', TeamSchema);

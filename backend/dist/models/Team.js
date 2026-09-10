import mongoose, { Schema } from 'mongoose';
const TeamSchema = new Schema({
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    teamType: { type: String, enum: ['permanent', 'working'], default: 'working' },
    managerId: { type: String, required: true },
    managerName: { type: String, required: true },
    memberIds: [{ type: String }],
    createdAt: { type: String, default: () => new Date().toISOString() }
}, { timestamps: true });
export const TeamModel = mongoose.model('Team', TeamSchema);

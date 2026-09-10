import mongoose, { Schema } from 'mongoose';
const TeamTaskSchema = new Schema({
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
}, { timestamps: true });
export const TeamTaskModel = mongoose.model('TeamTask', TeamTaskSchema);

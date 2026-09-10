import mongoose, { Schema } from 'mongoose';
const NotificationSchema = new Schema({
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
}, { timestamps: true });
export const NotificationModel = mongoose.model('Notification', NotificationSchema);

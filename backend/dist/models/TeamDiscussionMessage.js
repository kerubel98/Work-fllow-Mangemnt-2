import mongoose, { Schema } from 'mongoose';
const TeamDiscussionMessageSchema = new Schema({
    id: { type: String, required: true, unique: true },
    teamId: { type: String, required: true },
    senderId: { type: String, required: true },
    senderName: { type: String, required: true },
    senderRole: { type: String, required: true },
    content: { type: String, required: true },
    timestamp: { type: String, default: () => new Date().toISOString() }
}, { timestamps: true });
export const TeamDiscussionMessageModel = mongoose.model('TeamDiscussionMessage', TeamDiscussionMessageSchema);

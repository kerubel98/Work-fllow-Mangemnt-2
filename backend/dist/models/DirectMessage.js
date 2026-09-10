import mongoose, { Schema } from 'mongoose';
const DirectMessageSchema = new Schema({
    id: { type: String, required: true, unique: true },
    senderId: { type: String, required: true },
    senderName: { type: String, required: true },
    senderRole: { type: String, required: true },
    receiverId: { type: String, required: true },
    receiverName: { type: String, required: true },
    content: { type: String, required: true },
    timestamp: { type: String, default: () => new Date().toISOString() },
    isRead: { type: Boolean, default: false }
}, { timestamps: true });
export const DirectMessageModel = mongoose.model('DirectMessage', DirectMessageSchema);

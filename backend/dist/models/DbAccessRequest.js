import mongoose, { Schema } from 'mongoose';
const DbAccessRequestSchema = new Schema({
    id: { type: String, required: true, unique: true },
    userId: { type: String, required: true },
    username: { type: String, required: true },
    userRole: { type: String, required: true },
    dbId: { type: String, required: true },
    dbName: { type: String, required: true },
    requestedPrivilege: { type: String, enum: ['SELECT', 'UPDATE', 'FULL'], required: true },
    reason: { type: String, default: '' },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    requestDate: { type: String, default: () => new Date().toISOString() }
}, { timestamps: true });
export const DbAccessRequestModel = mongoose.model('DbAccessRequest', DbAccessRequestSchema);

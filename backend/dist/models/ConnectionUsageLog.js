import mongoose, { Schema } from 'mongoose';
const ConnectionUsageLogSchema = new Schema({
    id: { type: String, required: true, unique: true },
    userId: { type: String, required: true },
    username: { type: String, required: true },
    userRole: { type: String, required: true },
    dbId: { type: String, required: true },
    dbName: { type: String, required: true },
    queryType: { type: String, enum: ['SELECT', 'UPDATE', 'INSERT', 'DELETE'], required: true },
    queryStatement: { type: String, required: true },
    timestamp: { type: String, default: () => new Date().toISOString() },
    executionTimeMs: { type: Number, required: true }
}, { timestamps: true });
export const ConnectionUsageLogModel = mongoose.model('ConnectionUsageLog', ConnectionUsageLogSchema);

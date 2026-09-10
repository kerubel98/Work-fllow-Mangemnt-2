import mongoose, { Schema } from 'mongoose';
const DatabaseConnectionSchema = new Schema({
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    type: { type: String, required: true, enum: ['PostgreSQL', 'Oracle', 'MySQL', 'MongoDB', 'FTP', 'SFTP'] },
    host: { type: String, required: true },
    port: { type: Number },
    connectionString: { type: String, default: '' },
    databaseName: { type: String, default: '' },
    username: { type: String, default: '' },
    password: { type: String, default: '' },
    status: { type: String, required: true, enum: ['online', 'offline'], default: 'online' },
    apiEndpoint: { type: String, required: true },
    createdByAdmin: { type: Boolean, default: true },
    requiresAccessApproval: { type: Boolean, default: false },
    description: { type: String, default: '' },
    allowedRoles: [{ type: String }],
    systemCategory: { type: String, default: '' },
    environmentType: { type: String, default: '' },
    lastTestedAt: { type: String },
    lastTestStatus: { type: String, enum: ['success', 'failed'] },
    lastTestMessage: { type: String },
    pingMs: { type: Number },
    availableTables: [{ type: String }],
    allowedTables: [{ type: String }]
}, { timestamps: true });
export const DatabaseConnectionModel = mongoose.model('DatabaseConnection', DatabaseConnectionSchema);

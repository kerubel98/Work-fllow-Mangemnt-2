import mongoose, { Schema } from 'mongoose';
const EnvironmentConfigSchema = new Schema({
    dbName: { type: String, required: true },
    allowedTables: [{ type: String }],
    apiEndpoint: { type: String, required: true }
});
const EnvironmentSystemSchema = new Schema({
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    testing: { type: EnvironmentConfigSchema, required: true },
    production: { type: EnvironmentConfigSchema, required: true },
    allowedUserIds: [{ type: String }],
    allowedRoles: [{ type: String }],
    requireDmlApproval: { type: Boolean, default: true }
}, { timestamps: true });
export const EnvironmentSystemModel = mongoose.model('EnvironmentSystem', EnvironmentSystemSchema);

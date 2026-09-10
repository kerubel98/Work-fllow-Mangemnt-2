import mongoose, { Schema } from 'mongoose';
const OrganizationSchema = new Schema({
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    slug: { type: String, required: true },
    description: { type: String, default: '' },
    blogPostContent: { type: String, default: '' },
    category: { type: String, default: 'General' },
    logoUrl: { type: String, default: '' },
    ownerId: { type: String, required: true },
    ownerName: { type: String, required: true },
    memberIds: [{ type: String }],
    pendingJoinRequestUserIds: [{ type: String }],
    associatedTeamIds: [{ type: String }],
    associatedDbIds: [{ type: String }],
    createdAt: { type: String, default: () => new Date().toISOString() }
}, { timestamps: true });
export const OrganizationModel = mongoose.model('Organization', OrganizationSchema);

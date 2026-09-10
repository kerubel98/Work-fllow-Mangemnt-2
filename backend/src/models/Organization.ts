import mongoose, { Schema, Document } from 'mongoose';

export interface IOrganization extends Document {
  id: string;
  name: string;
  slug: string;
  description: string;
  blogPostContent: string;
  category: string;
  logoUrl?: string;
  ownerId: string;
  ownerName: string;
  memberIds: string[];
  pendingJoinRequestUserIds?: string[];
  associatedTeamIds?: string[];
  associatedDbIds?: string[];
  createdAt: string;
}

const OrganizationSchema: Schema = new Schema(
  {
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
  },
  { timestamps: true }
);

export const OrganizationModel = mongoose.model<IOrganization>('Organization', OrganizationSchema);

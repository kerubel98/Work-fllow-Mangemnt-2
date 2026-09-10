import { Router } from 'express';
import { isMongoConnected } from '../config/db.js';
import { OrganizationModel } from '../models/Organization.js';
import { store } from '../store/dataStore.js';
export const organizationRouter = Router();
// GET all organizations
organizationRouter.get('/', async (_req, res) => {
    if (isMongoConnected) {
        const orgs = await OrganizationModel.find().lean();
        return res.json(orgs);
    }
    return res.json(store.organizations);
});
// GET single organization by ID or slug
organizationRouter.get('/:id', async (req, res) => {
    const { id } = req.params;
    if (isMongoConnected) {
        const org = await OrganizationModel.findOne({ $or: [{ id }, { slug: id }] }).lean();
        if (!org)
            return res.status(404).json({ error: 'Organization not found' });
        return res.json(org);
    }
    const org = store.organizations.find((o) => o.id === id || o.slug === id);
    if (!org)
        return res.status(404).json({ error: 'Organization not found' });
    return res.json(org);
});
// POST create new organization
organizationRouter.post('/', async (req, res) => {
    const { name, description, blogPostContent, category, logoUrl, ownerId, ownerName } = req.body;
    if (!name || !ownerId || !ownerName) {
        return res.status(400).json({ error: 'Organization name, ownerId, and ownerName are required' });
    }
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const id = `org-${Date.now()}`;
    const newOrg = {
        id,
        name,
        slug,
        description: description || '',
        blogPostContent: blogPostContent || `# ${name}\n\nWelcome to ${name}. Add operational guidelines and team SOPs here.`,
        category: category || 'General',
        logoUrl: logoUrl || 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=300&q=80',
        ownerId,
        ownerName,
        memberIds: [ownerId],
        pendingJoinRequestUserIds: [],
        associatedTeamIds: [],
        associatedDbIds: [],
        createdAt: new Date().toISOString()
    };
    if (isMongoConnected) {
        await OrganizationModel.create(newOrg);
    }
    else {
        store.organizations.push(newOrg);
    }
    return res.status(201).json({ message: 'Organization created successfully', organization: newOrg });
});
// POST join organization
organizationRouter.post('/:id/join', async (req, res) => {
    const { id } = req.params;
    const { userId } = req.body;
    if (!userId) {
        return res.status(400).json({ error: 'userId is required to join organization' });
    }
    if (isMongoConnected) {
        const org = await OrganizationModel.findOne({ id });
        if (!org)
            return res.status(404).json({ error: 'Organization not found' });
        if (!org.memberIds.includes(userId)) {
            org.memberIds.push(userId);
            await org.save();
        }
        return res.json({ message: 'Successfully joined organization', organization: org });
    }
    const org = store.organizations.find((o) => o.id === id);
    if (!org)
        return res.status(404).json({ error: 'Organization not found' });
    if (!org.memberIds.includes(userId)) {
        org.memberIds.push(userId);
    }
    return res.json({ message: 'Successfully joined organization', organization: org });
});
// POST leave organization
organizationRouter.post('/:id/leave', async (req, res) => {
    const { id } = req.params;
    const { userId } = req.body;
    if (!userId) {
        return res.status(400).json({ error: 'userId is required' });
    }
    if (isMongoConnected) {
        const org = await OrganizationModel.findOne({ id });
        if (!org)
            return res.status(404).json({ error: 'Organization not found' });
        org.memberIds = org.memberIds.filter((m) => m !== userId);
        await org.save();
        return res.json({ message: 'Left organization successfully', organization: org });
    }
    const org = store.organizations.find((o) => o.id === id);
    if (!org)
        return res.status(404).json({ error: 'Organization not found' });
    org.memberIds = org.memberIds.filter((m) => m !== userId);
    return res.json({ message: 'Left organization successfully', organization: org });
});

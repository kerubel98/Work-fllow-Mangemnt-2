import { Router } from 'express';
import { repo } from '../store/repository.js';
export const organizationRouter = Router();
// GET all organizations
organizationRouter.get('/', async (_req, res) => {
    try {
        const orgs = await repo.getOrganizations();
        return res.json(orgs);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// GET single organization by ID or slug
organizationRouter.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const org = await repo.getOrganizationById(id);
        if (!org)
            return res.status(404).json({ error: 'Organization not found' });
        return res.json(org);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// POST create new organization
organizationRouter.post('/', async (req, res) => {
    try {
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
        await repo.createOrganization(newOrg);
        return res.status(201).json({ message: 'Organization created successfully', organization: newOrg });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// POST join organization
organizationRouter.post('/:id/join', async (req, res) => {
    try {
        const { id } = req.params;
        const { userId } = req.body;
        if (!userId) {
            return res.status(400).json({ error: 'userId is required to join organization' });
        }
        const org = await repo.getOrganizationById(id);
        if (!org)
            return res.status(404).json({ error: 'Organization not found' });
        if (!org.memberIds.includes(userId)) {
            org.memberIds.push(userId);
            await repo.updateOrganization(id, { memberIds: org.memberIds });
        }
        return res.json({ message: 'Successfully joined organization', organization: org });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// POST leave organization
organizationRouter.post('/:id/leave', async (req, res) => {
    try {
        const { id } = req.params;
        const { userId } = req.body;
        if (!userId) {
            return res.status(400).json({ error: 'userId is required' });
        }
        const org = await repo.getOrganizationById(id);
        if (!org)
            return res.status(404).json({ error: 'Organization not found' });
        org.memberIds = org.memberIds.filter((m) => m !== userId);
        await repo.updateOrganization(id, { memberIds: org.memberIds });
        return res.json({ message: 'Left organization successfully', organization: org });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

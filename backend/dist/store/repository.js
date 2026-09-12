import { isMongoConnected } from '../config/db.js';
import { isPostgresConnected } from '../config/postgres.js';
import { postgresRepo } from './postgresRepo.js';
import { store } from './dataStore.js';
import { UserModel } from '../models/User.js';
import { IssueModel } from '../models/Issue.js';
import { DatabaseConnectionModel } from '../models/DatabaseConnection.js';
import { EnvironmentSystemModel } from '../models/EnvironmentSystem.js';
import { TeamModel } from '../models/Team.js';
import { TeamTaskModel } from '../models/TeamTask.js';
import { TeamInsightModel } from '../models/TeamInsight.js';
import { TeamDiscussionMessageModel } from '../models/TeamDiscussionMessage.js';
import { NotificationModel } from '../models/Notification.js';
import { DirectMessageModel } from '../models/DirectMessage.js';
import { QueryApprovalRequestModel } from '../models/QueryApprovalRequest.js';
import { DbAccessRequestModel } from '../models/DbAccessRequest.js';
import { ConnectionUsageLogModel } from '../models/ConnectionUsageLog.js';
import { HashtagPresetModel } from '../models/HashtagPreset.js';
import { PluginModel } from '../models/Plugin.js';
import { OrganizationModel } from '../models/Organization.js';
import { TransactionTemplateModel } from '../models/TransactionTemplate.js';
import { GlobalTransactionSchemaConfigModel } from '../models/GlobalTransactionSchemaConfig.js';
import { UploadedTransactionRecordModel } from '../models/UploadedTransactionRecord.js';
import { UploadAuditLogModel } from '../models/UploadAuditLog.js';
import { WorkspaceTableRecordModel } from '../models/WorkspaceTableRecord.js';
import { DatabaseValidationWorkflowModel } from '../models/DatabaseValidationWorkflow.js';
import { QueryExtractionModel } from '../models/QueryExtraction.js';
import { InvestigationTaskModel } from '../models/InvestigationTask.js';
import { InvestigationBatchModel } from '../models/InvestigationBatch.js';
import { InvestigationTransactionModel } from '../models/InvestigationTransaction.js';
export const repo = {
    // ================= USERS =================
    async getUsers() {
        if (isPostgresConnected) {
            return await postgresRepo.getUsers();
        }
        if (isMongoConnected) {
            return await UserModel.find().sort({ createdAt: 1 }).lean();
        }
        return store.users;
    },
    async getUserById(id) {
        if (isPostgresConnected) {
            return await postgresRepo.getUserById(id);
        }
        if (isMongoConnected) {
            return await UserModel.findOne({ id }).lean();
        }
        return store.users.find(u => u.id === id) || null;
    },
    async getUserByUsername(username) {
        if (isPostgresConnected) {
            return await postgresRepo.getUserByUsername(username);
        }
        if (isMongoConnected) {
            return await UserModel.findOne({ username: { $regex: new RegExp(`^${username}$`, 'i') } }).lean();
        }
        return store.users.find(u => u.username.toLowerCase() === username.toLowerCase()) || null;
    },
    async createUser(userData) {
        if (isPostgresConnected) {
            await postgresRepo.createUser(userData);
        }
        else if (isMongoConnected) {
            await UserModel.create(userData);
        }
        const existingIdx = store.users.findIndex(u => u.id === userData.id);
        if (existingIdx >= 0)
            store.users[existingIdx] = userData;
        else
            store.users.push(userData);
        return userData;
    },
    async updateUser(id, updates) {
        let updated = null;
        if (isPostgresConnected) {
            updated = await postgresRepo.updateUser(id, updates);
        }
        else if (isMongoConnected) {
            updated = await UserModel.findOneAndUpdate({ id }, updates, { new: true }).lean();
        }
        const idx = store.users.findIndex(u => u.id === id);
        if (idx !== -1) {
            store.users[idx] = { ...store.users[idx], ...updates };
            if (!updated)
                updated = store.users[idx];
        }
        return updated;
    },
    async deleteUser(id) {
        if (isPostgresConnected) {
            await postgresRepo.deleteUser(id);
        }
        else if (isMongoConnected) {
            await UserModel.deleteOne({ id });
        }
        const idx = store.users.findIndex(u => u.id === id);
        if (idx !== -1) {
            store.users.splice(idx, 1);
            return true;
        }
        return false;
    },
    // ================= ISSUES =================
    async getIssues() {
        if (isPostgresConnected) {
            return await postgresRepo.getIssues();
        }
        if (isMongoConnected) {
            return await IssueModel.find().sort({ createdAt: -1 }).lean();
        }
        return store.issues;
    },
    async getIssueById(id) {
        if (isPostgresConnected) {
            return await postgresRepo.getIssueById(id);
        }
        if (isMongoConnected) {
            return await IssueModel.findOne({ id }).lean();
        }
        return store.issues.find(i => i.id === id) || null;
    },
    async createIssue(issue) {
        if (isPostgresConnected) {
            return await postgresRepo.createIssue(issue);
        }
        if (isMongoConnected) {
            await IssueModel.create(issue);
        }
        store.issues.unshift(issue);
        return issue;
    },
    async updateIssue(id, updates) {
        let updated = null;
        if (isPostgresConnected) {
            updated = await postgresRepo.updateIssue(id, updates);
        }
        else if (isMongoConnected) {
            updated = await IssueModel.findOneAndUpdate({ id }, updates, { new: true }).lean();
        }
        const idx = store.issues.findIndex(i => i.id === id);
        if (idx !== -1) {
            store.issues[idx] = { ...store.issues[idx], ...updates };
            if (!updated)
                updated = store.issues[idx];
        }
        return updated;
    },
    async deleteIssue(id) {
        if (isPostgresConnected) {
            return await postgresRepo.deleteIssue(id);
        }
        if (isMongoConnected) {
            await IssueModel.deleteOne({ id });
        }
        const idx = store.issues.findIndex(i => i.id === id);
        if (idx !== -1) {
            store.issues.splice(idx, 1);
            return true;
        }
        return false;
    },
    async addIssueChat(issueId, message) {
        if (isPostgresConnected) {
            return await postgresRepo.addIssueChat(issueId, message);
        }
        if (isMongoConnected) {
            const updated = await IssueModel.findOneAndUpdate({ id: issueId }, { $push: { chat: message } }, { new: true }).lean();
            const idx = store.issues.findIndex(i => i.id === issueId);
            if (idx !== -1) {
                if (!store.issues[idx].chat)
                    store.issues[idx].chat = [];
                store.issues[idx].chat.push(message);
            }
            return updated;
        }
        const issue = store.issues.find(i => i.id === issueId);
        if (!issue)
            return null;
        if (!issue.chat)
            issue.chat = [];
        issue.chat.push(message);
        return issue;
    },
    // ================= TASK DATASET TRANSACTIONS =================
    async createTaskDatasetTransactions(taskId, rows) {
        if (isPostgresConnected) {
            return await postgresRepo.createTaskDatasetTransactions(taskId, rows);
        }
        // Fallback: in-memory or mongo issue update
        const issue = await this.getIssueById(taskId);
        if (issue) {
            await this.updateIssue(taskId, { firstLevelMappedData: rows });
        }
        return rows.length;
    },
    async getTaskDatasetTransactions(taskId, page = 1, limit = 50, batchId) {
        if (isPostgresConnected) {
            return await postgresRepo.getTaskDatasetTransactions(taskId, page, limit, batchId);
        }
        const issue = await this.getIssueById(taskId);
        let all = issue?.firstLevelMappedData || [];
        if (batchId) {
            all = all.filter((r) => (r._batchId === batchId || r.batch_id === batchId));
        }
        const offset = (page - 1) * limit;
        return {
            rows: all.slice(offset, offset + limit),
            totalCount: all.length
        };
    },
    async getTaskDatasetBatches(taskId) {
        if (isPostgresConnected) {
            return await postgresRepo.getTaskDatasetBatches(taskId);
        }
        const issue = await this.getIssueById(taskId);
        const all = issue?.firstLevelMappedData || [];
        const counts = {};
        for (const r of all) {
            const b = r._batchId || r.batch_id;
            if (b)
                counts[b] = (counts[b] || 0) + 1;
        }
        return Object.entries(counts).map(([batchId, count]) => ({ batchId, count }));
    },
    async updateTaskDatasetValidationStatus(taskId, workflowId, workflowName, evaluatedRecords) {
        if (isPostgresConnected) {
            return await postgresRepo.updateTaskDatasetValidationStatus(taskId, workflowId, workflowName, evaluatedRecords);
        }
    },
    // ================= DATABASES =================
    async getDatabases() {
        if (isPostgresConnected) {
            return await postgresRepo.getDatabaseConnections();
        }
        if (isMongoConnected) {
            return await DatabaseConnectionModel.find().lean();
        }
        return store.databases;
    },
    async getDatabaseById(id) {
        if (isPostgresConnected) {
            return await postgresRepo.getDatabaseConnectionById(id);
        }
        if (isMongoConnected) {
            return await DatabaseConnectionModel.findOne({ id }).lean();
        }
        return store.databases.find(d => d.id === id) || null;
    },
    async getDatabaseConnections() {
        return await this.getDatabases();
    },
    async getDatabaseConnectionById(id) {
        return await this.getDatabaseById(id);
    },
    async createDatabase(db) {
        if (isPostgresConnected) {
            return await postgresRepo.createDatabaseConnection(db);
        }
        if (isMongoConnected) {
            await DatabaseConnectionModel.create(db);
        }
        store.databases.push(db);
        return db;
    },
    async updateDatabase(id, updates) {
        if (isPostgresConnected) {
            return await postgresRepo.updateDatabaseConnection(id, updates);
        }
        let updated = null;
        if (isMongoConnected) {
            updated = await DatabaseConnectionModel.findOneAndUpdate({ id }, updates, { new: true }).lean();
        }
        const idx = store.databases.findIndex(d => d.id === id);
        if (idx !== -1) {
            store.databases[idx] = { ...store.databases[idx], ...updates };
            if (!updated)
                updated = store.databases[idx];
        }
        return updated;
    },
    async deleteDatabase(id) {
        if (isPostgresConnected) {
            return await postgresRepo.deleteDatabaseConnection(id);
        }
        if (isMongoConnected) {
            await DatabaseConnectionModel.deleteOne({ id });
        }
        const idx = store.databases.findIndex(d => d.id === id);
        if (idx !== -1) {
            store.databases.splice(idx, 1);
            return true;
        }
        return false;
    },
    // ================= SYSTEMS =================
    async getSystems() {
        if (isPostgresConnected) {
            return await postgresRepo.getEnvironmentSystems();
        }
        if (isMongoConnected) {
            return await EnvironmentSystemModel.find().lean();
        }
        return store.systems;
    },
    async createSystem(sys) {
        if (isPostgresConnected) {
            return await postgresRepo.createEnvironmentSystem(sys);
        }
        if (isMongoConnected) {
            await EnvironmentSystemModel.create(sys);
        }
        store.systems.push(sys);
        return sys;
    },
    async updateSystem(id, updates) {
        if (isPostgresConnected) {
            return await postgresRepo.updateEnvironmentSystem(id, updates);
        }
        let updated = null;
        if (isMongoConnected) {
            updated = await EnvironmentSystemModel.findOneAndUpdate({ id }, updates, { new: true }).lean();
        }
        const idx = store.systems.findIndex(s => s.id === id);
        if (idx !== -1) {
            store.systems[idx] = { ...store.systems[idx], ...updates };
            if (!updated)
                updated = store.systems[idx];
        }
        return updated;
    },
    async deleteSystem(id) {
        if (isPostgresConnected) {
            return await postgresRepo.deleteEnvironmentSystem(id);
        }
        if (isMongoConnected) {
            await EnvironmentSystemModel.deleteOne({ id });
        }
        const idx = store.systems.findIndex(s => s.id === id);
        if (idx !== -1) {
            store.systems.splice(idx, 1);
            return true;
        }
        return false;
    },
    // ================= TEAMS & TEAM COLLABORATION =================
    async getTeams() {
        if (isMongoConnected) {
            return await TeamModel.find().lean();
        }
        return store.teams;
    },
    async createTeam(team) {
        if (isMongoConnected) {
            await TeamModel.create(team);
        }
        store.teams.push(team);
        return team;
    },
    async updateTeam(id, updates) {
        let updated = null;
        if (isMongoConnected) {
            updated = await TeamModel.findOneAndUpdate({ id }, updates, { new: true }).lean();
        }
        const idx = store.teams.findIndex(t => t.id === id);
        if (idx !== -1) {
            store.teams[idx] = { ...store.teams[idx], ...updates };
            if (!updated)
                updated = store.teams[idx];
        }
        return updated;
    },
    async deleteTeam(id) {
        if (isMongoConnected) {
            await TeamModel.deleteOne({ id });
        }
        const idx = store.teams.findIndex(t => t.id === id);
        if (idx !== -1) {
            store.teams.splice(idx, 1);
            return true;
        }
        return false;
    },
    async getTeamTasks(teamId) {
        if (isMongoConnected) {
            const query = teamId ? { teamId } : {};
            return await TeamTaskModel.find(query).sort({ createdAt: -1 }).lean();
        }
        return teamId ? store.teamTasks.filter(t => t.teamId === teamId) : store.teamTasks;
    },
    async createTeamTask(task) {
        if (isMongoConnected) {
            await TeamTaskModel.create(task);
        }
        store.teamTasks.unshift(task);
        return task;
    },
    async updateTeamTask(id, updates) {
        let updated = null;
        if (isMongoConnected) {
            updated = await TeamTaskModel.findOneAndUpdate({ id }, updates, { new: true }).lean();
        }
        const idx = store.teamTasks.findIndex(t => t.id === id);
        if (idx !== -1) {
            store.teamTasks[idx] = { ...store.teamTasks[idx], ...updates };
            if (!updated)
                updated = store.teamTasks[idx];
        }
        return updated;
    },
    async deleteTeamTask(id) {
        if (isMongoConnected) {
            await TeamTaskModel.deleteOne({ id });
        }
        const idx = store.teamTasks.findIndex(t => t.id === id);
        if (idx !== -1) {
            store.teamTasks.splice(idx, 1);
            return true;
        }
        return false;
    },
    async getTeamInsights(teamId) {
        if (isMongoConnected) {
            const query = teamId ? { teamId } : {};
            return await TeamInsightModel.find(query).sort({ createdAt: -1 }).lean();
        }
        return teamId ? store.teamInsights.filter(i => i.teamId === teamId) : store.teamInsights;
    },
    async createTeamInsight(insight) {
        if (isMongoConnected) {
            await TeamInsightModel.create(insight);
        }
        store.teamInsights.unshift(insight);
        return insight;
    },
    async deleteTeamInsight(id) {
        if (isMongoConnected) {
            await TeamInsightModel.deleteOne({ id });
        }
        const idx = store.teamInsights.findIndex(i => i.id === id);
        if (idx !== -1) {
            store.teamInsights.splice(idx, 1);
            return true;
        }
        return false;
    },
    async getTeamMessages(teamId) {
        if (isMongoConnected) {
            const query = teamId ? { teamId } : {};
            return await TeamDiscussionMessageModel.find(query).sort({ timestamp: 1 }).lean();
        }
        return teamId ? store.teamMessages.filter(m => m.teamId === teamId) : store.teamMessages;
    },
    async createTeamMessage(msg) {
        if (isMongoConnected) {
            await TeamDiscussionMessageModel.create(msg);
        }
        store.teamMessages.push(msg);
        return msg;
    },
    // ================= DIRECT MESSAGES =================
    async getDirectMessages(userId1, userId2) {
        if (isMongoConnected) {
            if (userId1 && userId2) {
                return await DirectMessageModel.find({
                    $or: [
                        { senderId: userId1, receiverId: userId2 },
                        { senderId: userId2, receiverId: userId1 }
                    ]
                }).sort({ timestamp: 1 }).lean();
            }
            return await DirectMessageModel.find().sort({ timestamp: 1 }).lean();
        }
        if (userId1 && userId2) {
            return store.directMessages.filter(m => (m.senderId === userId1 && m.receiverId === userId2) ||
                (m.senderId === userId2 && m.receiverId === userId1));
        }
        return store.directMessages;
    },
    async createDirectMessage(msg) {
        if (isMongoConnected) {
            await DirectMessageModel.create(msg);
        }
        store.directMessages.push(msg);
        return msg;
    },
    async markDirectMessagesRead(senderId, receiverId) {
        if (isMongoConnected) {
            await DirectMessageModel.updateMany({ senderId, receiverId, isRead: false }, { $set: { isRead: true } });
        }
        store.directMessages.forEach(m => {
            if (m.senderId === senderId && m.receiverId === receiverId) {
                m.isRead = true;
            }
        });
    },
    // ================= NOTIFICATIONS =================
    async getNotifications(userId) {
        if (isMongoConnected) {
            const query = userId ? { $or: [{ userId }, { userId: 'all' }] } : {};
            return await NotificationModel.find(query).sort({ timestamp: -1 }).limit(100).lean();
        }
        return userId ? store.notifications.filter(n => n.userId === userId || n.userId === 'all') : store.notifications;
    },
    async createNotification(notif) {
        if (isMongoConnected) {
            await NotificationModel.create(notif);
        }
        store.notifications.unshift(notif);
        return notif;
    },
    async markNotificationRead(id) {
        if (isMongoConnected) {
            await NotificationModel.findOneAndUpdate({ id }, { isRead: true });
        }
        const notif = store.notifications.find(n => n.id === id);
        if (notif) {
            notif.isRead = true;
            return true;
        }
        return false;
    },
    // ================= QUERY APPROVALS & DB ACCESS =================
    async getQueryApprovals() {
        if (isMongoConnected) {
            return await QueryApprovalRequestModel.find().sort({ requestDate: -1 }).lean();
        }
        return store.queryApprovals;
    },
    async createQueryApproval(req) {
        if (isMongoConnected) {
            await QueryApprovalRequestModel.create(req);
        }
        store.queryApprovals.unshift(req);
        return req;
    },
    async updateQueryApproval(id, status) {
        let updated = null;
        if (isMongoConnected) {
            updated = await QueryApprovalRequestModel.findOneAndUpdate({ id }, { status }, { new: true }).lean();
        }
        const req = store.queryApprovals.find(a => a.id === id);
        if (req) {
            req.status = status;
            if (!updated)
                updated = req;
        }
        return updated;
    },
    async getDbAccessRequests() {
        if (isMongoConnected) {
            return await DbAccessRequestModel.find().sort({ requestDate: -1 }).lean();
        }
        return store.dbAccessRequests;
    },
    async createDbAccessRequest(req) {
        if (isMongoConnected) {
            await DbAccessRequestModel.create(req);
        }
        store.dbAccessRequests.unshift(req);
        return req;
    },
    async updateDbAccessRequest(id, status) {
        let updated = null;
        if (isMongoConnected) {
            updated = await DbAccessRequestModel.findOneAndUpdate({ id }, { status }, { new: true }).lean();
        }
        const req = store.dbAccessRequests.find(a => a.id === id);
        if (req) {
            req.status = status;
            if (!updated)
                updated = req;
        }
        return updated;
    },
    async getConnectionLogs() {
        if (isMongoConnected) {
            return await ConnectionUsageLogModel.find().sort({ timestamp: -1 }).limit(200).lean();
        }
        return store.connectionLogs;
    },
    async createConnectionLog(log) {
        if (isMongoConnected) {
            await ConnectionUsageLogModel.create(log);
        }
        store.connectionLogs.unshift(log);
        return log;
    },
    // ================= HASHTAGS & PLUGINS =================
    async getHashtags() {
        if (isMongoConnected) {
            return await HashtagPresetModel.find().lean();
        }
        return store.hashtags;
    },
    async createHashtag(tag) {
        if (isMongoConnected) {
            await HashtagPresetModel.create(tag);
        }
        store.hashtags.push(tag);
        return tag;
    },
    async getPlugins() {
        if (isMongoConnected) {
            return await PluginModel.find().lean();
        }
        return store.plugins;
    },
    async togglePlugin(id, enabled) {
        let updated = null;
        if (isMongoConnected) {
            const plugin = await PluginModel.findOne({ id });
            if (plugin) {
                plugin.enabled = enabled !== undefined ? enabled : !plugin.enabled;
                await plugin.save();
                updated = plugin.toObject();
            }
        }
        const p = store.plugins.find(item => item.id === id);
        if (p) {
            p.enabled = enabled !== undefined ? enabled : !p.enabled;
            if (!updated)
                updated = p;
        }
        return updated;
    },
    // ================= METRICS =================
    async getMetrics() {
        let totalIssues = 0;
        let openIssues = 0;
        let resolvedIssues = 0;
        let pendingUsers = 0;
        let totalUsers = 0;
        let dbConnections = 0;
        if (isMongoConnected) {
            totalIssues = await IssueModel.countDocuments();
            openIssues = await IssueModel.countDocuments({ status: { $in: ['Open', 'Investigating'] } });
            resolvedIssues = await IssueModel.countDocuments({ status: { $in: ['Resolved', 'Closed'] } });
            pendingUsers = await UserModel.countDocuments({ isApproved: false });
            totalUsers = await UserModel.countDocuments();
            dbConnections = await DatabaseConnectionModel.countDocuments();
        }
        else {
            totalIssues = store.issues.length;
            openIssues = store.issues.filter(i => i.status === 'Open' || i.status === 'Investigating').length;
            resolvedIssues = store.issues.filter(i => i.status === 'Resolved' || i.status === 'Closed').length;
            pendingUsers = store.users.filter(u => !u.isApproved).length;
            totalUsers = store.users.length;
            dbConnections = store.databases.length;
        }
        return {
            totalIssues,
            openIssues,
            resolvedIssues,
            pendingUsers,
            totalUsers,
            dbConnections,
            reconciliationRate: totalIssues > 0 ? Math.round((resolvedIssues / totalIssues) * 100) : 100
        };
    },
    // ================= TRANSACTIONS & SETTINGS =================
    async getTransactionSchema() {
        if (isMongoConnected) {
            const config = await GlobalTransactionSchemaConfigModel.findOne().lean();
            if (config) {
                return {
                    version: config.version || '1.0',
                    updatedAt: config.updatedAt || new Date().toISOString(),
                    updatedBy: config.updatedBy || 'admin',
                    standardFields: (config.standardFields || config.systemStandardFields || store.globalSchema.systemStandardFields),
                    customFields: (config.customFields || store.globalSchema.customFields),
                    defaultTemplateId: config.defaultTemplateId
                };
            }
        }
        return {
            version: store.globalSchema.version,
            updatedAt: store.globalSchema.updatedAt,
            updatedBy: store.globalSchema.updatedBy,
            standardFields: store.globalSchema.systemStandardFields,
            customFields: store.globalSchema.customFields,
            defaultTemplateId: store.globalSchema.defaultTemplateId
        };
    },
    async updateTransactionSchema(config) {
        const current = await repo.getTransactionSchema();
        const updated = {
            ...current,
            ...config,
            updatedAt: new Date().toISOString()
        };
        if (isMongoConnected) {
            await GlobalTransactionSchemaConfigModel.findOneAndUpdate({}, updated, { upsert: true, new: true });
        }
        store.globalSchema.customFields = updated.customFields;
        store.globalSchema.updatedAt = updated.updatedAt;
        if (updated.defaultTemplateId)
            store.globalSchema.defaultTemplateId = updated.defaultTemplateId;
        return updated;
    },
    async getTransactionTemplates() {
        if (isMongoConnected) {
            return await TransactionTemplateModel.find().lean();
        }
        return store.transactionTemplates;
    },
    async saveTransactionTemplate(tmpl) {
        if (isMongoConnected) {
            await TransactionTemplateModel.findOneAndUpdate({ id: tmpl.id }, tmpl, { upsert: true, new: true });
        }
        const idx = store.transactionTemplates.findIndex(t => t.id === tmpl.id);
        if (idx >= 0)
            store.transactionTemplates[idx] = tmpl;
        else
            store.transactionTemplates.push(tmpl);
        return tmpl;
    },
    async deleteTransactionTemplate(id) {
        if (isMongoConnected) {
            await TransactionTemplateModel.deleteOne({ id });
        }
        const idx = store.transactionTemplates.findIndex(t => t.id === id);
        if (idx !== -1) {
            store.transactionTemplates.splice(idx, 1);
            return true;
        }
        return false;
    },
    async getUploadedTransactions(params) {
        const limit = params?.limit || 100;
        if (isMongoConnected) {
            const filter = {};
            if (params?.batchId)
                filter.batchId = params.batchId;
            if (params?.status)
                filter['mappedData.status'] = params.status;
            if (params?.search) {
                filter.$or = [
                    { 'mappedData.transaction_id': { $regex: params.search, $options: 'i' } },
                    { 'mappedData.card_number': { $regex: params.search, $options: 'i' } },
                    { 'mappedData.customer_email': { $regex: params.search, $options: 'i' } }
                ];
            }
            const totalCount = await UploadedTransactionRecordModel.countDocuments(filter);
            const records = await UploadedTransactionRecordModel.find(filter).limit(limit).lean();
            return { totalCount, returnedCount: records.length, transactions: records };
        }
        let list = [...store.uploadedTransactions];
        if (params?.batchId)
            list = list.filter(r => r.batchId === params.batchId);
        if (params?.status)
            list = list.filter(r => r.mappedData?.status === params.status);
        if (params?.search) {
            const s = params.search.toLowerCase();
            list = list.filter(r => r.mappedData?.transaction_id?.toLowerCase().includes(s) ||
                r.mappedData?.card_number?.toLowerCase().includes(s) ||
                r.mappedData?.customer_email?.toLowerCase().includes(s));
        }
        return { totalCount: list.length, returnedCount: Math.min(list.length, limit), transactions: list.slice(0, limit) };
    },
    async saveUploadedTransactions(records) {
        if (isMongoConnected) {
            await UploadedTransactionRecordModel.insertMany(records);
        }
        store.uploadedTransactions.push(...records);
    },
    async clearUploadedTransactions(batchId) {
        if (isMongoConnected) {
            const query = batchId ? { batchId } : {};
            await UploadedTransactionRecordModel.deleteMany(query);
        }
        if (batchId) {
            store.uploadedTransactions = store.uploadedTransactions.filter(r => r.batchId !== batchId);
        }
        else {
            store.uploadedTransactions = [];
        }
    },
    async getUploadAuditLogs() {
        if (isMongoConnected) {
            return await UploadAuditLogModel.find().sort({ uploadedAt: -1 }).lean();
        }
        return store.uploadAuditLogs;
    },
    async createUploadAuditLog(log) {
        if (isMongoConnected) {
            await UploadAuditLogModel.create(log);
        }
        store.uploadAuditLogs.unshift(log);
        return log;
    },
    async getWorkspaceTableRecords() {
        if (isMongoConnected) {
            return await WorkspaceTableRecordModel.find().lean();
        }
        return store.workspaceTableRecords;
    },
    async saveWorkspaceTableRecords(records) {
        if (isMongoConnected) {
            await WorkspaceTableRecordModel.deleteMany({});
            await WorkspaceTableRecordModel.insertMany(records);
        }
        store.workspaceTableRecords = [...records];
        return records;
    },
    async deleteWorkspaceTableRecord(id) {
        if (isMongoConnected) {
            await WorkspaceTableRecordModel.deleteOne({ id });
        }
        const idx = store.workspaceTableRecords.findIndex(r => r.id === id);
        if (idx !== -1) {
            store.workspaceTableRecords.splice(idx, 1);
            return true;
        }
        return false;
    },
    async clearWorkspaceTableRecords() {
        if (isMongoConnected) {
            await WorkspaceTableRecordModel.deleteMany({});
        }
        store.workspaceTableRecords = [];
    },
    // ================= ORGANIZATIONS =================
    async getOrganizations() {
        if (isMongoConnected) {
            return await OrganizationModel.find().lean();
        }
        return store.organizations;
    },
    async createOrganization(org) {
        if (isMongoConnected) {
            await OrganizationModel.create(org);
        }
        store.organizations.push(org);
        return org;
    },
    // ================= VALIDATION WORKFLOWS & STAGES =================
    async getWorkflows() {
        return await postgresRepo.getValidationWorkflows();
    },
    async getWorkflowById(id) {
        return await postgresRepo.getValidationWorkflowById(id);
    },
    async createWorkflow(wf) {
        return await postgresRepo.createValidationWorkflow(wf);
    },
    async updateWorkflow(id, updates) {
        if (isPostgresConnected) {
            const updated = await postgresRepo.updateValidationWorkflow(id, updates);
            if (updated)
                return updated;
        }
        if (isMongoConnected) {
            const updated = await DatabaseValidationWorkflowModel.findOneAndUpdate({ id }, { $set: updates }, { new: true }).lean();
            if (updated) {
                const idx = store.workflows.findIndex(w => w.id === id);
                if (idx !== -1)
                    store.workflows[idx] = updated;
                return updated;
            }
        }
        const idx = store.workflows.findIndex(w => w.id === id);
        if (idx !== -1) {
            store.workflows[idx] = { ...store.workflows[idx], ...updates, updatedAt: new Date().toISOString() };
            return store.workflows[idx];
        }
        return null;
    },
    async deleteWorkflow(id) {
        if (isPostgresConnected) {
            const deleted = await postgresRepo.deleteWorkflow(id);
            if (deleted)
                return true;
        }
        if (isMongoConnected) {
            await DatabaseValidationWorkflowModel.deleteOne({ id });
        }
        const idx = store.workflows.findIndex(w => w.id === id);
        if (idx !== -1) {
            store.workflows.splice(idx, 1);
            return true;
        }
        return false;
    },
    // ================= QUERY EXTRACTIONS =================
    async getQueryExtractionsByWorkflowId(workflowId) {
        if (isMongoConnected) {
            return await QueryExtractionModel.find({ workflowId }).lean();
        }
        return store.queryExtractions.filter(q => q.workflowId === workflowId);
    },
    async getQueryExtractionById(id) {
        if (isMongoConnected) {
            return await QueryExtractionModel.findOne({ id }).lean();
        }
        return store.queryExtractions.find(q => q.id === id) || null;
    },
    async createQueryExtraction(extraction) {
        if (isMongoConnected) {
            await QueryExtractionModel.create(extraction);
        }
        const idx = store.queryExtractions.findIndex(q => q.id === extraction.id);
        if (idx !== -1) {
            store.queryExtractions[idx] = extraction;
        }
        else {
            store.queryExtractions.push(extraction);
        }
        return extraction;
    },
    async updateQueryExtraction(id, updates) {
        if (isMongoConnected) {
            const updated = await QueryExtractionModel.findOneAndUpdate({ id }, { $set: updates }, { new: true }).lean();
            if (updated) {
                const idx = store.queryExtractions.findIndex(q => q.id === id);
                if (idx !== -1)
                    store.queryExtractions[idx] = updated;
                return updated;
            }
        }
        const idx = store.queryExtractions.findIndex(q => q.id === id);
        if (idx !== -1) {
            store.queryExtractions[idx] = { ...store.queryExtractions[idx], ...updates, updatedAt: new Date().toISOString() };
            return store.queryExtractions[idx];
        }
        return null;
    },
    async deleteQueryExtraction(id) {
        if (isPostgresConnected) {
            const deleted = await postgresRepo.deleteQueryExtraction(id);
            if (deleted)
                return true;
        }
        if (isMongoConnected) {
            await QueryExtractionModel.deleteOne({ id });
        }
        const idx = store.queryExtractions.findIndex(q => q.id === id);
        if (idx !== -1) {
            store.queryExtractions.splice(idx, 1);
            return true;
        }
        return false;
    },
    // ================= INVESTIGATION TASKS & BATCHES =================
    async createInvestigationTask(task) {
        if (isPostgresConnected) {
            return await postgresRepo.createInvestigationTask(task);
        }
        if (isMongoConnected) {
            await InvestigationTaskModel.create(task);
        }
        store.investigationTasks.push(task);
        return task;
    },
    async getInvestigationTaskById(id) {
        if (isPostgresConnected) {
            return await postgresRepo.getInvestigationTaskById(id);
        }
        if (isMongoConnected) {
            return await InvestigationTaskModel.findOne({ id }).lean();
        }
        return store.investigationTasks.find(t => t.id === id) || null;
    },
    async updateInvestigationTask(id, updates) {
        if (isPostgresConnected) {
            return await postgresRepo.updateInvestigationTask(id, updates);
        }
        if (isMongoConnected) {
            const updated = await InvestigationTaskModel.findOneAndUpdate({ id }, { $set: updates }, { new: true }).lean();
            if (updated) {
                const idx = store.investigationTasks.findIndex(t => t.id === id);
                if (idx !== -1)
                    store.investigationTasks[idx] = updated;
                return updated;
            }
        }
        const idx = store.investigationTasks.findIndex(t => t.id === id);
        if (idx !== -1) {
            store.investigationTasks[idx] = { ...store.investigationTasks[idx], ...updates };
            return store.investigationTasks[idx];
        }
        return null;
    },
    async createInvestigationBatch(batch) {
        if (isPostgresConnected) {
            return await postgresRepo.createInvestigationBatch(batch);
        }
        if (isMongoConnected) {
            await InvestigationBatchModel.create(batch);
        }
        store.investigationBatches.push(batch);
        return batch;
    },
    async getInvestigationBatchesByTaskId(taskId) {
        if (isPostgresConnected) {
            return await postgresRepo.getInvestigationBatchesByTaskId(taskId);
        }
        if (isMongoConnected) {
            return await InvestigationBatchModel.find({ taskId }).sort({ sequence: 1 }).lean();
        }
        return store.investigationBatches.filter(b => b.taskId === taskId).sort((a, b) => a.sequence - b.sequence);
    },
    async updateInvestigationBatch(id, updates) {
        if (isPostgresConnected) {
            return await postgresRepo.updateInvestigationBatch(id, updates);
        }
        if (isMongoConnected) {
            const updated = await InvestigationBatchModel.findOneAndUpdate({ id }, { $set: updates }, { new: true }).lean();
            if (updated) {
                const idx = store.investigationBatches.findIndex(b => b.id === id);
                if (idx !== -1)
                    store.investigationBatches[idx] = updated;
                return updated;
            }
        }
        const idx = store.investigationBatches.findIndex(b => b.id === id);
        if (idx !== -1) {
            store.investigationBatches[idx] = { ...store.investigationBatches[idx], ...updates };
            return store.investigationBatches[idx];
        }
        return null;
    },
    async createInvestigationTransaction(tx) {
        if (isPostgresConnected) {
            return await postgresRepo.createInvestigationTransaction(tx);
        }
        if (isMongoConnected) {
            await InvestigationTransactionModel.create(tx);
        }
        store.investigationTransactions.push(tx);
        return tx;
    },
    async getInvestigationTransactionsByTaskId(taskId) {
        if (isPostgresConnected) {
            return await postgresRepo.getInvestigationTransactionsByTaskId(taskId);
        }
        if (isMongoConnected) {
            return await InvestigationTransactionModel.find({ taskId }).lean();
        }
        return store.investigationTransactions.filter(t => t.taskId === taskId);
    },
    async getInvestigationTransaction(taskId, transactionId) {
        if (isPostgresConnected) {
            return await postgresRepo.getInvestigationTransaction(taskId, transactionId);
        }
        if (isMongoConnected) {
            return await InvestigationTransactionModel.findOne({ taskId, transactionId }).lean();
        }
        return store.investigationTransactions.find(t => t.taskId === taskId && t.transactionId === transactionId) || null;
    },
    // ================= CENTRAL TRANSACTION REPOSITORY =================
    async upsertCentralTransactions(records) {
        if (isPostgresConnected) {
            return await postgresRepo.upsertCentralTransactions(records);
        }
        for (const rec of records) {
            const idx = store.centralTransactions.findIndex(r => r.transactionKey === rec.transactionKey);
            if (idx !== -1) {
                const existing = store.centralTransactions[idx];
                const allTaskIds = Array.from(new Set([...existing.allTaskIds, rec.currentTaskId]));
                const workflowIds = Array.from(new Set([...(existing.workflowIds || []), ...(rec.workflowIds || [])]));
                store.centralTransactions[idx] = {
                    ...existing,
                    currentTaskId: rec.currentTaskId,
                    allTaskIds,
                    batchId: rec.batchId,
                    rowNumber: rec.rowNumber,
                    status: rec.status,
                    isDuplicate: true,
                    duplicateFromTaskId: existing.originalTaskId,
                    workflowIds,
                    canonicalData: rec.canonicalData,
                    rawData: rec.rawData,
                    updatedAt: new Date().toISOString()
                };
            }
            else {
                store.centralTransactions.push(rec);
            }
        }
    },
    async getCentralTransaction(key) {
        if (isPostgresConnected) {
            return await postgresRepo.getCentralTransaction(key);
        }
        return store.centralTransactions.find(r => r.transactionKey === key) || null;
    },
    async getCentralTransactionsByTaskId(taskId) {
        if (isPostgresConnected) {
            return await postgresRepo.getCentralTransactionsByTaskId(taskId);
        }
        return store.centralTransactions.filter(r => r.currentTaskId === taskId || r.originalTaskId === taskId);
    },
    async getCentralTransactionsByBatchId(batchId) {
        if (isPostgresConnected) {
            return await postgresRepo.getCentralTransactionsByBatchId(batchId);
        }
        return store.centralTransactions.filter(r => r.batchId === batchId);
    },
    // ================= STANDALONE VALIDATION BOXES =================
    async getValidationBoxes() {
        if (isPostgresConnected) {
            return await postgresRepo.getValidationBoxes();
        }
        return store.validationBoxes;
    },
    async getValidationBoxById(id) {
        if (isPostgresConnected) {
            return await postgresRepo.getValidationBoxById(id);
        }
        return store.validationBoxes.find(b => b.id === id) || null;
    },
    async createValidationBox(box) {
        if (isPostgresConnected) {
            return await postgresRepo.createValidationBox(box);
        }
        const idx = store.validationBoxes.findIndex(b => b.id === box.id);
        if (idx !== -1) {
            store.validationBoxes[idx] = box;
        }
        else {
            store.validationBoxes.push(box);
        }
        return box;
    },
    async updateValidationBox(id, updates) {
        if (isPostgresConnected) {
            return await postgresRepo.updateValidationBox(id, updates);
        }
        const idx = store.validationBoxes.findIndex(b => b.id === id);
        if (idx === -1)
            return null;
        store.validationBoxes[idx] = { ...store.validationBoxes[idx], ...updates, updatedAt: new Date().toISOString() };
        return store.validationBoxes[idx];
    },
    async deleteValidationBox(id) {
        if (isPostgresConnected) {
            return await postgresRepo.deleteValidationBox(id);
        }
        const initialLen = store.validationBoxes.length;
        store.validationBoxes = store.validationBoxes.filter(b => b.id !== id);
        return store.validationBoxes.length < initialLen;
    },
    // ================= FTP FILE STAGING CONFIGS =================
    async getFtpStagingConfigs() {
        if (isPostgresConnected) {
            return await postgresRepo.getFtpStagingConfigs();
        }
        return store.ftpStagingConfigs || [];
    },
    async getFtpStagingConfigById(id) {
        if (isPostgresConnected) {
            return await postgresRepo.getFtpStagingConfigById(id);
        }
        return (store.ftpStagingConfigs || []).find((c) => c.id === id) || null;
    },
    async createFtpStagingConfig(config) {
        if (isPostgresConnected) {
            return await postgresRepo.createFtpStagingConfig(config);
        }
        if (!store.ftpStagingConfigs)
            store.ftpStagingConfigs = [];
        store.ftpStagingConfigs.push(config);
        return config;
    },
    async updateFtpStagingConfig(id, updates) {
        if (isPostgresConnected) {
            return await postgresRepo.updateFtpStagingConfig(id, updates);
        }
        const list = store.ftpStagingConfigs || [];
        const idx = list.findIndex((c) => c.id === id);
        if (idx !== -1) {
            list[idx] = { ...list[idx], ...updates };
            return list[idx];
        }
        return null;
    },
    async deleteFtpStagingConfig(id) {
        if (isPostgresConnected) {
            return await postgresRepo.deleteFtpStagingConfig(id);
        }
        const list = store.ftpStagingConfigs || [];
        const idx = list.findIndex((c) => c.id === id);
        if (idx !== -1) {
            list.splice(idx, 1);
            return true;
        }
        return false;
    },
    // ================= GLOBAL STANDARD DIRECTORY =================
    async getGlobalStandardDirectory() {
        return await postgresRepo.getGlobalStandardDirectory();
    },
    async getGlobalStandardDirectoryField(idOrKey) {
        return await postgresRepo.getGlobalStandardDirectoryField(idOrKey);
    },
    async saveGlobalStandardDirectoryField(record) {
        return await postgresRepo.saveGlobalStandardDirectoryField(record);
    },
    async deleteGlobalStandardDirectoryField(idOrKey) {
        return await postgresRepo.deleteGlobalStandardDirectoryField(idOrKey);
    },
    // ================= TASK WORKFLOW EXECUTIONS (LOOKUP TABLE) =================
    async getTaskWorkflowExecution(taskId, workflowId) {
        return await postgresRepo.getTaskWorkflowExecution(taskId, workflowId);
    },
    async recordTaskWorkflowExecution(exec) {
        return await postgresRepo.recordTaskWorkflowExecution(exec);
    },
    async getTaskWorkflowExecutionsByTaskId(taskId) {
        return await postgresRepo.getTaskWorkflowExecutionsByTaskId(taskId);
    },
    async clearTaskWorkflowExecutions(taskId) {
        return await postgresRepo.clearTaskWorkflowExecutions(taskId);
    },
    async clearAllValidationExecutions() {
        return await postgresRepo.clearAllValidationExecutions();
    },
    // ================= CROSS-TASK DUPLICATES =================
    async runCrossTaskDuplicateScan() {
        return await postgresRepo.runCrossTaskDuplicateScan();
    },
    async moveTransactionToTask(transactionKey, targetTaskId) {
        return await postgresRepo.moveTransactionToTask(transactionKey, targetTaskId);
    },
    async removeTransactionFromTask(transactionKey, taskId) {
        return await postgresRepo.removeTransactionFromTask(transactionKey, taskId);
    },
    // ================= DATABASE COLUMN CONFIGURATIONS =================
    async getColumnConfigurations(dbId, tableName) {
        if (isPostgresConnected) {
            return await postgresRepo.getColumnConfigurations(dbId, tableName);
        }
        let configs = store.columnConfigurations;
        if (dbId) {
            configs = configs.filter(c => c.dbId === dbId);
        }
        if (tableName) {
            configs = configs.filter(c => c.tableName.toLowerCase() === tableName.toLowerCase());
        }
        return configs;
    },
    async getColumnConfigurationById(id) {
        if (isPostgresConnected) {
            return await postgresRepo.getColumnConfigurationById(id);
        }
        return store.columnConfigurations.find(c => c.id === id) || null;
    },
    async createColumnConfiguration(config) {
        if (isPostgresConnected) {
            return await postgresRepo.createColumnConfiguration(config);
        }
        store.columnConfigurations = store.columnConfigurations.filter(c => c.id !== config.id);
        store.columnConfigurations.push(config);
        return config;
    },
    async updateColumnConfiguration(id, updates) {
        if (isPostgresConnected) {
            return await postgresRepo.updateColumnConfiguration(id, updates);
        }
        const idx = store.columnConfigurations.findIndex(c => c.id === id);
        if (idx === -1)
            return null;
        store.columnConfigurations[idx] = {
            ...store.columnConfigurations[idx],
            ...updates,
            id,
            updatedAt: new Date().toISOString()
        };
        return store.columnConfigurations[idx];
    },
    async deleteColumnConfiguration(id) {
        if (isPostgresConnected) {
            return await postgresRepo.deleteColumnConfiguration(id);
        }
        const initialLen = store.columnConfigurations.length;
        store.columnConfigurations = store.columnConfigurations.filter(c => c.id !== id);
        return store.columnConfigurations.length < initialLen;
    }
};

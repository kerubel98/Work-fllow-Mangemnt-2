import { isMongoConnected } from './db.js';
import { UserModel } from '../models/User.js';
import { HashtagPresetModel } from '../models/HashtagPreset.js';
import { PluginModel } from '../models/Plugin.js';
import { DatabaseConnectionModel } from '../models/DatabaseConnection.js';
import { EnvironmentSystemModel } from '../models/EnvironmentSystem.js';
import { TeamModel } from '../models/Team.js';
import { IssueModel } from '../models/Issue.js';
import { OrganizationModel } from '../models/Organization.js';
import { TransactionTemplateModel } from '../models/TransactionTemplate.js';
import { GlobalTransactionSchemaConfigModel } from '../models/GlobalTransactionSchemaConfig.js';
import { UploadedTransactionRecordModel } from '../models/UploadedTransactionRecord.js';
import { UploadAuditLogModel } from '../models/UploadAuditLog.js';
import { WorkspaceTableRecordModel } from '../models/WorkspaceTableRecord.js';
import { DirectMessageModel } from '../models/DirectMessage.js';
import {
  INITIAL_USERS,
  INITIAL_HASHTAGS,
  INITIAL_PLUGINS,
  INITIAL_DBS,
  INITIAL_SYSTEMS,
  INITIAL_TEAMS,
  INITIAL_ISSUES,
  INITIAL_ORGANIZATIONS,
  store
} from '../store/dataStore.js';

export async function seedDatabase() {
  if (!isMongoConnected) return;

  try {
    const userCount = await UserModel.countDocuments();
    if (userCount === 0) {
      console.log('🌱 Seeding initial MongoDB collection data...');
      await UserModel.insertMany(INITIAL_USERS);
      await HashtagPresetModel.insertMany(INITIAL_HASHTAGS);
      await PluginModel.insertMany(INITIAL_PLUGINS);
      await DatabaseConnectionModel.insertMany(INITIAL_DBS);
      await EnvironmentSystemModel.insertMany(INITIAL_SYSTEMS);
      await TeamModel.insertMany(INITIAL_TEAMS);
      await IssueModel.insertMany(INITIAL_ISSUES);
      await OrganizationModel.insertMany(INITIAL_ORGANIZATIONS);
      await DirectMessageModel.insertMany(store.directMessages);
      // Seed Templates & Global Schema
      await TransactionTemplateModel.insertMany(store.transactionTemplates);
      await GlobalTransactionSchemaConfigModel.create(store.globalSchema);
      
      // Seed Uploaded Transactions if any
      if (store.uploadedTransactions.length > 0) {
        await UploadedTransactionRecordModel.insertMany(store.uploadedTransactions);
      }
      if (store.uploadAuditLogs.length > 0) {
        await UploadAuditLogModel.insertMany(store.uploadAuditLogs);
      }
      if (store.workspaceTableRecords.length > 0) {
        await WorkspaceTableRecordModel.insertMany(store.workspaceTableRecords);
      }

      console.log('🎉 MongoDB database seeded with all collections successfully!');
    }
  } catch (err: any) {
    console.error('Error seeding MongoDB database:', err.message);
  }
}



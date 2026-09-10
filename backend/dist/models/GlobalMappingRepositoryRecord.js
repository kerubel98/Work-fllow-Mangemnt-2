import { Schema } from 'mongoose';
import { mysqlModel } from './mysqlModel.js';
const GlobalMappingRepositoryRecordSchema = new Schema({
    file_name: { type: String, required: true, index: true },
    date_created: { type: String, required: true, index: true },
    tag: { type: String, default: 'Untagged', index: true },
    user: { type: String, default: 'anonymous_user', index: true },
    user_id: { type: String, default: 'usr-1' },
    task_id: { type: String, default: 'TASK-GEN' },
    mapping_id: { type: String, default: 'global-pos-standard' },
    mapping_name: { type: String, default: 'Global POS Data Standard' },
    row_number: { type: Number, required: true },
    data: { type: Schema.Types.Mixed, default: {} },
    raw_data: { type: Schema.Types.Mixed, default: {} }
}, { collection: 'global_mapping_repository', strict: false });
export const GlobalMappingRepositoryRecordModel = mysqlModel('global_mapping_repository');

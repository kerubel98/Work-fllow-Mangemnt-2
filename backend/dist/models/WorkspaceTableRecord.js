import mongoose, { Schema } from 'mongoose';
const WorkspaceTableRecordSchema = new Schema({
    id: { type: String, required: true, unique: true },
    file_name: { type: String, required: true },
    user: { type: String, default: 'anonymous' },
    user_id: { type: String, default: 'usr-1' },
    tag: { type: String, default: 'Untagged' },
    task_id: { type: String, required: true },
    mapping_id: { type: String, default: 'global-standard' },
    mapping_name: { type: String, default: 'Global Standard Mapping' },
    list_of_values_from_one_row: { type: [Schema.Types.Mixed], default: [] },
    transformed_data: { type: Schema.Types.Mixed, default: {} },
    raw_data: { type: Schema.Types.Mixed, default: {} },
    createdAt: { type: String, default: () => new Date().toISOString() }
}, { timestamps: true });
export const WorkspaceTableRecordModel = mongoose.model('WorkspaceTableRecord', WorkspaceTableRecordSchema);

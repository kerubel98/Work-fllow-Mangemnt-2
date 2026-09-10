import mongoose, { Schema } from 'mongoose';
const CriteriaRuleSchema = new Schema({
    column: { type: String, required: true },
    operator: { type: String, required: true },
    value: { type: String }
});
const HashtagPresetSchema = new Schema({
    tag: { type: String, required: true, unique: true },
    description: { type: String, required: true },
    criteria: { type: String, required: true },
    expectedFileStructure: [{ type: String }],
    solutionTemplate: { type: String, required: true },
    author: { type: String, required: true },
    createdAt: { type: String, default: () => new Date().toISOString() },
    fileTemplateData: { type: Array },
    criteriaRules: [CriteriaRuleSchema]
}, { timestamps: true });
export const HashtagPresetModel = mongoose.model('HashtagPreset', HashtagPresetSchema);

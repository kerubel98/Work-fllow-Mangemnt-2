import mongoose, { Schema, Document } from 'mongoose';
import { CriteriaRule } from '../types.js';

export interface IHashtagPreset extends Document {
  tag: string;
  description: string;
  criteria: string;
  expectedFileStructure: string[];
  solutionTemplate: string;
  author: string;
  createdAt: string;
  fileTemplateData?: Record<string, string>[];
  criteriaRules?: CriteriaRule[];
}

const CriteriaRuleSchema = new Schema({
  column: { type: String, required: true },
  operator: { type: String, required: true },
  value: { type: String }
});

const HashtagPresetSchema: Schema = new Schema(
  {
    tag: { type: String, required: true, unique: true },
    description: { type: String, required: true },
    criteria: { type: String, required: true },
    expectedFileStructure: [{ type: String }],
    solutionTemplate: { type: String, required: true },
    author: { type: String, required: true },
    createdAt: { type: String, default: () => new Date().toISOString() },
    fileTemplateData: { type: Array },
    criteriaRules: [CriteriaRuleSchema]
  },
  { timestamps: true }
);

export const HashtagPresetModel = mongoose.model<IHashtagPreset>('HashtagPreset', HashtagPresetSchema);

import mongoose, { Schema, Document } from 'mongoose';

export interface IPlugin extends Document {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  category: 'notification' | 'security' | 'automation' | 'database';
  config?: Record<string, string>;
}

const PluginSchema: Schema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    description: { type: String, required: true },
    enabled: { type: Boolean, default: true },
    category: { type: String, required: true, enum: ['notification', 'security', 'automation', 'database'] },
    config: { type: Map, of: String }
  },
  { timestamps: true }
);

export const PluginModel = mongoose.model<IPlugin>('Plugin', PluginSchema);

import mongoose, { Schema } from 'mongoose';
const PluginSchema = new Schema({
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    description: { type: String, required: true },
    enabled: { type: Boolean, default: true },
    category: { type: String, required: true, enum: ['notification', 'security', 'automation', 'database'] },
    config: { type: Map, of: String }
}, { timestamps: true });
export const PluginModel = mongoose.model('Plugin', PluginSchema);

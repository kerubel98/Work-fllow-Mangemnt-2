import React, { useState } from 'react';
import { GlobalTransactionSchemaField, User } from '../../types';
import { Layers, Plus, Trash2, Check, Sparkles, Code, Copy, CheckCheck } from 'lucide-react';
import { api } from '../../api/client';

interface TransactionSchemaBuilderProps {
  currentUser: User;
  standardFields: GlobalTransactionSchemaField[];
  customFields: GlobalTransactionSchemaField[];
  onSaveCustomFields: (fields: GlobalTransactionSchemaField[]) => void;
}

export default function TransactionSchemaBuilder({
  currentUser,
  standardFields,
  customFields,
  onSaveCustomFields
}: TransactionSchemaBuilderProps) {
  const [fields, setFields] = useState<GlobalTransactionSchemaField[]>(customFields);
  const [newKey, setNewKey] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newType, setNewType] = useState<'string' | 'number' | 'date' | 'boolean'>('string');
  const [newRequired, setNewRequired] = useState(false);
  const [newDesc, setNewDesc] = useState('');
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleAddField = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKey.trim()) return;

    const formattedKey = newKey.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const newField: GlobalTransactionSchemaField = {
      key: formattedKey,
      label: newLabel.trim() || formattedKey.replace(/_/g, ' ').toUpperCase(),
      description: newDesc.trim() || 'Custom operational transaction field',
      dataType: newType,
      required: newRequired,
      isStandard: false
    };

    const updated = [...fields, newField];
    setFields(updated);
    onSaveCustomFields(updated);
    setNewKey('');
    setNewLabel('');
    setNewDesc('');
  };

  const handleRemoveField = (keyToRemove: string) => {
    const updated = fields.filter(f => f.key !== keyToRemove);
    setFields(updated);
    onSaveCustomFields(updated);
  };

  const handleSaveToApi = async () => {
    try {
      await api.updateTransactionSchema(fields, undefined, currentUser.username);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2500);
    } catch (err) {
      console.warn('Could not save schema to API:', err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Dynamic Transaction Schema Configuration</h2>
          <p className="text-xs text-slate-500">Define system standard and dynamic custom attributes for transaction payloads</p>
        </div>

        <button
          type="button"
          onClick={handleSaveToApi}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition shadow-sm"
        >
          <Check className="w-4 h-4" />
          <span>{savedSuccess ? 'Schema Saved!' : 'Save Schema to DB'}</span>
        </button>
      </div>

      {/* Add New Custom Field Form */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        <h3 className="font-bold text-slate-800 text-sm mb-3 flex items-center gap-1.5">
          <Plus className="w-4 h-4 text-blue-600" />
          <span>Add Custom Transaction Attribute</span>
        </h3>

        <form onSubmit={handleAddField} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Key Name</label>
            <input
              type="text"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder="e.g. terminal_batch_id"
              required
              className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Display Label</label>
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="e.g. Terminal Batch ID"
              className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Data Type</label>
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value as any)}
              className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="string">string</option>
              <option value="number">number</option>
              <option value="date">date</option>
              <option value="boolean">boolean</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Description</label>
            <input
              type="text"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Field purpose"
              className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition shadow-sm"
            >
              Add Field
            </button>
          </div>
        </form>
      </div>

      {/* Standard Fields Section */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <h3 className="font-bold text-slate-900 text-sm mb-3 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-indigo-600" />
            <span>System Standard Fields ({standardFields.length})</span>
          </span>
          <span className="text-[11px] text-slate-400 font-normal">Protected Core Schema</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {standardFields.map((field) => (
            <div key={field.key} className="p-2.5 bg-slate-50 rounded-lg border border-slate-100 flex items-center justify-between">
              <div>
                <p className="font-semibold text-slate-800 text-xs font-mono">{field.key}</p>
                <p className="text-[11px] text-slate-400">{field.label} ({field.dataType})</p>
              </div>
              {field.required && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 border border-rose-200">
                  Required
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Custom Fields Section */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <h3 className="font-bold text-slate-900 text-sm mb-3 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-purple-600" />
            <span>Custom Dynamic Fields ({fields.length})</span>
          </span>
        </h3>

        {fields.length === 0 ? (
          <p className="text-xs text-slate-400 italic">No custom fields defined yet. Add one above.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {fields.map((field) => (
              <div key={field.key} className="p-2.5 bg-purple-50/60 rounded-lg border border-purple-100 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-purple-900 text-xs font-mono">{field.key}</p>
                  <p className="text-[11px] text-purple-600">{field.label} • {field.dataType}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveField(field.key)}
                  className="p-1 text-slate-400 hover:text-red-600 rounded"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

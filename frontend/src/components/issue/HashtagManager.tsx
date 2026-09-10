import React, { useState } from 'react';
import { HashtagPreset, User } from '../../types';
import { Tag, Plus, Terminal, CheckCircle, FileText, X, Sparkles } from 'lucide-react';

interface HashtagManagerProps {
  hashtags: HashtagPreset[];
  currentUser: User;
  onCreatePreset: (preset: HashtagPreset) => void;
}

export default function HashtagManager({
  hashtags,
  currentUser,
  onCreatePreset
}: HashtagManagerProps) {
  const [selectedTag, setSelectedTag] = useState<HashtagPreset | null>(hashtags[0] || null);
  const [isCreating, setIsCreating] = useState(false);

  // Form State
  const [newTagName, setNewTagName] = useState('#');
  const [newDesc, setNewDesc] = useState('');
  const [newCriteria, setNewCriteria] = useState('');
  const [newHeaders, setNewHeaders] = useState('Transaction_ID, Card_Number, Amount_USD');
  const [newSql, setNewSql] = useState("UPDATE transactions SET status = 'REVERSED' WHERE transaction_id = '{{Transaction_ID}}';");

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const formattedTag = newTagName.startsWith('#') ? newTagName.toUpperCase() : `#${newTagName.toUpperCase()}`;
    const headersList = newHeaders.split(',').map(h => h.trim()).filter(Boolean);

    const preset: HashtagPreset = {
      tag: formattedTag,
      description: newDesc,
      criteria: newCriteria,
      expectedFileStructure: headersList,
      solutionTemplate: newSql,
      author: currentUser.username,
      createdAt: new Date().toISOString()
    };

    onCreatePreset(preset);
    setSelectedTag(preset);
    setIsCreating(false);
    setNewTagName('#');
    setNewDesc('');
    setNewCriteria('');
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 lg:p-6 mb-6">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-200 mb-6">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-indigo-100 text-indigo-700 rounded-xl">
            <Tag className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Hashtag Solution Preset Library</h2>
            <p className="text-xs text-slate-500">Automated column mappings, discrepancy criteria rules, and standard SQL templates</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsCreating(true)}
          className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>New Hashtag Preset</span>
        </button>
      </div>

      {/* Main Grid: Tag List on Left, Selected Detail on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Preset Chips/Cards */}
        <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
          {hashtags.map((h) => {
            const isSelected = selectedTag?.tag === h.tag;
            return (
              <div
                key={h.tag}
                onClick={() => setSelectedTag(h)}
                className={`p-3.5 rounded-xl border cursor-pointer transition ${
                  isSelected
                    ? 'bg-indigo-50/80 border-indigo-300 shadow-sm'
                    : 'bg-slate-50 hover:bg-white border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-sm text-indigo-900">{h.tag}</span>
                  <span className="text-[10px] text-slate-400 font-mono">@{h.author}</span>
                </div>
                <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">{h.description}</p>
                <div className="mt-2 flex items-center gap-1 flex-wrap">
                  {h.expectedFileStructure?.slice(0, 3).map(col => (
                    <span key={col} className="px-1.5 py-0.5 rounded bg-white text-[10px] text-slate-600 border border-slate-200 font-mono">
                      {col}
                    </span>
                  ))}
                  {(h.expectedFileStructure?.length || 0) > 3 && (
                    <span className="text-[10px] text-slate-400">+{h.expectedFileStructure.length - 3} more</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Right Column: Detailed Inspector */}
        <div className="lg:col-span-2 bg-slate-50 rounded-xl p-5 border border-slate-200 flex flex-col justify-between">
          {selectedTag ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <div>
                  <span className="text-lg font-bold text-indigo-900 font-mono">{selectedTag.tag}</span>
                  <p className="text-xs text-slate-500 mt-0.5">{selectedTag.description}</p>
                </div>
                <span className="text-xs text-slate-400 font-medium">
                  Author: <strong className="text-slate-700">@{selectedTag.author}</strong>
                </span>
              </div>

              {/* Criteria */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Validation & Discrepancy Criteria
                </label>
                <div className="p-3 bg-white rounded-lg border border-slate-200 text-xs text-slate-700 font-mono leading-relaxed">
                  {selectedTag.criteria || 'Standard header and data presence validation'}
                </div>
              </div>

              {/* Expected File Columns */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Expected Column Headers
                </label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {selectedTag.expectedFileStructure?.map(col => (
                    <span key={col} className="px-2.5 py-1 rounded-lg bg-indigo-100 text-indigo-800 text-xs font-semibold font-mono border border-indigo-200">
                      {col}
                    </span>
                  ))}
                </div>
              </div>

              {/* Solution Template */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Automated SQL Solution Template
                </label>
                <div className="p-3 bg-slate-900 rounded-lg text-emerald-400 font-mono text-xs overflow-x-auto shadow-inner">
                  <pre>{selectedTag.solutionTemplate}</pre>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-48 text-slate-400 text-sm">
              Select a hashtag preset on the left to view details
            </div>
          )}
        </div>
      </div>

      {/* Modal: Create Hashtag Preset */}
      {isCreating && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
              <h3 className="font-bold text-slate-900 text-lg flex items-center gap-2">
                <Tag className="w-5 h-5 text-indigo-600" />
                <span>Create Hashtag Preset</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tag Identifier (e.g. #DISPUTE_REVERSAL)
                </label>
                <input
                  type="text"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  required
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-lg font-mono font-bold text-indigo-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Description
                </label>
                <input
                  type="text"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Describes what condition this tag addresses"
                  required
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Discrepancy Criteria Rule
                </label>
                <input
                  type="text"
                  value={newCriteria}
                  onChange={(e) => setNewCriteria(e.target.value)}
                  placeholder="e.g. Amount match, Card match, Time window < 5 min"
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Expected Column Headers (Comma separated)
                </label>
                <input
                  type="text"
                  value={newHeaders}
                  onChange={(e) => setNewHeaders(e.target.value)}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  SQL Solution Template
                </label>
                <textarea
                  rows={3}
                  value={newSql}
                  onChange={(e) => setNewSql(e.target.value)}
                  className="w-full text-xs p-2.5 bg-slate-900 text-emerald-400 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition shadow-sm"
                >
                  Save Preset
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useState } from 'react';
import { EnvironmentSystem, Plugin, User } from '../../types';
import { Server, ToggleLeft, ToggleRight, Plus, Trash2, ShieldCheck, Zap, X } from 'lucide-react';

interface AdminSystemSettingsProps {
  systems: EnvironmentSystem[];
  plugins: Plugin[];
  onTogglePlugin: (pluginId: string) => void;
  onAddSystem: (newSys: EnvironmentSystem) => void;
  onDeleteSystem: (sysId: string) => void;
}

export default function AdminSystemSettings({
  systems,
  plugins,
  onTogglePlugin,
  onAddSystem,
  onDeleteSystem
}: AdminSystemSettingsProps) {
  const [activeTab, setActiveTab] = useState<'systems' | 'plugins'>('systems');
  const [isAddingSystem, setIsAddingSystem] = useState(false);

  // New system form state
  const [sysName, setSysName] = useState('');
  const [sysDesc, setSysDesc] = useState('');
  const [testDb, setTestDb] = useState('');
  const [prodDb, setProdDb] = useState('');
  const [tables, setTables] = useState('');
  const [requireDml, setRequireDml] = useState(true);

  const handleCreateSystem = (e: React.FormEvent) => {
    e.preventDefault();
    const tableList = tables.split(',').map(t => t.trim()).filter(Boolean);

    const newSys: EnvironmentSystem = {
      id: `sys-${Date.now()}`,
      name: sysName,
      description: sysDesc,
      requireDmlApproval: requireDml,
      allowedUserIds: ['usr-1', 'usr-2', 'usr-3', 'usr-4'],
      allowedRoles: ['admin', 'technical', 'operational'],
      testing: {
        dbName: testDb || `${sysName.toLowerCase().replace(/\s+/g, '_')}_test`,
        allowedTables: tableList,
        apiEndpoint: `https://api.paymentops.internal/${sysName.toLowerCase().replace(/\s+/g, '-')}/test`
      },
      production: {
        dbName: prodDb || `${sysName.toLowerCase().replace(/\s+/g, '_')}_prod`,
        allowedTables: tableList,
        apiEndpoint: `https://api.paymentops.internal/${sysName.toLowerCase().replace(/\s+/g, '-')}/prod`
      }
    };

    onAddSystem(newSys);
    setIsAddingSystem(false);
    setSysName('');
    setSysDesc('');
  };

  return (
    <div className="space-y-6">
      {/* Header & Sub-Tab Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Environment Systems & Integration Plugins</h2>
          <p className="text-xs text-slate-500">Configure core engine topologies and external notification webhooks</p>
        </div>

        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('systems')}
            className={`px-3 py-1.5 rounded-lg font-bold transition ${
              activeTab === 'systems' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Environment Systems ({systems.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('plugins')}
            className={`px-3 py-1.5 rounded-lg font-bold transition ${
              activeTab === 'plugins' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Plugins & Webhooks ({plugins.length})
          </button>
        </div>
      </div>

      {/* Systems View */}
      {activeTab === 'systems' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setIsAddingSystem(true)}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Add Environment System</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {systems.map((sys) => (
              <div key={sys.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                        <Server className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 text-sm">{sys.name}</h3>
                        <p className="text-[11px] text-slate-500">{sys.description}</p>
                      </div>
                    </div>
                    {sys.requireDmlApproval && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200">
                        Approval Required
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 my-3 font-mono text-[11px]">
                    <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                      <span className="text-slate-400 font-bold block text-[10px] uppercase">Testing DB</span>
                      <span className="text-slate-800 font-semibold truncate block">{sys.testing?.dbName || 'test_db'}</span>
                    </div>
                    <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                      <span className="text-slate-400 font-bold block text-[10px] uppercase">Production DB</span>
                      <span className="text-slate-800 font-semibold truncate block">{sys.production?.dbName || 'prod_db'}</span>
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Allowed Tables</span>
                    <div className="flex items-center gap-1 flex-wrap">
                      {(sys.production?.allowedTables || sys.testing?.allowedTables || []).map(t => (
                        <span key={t} className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[10px] border border-slate-200">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-3 mt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`Remove system ${sys.name}?`)) {
                        onDeleteSystem(sys.id);
                      }
                    }}
                    className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Plugins View */}
      {activeTab === 'plugins' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {plugins.map((plugin) => (
            <div key={plugin.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-slate-900">{plugin.name}</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-blue-50 text-blue-700 border border-blue-200">
                    {plugin.category}
                  </span>
                </div>
                <p className="text-xs text-slate-500">{plugin.description}</p>
              </div>

              <button
                type="button"
                onClick={() => onTogglePlugin(plugin.id)}
                className={`p-1.5 rounded-lg transition ${
                  plugin.enabled ? 'text-emerald-600 hover:bg-emerald-50' : 'text-slate-300 hover:text-slate-400'
                }`}
              >
                {plugin.enabled ? <ToggleRight className="w-8 h-8" /> : <ToggleLeft className="w-8 h-8" />}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add System Modal */}
      {isAddingSystem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="font-bold text-slate-900 text-lg flex items-center gap-2">
                <Server className="w-5 h-5 text-blue-600" />
                <span>Add Environment System</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsAddingSystem(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSystem} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">System Name</label>
                <input
                  type="text"
                  value={sysName}
                  onChange={(e) => setSysName(e.target.value)}
                  placeholder="e.g. Card Authorization Network"
                  required
                  className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
                <input
                  type="text"
                  value={sysDesc}
                  onChange={(e) => setSysDesc(e.target.value)}
                  placeholder="System role and operational function"
                  required
                  className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Testing DB Name</label>
                  <input
                    type="text"
                    value={testDb}
                    onChange={(e) => setTestDb(e.target.value)}
                    placeholder="card_auth_test"
                    className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Production DB Name</label>
                  <input
                    type="text"
                    value={prodDb}
                    onChange={(e) => setProdDb(e.target.value)}
                    placeholder="card_auth_prod"
                    className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Allowed Tables (Comma separated)</label>
                <input
                  type="text"
                  value={tables}
                  onChange={(e) => setTables(e.target.value)}
                  placeholder="e.g. core_transactions, settlements"
                  className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="reqDml"
                  checked={requireDml}
                  onChange={(e) => setRequireDml(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <label htmlFor="reqDml" className="text-xs text-slate-700 font-medium cursor-pointer">
                  Require dual-control approval for production DML updates
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddingSystem(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition shadow-sm"
                >
                  Save System
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Boxes,
  Plus,
  Search,
  Filter,
  RefreshCw,
  Database,
  CheckCircle2,
  Layers,
  Cpu,
  Trash2,
  Edit2,
  Play,
  Share2,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  AlertCircle,
  Copy,
  Sparkles
} from 'lucide-react';
import { ValidationBox, DatabaseConnection } from '../../../types';
import { apiClient } from '../../../api/client';
import { ValidationBoxWizardDrawer } from './ValidationBoxWizardDrawer';
import { ValidationBoxDetailInspector } from './ValidationBoxDetailInspector';
import { ValidationBoxTestModal } from './ValidationBoxTestModal';

interface ValidationBoxHubProps {
  databases?: DatabaseConnection[];
  initialBoxes?: ValidationBox[];
  onOpenStudioWithBox?: (boxId: string) => void;
  onOpenGovernanceShare?: (box: ValidationBox) => void;
}

export const ValidationBoxHub: React.FC<ValidationBoxHubProps> = ({
  databases = [],
  initialBoxes,
  onOpenStudioWithBox,
  onOpenGovernanceShare
}) => {
  const [boxes, setBoxes] = useState<ValidationBox[]>(initialBoxes || []);
  const [loading, setLoading] = useState<boolean>(!initialBoxes);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [selectedDb, setSelectedDb] = useState<string>('ALL');

  // Interactive panels
  const [inspectorBoxId, setInspectorBoxId] = useState<string | null>(null);
  const [wizardBox, setWizardBox] = useState<{ isOpen: boolean; boxToEdit?: ValidationBox | null }>({
    isOpen: false,
    boxToEdit: null
  });
  const [testingBox, setTestingBox] = useState<ValidationBox | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [feedbackNotice, setFeedbackNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showNotice = (type: 'success' | 'error', message: string) => {
    setFeedbackNotice({ type, message });
    setTimeout(() => setFeedbackNotice(null), 4000);
  };

  const fetchBoxes = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiClient.getValidationBoxes();
      if (Array.isArray(data)) {
        setBoxes(data);
      }
    } catch (err: any) {
      console.warn('Failed to fetch validation boxes from backend:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!initialBoxes) {
      fetchBoxes();
    }
  }, [fetchBoxes, initialBoxes]);

  // Filtered boxes
  const filteredBoxes = useMemo(() => {
    return boxes.filter(box => {
      // Type filter
      if (selectedType !== 'ALL' && box.boxType !== selectedType) {
        return false;
      }
      // DB filter
      if (selectedDb !== 'ALL' && box.targetDbId !== selectedDb) {
        return false;
      }
      // Text search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const nameMatch = box.name?.toLowerCase().includes(q);
        const descMatch = box.description?.toLowerCase().includes(q);
        const tableMatch = box.targetTable?.toLowerCase().includes(q);
        const catMatch = box.category?.toLowerCase().includes(q);
        return nameMatch || descMatch || tableMatch || catMatch;
      }
      return true;
    });
  }, [boxes, selectedType, selectedDb, searchQuery]);

  // Metrics
  const metrics = useMemo(() => {
    const total = boxes.length;
    const ingestion = boxes.filter(b => b.boxType === 'INGESTION_SEARCH').length;
    const condition = boxes.filter(b => b.boxType === 'CONDITION_CHECK').length;
    const recon = boxes.filter(b => b.boxType === 'RECONCILIATION').length;
    const report = boxes.filter(b => b.boxType === 'REPORT').length;
    return { total, ingestion, condition, recon, report };
  }, [boxes]);

  // Selected box for inspector
  const activeInspectorBox = useMemo(() => {
    if (!inspectorBoxId) return null;
    return boxes.find(b => b.id === inspectorBoxId) || null;
  }, [boxes, inspectorBoxId]);

  // Handlers
  const handleSaveBox = async (savedBox: ValidationBox) => {
    try {
      const existingIdx = boxes.findIndex(b => b.id === savedBox.id);
      if (existingIdx >= 0) {
        await apiClient.updateValidationBox(savedBox.id, savedBox);
        setBoxes(prev => {
          const next = [...prev];
          next[existingIdx] = savedBox;
          return next;
        });
        showNotice('success', `Validation Box "${savedBox.name}" updated successfully.`);
      } else {
        const created = await apiClient.createValidationBox(savedBox);
        const actualBox = created?.box || savedBox;
        setBoxes(prev => [actualBox, ...prev]);
        showNotice('success', `Validation Box "${actualBox.name}" created successfully.`);
      }
      setWizardBox({ isOpen: false, boxToEdit: null });
      setInspectorBoxId(savedBox.id);
    } catch (err: any) {
      console.error('Save box error:', err);
      showNotice('error', `Failed to save validation box: ${err.message || 'Unknown error'}`);
    }
  };

  const handleDeleteBox = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete the validation box "${name}"? This action cannot be undone.`)) {
      return;
    }
    setDeletingId(id);
    try {
      await apiClient.deleteValidationBox(id);
      setBoxes(prev => prev.filter(b => b.id !== id));
      if (inspectorBoxId === id) setInspectorBoxId(null);
      showNotice('success', `Validation Box "${name}" deleted.`);
    } catch (err: any) {
      console.error('Delete box error:', err);
      showNotice('error', `Failed to delete validation box: ${err.message || 'Unknown error'}`);
    } finally {
      setDeletingId(null);
    }
  };

  const handleDuplicateBox = (box: ValidationBox) => {
    const duplicated: ValidationBox = {
      ...box,
      id: `vbox-${Date.now()}`,
      name: `${box.name} (Copy)`,
      updatedAt: new Date().toISOString()
    };
    setBoxes(prev => [duplicated, ...prev]);
    showNotice('success', `Duplicated "${box.name}" as new box.`);
    setInspectorBoxId(duplicated.id);
  };

  const getDbName = (dbId?: string) => {
    if (!dbId) return 'None';
    const found = databases.find(d => d.id === dbId);
    return found ? found.name : dbId;
  };

  const getArchetypePill = (type: string) => {
    switch (type) {
      case 'INGESTION_SEARCH':
        return {
          icon: Database,
          label: 'Search',
          badge: 'bg-emerald-950/60 text-emerald-400 border-emerald-800/50'
        };
      case 'CONDITION_CHECK':
        return {
          icon: CheckCircle2,
          label: 'Condition',
          badge: 'bg-blue-950/60 text-blue-400 border-blue-800/50'
        };
      case 'RECONCILIATION':
        return {
          icon: Layers,
          label: 'Recon',
          badge: 'bg-cyan-950/60 text-cyan-400 border-cyan-800/50'
        };
      case 'REPORT':
        return {
          icon: Cpu,
          label: 'Report',
          badge: 'bg-purple-950/60 text-purple-400 border-purple-800/50'
        };
      default:
        return {
          icon: Boxes,
          label: type,
          badge: 'bg-slate-800 text-slate-300 border-slate-700'
        };
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 overflow-hidden relative">
      
      {/* Toast notice */}
      {feedbackNotice && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl border shadow-2xl flex items-center gap-2.5 text-xs font-semibold animate-in slide-in-from-top-2 duration-200 ${
          feedbackNotice.type === 'success'
            ? 'bg-emerald-950/90 text-emerald-300 border-emerald-800 shadow-emerald-950/50'
            : 'bg-rose-950/90 text-rose-300 border-rose-800 shadow-rose-950/50'
        }`}>
          {feedbackNotice.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400" />
          )}
          <span>{feedbackNotice.message}</span>
        </div>
      )}

      {/* Top Banner & Metrics */}
      <div className="px-6 py-5 border-b border-slate-800/80 bg-slate-900/40 shrink-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-gradient-to-br from-indigo-500/20 to-blue-600/20 border border-indigo-500/30 text-indigo-400">
                <Boxes className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                  Validation Box Library
                  <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-indigo-950/80 text-indigo-300 border border-indigo-800/60">
                    Modular Catalog
                  </span>
                </h1>
                <p className="text-xs text-slate-400">
                  Reusable, unlogged-mirror-backed validation building blocks for ingestion search, dual-source condition checks, and reconciliation.
                </p>
              </div>
            </div>
          </div>

          {/* Quick Action Button */}
          <div className="flex items-center gap-2">
            <button
              onClick={fetchBoxes}
              disabled={loading}
              className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/60 transition cursor-pointer"
              title="Refresh Catalog"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => setWizardBox({ isOpen: true, boxToEdit: null })}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-lg shadow-blue-900/30 transition cursor-pointer"
            >
              <Plus className="w-4 h-4" /> New Validation Box
            </button>
          </div>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4">
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Total Blocks</span>
              <span className="text-lg font-bold text-white">{metrics.total}</span>
            </div>
            <Boxes className="w-5 h-5 text-slate-600" />
          </div>

          <div className="bg-slate-900/60 border border-emerald-900/30 rounded-xl p-3 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider block">Search</span>
              <span className="text-lg font-bold text-emerald-300">{metrics.ingestion}</span>
            </div>
            <Database className="w-5 h-5 text-emerald-600/60" />
          </div>

          <div className="bg-slate-900/60 border border-blue-900/30 rounded-xl p-3 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider block">Conditions</span>
              <span className="text-lg font-bold text-blue-300">{metrics.condition}</span>
            </div>
            <CheckCircle2 className="w-5 h-5 text-blue-600/60" />
          </div>

          <div className="bg-slate-900/60 border border-cyan-900/30 rounded-xl p-3 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-semibold text-cyan-400 uppercase tracking-wider block">Recon</span>
              <span className="text-lg font-bold text-cyan-300">{metrics.recon}</span>
            </div>
            <Layers className="w-5 h-5 text-cyan-600/60" />
          </div>

          <div className="bg-slate-900/60 border border-purple-900/30 rounded-xl p-3 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-semibold text-purple-400 uppercase tracking-wider block">Reports</span>
              <span className="text-lg font-bold text-purple-300">{metrics.report}</span>
            </div>
            <Cpu className="w-5 h-5 text-purple-600/60" />
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="px-6 py-3 bg-slate-900/80 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3 shrink-0">
        
        {/* Archetype Pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {[
            { id: 'ALL', label: 'All Types' },
            { id: 'INGESTION_SEARCH', label: 'Search' },
            { id: 'CONDITION_CHECK', label: 'Conditions' },
            { id: 'RECONCILIATION', label: 'Reconciliation' },
            { id: 'REPORT', label: 'Reports' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setSelectedType(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                selectedType === tab.id
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-800/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search & DB Select */}
        <div className="flex items-center gap-2.5 flex-1 max-w-md justify-end">
          {databases.length > 0 && (
            <select
              value={selectedDb}
              onChange={e => setSelectedDb(e.target.value)}
              className="bg-slate-800/80 border border-slate-700/60 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 transition cursor-pointer"
            >
              <option value="ALL">All Databases</option>
              {databases.map(d => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          )}

          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search boxes, tables, categories..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-slate-800/80 border border-slate-700/60 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
            />
          </div>
        </div>

      </div>

      {/* Main Workspace (Cards Grid + Inspector) */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left Side: Cards Grid */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          
          {loading && boxes.length === 0 ? (
            <div className="py-20 flex flex-col items-center justify-center text-slate-500 space-y-2">
              <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
              <p className="text-xs">Loading validation boxes from database...</p>
            </div>
          ) : filteredBoxes.length === 0 ? (
            /* Empty State */
            <div className="py-16 px-6 border-2 border-dashed border-slate-800 rounded-2xl flex flex-col items-center text-center max-w-2xl mx-auto space-y-4">
              <div className="p-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                <Boxes className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">
                  {boxes.length === 0 ? 'No Validation Boxes Configured Yet' : 'No Validation Boxes Match Your Filters'}
                </h3>
                <p className="text-xs text-slate-400 mt-1 max-w-md">
                  {boxes.length === 0
                    ? 'Create your first reusable validation box to execute targeted database lookups, balance checks, or multi-field reconciliation in your workflows.'
                    : 'Try clearing your search query or switching your archetype filter to view available boxes.'}
                </p>
              </div>

              {boxes.length === 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full pt-2">
                  <button
                    onClick={() => setWizardBox({ isOpen: true, boxToEdit: null })}
                    className="p-3 rounded-xl bg-slate-900 border border-emerald-900/40 hover:border-emerald-500/50 text-left transition group cursor-pointer"
                  >
                    <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs mb-1">
                      <Database className="w-4 h-4" /> Ingestion Search
                    </div>
                    <p className="text-[11px] text-slate-400">Query external tables by transaction reference or composite keys.</p>
                  </button>

                  <button
                    onClick={() => setWizardBox({ isOpen: true, boxToEdit: null })}
                    className="p-3 rounded-xl bg-slate-900 border border-blue-900/40 hover:border-blue-500/50 text-left transition group cursor-pointer"
                  >
                    <div className="flex items-center gap-2 text-blue-400 font-semibold text-xs mb-1">
                      <CheckCircle2 className="w-4 h-4" /> Dual-Source Condition
                    </div>
                    <p className="text-[11px] text-slate-400">Compare payload amounts against external mirror values with tolerances.</p>
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* Cards Grid */
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredBoxes.map(box => {
                const archetype = getArchetypePill(box.boxType);
                const ArchIcon = archetype.icon;
                const isSelected = inspectorBoxId === box.id;

                return (
                  <div
                    key={box.id}
                    onClick={() => setInspectorBoxId(isSelected ? null : box.id)}
                    className={`rounded-2xl border p-4 transition duration-150 flex flex-col justify-between cursor-pointer group ${
                      isSelected
                        ? 'bg-slate-900 border-blue-500/80 shadow-lg shadow-blue-950/40 ring-1 ring-blue-500/40'
                        : 'bg-slate-900/60 border-slate-800/80 hover:bg-slate-900 hover:border-slate-700'
                    }`}
                  >
                    <div>
                      {/* Card Header */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full border flex items-center gap-1 ${archetype.badge}`}>
                            <ArchIcon className="w-3 h-3" />
                            {archetype.label}
                          </span>
                          {box.category && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-medium truncate">
                              {box.category}
                            </span>
                          )}
                        </div>

                        {/* Top action triggers */}
                        <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => setTestingBox(box)}
                            className="p-1 rounded-lg hover:bg-emerald-950/60 text-slate-400 hover:text-emerald-400 transition"
                            title="Test Box"
                          >
                            <Play className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setWizardBox({ isOpen: true, boxToEdit: box })}
                            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-blue-400 transition"
                            title="Edit Box"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Title & Desc */}
                      <h3 className="text-sm font-bold text-white mt-2.5 truncate group-hover:text-blue-300 transition">
                        {box.name}
                      </h3>
                      {box.description ? (
                        <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                          {box.description}
                        </p>
                      ) : (
                        <p className="text-xs text-slate-600 italic mt-1">No description provided</p>
                      )}
                    </div>

                    {/* Card Footer / Target Meta */}
                    <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
                      <div className="flex items-center gap-1.5 text-slate-400 truncate max-w-[70%]">
                        <Database className="w-3 h-3 text-slate-500 shrink-0" />
                        <span className="truncate">{getDbName(box.targetDbId)}</span>
                        {box.targetTable && (
                          <>
                            <span className="text-slate-600">/</span>
                            <span className="font-mono text-emerald-400 font-medium truncate">{box.targetTable}</span>
                          </>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {box.checkStep?.actionOnFailure && (
                          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-rose-400 border border-rose-900/30">
                            {box.checkStep.actionOnFailure}
                          </span>
                        )}
                        <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-300 transition" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

        </div>

        {/* Right Side: Inspector Panel */}
        {activeInspectorBox && (
          <ValidationBoxDetailInspector
            box={activeInspectorBox}
            databases={databases}
            onClose={() => setInspectorBoxId(null)}
            onEdit={b => setWizardBox({ isOpen: true, boxToEdit: b })}
            onTest={b => setTestingBox(b)}
            onShare={b => {
              if (onOpenGovernanceShare) onOpenGovernanceShare(b);
              else showNotice('success', `Box ready to share: ${b.name}`);
            }}
            onDelete={(id, name) => handleDeleteBox(id, name)}
          />
        )}

      </div>

      {/* Creation / Edit Wizard Drawer */}
      <ValidationBoxWizardDrawer
        isOpen={wizardBox.isOpen}
        boxToEdit={wizardBox.boxToEdit}
        databases={databases}
        onClose={() => setWizardBox({ isOpen: false, boxToEdit: null })}
        onSave={handleSaveBox}
      />

      {/* Live Testing Modal */}
      {testingBox && (
        <ValidationBoxTestModal
          box={testingBox}
          database={databases.find(d => d.id === testingBox.targetDbId)}
          onClose={() => setTestingBox(null)}
        />
      )}

    </div>
  );
};

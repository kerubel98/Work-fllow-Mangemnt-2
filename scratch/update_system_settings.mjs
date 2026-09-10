import fs from 'fs';

const file = 'frontend/src/components/settings/SystemSettings.tsx';
let content = fs.readFileSync(file, 'utf8');

// Normalize CRLF to LF temporarily for matching
const isCrlf = content.includes('\r\n');
if (isCrlf) {
  content = content.replace(/\r\n/g, '\n');
}

// 1. Add states
const stateAnchor = `const [selectedFieldKeys, setSelectedFieldKeys] = useState<string[]>([]);`;
const newStates = `const [selectedFieldKeys, setSelectedFieldKeys] = useState<string[]>([]);

  // Database-Driven Discovery & Import States
  const [discoveringFromDb, setDiscoveringFromDb] = useState(false);
  const [showImportTableModal, setShowImportTableModal] = useState(false);
  const [importTableDbId, setImportTableDbId] = useState<string>(() => databases[0]?.id || '');
  const [importTableName, setImportTableName] = useState<string>('');
  const [importingTableLoading, setImportingTableLoading] = useState(false);
  const [importTableError, setImportTableError] = useState<string | null>(null);`;

if (!content.includes(stateAnchor)) {
  console.error('State anchor not found!');
  process.exit(1);
}
content = content.replace(stateAnchor, newStates);

// 2. Replace handleResetDictionary
const resetAnchor = `  const handleResetDictionary = async () => {
    if (window.confirm('Reset Global Dictionary to default standard banking/switch fields? This will restore all built-in definitions.')) {
      const resetConfig = globalMappingService.resetToDefaults(currentUser?.username || 'admin');
      setFields(resetConfig.standardFields);
      try {
        await globalMappingService.saveConfigToBackend('Reset to defaults', currentUser?.username || 'admin');
      } catch (err) {
        console.warn('Could not sync reset config to backend:', err);
      }
      setDictSuccessMsg('Global Mapping Dictionary reset to official defaults.');
      setTimeout(() => setDictSuccessMsg(null), 4000);
    }
  };`;

const newHandlers = `  const handleDiscoverFromDatabases = async () => {
    setDiscoveringFromDb(true);
    try {
      const res = await api.discoverGlobalFieldsFromDatabases(currentUser?.username || 'admin');
      const refreshed = await api.getGlobalStandardDirectory().catch(() => res.fields || []);
      if (Array.isArray(refreshed) && refreshed.length > 0) {
        setFields(refreshed);
      } else if (res.fields) {
        setFields(res.fields);
      }
      setDictSuccessMsg(res.message || \`Discovered \${res.discoveredCount || 0} database columns into Global Schema.\`);
      setTimeout(() => setDictSuccessMsg(null), 5000);
    } catch (err: any) {
      alert(\`Error discovering fields from databases: \${err.message}\`);
    } finally {
      setDiscoveringFromDb(false);
    }
  };

  const handleOpenImportTableModal = () => {
    const defaultDbId = selectedDbId || databases[0]?.id || '';
    setImportTableDbId(defaultDbId);
    const tbls = getTablesForDb(defaultDbId);
    setImportTableName(tbls[0] || '');
    setImportTableError(null);
    setShowImportTableModal(true);
  };

  const handleExecuteImportTable = async () => {
    if (!importTableDbId || !importTableName) {
      setImportTableError('Please select both a database and table to import.');
      return;
    }
    setImportingTableLoading(true);
    setImportTableError(null);
    try {
      const res = await api.importGlobalFieldsFromTable(importTableDbId, importTableName, currentUser?.username || 'admin');
      const refreshed = await api.getGlobalStandardDirectory().catch(() => null);
      if (Array.isArray(refreshed)) {
        setFields(refreshed);
      }
      setShowImportTableModal(false);
      setDictSuccessMsg(res.message || \`Successfully imported columns from '\${importTableName}' into Global Schema!\`);
      setTimeout(() => setDictSuccessMsg(null), 5000);
    } catch (err: any) {
      setImportTableError(err.message || 'Failed to import table columns');
    } finally {
      setImportingTableLoading(false);
    }
  };`;

if (!content.includes(resetAnchor)) {
  console.error('Reset anchor not found!');
  process.exit(1);
}
content = content.replace(resetAnchor, newHandlers);

// 3. Replace the toolbar buttons (Reset Defaults button -> Discover from Databases + Import from Table)
const resetBtnAnchor = `              <button
                type="button"
                onClick={handleResetDictionary}
                className="px-3 py-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg text-xs font-medium flex items-center gap-1 transition"
                title="Restore default standard fields"
              >
                <RefreshCw size={13} />
                <span className="hidden lg:inline">Reset Defaults</span>
              </button>`;

const newBtns = `              <button
                type="button"
                onClick={handleDiscoverFromDatabases}
                disabled={discoveringFromDb}
                className="px-3.5 py-2 bg-blue-600/10 hover:bg-blue-600/20 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold flex items-center gap-1.5 transition disabled:opacity-50"
                id="btn-discover-from-databases"
                title="Harvest real physical database columns from all connected databases into Global Schema"
              >
                {discoveringFromDb ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} className="text-blue-600" />}
                <span>{discoveringFromDb ? 'Discovering...' : 'Discover from Databases'}</span>
              </button>

              <button
                type="button"
                onClick={handleOpenImportTableModal}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
                id="btn-import-table-columns"
                title="Import physical columns from a specific connected database table"
              >
                <Table size={13} className="text-slate-500" />
                <span className="hidden sm:inline">Import from Table</span>
              </button>`;

if (!content.includes(resetBtnAnchor)) {
  console.error('Reset button anchor not found!');
  process.exit(1);
}
content = content.replace(resetBtnAnchor, newBtns);

// 4. Update empty state in table
const emptyStateAnchor = `                        {fields.length === 0 ? (
                          <div className="space-y-2 py-4">
                            <Layers size={28} className="mx-auto text-slate-300" />
                            <p className="text-sm font-semibold text-slate-600">No fields in Global Schema</p>
                            <p className="text-xs text-slate-400">All fields have been deleted. You can create custom fields, import JSON, or reset to defaults.</p>
                          </div>
                        ) :`;

const newEmptyState = `                        {fields.length === 0 ? (
                          <div className="py-12 px-6 text-center max-w-md mx-auto space-y-4">
                            <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center mx-auto shadow-inner">
                              <Database size={24} />
                            </div>
                            <div>
                              <h4 className="text-sm font-bold text-slate-800">No Global Schema Fields Configured</h4>
                              <p className="text-xs text-slate-500 mt-1">
                                The Global Schema is based strictly on real connected database values rather than a static dictionary. Discover columns automatically from your live database tables or import specific tables.
                              </p>
                            </div>
                            <div className="flex items-center justify-center gap-2 pt-2">
                              <button
                                type="button"
                                onClick={handleDiscoverFromDatabases}
                                disabled={discoveringFromDb}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition disabled:opacity-50"
                              >
                                {discoveringFromDb ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                                <span>{discoveringFromDb ? 'Discovering...' : 'Discover from Connected Databases'}</span>
                              </button>
                              <button
                                type="button"
                                onClick={handleOpenImportTableModal}
                                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
                              >
                                <Table size={13} />
                                <span>Import from Table</span>
                              </button>
                            </div>
                          </div>
                        ) :`;

if (!content.includes(emptyStateAnchor)) {
  console.error('Empty state anchor not found!');
  process.exit(1);
}
content = content.replace(emptyStateAnchor, newEmptyState);

// 5. Add notes / source database badge to row display
const keyCellAnchor = `                          <td className="py-3 px-4 font-mono font-bold text-blue-700">
                            <div className="flex items-center gap-1.5">
                              {isPk && <Key size={12} className="text-amber-500" title="Primary Key" />}
                              <span>{f.key}</span>
                            </div>
                          </td>`;

const newKeyCell = `                          <td className="py-3 px-4 font-mono font-bold text-blue-700">
                            <div className="flex items-center gap-1.5">
                              {isPk && <Key size={12} className="text-amber-500" title="Primary Key" />}
                              <span>{f.key}</span>
                            </div>
                            {f.notes && (
                              <div className="text-[10px] text-slate-400 font-sans font-normal truncate max-w-[220px] mt-0.5" title={f.notes}>
                                {f.notes.replace('Discovered from database ', '').replace('table ', '')}
                              </div>
                            )}
                          </td>`;

if (!content.includes(keyCellAnchor)) {
  console.error('Key cell anchor not found!');
  process.exit(1);
}
content = content.replace(keyCellAnchor, newKeyCell);

// 6. Add Import Table Modal before the end of the return statement
const modalAnchor = `{/* ========================================================================= */}
      {/* MODAL: CLEAR ALL GLOBAL SCHEMA FIELDS`;

const importModalCode = `{/* ========================================================================= */}
      {/* MODAL: IMPORT COLUMNS FROM DATABASE TABLE                                  */}
      {/* ========================================================================= */}
      {showImportTableModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Table className="text-blue-600" size={18} />
                <h3 className="text-sm font-bold text-slate-800">Import Columns from Database Table</h3>
              </div>
              <button
                onClick={() => setShowImportTableModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-500 leading-relaxed">
                Select a connected physical database and table to harvest all its live physical columns directly into the Global Standard Directory.
              </p>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Target Database</label>
                  <select
                    value={importTableDbId}
                    onChange={(e) => {
                      setImportTableDbId(e.target.value);
                      const tbls = getTablesForDb(e.target.value);
                      setImportTableName(tbls[0] || '');
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    {databases.map(d => (
                      <option key={d.id} value={d.id}>{d.name} ({d.type} - {d.databaseName || d.host})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Target Table</label>
                  <select
                    value={importTableName}
                    onChange={(e) => setImportTableName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    {getTablesForDb(importTableDbId).map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>

              {importTableError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-center gap-2">
                  <AlertCircle size={14} className="flex-shrink-0" />
                  <span>{importTableError}</span>
                </div>
              )}
            </div>

            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowImportTableModal(false)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-200 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteImportTable}
                disabled={importingTableLoading || !importTableName}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition disabled:opacity-50"
              >
                {importingTableLoading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                <span>{importingTableLoading ? 'Harvesting Columns...' : 'Import Table Columns'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CLEAR ALL GLOBAL SCHEMA FIELDS`;

if (!content.includes(modalAnchor)) {
  console.error('Modal anchor not found!');
  process.exit(1);
}
content = content.replace(modalAnchor, importModalCode);

// Restore CRLF if file was CRLF
if (isCrlf) {
  content = content.replace(/\n/g, '\r\n');
}

fs.writeFileSync(file, content, 'utf8');
console.log('Successfully applied all UI changes to SystemSettings.tsx!');
